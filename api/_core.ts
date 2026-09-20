/**
 * Pramaan analysis core — shared by the Vercel serverless function (api/analyze.ts)
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
 * The ANTHROPIC_API_KEY lives only on the server — never shipped to the browser.
 * Env tunables: ANALYSIS_EFFORT (default high), WEB_SEARCH_MAX_USES (default 4; 0 disables).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import exifr from 'exifr';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { runDeterministicChecks } from './verification.js';
import { screenNames } from './sanctions.js';
import { runCourt } from './court.js';

const MODEL = 'claude-opus-5';

export interface AnalyzeInput {
  fileBase64: string;
  mediaType: string;
  fileName: string;
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

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    documentType: { type: 'string', description: 'e.g. "Income Certificate (MP e-District)", "Commercial Invoice", "Bank Statement", "Class X Marksheet", "PAN card".' },
    verdict: { type: 'string', enum: ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'] },
    riskScore: { type: 'number', description: '0-100. Higher = more likely fraudulent/tampered.' },
    confidence: { type: 'number', description: '0-100 confidence in this assessment.' },
    summary: { type: 'string', description: 'Plain-language 2-4 sentence explanation a non-expert clerk can act on.' },
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
      description: 'Cross-field / cross-document / arithmetic logic tests — the specialty. Test EVERY relationship present.',
      items: {
        type: 'object',
        properties: {
          check: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'FAIL', 'WARN'] },
          detail: { type: 'string' },
        },
        required: ['check', 'status', 'detail'],
      },
    },
    extractedFields: {
      type: 'array',
      description: 'All key data points read from the document.',
      items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] },
    },
    technicalSignals: {
      type: 'array',
      description: 'Forensic / technical observations about the artifact itself.',
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
    modules: {
      type: 'array',
      description:
        'The DEEP FORENSIC DOSSIER. One entry per analysis module listed in the system prompt, in that order. Each needs a substantial multi-paragraph analyst narrative, concrete checks, and findings. Never output an empty narrative — if a module does not apply to this document type, say so explicitly and explain why, and set status INFO.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The module id from the system prompt list.' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL', 'INFO'] },
          score: { type: 'number', description: '0-100 health score for this module (higher = healthier).' },
          narrative: { type: 'string', description: '2-4 paragraphs of specific analyst reasoning citing what you actually saw.' },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                status: { type: 'string', enum: ['PASS', 'FAIL', 'WARN'] },
                detail: { type: 'string' },
              },
              required: ['category', 'status', 'detail'],
            },
          },
          findings: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'status', 'narrative', 'checks', 'findings'],
      },
    },
    riskBreakdown: {
      type: 'array',
      description: 'Risk contribution per dimension (0-100, higher = riskier). Use the module areas as labels.',
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
    issuerIntel: {
      type: 'string',
      description: 'What the document claims about its issuer/authority, and how plausible that is based ONLY on the document + any web_search you performed. Say plainly what cannot be confirmed here.',
    },
    missingDocuments: {
      type: 'array',
      description: 'Supporting documents a reviewer should demand to settle any remaining doubt.',
      items: { type: 'string' },
    },
  },
  required: ['documentType', 'verdict', 'riskScore', 'confidence', 'summary', 'redFlags', 'consistencyChecks', 'extractedFields', 'technicalSignals', 'recommendedAction', 'externalChecksNeeded', 'visualMarkers', 'modules', 'riskBreakdown', 'timeline'],
} as const;

const SYSTEM = `You are Pramaan, a world-class and scrupulously HONEST document-forensics examiner. You judge whether a document (government certificates, marksheets, IDs, bank statements, invoices, tender papers, contracts, etc.) is authentic or fraudulent, and you explain your reasoning with specific evidence.

===== NON-NEGOTIABLE HONESTY RULES =====
1. Base EVERY finding only on: (a) what is visible/readable in the document, (b) the VERIFIED TECHNICAL METADATA block (extracted deterministically in code — trust it), (c) the ERROR-LEVEL ANALYSIS (ELA) image provided when present, (d) any DECODED QR/BARCODE payload provided, and (e) results you obtain from the web_search tool (cite them).
2. NEVER invent the result of a lookup you did not perform — registry/GST/PAN/CIN status, bank confirmation, DigiLocker/e-District source verification, sanctions hits. If a claim needs such a source and web_search can't settle it, add a precise item to externalChecksNeeded. Fabricating is the worst possible error.
3. Use web_search when it materially helps (verify an issuer's certificate/number FORMAT, known-scam indicators, whether a public entity plausibly exists) and cite what you found; if inconclusive, say so and defer to externalChecksNeeded.

===== HOW TO READ THE EVIDENCE =====
- ELA image: the second image (when provided) is an Error-Level Analysis heatmap of the first. In a genuine single-save photo, error levels are fairly uniform. BRIGHT / high-contrast patches that differ sharply from their surroundings — especially around text, numbers, photos, stamps or signatures — suggest that region was edited and re-saved (spliced/retouched). Treat ELA as supporting evidence, not proof: JPEG artifacts, edges and text naturally show some ELA; call out only localized anomalies that coincide with meaningful fields.
- DECODED QR/BARCODE: if a payload was decoded, CROSS-CHECK it against the printed fields (name, number, dates, issuer). A mismatch, or an unreadable/absent QR on a document type that should carry a signed QR (e.g. many govt e-certificates, Aadhaar), is a strong signal. You cannot verify a digital signature here — note that under externalChecksNeeded.

===== DO A DEEP, THOROUGH ANALYSIS =====
A) TECHNICAL/VISUAL FORENSICS: font/kerning/weight inconsistencies (esp. names, numbers, dates, totals); misaligned/baseline-shifted text; copy-paste/clone artifacts; resolution/compression/anti-alias mismatch; flat or pasted stamps/seals/signatures; template/logo/seal/layout errors; interpret the ELA map and the provided EXIF/PDF metadata.
B) TEXT & OCR: read all fields; assess grammar/spelling/transliteration/formatting plausibility for the claimed issuer/region.
C) CROSS-FIELD & ARITHMETIC LOGIC (populate consistencyChecks richly): line items vs total/tax; stated age vs DOB vs issue date; declared income vs shown balances/salary; ID/number format vs issuer/country/state; date ordering; issuer vs jurisdiction vs content.
D) DOC-TYPE PLAYBOOKS: apply the specific document type's common forgeries (Indian caste/income/domicile certificate serials & issuing-authority conventions; marksheet grade/total arithmetic; bank-statement running-balance continuity; invoice HS codes/GST math/Incoterms; tender turnover/experience/bank-guarantee docs).

===== THE DOSSIER: produce ALL 12 MODULES, in this exact order =====
You are writing a professional forensic dossier a government officer could act on and defend. For EVERY module below emit an entry in "modules" with a substantial 2-4 paragraph narrative (specific to THIS document — quote what you actually saw), concrete checks, and findings. Never leave a narrative thin or generic. If a module genuinely does not apply to this document type, set status INFO and explain why in the narrative.
1.  id "executive"    — Executive Summary: what the document is, who it concerns, the verdict and the two or three findings that drove it.
2.  id "forensics"    — Document Forensics: ELA interpretation, compression/noise/resolution consistency, clone or splice artifacts, metadata (EXIF/PDF producer, creation-vs-modification), scan vs digital origin.
3.  id "typography"   — Typography & Layout: fonts, weights, kerning, baseline alignment, spacing, margins, template/logo fidelity; text that was re-typed or pasted over.
4.  id "content"      — Content & Cross-Field Logic: every arithmetic and logical relationship you can test between fields.
5.  id "identity"     — Identity & Number Validation: every ID/reference number, its expected format for the stated issuer, and whether it is structurally plausible. (Checksum math is computed separately in code and will be merged in — do not invent checksum results.)
6.  id "security"     — Security Features: stamps, seals, signatures, watermarks, holograms, microtext, QR/barcode presence and whether a document of this type should carry one.
7.  id "issuer"       — Issuer & Entity Intelligence: the issuing authority/company/bank named, its plausibility, and what must be confirmed at source.
8.  id "financial"    — Financial Integrity: amounts, totals, tax math, running balances, salary/income plausibility, bank/account detail formats, round-number and digit-pattern anomalies.
9.  id "compliance"   — Compliance & Legal: mandatory fields/clauses for this document type and jurisdiction, validity period, authority to issue.
10. id "screening"    — Screening & Reputation: what you could and could NOT check about the named parties. (Watchlist screening is run separately in code and merged in — never invent a screening result.)
11. id "predictive"   — Fraud Typology & Prediction: the specific fraud scheme this matches if fraudulent, its probability, and what the fraudster's next step usually is.
12. id "verdict"      — Verdict & Actions: the decision, the reasoning chain, and exactly what the reviewer should do next.
Also populate: riskBreakdown (risk 0-100 per module area), timeline (every date on the document with consistency), fraudTypology, issuerIntel, and missingDocuments.

===== OUTPUT =====
- Many, specific extractedFields and consistencyChecks; concrete redFlags each with real evidence; technicalSignals with concern flags.
- visualMarkers: bounding boxes ONLY for raster images (empty for PDFs), on the ORIGINAL document coordinates.
- Calibrate honestly: a clean, ordinary, internally-consistent document earns a LOW riskScore and AUTHENTIC — do not manufacture fraud without concrete evidence, and cite the evidence when you flag it. Real doubt without proof => SUSPICIOUS. Bands: 0-33 AUTHENTIC, 34-66 SUSPICIOUS, 67-100 LIKELY_FAKE.

Return your complete analysis by calling the submit_report tool exactly once. No prose outside the tool call.`;

async function extractMetadata(
  buf: Buffer,
  mediaType: string,
  fileName: string,
): Promise<{ signals: Signal[]; text: string; extraImages: ExtraImage[] }> {
  const signals: Signal[] = [];
  const extraImages: ExtraImage[] = [];
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

    // Real image forensics: ELA + QR
    await imageForensics(buf, signals, extraImages);
  }

  const text =
    'VERIFIED TECHNICAL METADATA (extracted deterministically in code — trust these facts):\n' +
    signals.map((s) => `- ${s.label}: ${s.value}${s.concern ? '  [POTENTIAL CONCERN]' : ''}`).join('\n');

  return { signals, text, extraImages };
}

/** Error-Level Analysis heatmap + QR decode, both best-effort. */
async function imageForensics(buf: Buffer, signals: Signal[], extraImages: ExtraImage[]) {
  // Normalize to a manageable size for both ELA and QR.
  let base: Buffer, width: number, height: number;
  try {
    const norm = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    base = norm.data;
    width = norm.info.width;
    height = norm.info.height;
  } catch {
    return; // unreadable image — Claude still sees the original
  }

  // --- ELA ---
  try {
    const q = 90;
    const resaved = await sharp(base).jpeg({ quality: q }).toBuffer();
    const a = await sharp(base).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(resaved).removeAlpha().resize(a.info.width, a.info.height).raw().toBuffer();
    const n = Math.min(a.data.length, b.length);
    const diff = Buffer.alloc(n);
    let maxD = 1, sum = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(a.data[i] - b[i]);
      diff[i] = d;
      if (d > maxD) maxD = d;
      sum += d;
    }
    const scale = Math.min(25, 255 / maxD);
    for (let i = 0; i < n; i++) diff[i] = Math.min(255, Math.round(diff[i] * scale));
    const elaPng = await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 3 } }).png({ compressionLevel: 8 }).toBuffer();
    const meanDiff = sum / n;
    extraImages.push({ media_type: 'image/png', data: elaPng.toString('base64'), caption: 'ERROR-LEVEL ANALYSIS (ELA) heatmap of the document — bright/high-contrast localized patches around meaningful fields suggest edited/re-saved regions.' });
    signals.push({ label: 'ELA tamper analysis', value: `Computed (mean error ${meanDiff.toFixed(1)}) — heatmap sent for review`, concern: meanDiff > 12 });
  } catch { /* best-effort */ }

  // --- QR / barcode ---
  try {
    const rgba = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(rgba.data), rgba.info.width, rgba.info.height);
    if (code && code.data) {
      const payload = code.data.length > 400 ? code.data.slice(0, 400) + '…' : code.data;
      signals.push({ label: 'QR/barcode decoded', value: payload, concern: false });
    } else {
      signals.push({ label: 'QR/barcode', value: 'None detected (or unreadable)', concern: false });
    }
  } catch { /* best-effort */ }
}

