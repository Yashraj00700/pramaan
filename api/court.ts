/**
 * api/court.ts
 * ------------
 * "The court": an adversarial multi-agent review that stress-tests the
 * primary Pramaan dossier (produced by api/_core.ts) before it reaches the
 * user. Three separate Claude calls argue the document from opposing sides
 * and then a neutral judge adjudicates, so the final verdict has survived
 * genuine pushback rather than being accepted from a single pass.
 *
 *   1. PROSECUTION and DEFENSE run CONCURRENTLY (Promise.all). Each receives
 *      the exact same document content blocks (the document image, the ELA
 *      heatmap, the verified metadata text — passed in via opts.userContent),
 *      a condensed summary of the primary dossier, and the BINDING FACTS
 *      block. Prosecution argues forgery/tampering as rigorously as the real
 *      evidence allows; defense argues the innocent explanation for each
 *      indicator and flags where prosecution overreaches. Both are told,
 *      explicitly, never to invent evidence, and that weak/padded points get
 *      discarded downstream — so there is no incentive to overstate.
 *   2. JUDGE receives both structured cases plus the BINDING FACTS and issues
 *      a final ruling: verdict, riskScore, confidence, substantial reasoning,
 *      and — critically — what was DECISIVE and what was DISMISSED (and why).
 *      The judge is instructed that the binding, code-computed facts (identity
 *      checksums, sanctions/OFAC screening) are conclusive: a failed checksum
 *      cannot be argued away, and an unreachable sanctions list can never be
 *      treated as a clean result.
 *
 * This module does NOT import api/_core.ts (orchestrator-owned) — it only
 * mirrors its Claude request shape (thinking: adaptive, output_config
 * {effort}, the pause_turn resume loop, tool_use extraction) so every call
 * here behaves identically against the API.
 *
 * Robustness: the whole pipeline is best-effort. Any failure — a bad API
 * response, a malformed tool call, a thrown network error — is caught and
 * the function resolves to `null`, so a court failure can NEVER break the
 * primary analysis that the caller already has in hand.
 */

import type { CourtArgument, CourtProceedings, CourtRuling, Verdict } from '../types';

export interface RunCourtOpts {
  client: any;
  model: string;
  /** Same content blocks sent to the primary analysis: document image/PDF, ELA heatmap, verified metadata text. */
  userContent: any[];
  /** The primary dossier (AnalysisReport-shaped) produced before the court convenes. */
  baseReport: any;
  /** The BINDING deterministic facts block (checksums, OFAC) as sent to the primary model — ground truth. */
  bindingFacts: string;
  /** Reasoning effort, mirrors ANALYSIS_EFFORT. Defaults to 'medium' — the court is a check, not a redo of the primary pass. */
  effort?: string;
}

// ---------------------------------------------------------------------------
// Tool schemas (forced-structured output, one call each — mirrors _core.ts's
// submit_report pattern).
// ---------------------------------------------------------------------------

const CASE_SCHEMA = {
  type: 'object',
  properties: {
    position: { type: 'string', enum: ['PROSECUTION', 'DEFENSE'] },
    headline: { type: 'string', description: 'One-sentence summary of this side’s overall case.' },
    points: {
      type: 'array',
      description:
        'Individual arguments, strongest first. Do NOT pad with speculative or filler points — weak, unsupported points are discarded by the judge, so a shorter honest list beats a longer inflated one.',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'The specific assertion.' },
          evidence: {
            type: 'string',
            description:
              'The concrete, OBSERVABLE evidence for this claim — quote or describe exactly what you saw in the document image, the ELA heatmap, or the verified metadata / dossier. Never invent or assume evidence you did not actually observe.',
          },
          weight: { type: 'string', enum: ['Strong', 'Moderate', 'Weak'] },
        },
        required: ['claim', 'evidence', 'weight'],
      },
    },
  },
  required: ['position', 'headline', 'points'],
} as const;

