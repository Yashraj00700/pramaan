/**
 * Single-call adversarial review.
 *
 * The original court made three sequential model calls (prosecution, defence,
 * judge). That is intellectually tidy but far too slow for an interactive scan.
 * This version asks for all three in ONE structured response: the model must
 * argue both sides and then rule. Same output shape, roughly a third of the
 * latency of the sequential version.
 *
 * _core.ts now also runs this CONCURRENTLY (Promise.allSettled) alongside the
 * two dossier-module calls, all three fed the Pass-A result plus the same
 * document/ELA/metadata content — so this call's cost is fully overlapped
 * with theirs rather than tacked on afterward.
 */
import type { CourtProceedings } from '../types';

const SYSTEM = `You are an adversarial document-review panel. You will produce THREE things in one response:

1. PROSECUTION — the strongest HONEST case that the document is forged or tampered, citing only evidence actually visible in the document, the ELA image, or the verified metadata.
2. DEFENCE — the innocent explanation for each indicator (JPEG recompression, scanner/printer artefacts, a legitimate re-save, template revisions, low-quality capture), and where the prosecution overreaches.
3. RULING — weigh both and decide.

RULES:
- The BINDING FACTS supplied below were computed in code. They are conclusive. A failed checksum cannot be argued away; a watchlist that failed to download must NOT be treated as "clean".
- Never invent evidence. A weak argument must be dropped, not padded.
- In the ruling, list what was DECISIVE and what you DISMISSED and why. The dismissed list matters: it is how we avoid accusing honest applicants.
- Bands: 0-33 AUTHENTIC, 34-66 SUSPICIOUS, 67-100 LIKELY_FAKE.

Call submit_proceedings exactly once. No prose outside the tool call.`;

const ARG = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          weight: { type: 'string', enum: ['Strong', 'Moderate', 'Weak'] },
        },
        required: ['claim', 'evidence', 'weight'],
      },
    },
  },
  required: ['headline', 'points'],
};

const SCHEMA = {
  type: 'object',
  properties: {
    prosecution: ARG,
    defense: ARG,
    ruling: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'] },
        riskScore: { type: 'number' },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
        decisive: { type: 'array', items: { type: 'string' } },
        dismissed: { type: 'array', items: { type: 'string' } },
      },
      required: ['verdict', 'riskScore', 'confidence', 'reasoning', 'decisive', 'dismissed'],
    },
  },
  required: ['prosecution', 'defense', 'ruling'],
};

/** Condenses a report (Pass-A core, or the fuller merged report) into compact
 *  text for a downstream model call. Exported so _core.ts's module-group calls
 *  can reuse the exact same condensation the court uses. */
export function condense(r: any): string {
  const s = (a: any[], f: (x: any) => string, n = 6) => (Array.isArray(a) ? a.slice(0, n).map(f).join('\n') : '');
  return [
    `Document: ${r?.documentType}`,
    `Primary-pass verdict: ${r?.verdict} (risk ${r?.riskScore})`,
    `Summary: ${String(r?.summary || '').slice(0, 600)}`,
    'Red flags:', s(r?.redFlags, (f) => `- [${f.severity}] ${f.title}: ${String(f.detail || '').slice(0, 160)}`),
    'Consistency checks:', s(r?.consistencyChecks, (c) => `- [${c.status}] ${c.check}`, 10),
  ].join('\n');
}

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
    const res = await client.messages.create({
      model,
      max_tokens: 5000,
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort || 'low' },
      system: SYSTEM,
      tools: [
        {
          name: 'submit_proceedings',
          description: 'Submit the prosecution case, the defence case, and the ruling.',
          input_schema: SCHEMA as any,
        },
      ],
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: [
            ...userContent,
            { type: 'text', text: `CONDENSED PRIMARY-PASS FINDINGS:\n${condense(baseReport)}` },
            { type: 'text', text: bindingFacts },
            { type: 'text', text: 'TASK: argue both sides and rule. Call submit_proceedings exactly once.' },
          ],
        },
      ],
    } as any);

    const block: any = (res.content as any[]).find((b) => b.type === 'tool_use' && b.name === 'submit_proceedings');
    const out: any = block?.input;
    if (!out?.ruling) return null;
    out.prosecution = { position: 'PROSECUTION', ...(out.prosecution || {}) };
    out.defense = { position: 'DEFENSE', ...(out.defense || {}) };
    return out as CourtProceedings;
  } catch (e) {
    console.error('court-fast failed (non-fatal):', e);
    return null;
  }
}
