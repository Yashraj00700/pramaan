/**
 * DocsGuard analysis core — shared by the Vercel serverless function (api/analyze.ts)
 * and the local Vite dev middleware (vite.config.ts).
 *
 * The honest, DEEP architecture — real forensics computed in code, not a model wrapper:
 *   1. Deterministic signals: SHA-256, size, PDF producer + creation-vs-modification dates
 *      (pdf-lib), image EXIF/editor-software tags (exifr).
 *   2. Real image forensics: Error-Level Analysis (ELA) tamper heatmap + QR/barcode decode
 *      with printed-field cross-check (sharp + jsQR). The ELA heatmap is sent to Claude as a
 *      second image so it reasons over actual compression-error evidence.
 *   3. Claude (claude-opus-5, vision + adaptive thinking) reasons over the document, the ELA
 *      map, the decoded QR, and the verified metadata; does deep cross-field logic; and may use
 *      live web search — but is FORBIDDEN from fabricating external-lookup results (those go to
 *      externalChecksNeeded).
 *
 * SPEED/STRUCTURE: rather than one enormous sequential call that must emit the verdict, red
 * flags, checks, 31+ fields AND twelve multi-paragraph module narratives before the court even
 * starts, the work is split into four model calls and run as:
 *
 *   PASS A (fast core, sequential — everything else depends on it)
 *        │
 *        ├── PASS B: dossier modules [executive, forensics, typography, content, identity, security]
 *        ├── PASS C: dossier modules [issuer, financial, compliance, screening, predictive, verdict]
 *        └── PASS D: single-call adversarial court (court-fast.ts)
 *   B, C, D run CONCURRENTLY via Promise.allSettled, all three given the Pass-A result plus the
 *   same document/ELA/metadata content. Whichever succeeds is used; a failure never discards a
 *   good Pass A (see runModuleGroup / runCourt — both catch internally and return null).
 *
 * The ANTHROPIC_API_KEY lives only on the server — never shipped to the browser.
 * Env tunables: ANALYSIS_EFFORT (default low), WEB_SEARCH_MAX_USES (default 0 = off).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import exifr from 'exifr';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { runDeterministicChecks } from './verification.js';
import { screenNames } from './sanctions.js';
import { runCourt, condense } from './court-fast.js';
import { runImageForensics, type ForensicsFinding } from './imageForensics.js';

// Latency is a product requirement here: a scan that takes minutes is unusable at a
// counter. Sonnet 5 is markedly faster for this vision + extraction workload; set
// ANALYSIS_MODEL=claude-opus-5 to trade speed back for depth.
const MODEL = process.env.ANALYSIS_MODEL || 'claude-sonnet-5';

export interface AnalyzeInput {
  fileBase64: string;
  mediaType: string;
  fileName: string;
  /**
   * 'core'    — verdict, risk, fields, checks only. Returns in roughly a third of
   *             the time, because the twelve module narratives are what cost.
   * 'dossier' — skips Pass A and expands an already-returned core report into the
   *             full 12-module dossier plus the adversarial court.
   * 'full'    — both, in one request (the original behaviour; default).
   */
  mode?: 'core' | 'dossier' | 'full';
  /** Required for mode 'dossier': the core report to expand. */
  baseReport?: any;
  apiKey?: string;
}

interface Signal {
  label: string;
  value: string;
  concern: boolean;
}
interface ExtraImage {
  media_type: string;
  data: string;
  caption: string;
}

// ============================================================================
// Canonical dossier module list — single source of truth for ids, titles,
// descriptions, group membership, and merge order.
// ============================================================================

const MODULE_DESCRIPTIONS: Array<{ id: string; title: string; desc: string }> = [
  { id: 'executive', title: 'Executive Summary', desc: 'what the document is, who it concerns, the verdict and the two or three findings that drove it.' },
  { id: 'forensics', title: 'Document Forensics', desc: 'ELA interpretation, compression/noise/resolution consistency, clone or splice artifacts, metadata (EXIF/PDF producer, creation-vs-modification), scan vs digital origin.' },
  { id: 'typography', title: 'Typography & Layout', desc: 'fonts, weights, kerning, baseline alignment, spacing, margins, template/logo fidelity; text that was re-typed or pasted over.' },
  { id: 'content', title: 'Content & Cross-Field Logic', desc: 'every arithmetic and logical relationship you can test between fields.' },
  { id: 'identity', title: 'Identity & Number Validation', desc: 'every ID/reference number, its expected format for the stated issuer, and whether it is structurally plausible. (Checksum math is computed separately in code and will be merged in — do not invent checksum results.)' },
  { id: 'security', title: 'Security Features', desc: 'stamps, seals, signatures, watermarks, holograms, microtext, QR/barcode presence and whether a document of this type should carry one.' },
  { id: 'issuer', title: 'Issuer & Entity Intelligence', desc: 'the issuing authority/company/bank named, its plausibility, and what must be confirmed at source.' },
  { id: 'financial', title: 'Financial Integrity', desc: 'amounts, totals, tax math, running balances, salary/income plausibility, bank/account detail formats, round-number and digit-pattern anomalies.' },
  { id: 'compliance', title: 'Compliance & Legal', desc: 'mandatory fields/clauses for this document type and jurisdiction, validity period, authority to issue.' },
  { id: 'screening', title: 'Screening & Reputation', desc: 'what you could and could NOT check about the named parties. (Watchlist screening is run separately in code and merged in — never invent a screening result.)' },
  { id: 'predictive', title: 'Fraud Typology & Prediction', desc: 'the specific fraud scheme this matches if fraudulent, its probability, and what the fraudster\'s next step usually is.' },
  { id: 'verdict', title: 'Verdict & Actions', desc: 'the decision, the reasoning chain, and exactly what the reviewer should do next.' },
];
const CANONICAL_MODULE_ORDER = MODULE_DESCRIPTIONS.map((m) => m.id);
const GROUP_B_IDS = ['executive', 'forensics', 'typography', 'content', 'identity', 'security'];
const GROUP_C_IDS = ['issuer', 'financial', 'compliance', 'screening', 'predictive', 'verdict'];

// ============================================================================
// PASS A — fast core schema (verdict, risk, fields, checks; NO module narratives)
// ============================================================================