const RULING_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'] },
    riskScore: { type: 'number', description: '0-100. Higher = more likely fraudulent/tampered.' },
    confidence: { type: 'number', description: '0-100 confidence in this ruling.' },
    reasoning: {
      type: 'string',
      description:
        'Substantial, multi-paragraph reasoning: how the two cases were weighed against each other and against the binding facts, and why the verdict landed where it did. This is the final word a human reviewer reads — be specific, not generic.',
    },
    decisive: {
      type: 'array',
      items: { type: 'string' },
      description: 'The specific points (from either side, or from the binding facts) that actually decided the outcome.',
    },
    dismissed: {
      type: 'array',
      items: { type: 'string' },
      description: 'Points raised by either side that were rejected, and a short reason why — this is what prevents both false positives and false negatives.',
    },
  },
  required: ['verdict', 'riskScore', 'confidence', 'reasoning', 'decisive', 'dismissed'],
} as const;

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const PROSECUTION_SYSTEM = `You are the PROSECUTION in an adversarial document-forensics review ("the court"), convened after a primary forensic analysis pass on the attached document. Your sole job is to build the strongest HONEST case that this document is forged, tampered, or fraudulent.

RULES — violating any of these makes your case worthless:
1. Cite ONLY real, observable evidence: what is actually visible in the document image/PDF, in the Error-Level Analysis (ELA) heatmap if one is provided, in the verified technical metadata, and in the condensed dossier from the primary pass. NEVER invent evidence, assume a detail you cannot see, or fabricate the result of a lookup.
2. The BINDING FACTS block (identifier checksum validation, sanctions/OFAC screening — computed deterministically in code) is ground truth. You may argue its implications, but you may never contradict or re-litigate it.
3. Rank every point honestly by evidentiary weight (Strong / Moderate / Weak). Do not pad the case with speculative or weak points to look thorough — the judge discards unsupported points, so a shorter, well-evidenced case beats a longer inflated one.
4. If the document is genuinely clean, say so through the absence of strong points — do not manufacture tampering that is not there. Your credibility as a prosecutor depends on only ever overreaching when the evidence truly supports it.

Call submit_case exactly once with your complete case. No prose outside the tool call.`;

const DEFENSE_SYSTEM = `You are the DEFENSE in an adversarial document-forensics review ("the court"), convened after a primary forensic analysis pass on the attached document. Your job is to argue the INNOCENT explanation for every indicator raised in the primary analysis, and to identify anywhere a prosecution case would overreach.

RULES — violating any of these makes your case worthless:
1. For every flagged or suspicious-looking indicator, consider mundane non-fraudulent explanations FIRST: JPEG re-compression artifacts, scanner/printer noise, a legitimate re-save or re-export (e.g. print-to-PDF, WhatsApp/email re-compression), template revisions by the real issuer, a low-quality photograph/scan of a genuine paper original, normal EXIF stripping by messaging apps or OS share sheets, etc.
2. Cite ONLY real, observable evidence: the document image/PDF, the ELA heatmap if provided, the verified technical metadata, and the condensed dossier from the primary pass. NEVER invent evidence or a lookup you did not perform.
3. The BINDING FACTS block (identifier checksum validation, sanctions/OFAC screening — computed deterministically in code) is ground truth and CANNOT be argued away. A failed checksum is a failed checksum — do not contest it; if it is unfavorable to the document, say so honestly instead of disputing it.
4. Rank every point honestly by evidentiary weight (Strong / Moderate / Weak). Do not pad the case — weak or unsupported points are discarded by the judge. If the primary analysis correctly identified genuine tampering, concede it rather than manufacturing an implausible innocent story.

Call submit_case exactly once with your complete case. No prose outside the tool call.`;

const JUDGE_SYSTEM = `You are the JUDGE in an adversarial document-forensics review. You have been given the PROSECUTION case, the DEFENSE case, and the BINDING FACTS — identifier checksum validation and sanctions/OFAC screening, both computed deterministically in code, which is ground truth outranking either side's opinion.

RULES:
1. Weigh both cases on evidentiary merit alone, not on eloquence or confidence of phrasing. Down-weight or ignore speculative and weakly-evidenced points from EITHER side.
2. The binding, code-computed facts are CONCLUSIVE and cannot be argued away by either side:
   - A FAILED identifier checksum (Aadhaar Verhoeff, PAN structure, GSTIN mod-36, IFSC format, IBAN mod-97) is mathematical proof the number could not have been issued by the real authority — this must push the verdict toward LIKELY_FAKE regardless of how persuasive the defense's other points were.
   - If a sanctions/watchlist source could NOT be reached, you must NOT treat that as a clean result — note it as unresolved, never as exoneration.
3. List, specifically, what was DECISIVE in reaching your verdict, and what you DISMISSED (from either side, or from weak circumstantial signals) and why. This is what makes the ruling defensible and is what prevents both false positives (convicting a genuine document on cosmetic noise) and false negatives (clearing a forged one because the forger was competent).
4. Write substantial, specific reasoning — this ruling is the final word a human reviewer will read before acting. Do not be terse or generic; reference the actual points and facts you weighed.
5. Calibrate the verdict/riskScore using the same bands as the primary analysis: 0-33 AUTHENTIC, 34-66 SUSPICIOUS, 67-100 LIKELY_FAKE. Your ruling may reasonably differ from the primary dossier's verdict if the adversarial process surfaced something new — that is the entire point of the court.

Call submit_ruling exactly once with your complete ruling. No prose outside the tool call.`;