function safe(fn: () => string | undefined): string { try { return fn() || ''; } catch { return ''; } }
function safeDate(fn: () => Date | undefined): Date | null { try { return fn() || null; } catch { return null; } }
function clamp(n: unknown, dflt: number): number { const v = typeof n === 'number' && isFinite(n) ? n : dflt; return Math.max(0, Math.min(100, Math.round(v))); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * Merge code-computed results into a dossier module. Deterministic results are
 * authoritative: they are prepended to the module's checks, the note is prepended
 * to its narrative, and a FAIL forces the module status to FAIL. If the model did
 * not emit the module at all, it is created.
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

function contentBlock(mediaType: string, data: string) {
  if (mediaType === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  const imageType = mediaType && mediaType.startsWith('image/') ? mediaType : 'image/png';
  return { type: 'image', source: { type: 'base64', media_type: imageType, data } };
}

export async function analyze(input: AnalyzeInput): Promise<any> {
  const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Server is missing ANTHROPIC_API_KEY. Set it in .env.local (local) or the Vercel project env.');

  const buf = Buffer.from(input.fileBase64, 'base64');
  const { signals, text: metaText, extraImages } = await extractMetadata(buf, input.mediaType, input.fileName);

  const client = new Anthropic({ apiKey });
  const effort = (process.env.ANALYSIS_EFFORT || 'high') as any;
  const webMax = Number.isFinite(Number(process.env.WEB_SEARCH_MAX_USES)) ? Number(process.env.WEB_SEARCH_MAX_USES) : 4;

  const tools: any[] = [
    { name: 'submit_report', description: 'Submit the complete structured document-authenticity report.', input_schema: REPORT_SCHEMA as any },
  ];
  if (webMax > 0) tools.unshift({ type: 'web_search_20260209', name: 'web_search', max_uses: webMax });

  const userContent: any[] = [contentBlock(input.mediaType, input.fileBase64)];
  for (const img of extraImages) {
    userContent.push({ type: 'text', text: img.caption });
    userContent.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  userContent.push({
    type: 'text',
    text: metaText + '\n\nTASK: Perform a deep, thorough authenticity & fraud forensic analysis of the attached document (use the ELA heatmap and any decoded QR above). Use web_search where it materially helps verify a public fact, then call submit_report with your complete findings.',
  });

  const params = (messages: any[]) => ({
    model: MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort } as any,
    system: SYSTEM, tools, tool_choice: { type: 'auto' }, messages,
  }) as any;

  const messages: any[] = [{ role: 'user', content: userContent }];
  let response = await client.messages.create(params(messages));
  let guard = 0;
  while (response.stop_reason === 'pause_turn' && guard++ < 6) {
    messages.push({ role: 'assistant', content: response.content as any });
    response = await client.messages.create(params(messages));
  }

  let report: any = (response.content as any[])?.find((b) => b.type === 'tool_use' && b.name === 'submit_report')?.input;
  if (!report) {
    const textBlock: any = (response.content as any[]).find((b) => b.type === 'text');
    report = tryParseJson(textBlock?.text || '');
  }
  if (!report || typeof report !== 'object') throw new Error('The model did not return a structured report. Please retry.');

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
  report.visualMarkers = arr(report.visualMarkers);
  // Surface the ELA heatmap to the UI (display-only; the client strips it before
  // writing history so it cannot blow the localStorage quota).
  const elaImg = extraImages.find((i) => i.caption.includes('ERROR-LEVEL'));
  if (elaImg) report.elaImage = `data:${elaImg.media_type};base64,${elaImg.data}`;

  report.modules = arr(report.modules);
  report.riskBreakdown = arr(report.riskBreakdown);
  report.timeline = arr(report.timeline);
  report.missingDocuments = arr(report.missingDocuments);
  report.issuerIntel = String(report.issuerIntel || '');

  let hardFailures = 0;

  // ---- DETERMINISTIC VERIFICATION LAYER -------------------------------------
  // Math beats opinion: identifier checksums and watchlist screening are computed
  // in code and are AUTHORITATIVE over the model's judgement. A failed Aadhaar/PAN/
  // GSTIN/IBAN checksum is proof the number is fabricated, not a matter of degree.
  try {
    const det = runDeterministicChecks(report.extractedFields);
    if (det?.checks?.length) {
      report.consistencyChecks = [...det.checks, ...report.consistencyChecks];
      mergeIntoModule(
        report,
        'identity',
        'Identity & Number Validation',
        det.checks.map((c: any) => ({ category: c.check, status: c.status, detail: c.detail })),
        'The results below are COMPUTED IN CODE, not inferred by the model. Each identifier was validated against its official structure and checksum rule (Aadhaar via the Verhoeff algorithm, PAN structure and entity-type code, GSTIN via its mod-36 check character, IFSC format, IBAN via mod-97). A FAIL here is mathematical proof that the number could not have been issued by the real authority, and it overrides any softer assessment elsewhere in this dossier.',
      );
    }
    if (det?.signals?.length) report.technicalSignals = [...report.technicalSignals, ...det.signals];

    const hard = det?.hardFailures || 0;
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
          evidence: det.checks
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
      const res = await screenNames(unique, { timeoutMs: 12000 });
      if (res?.checks?.length) {
        report.consistencyChecks = [...report.consistencyChecks, ...res.checks];
        mergeIntoModule(
          report,
          'screening',
          'Screening & Reputation',
          res.checks.map((c: any) => ({ category: c.check, status: c.status, detail: c.detail })),
          `OFAC watchlist screening was executed in code against ${unique.length} name(s) found on the document. ${
            res.available
              ? 'The list was fetched and screened successfully; results below are computed, not inferred.'
              : 'The list could NOT be retrieved, so no screening conclusion may be drawn — this is reported honestly rather than shown as a clean result.'
          } A name match is never by itself an identification and always requires human confirmation.`,
        );
      }
      if (res?.signals?.length) report.technicalSignals = [...report.technicalSignals, ...res.signals];
    }
  } catch (e) {
    console.error('sanctions screening failed:', e);
  }

  // ---- ADVERSARIAL COURT ----------------------------------------------------
  // Prosecution and Defense argue the same evidence concurrently, then a Judge
  // rules. The code-computed facts are handed over as BINDING evidence, so a
  // failed checksum cannot be argued away and an unavailable watchlist cannot be
  // spun into a clean result. The ruling's "dismissed" list is what protects
  // against false positives.
  try {
    const bindingFacts = [
      'BINDING, CODE-COMPUTED FACTS (calculated in code, not inferred — conclusive, and NOT open to reinterpretation by either side):',
      ...report.technicalSignals.map((s: any) => `- ${s.label}: ${s.value}${s.concern ? '  [CONCERN]' : ''}`),
      ...report.consistencyChecks.map((c: any) => `- [${c.status}] ${c.check}: ${c.detail}`),
      hardFailures > 0
        ? `- ${hardFailures} identifier(s) FAILED official checksum validation. This is mathematical proof the number could not have been issued by the real authority.`
        : '- No identifier failed checksum validation.',
    ].join('\n');

    const court = await runCourt({
      client,
      model: MODEL,
      userContent,
      baseReport: report,
      bindingFacts,
      effort: 'medium',
    });

    if (court && court.ruling) {
      report.court = court;
      const r: any = court.ruling;
      if (['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'].includes(r.verdict)) report.verdict = r.verdict;
      report.riskScore = clamp(r.riskScore, report.riskScore);
      report.confidence = clamp(r.confidence, report.confidence);
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
      // Deterministic override is re-asserted LAST so no argument can undo maths.
      if (hardFailures > 0) {
        report.riskScore = Math.min(100, Math.max(report.riskScore, 65 + 10 * hardFailures));
        if (hardFailures >= 2) report.verdict = 'LIKELY_FAKE';
        else if (report.verdict === 'AUTHENTIC') report.verdict = 'SUSPICIOUS';
      }
    }
  } catch (e) {
    console.error('adversarial court failed (non-fatal):', e);
  }

  return report;
}

function tryParseJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { try { return JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1')); } catch { return null; } }
}
