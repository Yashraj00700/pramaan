/**
 * api/chat.ts
 * -----------
 * The Pramaan AI assistant: a follow-up chat endpoint that lets a user ask
 * questions about a report they already have open, without re-running the
 * forensic pipeline.
 *
 * HONESTY CONTRACT (non-negotiable — see docs/DESIGN_SYSTEM.md / CLAUDE.md):
 *   - The assistant is grounded STRICTLY in the `report` the client sends.
 *     It may explain, summarise, cross-reference and reason about the
 *     findings already in that report, but it must never invent a fact
 *     (a number, a date, a name, a verification result) that is not present
 *     in it.
 *   - Code-computed facts (identifier checksums, OFAC screening,
 *     `technicalSignals`, deterministic `consistencyChecks`) are BINDING —
 *     they came from api/_core.ts's deterministic layer, not from a model,
 *     and the assistant must treat them as authoritative over any softer,
 *     narrative judgement elsewhere in the dossier.
 *   - Anything that would require a live external source to actually verify
 *     is exactly what `report.externalChecksNeeded` exists for. When a
 *     question reaches past what the report can honestly answer, the
 *     assistant says so plainly and points at that list (or says the item
 *     belongs there) instead of guessing.
 *
 * This file owns only the HTTP boundary + prompt construction. It reuses
 * api/_validate.ts's safe-error mapping and retry helpers rather than
 * reinventing them (per project convention), and performs its own request
 * validation here since the shape (question/report/history) is specific to
 * this endpoint.
 *
 * ESM NOTE: every relative import of a runtime value below carries an
 * explicit `.js` extension (Node's ESM resolver on Vercel requires it —
 * this already caused a production outage once). `AnalysisReport` is a
 * type-only import and is erased at compile time, so it does not need one.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisReport } from '../types';
import { toUserMessage, withRetry, statusForError } from './_validate.js';

// A conversational follow-up should be fast; 60s is ample and keeps the
// function well clear of Vercel's limits without tying up capacity.
export const config = { maxDuration: 60 };

const MODEL = 'claude-opus-5';

const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_TURNS = 12;
const MAX_REPORT_JSON_CHARS = 250_000; // generous — a full 12-module dossier, minus the ELA image

// ---------------------------------------------------------------------------
// Request validation (mirrors the shape/spirit of validateRequest in
// api/_validate.ts: reject bad input cheaply, with a friendly message,
// before spending a model call on it).
// ---------------------------------------------------------------------------

type ChatRole = 'user' | 'assistant';
interface ChatTurn {
  role: ChatRole;
  content: string;
}

interface ValidatedChatRequest {
  ok: true;
  question: string;
  report: AnalysisReport;
  history: ChatTurn[];
}
interface ChatValidationError {
  ok: false;
  status: number;
  error: string;
}

function fail(status: number, error: string): ChatValidationError {
  return { ok: false, status, error };
}

function validateChatRequest(body: unknown): ValidatedChatRequest | ChatValidationError {
  if (!body || typeof body !== 'object') {
    return fail(400, 'Request body is missing or malformed.');
  }

  const { question, report, history } = body as {
    question?: unknown;
    report?: unknown;
    history?: unknown;
  };

  if (typeof question !== 'string' || !question.trim()) {
    return fail(400, 'A question is required.');
  }
  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length > MAX_QUESTION_CHARS) {
    return fail(413, `Question is too long (max ${MAX_QUESTION_CHARS} characters).`);
  }

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return fail(400, 'A report is required to ground the assistant — open a completed analysis first.');
  }
  const r = report as Record<string, unknown>;
  if (typeof r.verdict !== 'string' || typeof r.summary !== 'string' || !Array.isArray(r.redFlags)) {
    return fail(400, 'The supplied report is missing required fields.');
  }

  let jsonLen = 0;
  try {
    jsonLen = JSON.stringify(report).length;
  } catch {
    return fail(400, 'The supplied report could not be read.');
  }
  if (jsonLen > MAX_REPORT_JSON_CHARS) {
    return fail(413, 'The supplied report is too large for the assistant to read.');
  }

  let cleanedHistory: ChatTurn[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) {
      return fail(400, 'history must be a list of {role, content} turns.');
    }
    cleanedHistory = history
      .filter(
        (h): h is { role: unknown; content: unknown } => !!h && typeof h === 'object',
      )
      .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
      .slice(-MAX_HISTORY_TURNS)
      .map((h) => ({ role: h.role as ChatRole, content: String(h.content).trim().slice(0, MAX_QUESTION_CHARS) }));
  }

  return { ok: true, question: trimmedQuestion, report: report as AnalysisReport, history: cleanedHistory };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/** Renders the report into plain text the model can ground its answers in. Strips elaImage (display-only, huge base64) and caps list lengths defensively. */