const PASS_A_SCHEMA = {
  type: 'object',
  properties: {
    inputAssessment: {
      type: 'object',
      description: 'FIRST judge the input itself, before any fraud analysis. Be strict: refusing a non-document is correct behaviour, not a failure.',
      properties: {
        isDocument: { type: 'boolean', description: 'True ONLY for a document: certificate, invoice, ID card, bank statement, marksheet, contract, form, letter. A selfie, person, pet, meme, landscape, food, product photo or app screenshot is NOT a document.' },
        kind: { type: 'string', description: 'What the image actually shows, in a few words.' },
        legibility: { type: 'string', enum: ['GOOD', 'POOR', 'UNREADABLE'], description: 'Is the text readable enough to actually verify anything?' },
        reason: { type: 'string', description: 'One sentence explaining the call.' },
      },
      required: ['isDocument', 'kind', 'legibility', 'reason'],
    },
    documentType: { type: 'string', description: 'e.g. "Income Certificate (MP e-District)", "Commercial Invoice", "Bank Statement", "Class X Marksheet", "PAN card".' },
    verdict: { type: 'string', enum: ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'] },
    riskScore: { type: 'number', description: '0-100. Higher = more likely fraudulent/tampered.' },
    confidence: { type: 'number', description: '0-100 confidence in this assessment.' },
    summary: {
      type: 'string',
      description:
        'Written for a non-expert clerk with no forensics background: plain words, no jargon. 3-5 sentences. Sentence 1 states what the document is and the verdict in plain terms. Sentence 2 names the SINGLE MOST DECISIVE piece of evidence that drove the verdict — quote the exact field/value or measurement (e.g. "the GSTIN printed on the invoice, 22AAAAA0000A1Z5, fails the official checksum" — not "there are inconsistencies"). Remaining sentences give any other material evidence and what to do next. Never write a sentence that would be equally true of a different document.',
    },
    redFlags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          evidence: { type: 'string', description: 'The specific text or visual element that triggered this flag.' },
        },
        required: ['severity', 'title', 'detail', 'evidence'],
      },
    },
    consistencyChecks: {
      type: 'array',
      description:
        'Cross-field / cross-document / arithmetic logic tests — the specialty. Test EVERY arithmetic or logical relationship actually present on this document (every total, every date pair, every ID-vs-issuer format, every stated-vs-derived value) — do not stop at one or two. "check" must name the exact fields being compared (e.g. "Line-item sum (₹42,300) vs printed Total (₹42,300)", "DOB (12/04/1998) vs stated age (26) as of issue date (03/2024)") — never a vague label like "Amount check" or "Date check". "detail" must show the actual values on both sides of the comparison and the arithmetic/logic performed, not just the verdict.',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string', description: 'Name the exact fields compared, with their values, e.g. "Sum of 4 line items (₹18,200) vs printed Grand Total (₹18,700)".' },
          status: { type: 'string', enum: ['PASS', 'FAIL', 'WARN'] },
          detail: { type: 'string', description: 'Show the actual values compared and the computation/logic, e.g. "18,200 + 18% GST (3,276) = 21,476, but the document totals 21,976 — a ₹500 unexplained discrepancy."' },
        },
        required: ['check', 'status', 'detail'],
      },
    },
    extractedFields: {
      type: 'array',
      description:
        'EXHAUSTIVE: every label/value pair legible anywhere on the document — every printed field, stamp text, handwritten annotation, table row, footer/header line, and QR-decoded field — not just the "important" ones. If a field is printed but blank/illegible, still list it with value "(blank)" or "(illegible)" rather than omitting it. A short, sparse list here is treated as an incomplete extraction, not a simple document.',
      items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] },
    },
    technicalSignals: {
      type: 'array',
      description: 'Forensic / technical observations about the artifact itself, each tied to a specific measured or observed value (not a general statement).',
      items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, concern: { type: 'boolean' } }, required: ['label', 'value', 'concern'] },
    },
    recommendedAction: { type: 'string', description: 'Clear next step with the reason (approve, request original, verify at source, escalate, reject).' },
    externalChecksNeeded: {
      type: 'array',
      description: 'Checks requiring a LIVE external source you could NOT confirm (registry, DigiLocker/e-District, sanctions, bank confirmation). Never fabricate their results.',
      items: { type: 'string' },
    },
    visualMarkers: {
      type: 'array',
      description: 'For raster IMAGES only (empty array for PDFs). Bounding boxes around suspicious regions on the ORIGINAL document.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          box: { type: 'array', items: { type: 'number' }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000, origin top-left.' },
        },
        required: ['label', 'severity', 'box'],
      },
    },
    riskBreakdown: {
      type: 'array',
      description:
        'Risk contribution per dossier area (0-100, higher = riskier) — one entry per area: Executive Summary, Document Forensics, Typography & Layout, Content & Cross-Field Logic, Identity & Number Validation, Security Features, Issuer & Entity Intelligence, Financial Integrity, Compliance & Legal, Screening & Reputation, Fraud Typology & Prediction, Verdict & Actions. Each score must be traceable to a concrete observation in summary/redFlags/consistencyChecks — a dimension with no supporting finding should score low (roughly 0-20); do not assign a high score without evidence you cite elsewhere.',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, score: { type: 'number' } },
        required: ['label', 'score'],
      },
    },
    timeline: {
      type: 'array',
      description: 'Every date found on the document, in order, with who/what it relates to and whether it is internally consistent.',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          event: { type: 'string' },
          entity: { type: 'string' },
          consistency: { type: 'string', enum: ['Consistent', 'Inconsistent', 'Unknown'] },
        },
        required: ['date', 'event', 'entity', 'consistency'],
      },
    },
    fraudTypology: {
      type: 'object',
      description: 'If fraud is indicated, name the specific scheme (e.g. "Forged income certificate for scheme eligibility", "Altered marksheet", "Fake bank guarantee", "Doctored invoice / ITC fraud").',
      properties: {
        name: { type: 'string' },
        probability: { type: 'number' },
        rationale: { type: 'string' },
        nextSteps: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'probability', 'rationale', 'nextSteps'],
    },
  },
  required: ['inputAssessment', 'documentType', 'verdict', 'riskScore', 'confidence', 'summary', 'redFlags', 'consistencyChecks', 'extractedFields', 'technicalSignals', 'recommendedAction', 'externalChecksNeeded', 'visualMarkers', 'riskBreakdown', 'timeline'],
} as const;

