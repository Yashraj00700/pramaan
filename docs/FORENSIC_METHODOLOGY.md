# Pramaan — Forensic Detection Methodology

> **Code-update note (2026-09-20):** parts of this doc were written against an earlier
> `api/_core.ts`. The engine has since been upgraded and the following are now **live**:
> (1) **Image EXIF/editor-tag extraction via `exifr`** — `extractMetadata()` reads camera
> Make/Model and editing-software tags (Photoshop/Canva/GIMP/etc.) and flags edited-scan
> patterns; (2) a **live `web_search` server tool** (`web_search_20260209`, env
> `WEB_SEARCH_MAX_USES`, default 4) that lets Claude verify public facts, with `pause_turn`
> handled; (3) analysis **effort raised to `high`** (env `ANALYSIS_EFFORT`). The honesty rule
> is unchanged: results that still need a live source go to `externalChecksNeeded`, and the
> model must cite web-search findings rather than fabricate. Treat `api/_core.ts` as the source
> of truth where any statement below says exifr/web-search are "unused/not wired".

This document describes, precisely, how Pramaan decides whether a document is
`AUTHENTIC`, `SUSPICIOUS`, or `LIKELY_FAKE`. It is written against the actual
implementation in `api/_core.ts` (shared by `api/analyze.ts` on Vercel and the
`vite.config.ts` dev middleware), not against an idealized design. Where the
current build does not do something, that is stated explicitly rather than
implied.

Every claim below is traceable to a specific line of code. File:line
references point at `api/_core.ts` unless noted.

---

## 0. Pipeline at a glance

```
Browser (services/analysisService.ts)
  → base64-encodes the file
  → POST /api/analyze { fileBase64, mediaType, fileName }
       ↓
api/_core.ts : analyze()
  1. extractMetadata()        ← Section 1 (deterministic, in code, no AI)
  2. Anthropic Messages API   ← Sections 2–4 (Claude Opus 5, model reasoning)
     - system prompt (forensic ground rules)
     - document bytes (PDF or image, as-is) + the deterministic signal block as text
     - forced tool schema `submit_report`
  3. normalize + merge deterministic signals into report.technicalSignals
       ↓
report: AnalysisReport  → rendered by components/ResultView.tsx
```

Two categories of evidence are deliberately kept separate and never blended
into a single "AI score" the way a black-box classifier would: **measured
facts** (Section 1, computed in TypeScript, reproducible, independent of the
model) and **reasoned judgments** (Sections 2–3, Claude's read of the
document). The UI shows both, labeled as such.

---

## 1. Deterministic / code-level signals

Computed in `extractMetadata()` (`api/_core.ts:163-211`), **before** the file
is ever sent to Claude. These are facts, not inferences — no model is
involved in producing them, and they are prepended to every request as a
"VERIFIED TECHNICAL METADATA" block the system prompt tells Claude to trust
without re-deriving.