function serializeReport(report: AnalysisReport): string {
  const lines: string[] = [];

  lines.push(`Document type: ${report.documentType || 'Unknown'}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Risk score: ${report.riskScore}/100`);
  lines.push(`Confidence: ${report.confidence}/100`);
  lines.push(`Recommended action: ${report.recommendedAction || '(none given)'}`);
  lines.push('');
  lines.push('SUMMARY:');
  lines.push(report.summary || '(none)');

  if (report.redFlags?.length) {
    lines.push('');
    lines.push('RED FLAGS:');
    for (const f of report.redFlags) {
      lines.push(`- [${f.severity}] ${f.title}: ${f.detail} (evidence: ${f.evidence})`);
    }
  }

  if (report.consistencyChecks?.length) {
    lines.push('');
    lines.push('CONSISTENCY CHECKS (some are code-computed and binding — see technical signals below):');
    for (const c of report.consistencyChecks) {
      lines.push(`- [${c.status}] ${c.check}: ${c.detail}`);
    }
  }

  if (report.technicalSignals?.length) {
    lines.push('');
    lines.push('TECHNICAL SIGNALS (code-computed where noted — these are BINDING facts, not model opinion):');
    for (const s of report.technicalSignals) {
      lines.push(`- ${s.label}: ${s.value}${s.concern ? '  [CONCERN]' : ''}`);
    }
  }

  if (report.extractedFields?.length) {
    lines.push('');
    lines.push('EXTRACTED FIELDS:');
    for (const f of report.extractedFields) {
      lines.push(`- ${f.label}: ${f.value}`);
    }
  }

  if (report.modules?.length) {
    lines.push('');
    lines.push('FORENSIC MODULES:');
    for (const m of report.modules) {
      lines.push(`--- ${m.title} [${m.status}${typeof m.score === 'number' ? `, score ${m.score}/100` : ''}] ---`);
      lines.push(m.narrative || '(no narrative)');
      for (const c of m.checks || []) lines.push(`  - [${c.status}] ${c.category}: ${c.detail}`);
      for (const f of m.findings || []) lines.push(`  * ${f}`);
    }
  }

  if (report.riskBreakdown?.length) {
    lines.push('');
    lines.push('RISK BREAKDOWN:');
    for (const rb of report.riskBreakdown) lines.push(`- ${rb.label}: ${rb.score}/100`);
  }

  if (report.timeline?.length) {
    lines.push('');
    lines.push('TIMELINE:');
    for (const t of report.timeline) lines.push(`- ${t.date} — ${t.event} (${t.entity}) [${t.consistency}]`);
  }

  if (report.fraudTypology) {
    lines.push('');
    lines.push(
      `FRAUD TYPOLOGY: ${report.fraudTypology.name} (${report.fraudTypology.probability}% probability) — ${report.fraudTypology.rationale}`,
    );
    if (report.fraudTypology.nextSteps?.length) {
      lines.push(`  Next steps: ${report.fraudTypology.nextSteps.join('; ')}`);
    }
  }

  if (report.issuerIntel) {
    lines.push('');
    lines.push(`ISSUER INTEL: ${report.issuerIntel}`);
  }

  if (report.missingDocuments?.length) {
    lines.push('');
    lines.push(`MISSING/RECOMMENDED SUPPORTING DOCUMENTS: ${report.missingDocuments.join('; ')}`);
  }

  if (report.court) {
    lines.push('');
    lines.push('ADVERSARIAL COURT REVIEW:');
    lines.push(`Prosecution — ${report.court.prosecution.headline}`);
    for (const p of report.court.prosecution.points) lines.push(`  - (${p.weight}) ${p.claim} — ${p.evidence}`);
    lines.push(`Defense — ${report.court.defense.headline}`);
    for (const p of report.court.defense.points) lines.push(`  - (${p.weight}) ${p.claim} — ${p.evidence}`);
    lines.push(`Ruling: ${report.court.ruling.verdict}, risk ${report.court.ruling.riskScore}, confidence ${report.court.ruling.confidence}`);
    lines.push(`Reasoning: ${report.court.ruling.reasoning}`);
    if (report.court.ruling.decisive?.length) lines.push(`Decisive: ${report.court.ruling.decisive.join('; ')}`);
    if (report.court.ruling.dismissed?.length) lines.push(`Dismissed (raised but rejected): ${report.court.ruling.dismissed.join('; ')}`);
  }

  lines.push('');
  lines.push(
    `EXTERNAL CHECKS STILL NEEDED (NOT verified — these require a live external source Pramaan cannot reach on its own): ${
      report.externalChecksNeeded?.length ? report.externalChecksNeeded.join('; ') : '(none listed)'
    }`,
  );

  return lines.join('\n');
}

