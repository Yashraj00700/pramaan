/**
 * api/entity.ts
 * -------------
 * Entity Intelligence: given a name (company or person), returns
 *   1. `screening`  — a real, code-computed OFAC SDN watchlist screen
 *                      (reuses api/sanctions.ts — same engine the main
 *                      dossier uses). A name-match-only signal, never a
 *                      confirmed identification.
 *   2. `assessment`  — a Claude-generated PLAUSIBILITY read on the name
 *                      itself (does it look like a well-formed, real-world
 *                      company/person name; any structural red flags such
 *                      as known shell-naming patterns, generic/templated
 *                      names, or naming-convention mismatches for the
 *                      claimed entity kind). This is explicitly NOT a
 *                      registry lookup — see the honesty contract below.
 *   3. `requiresLiveVerification` — the list of checks that would actually
 *                      confirm this entity's identity/status, each paired
 *                      with which live authority/source would perform it.
 *
 * CRITICAL HONESTY CONTRACT (non-negotiable — matches api/_core.ts and
 * api/sanctions.ts):
 *   - This function NEVER calls, queries, or scrapes any company/person
 *     registry, GST/PAN database, MCA portal, or DigiLocker. It has no
 *     integration with any of those systems.
 *   - The Claude assessment is instructed, under threat of the response
 *     being discarded downstream, to NEVER claim or imply that GST, PAN,
 *     MCA/company-registration, or DigiLocker/identity verification was
 *     performed. Any such check the user would actually need goes into
 *     `requiresLiveVerification`, not into `assessment`.
 *   - `screening` is the one piece of this response backed by a real,
 *     deterministic, code-computed lookup (the live OFAC SDN CSV). If that
 *     lookup could not be reached, `screening.available` is false and no
 *     check is silently treated as "clean" — see api/sanctions.ts.
 *
 * ESM note: every relative import below carries an explicit `.js`
 * extension — required for Node ESM on Vercel (see api/_core.ts header).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { screenNames } from './sanctions.js';
import { toUserMessage, withRetry } from './_validate.js';
import type { ConsistencyCheck, TechnicalSignal } from '../types';

export const config = { maxDuration: 60 };

// Mirrors the model id used by api/_core.ts (MODEL) and api/court.ts —
// kept as a local constant since _core.ts does not export it and this
// agent does not own that file.
const MODEL = 'claude-opus-5';

type EntityKind = 'company' | 'person';

export interface EntityScreening {
  checks: ConsistencyCheck[];
  signals: TechnicalSignal[];
  available: boolean;
}

export interface EntityAssessment {
  /** How plausible the SUPPLIED NAME looks as a real, well-formed entity name — NOT a verification result. */
  plausibility: 'PLAUSIBLE' | 'UNCERTAIN' | 'IMPLAUSIBLE';
  /** 0-100 confidence in this plausibility read (confidence in the read itself, not in the entity's legitimacy). */
  confidence: number;
  /** One-paragraph, honest summary. Must not claim any registry/database lookup occurred. */
  summary: string;
  /** Specific, named-based structural observations (naming convention fit, genericness, known shell-pattern resemblance, etc). */
  observations: string[];
}

export interface RequiredLiveCheck {
  /** What still needs confirming, e.g. "Company registration status". */
  item: string;
  /** The authority/source that could actually confirm it. */
  authority: string;
  /** Why this can't be answered from the name alone / what it would settle. */
  reason: string;
}

export interface EntityIntelResponse {
  name: string;
  kind: EntityKind;
  screening: EntityScreening;
  assessment: EntityAssessment;
  requiresLiveVerification: RequiredLiveCheck[];
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function validateBody(body: unknown): { name: string; kind: EntityKind } | { error: string; status: number } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object with a "name" field.', status: 400 };
  }
  const b = body as Record<string, unknown>;
  const rawName = typeof b.name === 'string' ? b.name.trim() : '';
  if (!rawName) {
    return { error: 'A non-empty "name" field is required.', status: 400 };
  }
  if (rawName.length > 200) {
    return { error: 'Name is too long (200 character limit).', status: 400 };
  }
  const kind: EntityKind = b.kind === 'person' ? 'person' : 'company';
  if (b.kind !== undefined && b.kind !== 'company' && b.kind !== 'person') {
    return { error: 'If provided, "kind" must be "company" or "person".', status: 400 };
  }
  return { name: rawName, kind };
}

// ---------------------------------------------------------------------------
// Claude structured plausibility assessment
// ---------------------------------------------------------------------------

const ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    plausibility: { type: 'string', enum: ['PLAUSIBLE', 'UNCERTAIN', 'IMPLAUSIBLE'] },
    confidence: { type: 'number', description: '0-100 confidence in this plausibility read (NOT confidence that the entity is legitimate — you have not verified that).' },
    summary: {
      type: 'string',
      description:
        'One honest paragraph. Must describe only what can be judged from the name string itself (and general public knowledge of well-known, unambiguous entities, if genuinely applicable). Must NEVER claim or imply that a company registry, GST, PAN, MCA, or DigiLocker lookup was performed.',
    },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Specific, name-based structural observations: does the name follow the expected convention for the stated kind (e.g. a company name plausibly carrying "Private Limited"/"LLP"/"Pvt Ltd" vs. a bare personal name); is it generic/templated in a way associated with shell entities; is it a well-known real-world entity you can identify with genuine confidence; any spelling/formatting oddities. Do not fabricate specifics you cannot support.',
    },
  },
  required: ['plausibility', 'confidence', 'summary', 'observations'],
} as const;

const REQUIRED_CHECKS_SCHEMA = {
  type: 'object',
  properties: {
    requiresLiveVerification: {
      type: 'array',
      description: 'Every check needed to actually confirm this entity, each paired with the real authority/source that would perform it.',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'What needs confirming, e.g. "Company registration status and CIN".' },
          authority: { type: 'string', description: 'The real authority/source that could confirm it, e.g. "Ministry of Corporate Affairs (MCA21 portal, mca.gov.in)".' },
          reason: { type: 'string', description: 'Why this cannot be answered from the name alone.' },
        },
        required: ['item', 'authority', 'reason'],
      },
    },
  },
  required: ['requiresLiveVerification'],
} as const;

const SYSTEM_PROMPT = `You are Pramaan's entity-intelligence assistant. You are given ONLY a name (and whether it is claimed to be a company or a person) — you have NO access to any company registry, GST database, PAN database, MCA (Ministry of Corporate Affairs) records, DigiLocker, or any other live/external identity source. You cannot browse the web and have not been given any lookup results.

CRITICAL HONESTY RULES — a response that violates these is worthless and will be discarded:
1. NEVER state or imply that you checked, verified, or looked up this entity in any registry, government database, GST/PAN system, MCA records, or DigiLocker. You did not. If your wording could be read that way, rewrite it.
2. Your "assessment" is a plausibility read of the NAME STRING ONLY: does it look like a well-formed, real name for the stated entity kind; does it resemble known shell-company naming patterns (generic, templated, overly vague trading names); is it a genuinely well-known, unambiguous real-world entity you can name with honest confidence (e.g. a large well-known corporation) — versus a name you simply cannot evaluate further without a live source.
3. Every substantive question about this entity's actual legal status, registration, tax compliance, or identity documents belongs in the requiresLiveVerification list, not in the assessment. Be thorough and specific there — think about what a human analyst would actually need to check and which real authority would answer it (for an Indian company: MCA/CIN, GSTIN via GSTN, PAN via the Income Tax e-filing portal; for a person: DigiLocker/Aadhaar-linked identity systems, PAN; for either: sanctions/watchlist currency beyond the one-time screen already performed, litigation/insolvency records, credit bureau records, as applicable).
4. Call BOTH tools exactly once each: submit_assessment and submit_required_checks. No prose outside the tool calls.`;

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