// ---------------------------------------------------------------------------
// Small local helpers (deliberately not imported from _core.ts / verification.ts)
// ---------------------------------------------------------------------------

function clamp(n: unknown, dflt: number): number {
  const v = typeof n === 'number' && isFinite(n) ? n : dflt;
  return Math.max(0, Math.min(100, Math.round(v)));
}
function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}
function str(v: any, dflt = ''): string {
  return typeof v === 'string' && v.trim() ? v : dflt;
}
function truncate(s: string, n: number): string {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** Condense the primary dossier into a compact text block the two advocates and the judge can ground themselves in. */
function condenseReport(report: any): string {
  const lines: string[] = [];
  lines.push(`Document type: ${str(report?.documentType, 'Unknown')}`);
  lines.push(`Primary verdict: ${str(report?.verdict, 'SUSPICIOUS')} (riskScore ${clamp(report?.riskScore, 50)}, confidence ${clamp(report?.confidence, 60)})`);
  if (report?.summary) lines.push(`Summary: ${truncate(str(report.summary), 500)}`);

  const flags = arr(report?.redFlags).slice(0, 8);
  if (flags.length) {
    lines.push('\nRed flags from primary pass:');
    for (const f of flags) lines.push(`  - [${str(f?.severity, '?')}] ${str(f?.title)}: ${truncate(str(f?.detail), 220)} (evidence: ${truncate(str(f?.evidence), 160)})`);
  }

  const failedChecks = arr(report?.consistencyChecks).filter((c) => c?.status === 'FAIL' || c?.status === 'WARN').slice(0, 10);
  if (failedChecks.length) {
    lines.push('\nConsistency checks that did NOT pass:');
    for (const c of failedChecks) lines.push(`  - [${c.status}] ${str(c?.check)}: ${truncate(str(c?.detail), 200)}`);
  }

  const concerns = arr(report?.technicalSignals).filter((s) => s?.concern).slice(0, 10);
  if (concerns.length) {
    lines.push('\nTechnical signals flagged as a concern:');
    for (const s of concerns) lines.push(`  - ${str(s?.label)}: ${truncate(str(s?.value), 200)}`);
  }

  const keyModuleIds = ['forensics', 'typography', 'identity', 'security', 'content', 'financial'];
  const modules = arr(report?.modules).filter((m) => keyModuleIds.includes(m?.id));
  if (modules.length) {
    lines.push('\nKey module narratives (truncated):');
    for (const m of modules) lines.push(`  - [${str(m?.id)} / ${str(m?.status, 'INFO')}] ${truncate(str(m?.narrative), 350)}`);
  }

  return lines.join('\n');
}

/** Mirrors _core.ts's JSON-in-text fallback in case a tool_use block is absent. */
function tryParseJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    try {
      return JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/**
 * One forced-structured-output call, mirroring _core.ts's request shape:
 * thinking {type:'adaptive'}, output_config {effort}, tool_choice 'auto',
 * and the pause_turn resume loop, then extraction of the named tool_use block.
 */
async function callForTool(
  client: any,
  model: string,
  effort: string,
  system: string,
  userContent: any[],
  toolName: string,
  schema: any,
  maxTokens: number,
): Promise<any> {
  const tools: any[] = [
    { name: toolName, description: `Submit the complete structured ${toolName === 'submit_case' ? 'case' : 'ruling'}.`, input_schema: schema },
  ];

  const params = (messages: any[]) =>
    ({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort } as any,
      system,
      tools,
      tool_choice: { type: 'auto' },
      messages,
    }) as any;

  const messages: any[] = [{ role: 'user', content: userContent }];
  let response = await client.messages.create(params(messages));
  let guard = 0;
  while (response.stop_reason === 'pause_turn' && guard++ < 6) {
    messages.push({ role: 'assistant', content: response.content as any });
    response = await client.messages.create(params(messages));
  }

  const block: any = (response.content as any[])?.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (block?.input) return block.input;

  const textBlock: any = (response.content as any[])?.find((b) => b.type === 'text');
  return tryParseJson(textBlock?.text || '');
}

function normalizeArgument(input: any, position: 'PROSECUTION' | 'DEFENSE'): CourtArgument {
  const points = arr(input?.points)
    .map((p: any) => ({
      claim: str(p?.claim),
      evidence: str(p?.evidence),
      weight: (['Strong', 'Moderate', 'Weak'].includes(p?.weight) ? p.weight : 'Weak') as 'Strong' | 'Moderate' | 'Weak',
    }))
    .filter((p) => p.claim);
  return {
    position,
    headline: str(input?.headline, position === 'PROSECUTION' ? 'No case for tampering was established.' : 'No innocent explanation was required.'),
    points,
  };
}

function normalizeRuling(input: any): CourtRuling {
  const verdict: Verdict = ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'].includes(input?.verdict) ? input.verdict : 'SUSPICIOUS';
  return {
    verdict,
    riskScore: clamp(input?.riskScore, 50),
    confidence: clamp(input?.confidence, 60),
    reasoning: str(input?.reasoning),
    decisive: arr(input?.decisive).map((s: any) => str(s)).filter(Boolean),
    dismissed: arr(input?.dismissed).map((s: any) => str(s)).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runCourt(opts: {
  client: any;
  model: string;
  userContent: any[];
  baseReport: any;
  bindingFacts: string;
  effort?: string;
}): Promise<CourtProceedings | null> {
  try {
    const { client, model, userContent, baseReport, bindingFacts } = opts;
    const effort = opts.effort || 'medium';

    const summary = condenseReport(baseReport);
    const summaryBlock = {
      type: 'text',
      text: `CONDENSED PRIMARY-PASS DOSSIER (for reference — ground your case in the actual document/ELA/metadata content above, do not merely restate this):\n${summary}`,
    } as const;
    const bindingBlock = { type: 'text', text: bindingFacts } as const;

    // ---- Round 1: PROSECUTION vs DEFENSE, concurrently, from identical evidence ----
    const prosecutionContent = [
      ...userContent,
      summaryBlock,
      bindingBlock,
      { type: 'text', text: 'TASK: Build the strongest HONEST prosecution case that this document is forged or tampered. Call submit_case exactly once.' },
    ];
    const defenseContent = [
      ...userContent,
      summaryBlock,
      bindingBlock,
      { type: 'text', text: 'TASK: Build the strongest HONEST defense case — the innocent explanation for each indicator, and where a prosecutor would overreach. Call submit_case exactly once.' },
    ];

    const [prosecutionInput, defenseInput] = await Promise.all([
      callForTool(client, model, effort, PROSECUTION_SYSTEM, prosecutionContent, 'submit_case', CASE_SCHEMA, 4000),
      callForTool(client, model, effort, DEFENSE_SYSTEM, defenseContent, 'submit_case', CASE_SCHEMA, 4000),
    ]);

    if (!prosecutionInput || !defenseInput) return null;

    const prosecution = normalizeArgument(prosecutionInput, 'PROSECUTION');
    const defense = normalizeArgument(defenseInput, 'DEFENSE');

    // ---- Round 2: JUDGE weighs both cases against the binding facts ----
    const judgeContent = [
      { type: 'text', text: `PROSECUTION CASE:\n${JSON.stringify(prosecution, null, 2)}` },
      { type: 'text', text: `DEFENSE CASE:\n${JSON.stringify(defense, null, 2)}` },
      bindingBlock,
      summaryBlock,
      { type: 'text', text: 'TASK: Weigh both cases against the binding facts and issue your final ruling. Call submit_ruling exactly once.' },
    ];

    const rulingInput = await callForTool(client, model, effort, JUDGE_SYSTEM, judgeContent, 'submit_ruling', RULING_SCHEMA, 8000);
    if (!rulingInput) return null;

    const ruling = normalizeRuling(rulingInput);

    return { prosecution, defense, ruling };
  } catch (e) {
    console.error('court pipeline failed (best-effort, returning null):', e);
    return null;
  }
}