function buildSystemPrompt(report: AnalysisReport): string {
  return [
    'You are the Pramaan Assistant, embedded in a document authenticity & fraud-detection report the user is currently viewing.',
    '',
    'You are grounded STRICTLY in the report reproduced below. You may explain, summarise, compare, and reason about what is already in it — but you must follow these rules absolutely:',
    '1. NEVER invent a fact (a number, date, name, checksum result, sanctions match, or verification outcome) that is not present in the report below. If the user asks for something the report does not contain, say plainly that it is not in the report — do not guess or fill the gap.',
    '2. Treat items under TECHNICAL SIGNALS and the code-computed rows in CONSISTENCY CHECKS as BINDING — they were computed deterministically (checksum algorithms, OFAC screening), not inferred by a model, and they override softer narrative judgement elsewhere in the dossier if the two ever seem to disagree.',
    '3. Anything that would need a live external source to actually confirm (issuer callback, registrar lookup, in-person verification, a database Pramaan has no access to) is exactly what EXTERNAL CHECKS STILL NEEDED is for. If the user asks "is this actually verified?" or "has X been confirmed?" for something not covered by a code-computed fact above, say it has NOT been verified and point at that list (or say it belongs there if it is missing).',
    '4. Never claim higher certainty than the report itself states. If the report is SUSPICIOUS with 60% confidence, do not tell the user it is definitely fake or definitely authentic.',
    '5. Keep answers concise, analyst-toned, and specific — cite the actual check/module/red-flag name you are drawing from so the user can find it in the report.',
    '6. You are not a lawyer, notary, or law-enforcement authority. Do not tell the user what legal action to take beyond restating `recommendedAction`; suggest they consult the relevant authority or professional for that.',
    '',
    '=== REPORT ===',
    serializeReport(report),
    '=== END REPORT ===',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validation = validateChatRequest(req.body);
  if (!validation.ok) {
    const failed = validation as ChatValidationError;
    return res.status(failed.status).json({ error: failed.error });
  }
  const { question, report, history } = validation as ValidatedChatRequest;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Server is missing ANTHROPIC_API_KEY. Set it in .env.local (local) or the Vercel project env.');
    }
    const client = new Anthropic({ apiKey });

    const system = buildSystemPrompt(report);
    const messages: any[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: question },
    ];

    // Only transient failures (429 / 5xx / overloaded / network / timeout) are
    // retried, matching api/analyze.ts's policy.
    const response = await withRetry(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages,
      }),
    );

    const answer = ((response.content as any[]) || [])
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!answer) {
      throw new Error('The assistant did not return a response. Please retry.');
    }

    return res.status(200).json({ answer });
  } catch (e: unknown) {
    console.error('chat error:', e);
    return res.status(statusForError(e)).json({ error: toUserMessage(e) });
  }
}