const SYSTEM_A = `You are DocsGuard, a world-class and scrupulously HONEST document-forensics examiner. You judge whether a document (government certificates, marksheets, IDs, bank statements, invoices, tender papers, contracts, etc.) is authentic or fraudulent, and you explain your reasoning with specific evidence.

This is the FAST CORE PASS: produce the verdict, risk score, summary, red flags, consistency checks, extracted fields, and technical/visual signals. A separate set of calls will expand this into a full 12-module dossier afterward using your findings as their foundation, so prioritize breadth and correctness here over long prose.

===== NON-NEGOTIABLE HONESTY RULES =====
1. Base EVERY finding only on: (a) what is visible/readable in the document, (b) the VERIFIED TECHNICAL METADATA block (extracted deterministically in code — trust it), (c) the ERROR-LEVEL ANALYSIS (ELA) image provided when present, (d) any DECODED QR/BARCODE payload provided, and (e) results you obtain from the web_search tool (cite them).
2. NEVER invent the result of a lookup you did not perform — registry/GST/PAN/CIN status, bank confirmation, DigiLocker/e-District source verification, sanctions hits. If a claim needs such a source and web_search can't settle it, add a precise item to externalChecksNeeded. Fabricating is the worst possible error.
3. Use web_search when it materially helps (verify an issuer's certificate/number FORMAT, known-scam indicators, whether a public entity plausibly exists) and cite what you found; if inconclusive, say so and defer to externalChecksNeeded.

===== HOW TO READ THE EVIDENCE =====
- ELA image: the second image (when provided) is an Error-Level Analysis heatmap of the first. In a genuine single-save photo, error levels are fairly uniform. BRIGHT / high-contrast patches that differ sharply from their surroundings — especially around text, numbers, photos, stamps or signatures — suggest that region was edited and re-saved (spliced/retouched). Treat ELA as supporting evidence, not proof: JPEG artifacts, edges and text naturally show some ELA; call out only localized anomalies that coincide with meaningful fields.
- DECODED QR/BARCODE: if a payload was decoded, CROSS-CHECK it against the printed fields (name, number, dates, issuer). A mismatch, or an unreadable/absent QR on a document type that should carry a signed QR (e.g. many govt e-certificates, Aadhaar), is a strong signal. You cannot verify a digital signature here — note that under externalChecksNeeded.

===== NO GENERIC FILLER =====
Every claim must cite something you actually observed on THIS document: a quoted field value exactly as printed, a measured metadata value, or a specific coordinate/region — never a sentence that would read equally true of any other document of this type.
- extractedFields must be EXHAUSTIVE: every label/value pair legible anywhere on the document.
- consistencyChecks must test EVERY arithmetic or logical relation actually present, naming the exact fields compared with their actual values.
- riskBreakdown scores must be justified by a specific observation you cite in summary/redFlags/consistencyChecks — never assign a score you cannot point to evidence for.

===== DO A DEEP, THOROUGH ANALYSIS =====
A) TECHNICAL/VISUAL FORENSICS: font/kerning/weight inconsistencies (esp. names, numbers, dates, totals); misaligned/baseline-shifted text; copy-paste/clone artifacts; resolution/compression/anti-alias mismatch; flat or pasted stamps/seals/signatures; template/logo/seal/layout errors; interpret the ELA map and the provided EXIF/PDF metadata.
B) TEXT & OCR: read all fields; assess grammar/spelling/transliteration/formatting plausibility for the claimed issuer/region.
C) CROSS-FIELD & ARITHMETIC LOGIC (populate consistencyChecks richly): line items vs total/tax; stated age vs DOB vs issue date; declared income vs shown balances/salary; ID/number format vs issuer/country/state; date ordering; issuer vs jurisdiction vs content.
D) DOC-TYPE PLAYBOOKS: apply the specific document type's common forgeries (Indian caste/income/domicile certificate serials & issuing-authority conventions; marksheet grade/total arithmetic; bank-statement running-balance continuity; invoice HS codes/GST math/Incoterms; tender turnover/experience/bank-guarantee docs).

===== OUTPUT =====
- visualMarkers: bounding boxes ONLY for raster images (empty for PDFs), on the ORIGINAL document coordinates.
- summary: written for a non-expert clerk, plain language, and must explicitly name the single most decisive piece of evidence behind the verdict (quote the exact value/field/measurement) — not a vague characterization.
- Calibrate honestly: a clean, ordinary, internally-consistent document earns a LOW riskScore and AUTHENTIC — do not manufacture fraud without concrete evidence, and cite the evidence when you flag it. Real doubt without proof => SUSPICIOUS. Bands: 0-33 AUTHENTIC, 34-66 SUSPICIOUS, 67-100 LIKELY_FAKE.

Return your complete analysis by calling the submit_report tool exactly once. No prose outside the tool call.`;

// ============================================================================
// PASS B / C — dossier module-group schema + system prompt (dynamic per id set)
// ============================================================================

function moduleGroupSchema(ids: string[]) {
  return {
    type: 'object',
    properties: {
      modules: {
        type: 'array',
        description: `One entry for EACH of these module ids, in this exact order, and no others: ${ids.join(', ')}.`,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ids },
            title: { type: 'string' },
            status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL', 'INFO'] },
            score: { type: 'number', description: '0-100 health score for this module (higher = healthier). Must be consistent with the checks/findings in this same module — a module with a FAIL check cannot score above ~40, a module with only PASS checks and no concerns cannot score below ~80.' },
            narrative: {
              type: 'string',
              description:
                'EXACTLY one tight paragraph of AT MOST 60 words, instead of padding with vague reassurance.',
            },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  status: { type: 'string', enum: ['PASS', 'FAIL', 'WARN'] },
                  detail: { type: 'string', description: 'Cite the specific value/region observed, not a generic statement.' },
                },
                required: ['category', 'status', 'detail'],
              },
            },
            findings: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'title', 'status', 'narrative', 'checks', 'findings'],
        },
      },
      issuerIntel: {
        type: 'string',
        description: 'Only if one of your assigned modules concerns the issuer: what the document claims about its issuer/authority, and how plausible that is based ONLY on the document + any web_search you performed. Leave empty string otherwise.',
      },
      missingDocuments: {
        type: 'array',
        description: 'Supporting documents a reviewer should demand to settle any remaining doubt, if applicable to your assigned modules. Leave empty otherwise.',
        items: { type: 'string' },
      },
    },
    required: ['modules'],
  } as const;
}