| Signal | How it's computed | What it implies |
|---|---|---|
| **SHA-256 hash** | `createHash('sha256').update(buf).digest('hex')` over the raw uploaded bytes | A stable fingerprint of the exact file received. Useful as an audit/chain-of-custody reference (e.g. "this is the same file the applicant uploaded last week") and for exact-duplicate detection if compared against a prior hash. It does **not** by itself indicate tampering — a hash only tells you the file matches (or doesn't match) another specific file; Pramaan does not currently maintain a hash registry to compare against. |
| **File size** | `buf.length / 1024` KB | Sanity signal only. An implausibly small file for its stated page count/resolution, or a size wildly inconsistent with what a genuine issuer's scanner/PDF export typically produces, is a weak secondary signal Claude can factor in — not dispositive on its own. |
| **PDF page count** | `pdf.getPageCount()` via `pdf-lib` | Flags obvious mismatches (e.g. a "3-page bank statement" that is actually 1 page). |
| **PDF producer** | `pdf.getProducer()` | The software that generated the PDF stream (e.g. `Adobe PDF Library`, `Microsoft: Print To PDF`, `iLovePDF`, `Skia/PDF` from a phone scanning app, `Canva`). A producer string inconsistent with how the purported issuer generates documents (e.g. a "government e-District portal" PDF whose producer is a generic image-editing or "PDF to Word to PDF" toolchain) is a real, checkable signal. |
| **PDF creator tool** | `pdf.getCreator()` | The authoring application (e.g. `Microsoft Word`, `LibreOffice`, a specific government e-Gov CMS). Same logic as producer: a mismatch between the claimed issuing system and the actual authoring tool is evidence, not proof. |
| **PDF author** | `pdf.getAuthor()` | Sometimes leaks a personal name or organization inconsistent with the document's claimed origin. |
| **PDF creation date** | `pdf.getCreationDate()` | The `/CreationDate` field embedded by the authoring tool. |
| **PDF modification date** | `pdf.getModificationDate()` | The `/ModDate` field. |
| **PDF edited-after-creation flag** | `modified.getTime() - created.getTime() > 60_000` (`api/_core.ts:194-200`) | The one *derived* deterministic signal: if the file was modified more than 60 seconds after it was created, the PDF stream was re-saved/edited after initial generation. This is flagged with `concern: true` and surfaced to Claude as a potential concern. A genuine, never-touched government-issued PDF is typically created and "modified" within the same save operation (near-zero gap); a large gap means *something* re-opened and re-saved the file — which is consistent with, though not proof of, tampering (it is also consistent with benign re-saves, e.g. a scanner app finalizing the file, or the PDF being flattened/compressed by an intermediate tool). |

### What is *not* currently extracted (honesty note)

The `exifr` package is listed in `package.json` as a dependency, but it is
**not imported or called anywhere in the codebase** — `api/_core.ts` does not
read image EXIF, XMP, or "Software"/editor tags (e.g. Photoshop, GIMP,
Snapseed signatures) for uploaded raster images (JPEG/PNG/WebP). Today, image
uploads only get the SHA-256 hash and file-size signals from this
deterministic layer; all visual-forensic judgment on images comes entirely
from Claude's vision reasoning in Section 2. Wiring `exifr` into
`extractMetadata()` for `mediaType.startsWith('image/')` is the single
highest-value near-term addition to this section (see Section 6).

---

## 2. AI / vision forensic checks

The document (PDF bytes or image bytes, sent as a native `document`/`image`
content block — not pre-rasterized or pre-OCR'd by our code) is sent to
**Claude Opus 5** (`MODEL = 'claude-opus-5'`, `api/_core.ts:21`) via the
Anthropic Messages API with `thinking: { type: 'adaptive' }` and
`effort: 'medium'`, and a forced-schema tool (`submit_report`) so the response
is guaranteed to match `AnalysisReport` exactly — no free-text parsing, no
schema drift. Claude reads the raw document natively (vision for images and
PDF pages, and its own in-context reading of embedded text) rather than
through a separate OCR engine; there is no Tesseract or third-party OCR
library in this codebase.

The system prompt (`SYSTEM`, `api/_core.ts:148-161`) explicitly instructs the
model to perform the following categories of analysis on the artifact
itself:

- **Font / typeface / kerning inconsistency** — mismatched letterforms, weight,
  or spacing within a single field (e.g. an amount or date where two digits
  visibly come from a different font than the rest of the line), which is the
  classic signature of a field being edited in an image editor rather than
  reprinted from the original template.
- **Misalignment / copy-paste artifacts** — text or a stamp sitting at a
  slightly different baseline, angle, or spacing than the surrounding
  template, indicating a pasted element rather than one rendered by the same
  process as the rest of the page.
- **Resolution / compression / anti-aliasing mismatch between regions** — a
  patch of the image (commonly a number, name, or seal) that is visibly
  sharper, blurrier, or has different JPEG block artifacts than the region
  around it — the fingerprint of one region being re-saved or overlaid at a
  different generation/quality than the rest of the scan.
- **Cloned regions** — a texture, seal fragment, or background pattern that
  repeats identically elsewhere on the page in a way a genuine printed/scanned
  document would not (copy-stamped rather than naturally varying).
- **Flat / pasted stamps and signatures** — a seal or signature that sits as a
  clean flat overlay (no ink bleed, no scanner noise, hard-edged against the
  paper texture beneath it) versus one that shows the physical interaction
  (pressure variance, slight smudging, paper grain visible through it) of a
  genuinely stamped/signed physical document that was then scanned.
- **Template / layout errors** — wrong government emblem/letterhead for the
  claimed issuing office, a field arrangement that doesn't match the known
  layout of that certificate type, missing mandatory fields a genuine template
  always carries, or an office name/seal that doesn't correspond to the
  stated district/state.
- **Watermark / seal anomalies** — absent, misplaced, wrong-shape, or
  wrong-color official watermarks/seals relative to what that document class
  is expected to carry.
- **OCR text + language-fluency plausibility** — Claude reads all visible
  text and judges whether the phrasing, grammar, honorifics, and formatting
  are plausible for the claimed issuer and language/register (e.g. a Hindi
  government certificate with machine-translation-grade phrasing, or English
  legal boilerplate that doesn't match how that document class is normally
  worded).

For raster images (not PDFs), the model additionally returns `visualMarkers`
— bounding boxes (`[ymin, xmin, ymax, xmax]`, normalized 0–1000, origin
top-left, per `types.ts`) around the specific suspicious regions, so the
reviewer sees *where* the flag applies rather than a text claim alone
(`REPORT_SCHEMA.visualMarkers`, `api/_core.ts:113-130`). The prompt requires
an empty array for PDFs (bounding boxes are not computed against PDF page
coordinates in this build).

**Important honesty note on this section:** none of the above is backed by a
separate, purpose-built forensic algorithm (no Error-Level Analysis / ELA
pass, no copy-move detector, no JPEG ghost/double-compression detector, no
font-matching library). All of it is a single large vision-language model
performing zero-shot visual judgment during one inference pass. This is a
genuine and often powerful capability of a frontier multimodal model, but it
is probabilistic pattern recognition, not a deterministic forensic
measurement — the same category of evidence as an experienced human
examiner's eye, not a lab instrument. Section 6 expands on this.

---

## 3. Cross-field & arithmetic logic checks

This is the category the system prompt calls out as Claude's specialty
relative to pixel-only forensics tools, and it is reported in
`consistencyChecks` (`check` / `status: PASS|FAIL|WARN` / `detail`,
`REPORT_SCHEMA.consistencyChecks`, `api/_core.ts:67-80`). A pixel-level
ELA/copy-move tool can tell you a region was edited; it cannot tell you that
two numbers on the same document contradict each other. Concrete examples
the system prompt instructs the model to check (`api/_core.ts:156`):

- **Line items sum to stated total.** E.g. a bank statement or invoice
  listing individual transactions/items that should arithmetically add up to
  the printed subtotal/total — a mismatch is a hard, unambiguous FAIL.
- **DOB vs. stated age vs. issue date.** E.g. a domicile/caste certificate
  stating "Age: 24 years" issued in 2024 implies a date of birth around
  1999–2000; if the printed DOB field says 1985, that is an internal
  contradiction independent of any visual tampering evidence.
- **Declared income vs. bank balance/transactions shown.** E.g. an income
  certificate declaring annual income of ₹40,000 (for BPL/scheme eligibility)
  submitted alongside a bank statement showing a running balance and monthly
  credits consistent with a much higher income — a red flag for
  income-certificate fraud used to game an eligibility threshold, without
  needing to prove either document was pixel-edited.
- **ID-number format plausibility.** E.g. checking that a PAN
  (`AAAAA9999A`), Aadhaar-shaped 12-digit number, GSTIN, or a state-issued
  certificate/serial number matches the *structural* pattern expected for
  that ID type and the stated issuing state/authority — catching an
  obviously malformed or wrong-length identifier. This is a format-plausibility
  check only; it is explicitly **not** a real-time validity check against
  UIDAI/GSTN/Income Tax systems (see Section 4).
- **Date ordering / sequencing sanity.** E.g. an issue date that precedes an
  application date, or a certificate "valid from" a date after its own
  expiry — logically impossible orderings that indicate either fabrication or
  a scanning/data-entry error worth flagging either way.
- **Tenure vs. institution/domain age**, for HR/education and business
  documents (named directly in the system prompt as an example class of
  check) — e.g. an experience letter claiming 5 years' tenure at a company
  whose registration or domain is 2 years old.

Each check gets an explicit `PASS` / `FAIL` / `WARN` status plus a `detail`
string explaining the reasoning, so a reviewer sees the logic, not just a
verdict.

---

## 4. Live web verification — how it's used, honestly, and its limits

**As implemented today, Claude has no live web-search or browsing tool
available in this pipeline.** The Anthropic API call in `api/_core.ts`
registers exactly one tool:

```ts
tools: [{ name: 'submit_report', description: '...', input_schema: REPORT_SCHEMA }]
```

(`api/_core.ts:259-265`). There is no `web_search` (or any other) tool
defined alongside it, so nothing in this build performs a real external
lookup — no DigiLocker/e-District query, no UIDAI/Aadhaar check, no GST/PAN
registry call, no MCA company-registry call, no bank API confirmation, no
WHOIS/domain lookup. Any earlier framing of this feature as "live" describes
an aspiration, not the current code path — this document corrects that.

What the system *does* do, deliberately, is refuse to fake those checks. Rule
2 of the system prompt is explicit and is the architectural core of the
project's honesty guarantee:

> "You must NEVER invent or assert the result of an external lookup —
> company registries, GST/PAN/CIN validity, WHOIS/domain data,
> sanctions/blacklist hits, bank account confirmation, DigiLocker/e-District
> source verification. If a claim can only be confirmed by such a source, DO
> NOT state it as true or false. Instead add a clear item to
> `externalChecksNeeded` describing what should be verified and where.
> Fabricating these is the single worst thing you can do." (`api/_core.ts:152`)

Concretely, this means: when a document contains a certificate number, GSTIN,
UDISE code, or bank account that *could* be checked against a live registry,
Claude is instructed to (a) validate its *format* only (Section 3), and (b)
emit a plain-language entry in `externalChecksNeeded` (e.g. "Verify caste
certificate number MP/2024/XXXXXX against the MP e-District portal") rather
than silently assuming it is genuine (or fake) because it merely looks
correctly formatted. `externalChecksNeeded` is a required array field in the
schema (`api/_core.ts:107-112`) and is rendered to the reviewer as an
explicit "still needs checking" list, distinct from the red flags Claude is
actually asserting.

**Limits this implies, stated plainly:**
- Pramaan's verdict is bounded entirely by what is visible on the document
  itself plus the deterministic file-level metadata. It cannot and does not
  confirm that a certificate number, bank account, GST/PAN, or company
  registration actually exists or is currently valid.
- A well-forged document that is internally consistent (correct format,
  plausible numbers, no visible pixel tampering, clean PDF metadata) can pass
  as `AUTHENTIC` — Pramaan is a triage/screening aid that raises the bar for
  fraud, not a guarantee of authenticity.
- Adding a real `web_search` tool (Anthropic's API supports server-side web
  search as a tool) would let Claude *look up* public information (e.g.
  confirm a company's registered address matches an invoice, or that a
  university's UGC listing matches a claimed degree) — but this must be built
  and scoped carefully (allowed domains, what counts as a trustworthy source,
  what to do when a lookup is inconclusive) rather than assumed to already
  exist. It is the clearest, most honest next increment to this system (see
  Section 6) — not a claim to make about the current build.

---

## 5. Scoring model, confidence, and calibration

### riskScore → verdict bands

The mapping is fixed in the system prompt, not computed by any separate
formula in code — Claude assigns both the `riskScore` and the `verdict` in
the same structured response, and is told the exact band to be internally
consistent with (`api/_core.ts:158`):

| `riskScore` | `verdict` | Meaning |
|---|---|---|
| 0–33 | `AUTHENTIC` | No material red flags; document appears genuine and internally consistent. |
| 34–66 | `SUSPICIOUS` | Real doubt exists (one or more Medium/High flags, a failed consistency check, or an unresolved concern), but not enough concrete evidence to call it fraudulent. Recommended path: request original / manual review. |
| 67–100 | `LIKELY_FAKE` | Concrete evidence of tampering, fabrication, or hard internal contradiction (e.g. a failed arithmetic check, visible pasted stamp, mismatched fonts) severe enough to reject or escalate. |

Both `riskScore` and `confidence` are clamped server-side to the `[0, 100]`
integer range regardless of what the model returns (`clamp()`,
`api/_core.ts:228-231`), with safe fallbacks if the field is missing or
non-numeric: `riskScore` defaults to `50` (the exact `SUSPICIOUS`/undecided
midpoint — a deliberately non-committal fallback rather than defaulting to
"safe") and `confidence` defaults to `60`. These fallbacks only trigger if
the model fails to populate the field at all; they are not part of normal
operation given the field is `required` in `REPORT_SCHEMA`.

### Confidence

`confidence` (0–100) is the model's own self-reported certainty in its
assessment, requested directly in the schema description ("0-100 confidence
in this assessment," `api/_core.ts:46`). It is **not** independently
calibrated against a labeled dataset, a held-out test set, or repeated
sampling/ensembling — there is no code in this repo that runs multiple
inference passes and reconciles disagreement, and no ground-truth benchmark
this number has been checked against. Treat it as the model's stated
self-assessment, useful as a rough triage signal (a low-confidence
`SUSPICIOUS` verdict should route to human review sooner than a
high-confidence one), not as a statistically validated probability.

### Calibration against false positives

The system prompt's rule 5 is the only calibration mechanism in this build,
and it is a prompting instruction, not a trained/tuned classifier threshold:

> "Calibrate honestly. A clean, ordinary, internally-consistent document
> should receive a LOW riskScore and an AUTHENTIC verdict — do not cry fraud
> without concrete evidence, and cite the specific evidence when you do. When
> you have real doubt but not proof, use SUSPICIOUS." (`api/_core.ts:158`)

Every `redFlag` is required to carry an `evidence` field — "the specific text
or visual element on the document that triggered this flag"
(`api/_core.ts:59-63`) — which is the main practical guard against
unsubstantiated flags: a flag with no concrete evidence is visibly weak to a
reviewer reading the report, even though nothing in code currently rejects or
down-weights a flag that omits credible evidence. There is no automated
false-positive-rate measurement in this build (no test suite of known-genuine
documents run against the pipeline to measure how often it wrongly flags
them) — calibration currently rests entirely on the system prompt's
instruction and the model's own judgment. This is a known gap for a
production deployment; see Section 6.

---

## 6. Explicit limitations & where human/source verification is still required

Stated directly, without hedging:

1. **No live external verification is wired up.** As covered in Section 4,
   no registry, database, or web-search tool is queried. Every result that
   would require one is listed in `externalChecksNeeded`, never asserted.
2. **Image EXIF/software-tag extraction is not implemented**, despite
   `exifr` being an installed dependency — see Section 1's honesty note.
   Visual tampering detection on images today relies entirely on Claude's
   vision judgment, with no supporting deterministic image-metadata signal.
3. **PDF metadata is itself editable and can be spoofed.** Producer,
   creator, author, and creation/modification timestamps are values embedded
   by whatever tool last wrote the PDF — a forger using a script or a
   metadata-editing tool can set these fields to whatever they like. They are
   genuinely useful signals (most casual forgers don't bother cleaning
   metadata), but they are evidence, not proof, and a sophisticated forgery
   can defeat them entirely.
4. **No separate/classical forensic algorithms.** There is no Error-Level
   Analysis, copy-move/clone detection, JPEG double-compression ("ghost")
   detection, or font-database matching library in this codebase. All visual
   forensic judgment is a single LLM inference pass. This is fast and
   surprisingly capable for a hackathon build, but it is not equivalent to
   dedicated image-forensics tooling used in professional document-fraud
   labs, and it can miss forgery techniques those tools are specifically
   built to catch (and can be fooled by adversarial inputs crafted against
   vision models specifically).
5. **No repeatability/consistency guarantee.** A single inference call is
   made per document; the same document analyzed twice can, in principle,
   receive slightly different riskScore/confidence values or flag wording,
   since nothing in this build runs multiple passes and reconciles them.
6. **`confidence` is self-reported, not statistically calibrated** (Section
   5) — there is no benchmark dataset this system has been measured against
   for precision/recall or false-positive rate.
7. **No legal or evidentiary status.** Pramaan is explicitly a
   triage/screening aid (stated in `docs/PRODUCT.md`), not a court-admissible
   forensic report, and does not claim chain-of-custody guarantees beyond the
   SHA-256 hash of the uploaded bytes.
8. **`visualMarkers` bounding boxes are image-only.** PDFs always return an
   empty array for this field (`api/_core.ts:157`); a suspicious region in a
   PDF is described in text (in `redFlags[].evidence`) but not boxed visually.
9. **History/audit trail is local-only.** `HistoryService`
   (`services/historyService.ts`) persists scan records to the browser's
   `localStorage`, capped at 30 records — there is no server-side, shared, or
   tamper-evident audit log in this build (a Supabase-backed version is
   sketched in code comments but not implemented).
10. **Document-type detection is open-vocabulary, not a fixed taxonomy.**
    `documentType` is a free-text best guess from the model
    (`api/_core.ts:39-42`), not selected from a validated enum of known
    Indian government document types — wording can vary between runs for the
    same document class.

### Practical guidance for a deployer

Use Pramaan's verdict to **prioritize and accelerate** human review, not to
replace it for high-stakes decisions:
- `AUTHENTIC` with high confidence and no `externalChecksNeeded` items →
  fast-track, but retain spot-check sampling.
- `SUSPICIOUS`, or any populated `externalChecksNeeded` list → route to a
  human reviewer who performs the specific external checks listed (e.g.
  actually query the e-District portal for the certificate number) before
  approving.
- `LIKELY_FAKE` → escalate; do not auto-reject without a human confirming the
  cited evidence, since a false positive has real consequences for a genuine
  applicant.

---

## Appendix: `AnalysisReport` fields referenced in this document

See `types.ts` for the canonical TypeScript definitions of `AnalysisReport`,
`RedFlag`, `ConsistencyCheck`, `ExtractedField`, `TechnicalSignal`, and
`VisualMarker`, and `api/_core.ts`'s `REPORT_SCHEMA` for the exact JSON
schema forced on the Claude tool call that produces them.