async function getAssessment(client: Anthropic, name: string, kind: EntityKind): Promise<{ assessment: EntityAssessment; requiresLiveVerification: RequiredLiveCheck[] }> {
  const effort = (process.env.ANALYSIS_EFFORT || 'medium') as any;

  const tools: any[] = [
    { name: 'submit_assessment', description: 'Submit the name-plausibility assessment.', input_schema: ASSESSMENT_SCHEMA },
    { name: 'submit_required_checks', description: 'Submit the list of checks that need a live authority/source.', input_schema: REQUIRED_CHECKS_SCHEMA },
  ];

  const userContent = [
    {
      type: 'text',
      text: `Entity name: "${name}"\nClaimed kind: ${kind}\n\nCall submit_assessment with your honest, name-only plausibility read, and call submit_required_checks with the full list of live-verification checks a human would still need to run. Call both exactly once.`,
    },
  ];

  const params = (messages: any[]) =>
    ({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      output_config: { effort } as any,
      system: SYSTEM_PROMPT,
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

  const blocks = (response.content as any[]) || [];
  const assessmentBlock: any = blocks.find((b) => b.type === 'tool_use' && b.name === 'submit_assessment');
  const checksBlock: any = blocks.find((b) => b.type === 'tool_use' && b.name === 'submit_required_checks');

  const textBlock: any = blocks.find((b) => b.type === 'text');
  const fallback = textBlock ? tryParseJson(textBlock.text || '') : null;

  const rawAssessment = assessmentBlock?.input ?? fallback ?? {};
  const rawChecks = checksBlock?.input?.requiresLiveVerification ?? fallback?.requiresLiveVerification ?? [];

  const assessment: EntityAssessment = {
    plausibility: (['PLAUSIBLE', 'UNCERTAIN', 'IMPLAUSIBLE'].includes(rawAssessment?.plausibility) ? rawAssessment.plausibility : 'UNCERTAIN') as EntityAssessment['plausibility'],
    confidence: clamp(rawAssessment?.confidence, 40),
    summary: str(rawAssessment?.summary, 'No assessment could be generated for this name.'),
    observations: arr(rawAssessment?.observations).map((s: any) => str(s)).filter(Boolean),
  };

  const requiresLiveVerification: RequiredLiveCheck[] = arr(rawChecks)
    .map((c: any) => ({
      item: str(c?.item),
      authority: str(c?.authority),
      reason: str(c?.reason),
    }))
    .filter((c) => c.item && c.authority);

  return { assessment, requiresLiveVerification };
}

// Baseline checks always surfaced, even if the model call fails entirely or
// returns a thin list — these are true regardless of what Claude says, so
// the honesty contract holds even in a degraded-response scenario.
function baselineRequiredChecks(kind: EntityKind): RequiredLiveCheck[] {
  if (kind === 'company') {
    return [
      { item: 'Company registration status and CIN', authority: 'Ministry of Corporate Affairs (MCA21 portal, mca.gov.in)', reason: 'Name alone cannot confirm active registration, incorporation date, or corporate identity number.' },
      { item: 'GSTIN validity and filing status', authority: 'GST Network (GSTN) portal', reason: 'GST registration and compliance status require a live query against GSTN records.' },
      { item: 'PAN validity', authority: 'Income Tax e-filing portal / NSDL PAN verification', reason: 'PAN status cannot be inferred from a business name.' },
      { item: 'Directors, beneficial owners, and filing history', authority: 'MCA21 / registrar of companies filings', reason: 'This requires pulling the entity’s actual filed records, not just its name.' },
    ];
  }
  return [
    { item: 'Identity verification', authority: 'DigiLocker / Aadhaar-linked identity systems', reason: 'A name alone cannot confirm a person’s identity documents.' },
    { item: 'PAN validity', authority: 'Income Tax e-filing portal / NSDL PAN verification', reason: 'PAN status cannot be inferred from a name.' },
  ];
}

function mergeRequiredChecks(fromModel: RequiredLiveCheck[], kind: EntityKind): RequiredLiveCheck[] {
  const baseline = baselineRequiredChecks(kind);
  const seen = new Set(fromModel.map((c) => c.item.toLowerCase()));
  const merged = [...fromModel];
  for (const b of baseline) {
    if (!seen.has(b.item.toLowerCase())) merged.push(b);
  }
  // Always present regardless of kind: this screen's own limits.
  merged.push({
    item: 'Confirmed identification of any OFAC name match',
    authority: 'OFAC / US Treasury sanctions program officer, or qualified compliance counsel',
    reason: 'The screening above is a normalized name match only — common names produce false positives and this alone can never confirm or clear an identity.',
  });
  return merged;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validated = validateBody(req.body);
  if ('error' in validated) {
    return res.status(validated.status).json({ error: validated.error });
  }
  const { name, kind } = validated;

  // Run OFAC screening — real, code-computed, independent of the model call.
  const screeningResult = await screenNames([name]);
  const screening: EntityScreening = {
    checks: screeningResult.checks,
    signals: screeningResult.signals,
    available: screeningResult.available,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No model available — still return the real screening result plus an
    // honest, unfabricated assessment, rather than fabricating a plausibility read.
    const response: EntityIntelResponse = {
      name,
      kind,
      screening,
      assessment: {
        plausibility: 'UNCERTAIN',
        confidence: 0,
        summary: 'No plausibility assessment could be generated — the analysis service is not configured on this server.',
        observations: [],
      },
      requiresLiveVerification: mergeRequiredChecks([], kind),
    };
    return res.status(200).json(response);
  }

  try {
    const client = new Anthropic({ apiKey });
    const { assessment, requiresLiveVerification } = await withRetry(() => getAssessment(client, name, kind));

    const response: EntityIntelResponse = {
      name,
      kind,
      screening,
      assessment,
      requiresLiveVerification: mergeRequiredChecks(requiresLiveVerification, kind),
    };
    return res.status(200).json(response);
  } catch (e: unknown) {
    console.error('entity assessment error:', e);
    // Even on a model failure, the OFAC screening above is real and useful —
    // but we do NOT fabricate an assessment to paper over the failure.
    const response: EntityIntelResponse = {
      name,
      kind,
      screening,
      assessment: {
        plausibility: 'UNCERTAIN',
        confidence: 0,
        summary: `${toUserMessage(e)} No plausibility assessment could be generated for this name.`,
        observations: [],
      },
      requiresLiveVerification: mergeRequiredChecks([], kind),
    };
    // The OFAC screening above is real and still worth returning even when
    // the model call failed, so this is a 200 with a degraded (never
    // fabricated) assessment rather than an error status.
    return res.status(200).json(response);
  }
}