function buildModuleSystem(ids: string[]): string {
  const lines = ids
    .map((id) => {
      const m = MODULE_DESCRIPTIONS.find((x) => x.id === id);
      return m ? `id "${m.id}" — ${m.title}: ${m.desc}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `You are DocsGuard, a world-class and scrupulously HONEST document-forensics examiner, writing SPECIFIC SECTIONS of a larger forensic dossier a government officer could act on and defend. A fast core pass has already established the verdict, risk score, red flags, consistency checks, and extracted fields for this document (given below as PRIMARY-PASS FINDINGS) — do not contradict it; your job is to go deeper on YOUR assigned modules only, grounded in concrete evidence.

===== NON-NEGOTIABLE HONESTY RULES =====
1. Base EVERY finding only on: (a) what is visible/readable in the document, (b) the VERIFIED TECHNICAL METADATA block, (c) the ERROR-LEVEL ANALYSIS (ELA) image provided when present, (d) any DECODED QR/BARCODE payload provided, (e) the PRIMARY-PASS FINDINGS below, and (f) any web_search tool results (cite them).
2. NEVER invent the result of a lookup you did not perform. If a claim needs an external source you cannot check, say so plainly in the narrative instead of fabricating a result.
3. NEVER invent identifier-checksum or watchlist-screening RESULTS for the "identity" or "screening" modules — those are computed separately in code and merged in afterward. Describe only the format/plausibility you can assess directly from the document.

===== NO GENERIC FILLER — EVERY CLAIM MUST BE GROUNDED IN THIS DOCUMENT =====
Every sentence must cite something you actually observed ON THIS SPECIFIC DOCUMENT: a quoted field value exactly as printed ("Total Amount: ₹42,300"), a measured metadata value (an actual EXIF timestamp, PDF producer string, or ELA mean-error number — not "the metadata looks fine"), or a specific coordinate/region ("the stamp overlapping the signature in the lower-right"). A sentence that would read equally true of any other document of this type is FORBIDDEN — delete it and replace it with something specific, or state plainly what you could not determine and why.

===== SPEED BUDGET =====
Each module's narrative must be EXACTLY one tight paragraph of AT MOST 60 words (not 2-4) — dense with concrete citations, not padded. Keep checks and findings equally concrete and no longer than necessary.

===== YOUR ASSIGNED MODULES — produce ONLY these, in this exact order, and no others =====
${lines}

Also populate issuerIntel and missingDocuments as top-level fields ONLY when they are relevant to your assigned modules; leave them empty otherwise (another call may already be covering them).

Call submit_modules exactly once, with one entry per assigned id above. No prose outside the tool call.`;
}

function contentBlock(mediaType: string, data: string) {
  if (mediaType === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  const imageType = mediaType && mediaType.startsWith('image/') ? mediaType : 'image/png';
  return { type: 'image', source: { type: 'base64', media_type: imageType, data } };
}

function extraContent(userContent: any[], metaText: string): any[] {
  return [...userContent, { type: 'text', text: metaText }];
}

function searchTools(webMax: number, primary: any): any[] {
  const tools: any[] = [primary];
  if (webMax > 0) tools.unshift({ type: 'web_search_20260209', name: 'web_search', max_uses: webMax });
  return tools;
}

/** PASS A: fast core report. Throws on genuine failure — everything else depends on this. */
async function runPassA(client: any, effort: any, webMax: number, userContent: any[], metaText: string): Promise<any> {
  const tools = searchTools(webMax, {
    name: 'submit_report',
    description: 'Submit the fast-core structured document-authenticity report.',
    input_schema: PASS_A_SCHEMA as any,
  });

  const content = [
    ...extraContent(userContent, metaText),
    {
      type: 'text',
      text: 'TASK: Perform a fast, thorough CORE authenticity & fraud analysis of the attached document (use the ELA heatmap and any decoded QR above). Use web_search where it materially helps verify a public fact, then call submit_report with your complete core findings.',
    },
  ];

  const params = (messages: any[]) => ({
    model: MODEL, max_tokens: 4500, thinking: { type: 'adaptive' }, output_config: { effort } as any,
    system: SYSTEM_A, tools, tool_choice: { type: 'auto' }, messages,
  }) as any;

  const messages: any[] = [{ role: 'user', content }];
  let response = await client.messages.create(params(messages));
  let guard = 0;
  while (response.stop_reason === 'pause_turn' && guard++ < 4) {
    messages.push({ role: 'assistant', content: response.content as any });
    response = await client.messages.create(params(messages));
  }

  let report: any = (response.content as any[])?.find((b) => b.type === 'tool_use' && b.name === 'submit_report')?.input;
  if (!report) {
    const textBlock: any = (response.content as any[]).find((b) => b.type === 'text');
    report = tryParseJson(textBlock?.text || '');
  }
  if (!report || typeof report !== 'object') throw new Error('The model did not return a structured core report. Please retry.');
  return report;
}

/** PASS B / C: a group of dossier modules. Never throws — failures are logged and null is returned,
 *  so a bad module call can never take down a report that otherwise has a good Pass A. */
async function runModuleGroup(opts: {
  client: any; effort: any; webMax: number; userContent: any[]; metaText: string; passA: any; ids: string[]; groupLabel: string;
}): Promise<{ modules: any[]; issuerIntel?: string; missingDocuments?: string[] } | null> {
  const { client, effort, webMax, userContent, metaText, passA, ids, groupLabel } = opts;
  try {
    const tools = searchTools(webMax, {
      name: 'submit_modules',
      description: 'Submit the dossier module narratives for this assigned group of module ids.',
      input_schema: moduleGroupSchema(ids) as any,
    });

    const content = [
      ...extraContent(userContent, metaText),
      { type: 'text', text: `PRIMARY-PASS FINDINGS (already established by a separate fast pass — do not contradict; expand on and cite concrete evidence for your assigned modules):\n${condense(passA)}` },
      { type: 'text', text: `TASK: Produce the forensic dossier modules for EXACTLY these ids, in order: ${ids.join(', ')}. Call submit_modules exactly once.` },
    ];

    const params = (messages: any[]) => ({
      model: MODEL, max_tokens: 2800, thinking: { type: 'disabled' }, output_config: { effort } as any,
      system: buildModuleSystem(ids), tools, tool_choice: { type: 'auto' }, messages,
    }) as any;

    const messages: any[] = [{ role: 'user', content }];
    let response = await client.messages.create(params(messages));
    let guard = 0;
    while (response.stop_reason === 'pause_turn' && guard++ < 4) {
      messages.push({ role: 'assistant', content: response.content as any });
      response = await client.messages.create(params(messages));
    }

    const block: any = (response.content as any[])?.find((b) => b.type === 'tool_use' && b.name === 'submit_modules');
    let out: any = block?.input;
    if (!out) {
      const textBlock: any = (response.content as any[]).find((b) => b.type === 'text');
      out = tryParseJson(textBlock?.text || '');
    }
    if (!out || typeof out !== 'object') {
      console.error(`module group ${groupLabel} (${ids.join(',')}) returned no structured output`);
      return null;
    }
    out.modules = arr(out.modules);
    return out;
  } catch (e) {
    console.error(`module group ${groupLabel} (${ids.join(',')}) failed (non-fatal):`, e);
    return null;
  }
}

/** Minimal, honest placeholder for a module id whose generating call failed or omitted it —
 *  used so the merged report ALWAYS has all 12 canonical module ids, per the robustness rule. */
function synthesizeInfoModule(id: string): any {
  const meta = MODULE_DESCRIPTIONS.find((m) => m.id === id);
  return {
    id,
    title: meta?.title || id,
    status: 'INFO',
    score: undefined,
    narrative:
      'This section of the dossier could not be completed in this analysis pass — the model call responsible for it did not return a usable result. No forensic conclusion should be drawn from its absence; the core verdict and risk score above are unaffected, but a reviewer who specifically needs this section should re-run the scan.',
    checks: [],
    findings: ['Module generation incomplete for this pass — see narrative.'],
  };
}

async function extractMetadata(
  buf: Buffer,
  mediaType: string,
  fileName: string,
): Promise<{ signals: Signal[]; text: string; extraImages: ExtraImage[]; findings: ForensicsFinding[] }> {
  const signals: Signal[] = [];
  const extraImages: ExtraImage[] = [];
  const findings: ForensicsFinding[] = [];
  const sha = createHash('sha256').update(buf).digest('hex');
  const sizeKb = (buf.length / 1024).toFixed(1);

  signals.push({ label: 'File', value: `${fileName} (${mediaType || 'unknown'})`, concern: false });
  signals.push({ label: 'Size', value: `${sizeKb} KB`, concern: false });
  signals.push({ label: 'SHA-256 fingerprint', value: sha.slice(0, 24) + '…', concern: false });

  if (mediaType === 'application/pdf') {
    try {
      const pdf = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
      const producer = safe(pdf.getProducer);
      const creator = safe(pdf.getCreator);
      const created = safeDate(pdf.getCreationDate);
      const modified = safeDate(pdf.getModificationDate);
      signals.push({ label: 'PDF pages', value: String(pdf.getPageCount()), concern: false });
      if (producer) signals.push({ label: 'PDF producer', value: producer, concern: /photoshop|canva|word|illustrator|gimp/i.test(producer) });
      if (creator) signals.push({ label: 'PDF creator tool', value: creator, concern: false });
      if (created) signals.push({ label: 'PDF created', value: created.toISOString().slice(0, 19), concern: false });
      if (modified) signals.push({ label: 'PDF modified', value: modified.toISOString().slice(0, 19), concern: false });
      if (created && modified && modified.getTime() - created.getTime() > 60_000) {
        signals.push({ label: 'PDF edited after creation', value: `Modified ~${Math.round((modified.getTime() - created.getTime()) / 60000)} min after creation`, concern: true });
      }
    } catch {
      signals.push({ label: 'PDF metadata', value: 'Could not parse (image-only or malformed)', concern: false });
    }
  } else if (mediaType.startsWith('image/')) {
    // EXIF / editor tags
    try {
      const exif: any = await exifr.parse(buf, { tiff: true, exif: true, ifd0: true, xmp: true } as any).catch(() => null);
      if (exif) {
        const software = exif.Software || exif.CreatorTool || '';
        const make = exif.Make || '';
        const model = exif.Model || '';
        const editor = /photoshop|gimp|canva|illustrator|affinity|snapseed|pixlr|lightroom|paint|inkscape/i;
        if (software) signals.push({ label: 'Image software', value: String(software), concern: editor.test(String(software)) });
        if (make || model) signals.push({ label: 'Camera', value: [make, model].filter(Boolean).join(' '), concern: false });
        if (software && editor.test(String(software)) && !make) {
          signals.push({ label: 'Editing-software fingerprint', value: `Produced/edited with ${software}, no camera capture data`, concern: true });
        }
      } else {
        signals.push({ label: 'Image metadata', value: 'No EXIF present (stripped, screenshot, or re-saved)', concern: false });
      }
    } catch { /* best-effort */ }

    // Real image forensics: block-level ELA, multi-quality JPEG ghost, DQT/encoder
    // fingerprint, and the localized heatmap — see api/imageForensics.ts and
    // docs/FORENSICS_UPGRADES.md for the algorithm detail. Wrapped so a failure
    // here still leaves QR decode below (and everything else) running.
    try {
      const forensics = await runImageForensics(buf);
      signals.push(...forensics.signals);
      findings.push(...forensics.findings);
      if (forensics.heatmapPng) {
        extraImages.push({
          media_type: 'image/png',
          data: forensics.heatmapPng,
          caption:
            'ERROR-LEVEL ANALYSIS (ELA) heatmap of the document — per-block z-scored against the page\'s own robust baseline and colour-ramped calm blue → amber → red for increasing anomaly, with faint gridlines marking the scoring blocks. Amber/red patches around meaningful fields suggest edited/re-saved regions; the underlying block scores, JPEG-ghost double-compression check and DQT/encoder fingerprint are reported separately below.',
        });
      }
    } catch {
      signals.push({ label: 'Image forensics', value: 'Forensic analysis failed to complete for this image', concern: false });
    }

    // QR / barcode — independent of the forensic scoring above, kept as its own
    // best-effort step so a decode failure never affects (or is affected by) it.
    try {
      const rgba = await sharp(buf)
        .rotate()
        .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const code = jsQR(new Uint8ClampedArray(rgba.data), rgba.info.width, rgba.info.height);
      if (code && code.data) {
        const payload = code.data.length > 400 ? code.data.slice(0, 400) + '…' : code.data;
        signals.push({ label: 'QR/barcode decoded', value: payload, concern: false });
      } else {
        signals.push({ label: 'QR/barcode', value: 'None detected (or unreadable)', concern: false });
      }
    } catch { /* best-effort */ }
  }

  const text =
    'VERIFIED TECHNICAL METADATA (extracted deterministically in code — trust these facts):\n' +
    signals.map((s) => `- ${s.label}: ${s.value}${s.concern ? '  [POTENTIAL CONCERN]' : ''}`).join('\n');

  return { signals, text, extraImages, findings };
}

/**
 * Deterministic input gate. Runs before any model call so we never spend a scan —
 * or produce a confident-looking verdict — on something that cannot be analysed.
 * Throws a user-facing message; the caller surfaces it verbatim.
 */
async function assertAnalysableImage(buf: Buffer) {
  let meta: any;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new Error('That file could not be opened as an image. Please upload a clear photo, scan or PDF of the document.');
  }
  const w = meta?.width || 0;
  const h = meta?.height || 0;
  if (w && h && Math.max(w, h) < 500) {
    throw new Error(
      `This image is too small to examine (${w}x${h}). Forensic checks need detail — please upload a scan or photo at least 500px on its longest side.`,
    );
  }
  // A near-uniform image (blank page, solid colour, lens cap) carries no evidence.
  try {
    const st: any = await sharp(buf).greyscale().stats();
    const sd = st?.channels?.[0]?.stdev ?? 999;
    if (sd < 6) {
      throw new Error('This image looks blank or near-uniform, so there is nothing to examine. Please upload the actual document.');
    }
  } catch (e: any) {
    if (e?.message?.includes('blank or near-uniform')) throw e;
    // stats() failing is not itself a reason to reject
  }
}

function safe(fn: () => string | undefined): string { try { return fn() || ''; } catch { return ''; } }
function safeDate(fn: () => Date | undefined): Date | null { try { return fn() || null; } catch { return null; } }
function clamp(n: unknown, dflt: number): number { const v = typeof n === 'number' && isFinite(n) ? n : dflt; return Math.max(0, Math.min(100, Math.round(v))); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** Accept 0-100 or a 0-1 fraction; anything else falls back to `dflt`. */
function asPercent(v: unknown, dflt: number): number {
  if (typeof v !== 'number' || !isFinite(v)) return dflt;
  if (v > 0 && v <= 1) return v * 100; // fraction expressed as 0-1
  return v;
}

/**
 * Merge code-computed results into a dossier module. Deterministic results are
 * authoritative: they are prepended to the module's checks, the note is prepended
 * to its narrative, and a FAIL forces the module status to FAIL. If the module was
 * not present at all (e.g. its group call failed and it was synthesized as INFO),
 * this still finds and enriches that synthesized entry.
 */
function mergeIntoModule(report: any, id: string, title: string, checks: any[], note: string) {
  if (!Array.isArray(report.modules)) report.modules = [];
  let mod = report.modules.find((m: any) => m && m.id === id);
  if (!mod) {
    mod = { id, title, status: 'INFO', narrative: '', checks: [], findings: [] };
    report.modules.push(mod);
  }
  mod.checks = [...checks, ...arr(mod.checks)];
  mod.narrative = note + (mod.narrative ? '\n\n' + mod.narrative : '');
  if (checks.some((c) => c?.status === 'FAIL')) mod.status = 'FAIL';
  else if (mod.status === 'INFO' && checks.length) mod.status = checks.some((c) => c?.status === 'WARN') ? 'WARN' : 'PASS';
  return mod;
}

export async function analyze(input: AnalyzeInput): Promise<any> {
  const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Server is missing ANTHROPIC_API_KEY. Set it in .env.local (local) or the Vercel project env.');

  const buf = Buffer.from(input.fileBase64, 'base64');

  // Downscale big scans before sending. A 1240x1754 certificate carries far more
  // pixels than the model needs to read fields and spot typography defects, and
  // image size is a direct latency cost on every request.
  let sendB64 = input.fileBase64;
  if ((input.mediaType || '').startsWith('image/')) {
    try {
      const small = await sharp(buf).rotate().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      if (small.length < buf.length) sendB64 = small.toString('base64');
    } catch { /* fall back to the original */ }
  }
  if ((input.mediaType || '').startsWith('image/')) await assertAnalysableImage(buf);

  const { signals, text: metaText, extraImages, findings: forensicsFindings } = await extractMetadata(buf, input.mediaType, input.fileName);

  const client = new Anthropic({ apiKey });
  const effort = (process.env.ANALYSIS_EFFORT || 'low') as any;
  // Web search is the biggest latency sink; off by default, opt in via env.
  const webMax = Number.isFinite(Number(process.env.WEB_SEARCH_MAX_USES)) ? Number(process.env.WEB_SEARCH_MAX_USES) : 0;

  // userContent is the shared document + ELA-image payload every pass (A, B, C, D) is
  // given. It deliberately carries no trailing task text — each pass appends its own.
  // Two payloads: the full evidence set (document + ELA heatmap) for the forensic
  // pass, and a lighter document-only payload for the module/court passes. Sending
  // every image to all four passes was doubling the upload cost of every scan.
  const docOnlyContent: any[] = [contentBlock(input.mediaType, sendB64)];
  const userContent: any[] = [contentBlock(input.mediaType, sendB64)];
  for (const img of extraImages) {
    userContent.push({ type: 'text', text: img.caption });
    userContent.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }

  const mode = input.mode || 'full';

  // ---- PASS A: fast core (sequential — everything else needs this result) ----
  // In 'dossier' mode Pass A already ran in an earlier request; reuse it rather
  // than paying for it twice.
  const report: any =
    mode === 'dossier' && input.baseReport
      ? input.baseReport
      : await runPassA(client, effort, webMax, userContent, metaText);

  // GUARD: if this is not a document, stop here. Running a forensic dossier on a
  // selfie would produce an authoritative-looking verdict about nothing, which is
  // exactly the kind of confident nonsense this product exists to avoid. Skipping
  // the remaining passes also returns the answer far faster.
  const ia = report?.inputAssessment;
  if (ia && ia.isDocument === false) {
    return {
      ...report,
      documentType: ia.kind || 'Not a document',
      verdict: 'SUSPICIOUS',
      riskScore: 0,
      confidence: clamp(report.confidence, 90),
      notADocument: true,
      summary: `This does not appear to be a document — it looks like ${ia.kind || 'something else'}. ${ia.reason || ''} No authenticity verdict can be given, because there is nothing to verify. Please upload a certificate, invoice, ID, statement or similar.`,
      recommendedAction: 'Upload an actual document (certificate, invoice, ID, bank statement or contract) to run a verification.',
      redFlags: [], consistencyChecks: [], extractedFields: [], modules: [],
      riskBreakdown: [], timeline: [], visualMarkers: [], externalChecksNeeded: [],
      technicalSignals: signals,
    };
  }

  report.documentType = String(report.documentType || 'Unknown document');
  report.verdict = ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'].includes(report.verdict) ? report.verdict : 'SUSPICIOUS';
  report.riskScore = clamp(report.riskScore, 50);
  report.confidence = clamp(report.confidence, 60);
  report.summary = String(report.summary || '');
  report.redFlags = arr(report.redFlags);
  report.consistencyChecks = arr(report.consistencyChecks);
  report.extractedFields = arr(report.extractedFields);
  report.technicalSignals = [...signals, ...arr(report.technicalSignals)];
  report.recommendedAction = String(report.recommendedAction || '');
  report.externalChecksNeeded = arr(report.externalChecksNeeded);
  // Code-computed, block-localized anomalies (ELA/JPEG-ghost) render through the
  // same VisualMarker box UI as Claude's own evidence markers — see
  // docs/FORENSICS_UPGRADES.md §5. Deterministic findings first, same pattern as
  // technicalSignals above.
  report.visualMarkers = [...forensicsFindings, ...arr(report.visualMarkers)];
  report.riskBreakdown = arr(report.riskBreakdown);
  report.timeline = arr(report.timeline);
  report.modules = [];
  report.missingDocuments = [];
  report.issuerIntel = '';

  // Surface the ELA heatmap to the UI (display-only; the client strips it before
  // writing history so it cannot blow the localStorage quota).
  const elaImg = extraImages.find((i) => i.caption.includes('ERROR-LEVEL'));
  if (elaImg) report.elaImage = `data:${elaImg.media_type};base64,${elaImg.data}`;

  let hardFailures = 0;

  // ---- DETERMINISTIC VERIFICATION LAYER -------------------------------------
  // Math beats opinion: identifier checksums and watchlist screening are computed
  // in code and are AUTHORITATIVE over the model's judgement. A failed Aadhaar/PAN/
  // GSTIN/IBAN checksum is proof the number is fabricated, not a matter of degree.
  // Computed here (before the concurrent module/court calls) because the court's
  // BINDING FACTS need these results, and consistencyChecks/technicalSignals from
  // here also flow into the "PRIMARY-PASS FINDINGS" the module calls receive.
  let detResult: any = null;
  try {
    detResult = runDeterministicChecks(report.extractedFields);
    if (detResult?.checks?.length) report.consistencyChecks = [...detResult.checks, ...report.consistencyChecks];
    if (detResult?.signals?.length) report.technicalSignals = [...report.technicalSignals, ...detResult.signals];

    const hard = detResult?.hardFailures || 0;
    hardFailures = hard;
    if (hard > 0) {
      report.riskScore = Math.min(100, Math.max(report.riskScore, 65 + 10 * hard));
      if (hard >= 2) report.verdict = 'LIKELY_FAKE';
      else if (report.verdict === 'AUTHENTIC') report.verdict = 'SUSPICIOUS';
      report.redFlags = [
        {
          severity: hard >= 2 ? 'Critical' : 'High',
          title: `${hard} identifier${hard > 1 ? 's' : ''} failed mathematical validation`,
          detail:
            'One or more ID numbers on this document fail their official checksum/format rules. A genuine issuer cannot produce such a number, so this is strong evidence of fabrication.',
          evidence: detResult.checks
            .filter((c: any) => c.status === 'FAIL')
            .map((c: any) => c.check)
            .join('; '),
        },
        ...report.redFlags,
      ];
    }
  } catch (e) {
    console.error('deterministic checks failed:', e);
  }

  // Free OFAC watchlist screening on any person/organisation names we extracted.
  let screenResult: any = null;
  try {
    const names = (report.extractedFields as any[])
      .filter(
        (f) =>
          /name|holder|applicant|company|organisation|organization|firm|beneficiary|supplier|issuer/i.test(String(f?.label || '')) &&
          String(f?.value || '').trim().length >= 3 &&
          String(f?.value || '').trim().length <= 80,
      )
      .map((f) => String(f.value).trim());
    const unique = Array.from(new Set(names)).slice(0, 5);
    if (unique.length) {
      // The OFAC export is ~5MB; give it room before honestly reporting "unavailable".
      screenResult = await screenNames(unique, { timeoutMs: 5000 });
      if (screenResult?.checks?.length) report.consistencyChecks = [...report.consistencyChecks, ...screenResult.checks];
      if (screenResult?.signals?.length) report.technicalSignals = [...report.technicalSignals, ...screenResult.signals];
    }
  } catch (e) {
    console.error('sanctions screening failed:', e);
  }

  const bindingFacts = [
    'BINDING, CODE-COMPUTED FACTS (calculated in code, not inferred — conclusive, and NOT open to reinterpretation by either side):',
    ...report.technicalSignals.map((s: any) => `- ${s.label}: ${s.value}${s.concern ? '  [CONCERN]' : ''}`),
    ...report.consistencyChecks.map((c: any) => `- [${c.status}] ${c.check}: ${c.detail}`),
    hardFailures > 0
      ? `- ${hardFailures} identifier(s) FAILED official checksum validation. This is mathematical proof the number could not have been issued by the real authority.`
      : '- No identifier failed checksum validation.',
  ].join('\n');

  // In 'core' mode we stop here: the caller gets a usable verdict fast and can
  // request the dossier separately, so the user is never left staring at a spinner
  // while twelve narratives are written.
  if (mode === 'core') {
    report.dossierPending = true;
    return report;
  }

  // ---- PASS B, C, D — CONCURRENT ---------------------------------------------
  // Two dossier-module groups and the adversarial court all run at once, each fed
  // the Pass-A result plus the same document/ELA/metadata content. allSettled so a
  // thrown rejection from any one of them can never take the others — or the good
  // Pass A already computed above — down with it.
  const [bResult, cResult, dResult] = await Promise.allSettled([
    runModuleGroup({ client, effort, webMax, userContent: docOnlyContent, metaText, passA: report, ids: GROUP_B_IDS, groupLabel: 'B' }),
    runModuleGroup({ client, effort, webMax, userContent: docOnlyContent, metaText, passA: report, ids: GROUP_C_IDS, groupLabel: 'C' }),
    runCourt({ client, model: MODEL, userContent: docOnlyContent, baseReport: report, bindingFacts, effort }),
  ]);

  const bOut = bResult.status === 'fulfilled' ? bResult.value : null;
  const cOut = cResult.status === 'fulfilled' ? cResult.value : null;
  const court = dResult.status === 'fulfilled' ? dResult.value : null;
  if (bResult.status === 'rejected') console.error('module group B rejected unexpectedly:', bResult.reason);
  if (cResult.status === 'rejected') console.error('module group C rejected unexpectedly:', cResult.reason);
  if (dResult.status === 'rejected') console.error('adversarial court rejected unexpectedly:', dResult.reason);

  // ---- MERGE B + C into the canonical 12-module order, synthesizing any gaps ----
  const byId = new Map<string, any>();
  for (const m of [...(bOut?.modules || []), ...(cOut?.modules || [])]) {
    if (m && typeof m.id === 'string') byId.set(m.id, m);
  }
  report.modules = CANONICAL_MODULE_ORDER.map((id) => byId.get(id) || synthesizeInfoModule(id));

  report.issuerIntel = String(bOut?.issuerIntel || cOut?.issuerIntel || '');
  const missing = new Set<string>();
  for (const d of [...arr(bOut?.missingDocuments), ...arr(cOut?.missingDocuments)]) if (d) missing.add(String(d));
  report.missingDocuments = Array.from(missing);

  // ---- Now that every module id exists in report.modules, merge the deterministic
  // layer INTO the real "identity" / "screening" narratives (or their INFO stubs). ----
  if (detResult?.checks?.length) {
    mergeIntoModule(
      report,
      'identity',
      'Identity & Number Validation',
      detResult.checks.map((c: any) => ({ category: c.check, status: c.status, detail: c.detail })),
      'The results below are COMPUTED IN CODE, not inferred by the model. Each identifier was validated against its official structure and checksum rule (Aadhaar via the Verhoeff algorithm, PAN structure and entity-type code, GSTIN via its mod-36 check character, IFSC format, IBAN via mod-97). A FAIL here is mathematical proof that the number could not have been issued by the real authority, and it overrides any softer assessment elsewhere in this dossier.',
    );
  }
  if (screenResult?.checks?.length) {
    mergeIntoModule(
      report,
      'screening',
      'Screening & Reputation',
      screenResult.checks.map((c: any) => ({ category: c.check, status: c.status, detail: c.detail })),
      `OFAC watchlist screening was executed in code against name(s) found on the document. ${
        screenResult.available
          ? 'The list was fetched and screened successfully; results below are computed, not inferred.'
          : 'The list could NOT be retrieved, so no screening conclusion may be drawn — this is reported honestly rather than shown as a clean result.'
      } A name match is never by itself an identification and always requires human confirmation.`,
    );
  }

  // ---- ADVERSARIAL COURT RULING ----------------------------------------------
  // Prosecution and Defense argued the same evidence concurrently with the module
  // calls above; the Judge's ruling is merged in here. The code-computed facts were
  // handed over as BINDING evidence, so a failed checksum cannot be argued away and
  // an unavailable watchlist cannot be spun into a clean result.
  if (court && court.ruling) {
    report.court = court;
    const r: any = court.ruling;
    if (['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'].includes(r.verdict)) report.verdict = r.verdict;
    // The judge sometimes expresses these as 0-1 fractions rather than 0-100.
    // Taken literally that renders as "1% confidence", so normalise before merging
    // and fall back to Pass A's value when the ruling gives us nothing usable.
    report.riskScore = clamp(asPercent(r.riskScore, report.riskScore), report.riskScore);
    report.confidence = clamp(asPercent(r.confidence, report.confidence), report.confidence);
    if (r.reasoning) {
      mergeIntoModule(
        report,
        'verdict',
        'Verdict & Actions',
        [],
        'ADJUDICATED VERDICT — this outcome was reached by an adversarial review: a prosecution case and a defence case were argued from identical evidence, then weighed by an independent adjudicator against the binding code-computed facts.\n\n' +
          String(r.reasoning),
      );
    }
  }

  // ---- BINDING HARD-FAILURE OVERRIDE — applied LAST, after the court ruling ----
  // No argument, narrative, or ruling above can undo mathematics: re-assert the
  // floor one final time so a failed checksum always wins.
  if (hardFailures > 0) {
    report.riskScore = Math.min(100, Math.max(report.riskScore, 65 + 10 * hardFailures));
    if (hardFailures >= 2) report.verdict = 'LIKELY_FAKE';
    else if (report.verdict === 'AUTHENTIC') report.verdict = 'SUSPICIOUS';
  }

  return report;
}

function tryParseJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { try { return JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1')); } catch { return null; } }
}
