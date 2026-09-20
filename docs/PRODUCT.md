# DocsGuard

**Tagline:** Upload any document. Know in seconds if it is real.

DocsGuard is a universal AI document-authenticity and fraud-detection web app. Its hero use case is Madhya Pradesh government scheme documents — fake caste, income, and domicile certificates, tampered marksheets, forged bank statements used to claim benefits like Ladli Behna, scholarships, PDS ration cards, and subsidised jobs/tenders. The same engine also works for banking/KYC documents, trade invoices, HR/education records, and rental or marketplace listings — anywhere a document is used to establish trust.

---

## 1. Problem

Madhya Pradesh (and India generally) runs welfare and benefit programs at massive scale — Ladli Behna Yojana, scholarships (post-matric, pre-matric), PDS ration entitlements, caste/income/domicile-linked job and tender reservations. Every one of these programs is gated by a **document upload**: a caste certificate, an income certificate, a domicile certificate, a marksheet, a bank passbook photo.

- **Manual verification does not scale.** A single taluka or block office may process thousands of applications per scheme cycle. Front-desk staff have seconds to eyeball a photocopy or a scanned PDF — they cannot check font consistency, stamp geometry, seal placement, or cross-field arithmetic by hand.
- **Fraud is common and low-effort.** Editing a scanned certificate in a photo editor (changing an income figure, a caste category, a date of birth) is trivial. Forged bank statements to inflate or deflate declared income are a known problem in subsidy and loan-linked scheme fraud.
- **The fiscal and beneficiary impact is real.** Every fraudulent claim that passes either (a) diverts a limited subsidy/scholarship/quota slot away from a genuine beneficiary, or (b) costs the state exchequer directly. At scale, even a few percent leakage across a scheme with lakhs of applicants is a large number.
- **This is not only a government problem.** The same failure mode — a human being asked to eyeball a document and decide "real or fake" in seconds — shows up in bank KYC onboarding, trade-finance invoice checks, HR verifying degree certificates, and landlords/marketplaces verifying ID or ownership proofs.

## 2. Solution

DocsGuard lets anyone — a scheme officer, a bank clerk, an HR recruiter, or a citizen checking their own paperwork — **upload a document (image or PDF) and get a structured authenticity verdict in seconds**, with the evidence highlighted, not just asserted.

Pipeline:

1. **Upload** — drag/drop or pick a file (image or PDF) in the browser.
2. **Deterministic metadata extraction** — before any AI call, the app computes a SHA-256 hash of the file and (for PDFs) reads structural/producer metadata via `pdf-lib`-style inspection: creation/modification dates, producer/editor software strings, and other signals that do not require interpretation — the kind of evidence a forensic tool would report, not guess.
3. **Claude vision + reasoning** — the document image and the deterministic signals are sent to Claude with a forced structured-output tool call. Claude reads the document the way a trained clerk would: extracts fields, cross-checks them against each other (does the DOB imply the stated age? does the issuing office match the stated district? is the stamp/seal placement, font, and layout consistent with a genuine template of that document type?), and flags inconsistencies.
4. **Verdict + evidence** — the app renders a verdict (AUTHENTIC / SUSPICIOUS / LIKELY_FAKE), a 0–100 risk score, a plain-language summary, a list of red flags with severity and evidence, a table of consistency checks (PASS/FAIL/WARN), the extracted fields, the technical (deterministic) signals, and — where the document is an image — bounding boxes drawn directly over the suspicious regions so the reviewer can see exactly what triggered the flag.
5. **Recommended action + what still needs live verification** — DocsGuard is explicit about what it *cannot* confirm from the document alone (e.g. "verify this certificate number against the e-District portal," "confirm this UDISE code against the school's official record") rather than pretending to have checked an external database it never touched.

## 3. Why it wins / uniqueness

- **Honest architecture, not a black box.** DocsGuard separates what is *measured* (file hash, PDF producer metadata, structural signals — deterministic, reproducible, and independent of the AI) from what is *reasoned* (Claude's visual and cross-field analysis). The UI never blends the two into a single unexplained "AI score" — every red flag cites its evidence.
- **Cross-field and cross-document logic that generic OCR/forensics tools miss.** A standard OCR or ELA (error-level analysis) tool tells you "this region was edited." It does not tell you "the applicant's declared age doesn't match their date of birth" or "this income certificate's issuing tehsil doesn't exist in the district stated on the same form." That reasoning step is where Claude's language+vision understanding adds value that pixel-forensics alone cannot.
- **It does not fabricate confidence.** DocsGuard explicitly does **not** claim to have checked a certificate number against DigiLocker, an e-District registry, a company's MCA/GST record, or a sanctions list unless that integration actually exists. Where such verification would be needed, the report lists it under `externalChecksNeeded` rather than silently assuming the document is genuine (or fake) because a number "looks" like a valid ID.
- **Universal, not single-purpose.** The same `AnalysisReport` schema and pipeline work whether the input is a caste certificate, a bank statement, a trade invoice, or a rental agreement — the document type is detected and reported, not hard-coded.
- **Built for a 2-hour hackathon and it still works end-to-end.** No mocked demo data — a real file, uploaded live, produces a real structured verdict.

## 4. PRD (Product Requirements)

### 4.1 Goals
- Let a non-technical user upload one document and get an understandable, evidence-backed authenticity verdict in under ~15 seconds.
- Make the reasoning legible: every flag has a severity, a title, a detail, and cited evidence; every consistency check has a pass/fail/warn status.
- Work for the MP government hero case (caste/income/domicile certificates, marksheets, bank statements) and generalize to KYC, invoices, HR, and rental/marketplace documents without code changes per document type.
- Be honest about limitations: never claim an external-database check that was not actually performed.

### 4.2 Non-goals (for this build)
- No live integration with DigiLocker, e-District, UIDAI/Aadhaar verification, MCA/GST company registries, or sanctions lists — these are flagged as "needs external verification," not simulated.
- No user authentication/multi-tenant accounts in the hackathon build (Supabase-ready schema exists for later — see Architecture).
- No bulk/batch upload or API access in v1.
- No legal or evidentiary certification — DocsGuard is a triage/screening aid, not a court-admissible forensic report.

### 4.3 Primary user + easy onboarding
Primary user: an **MP government scheme officer or front-desk verification clerk** with low technical comfort, on a shared or low-spec device, who needs a fast yes/no/needs-review signal. Secondary users: bank KYC staff, HR recruiters, landlords/marketplace moderators, and citizens self-checking a document before submission.

Onboarding is intentionally zero-friction: open the site, drag a file onto the upload zone (or tap to pick from a phone), and get a result — no signup, no configuration, no document-type selection required.

### 4.4 Key user stories
- *As a scheme desk officer*, I upload a scanned income certificate and immediately see whether the numbers are internally consistent and whether the document matches the expected format, so I can decide whether to escalate for manual review.
- *As a bank KYC analyst*, I upload a submitted bank statement and see if the metadata (edit history, producer software) is consistent with a bank-issued PDF or shows signs of tampering.
- *As an HR recruiter*, I upload a degree certificate and get a clear verdict plus a note that the university registration number should be verified against the university's own portal.
- *As a citizen*, I check my own scanned certificate before submitting it, to catch scanning artifacts that might get it wrongly rejected.
- *As any user*, I can see exactly which part of the image triggered a red flag via a highlighted bounding box, not just a text claim.

### 4.5 Functional requirements
- FR1: Accept image (JPEG/PNG/WebP) and PDF uploads via drag-and-drop or file picker.
- FR2: Compute SHA-256 hash of the uploaded file client-side/server-side for integrity/audit reference.
- FR3: For PDFs, extract structural metadata (producer, creation/modification timestamps, page count) deterministically before any AI call.
- FR4: Send the document (as base64) plus filename/mediaType to `POST /api/analyze`; the serverless function holds the Claude API key server-side — it is never exposed to the browser.
- FR5: The backend calls Claude with a forced-tool call to guarantee the response matches the `AnalysisReport` schema exactly (no free-text parsing, no schema drift).
- FR6: Render the verdict, risk score, confidence, summary, red flags (with severity color-coding), consistency checks, extracted fields, technical signals, recommended action, and any external checks still needed.
- FR7: For image documents, draw the returned `visualMarkers` bounding boxes over the original image, color-coded by severity.
- FR8: Persist each scan as a `ScanRecord` (id, timestamp, filename, mediaType, thumbnail, report) to local history; the storage layer is written against a schema compatible with a future Supabase table so history can move server-side without a rewrite.
- FR9: Handle and surface errors from the API (non-200 responses) as a clear, non-technical message to the user rather than a raw stack trace.

### 4.6 Data model — `AnalysisReport` (canonical, from `types.ts`)
```ts
type Verdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'LIKELY_FAKE';
type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

interface RedFlag { severity: Severity; title: string; detail: string; evidence: string; }
interface ConsistencyCheck { check: string; status: CheckStatus; detail: string; }
interface ExtractedField { label: string; value: string; }
interface TechnicalSignal { label: string; value: string; concern: boolean; }
interface VisualMarker { label: string; severity: Severity; box: [number, number, number, number]; } // [ymin,xmin,ymax,xmax], 0-1000, origin top-left

interface AnalysisReport {
  documentType: string;
  verdict: Verdict;
  riskScore: number;       // 0-100, higher = more likely fraudulent
  confidence: number;
  summary: string;
  redFlags: RedFlag[];
  consistencyChecks: ConsistencyCheck[];
  extractedFields: ExtractedField[];
  technicalSignals: TechnicalSignal[];
  recommendedAction: string;
  externalChecksNeeded: string[];
  visualMarkers: VisualMarker[];
}

interface ScanRecord { id: string; createdAt: number; fileName: string; mediaType: string; thumbnail?: string; report: AnalysisReport; }
```
`riskScore` maps roughly to `verdict`: 0–33 → AUTHENTIC, 34–66 → SUSPICIOUS, 67–100 → LIKELY_FAKE. The backend sets both fields; the frontend renders them, it does not recompute the mapping.

### 4.7 Success metrics
- **Demo success:** a visibly tampered sample certificate is correctly flagged SUSPICIOUS/LIKELY_FAKE with at least one FAIL consistency check and one visible bounding box, live, in front of judges.
- **Speed:** end-to-end (upload → verdict rendered) under ~15 seconds on a typical document.
- **Clarity:** a non-technical reviewer can explain, from the UI alone, *why* the app reached its verdict (evidence-linked flags, not an opaque score).
- **Honesty:** zero instances in the UI/copy of claiming a check against an external system (DigiLocker, MCA, sanctions lists, etc.) that was not actually performed.

## 5. Architecture

- **Frontend:** React 19 + Vite + TypeScript, deployed as a static site on **Vercel**. Styling is Tailwind CSS loaded via CDN in `index.html` (no build-time CSS pipeline). Icons via `lucide-react`.
- **Backend:** a single Vercel **serverless function** at `/api/analyze`. This is the only place the Claude API key lives — it is read from a server-side environment variable and never shipped to the client bundle.
  - Request: `{ fileBase64, mediaType, fileName }` (base64 with no `data:` prefix).
  - The function first runs **deterministic checks**: SHA-256 hashing of the file bytes, and for PDFs, `pdf-lib`-based metadata extraction (producer, creation/mod dates, page count) — these do not depend on the model and are reproducible.
  - It then calls **Claude (`claude-opus-5`)** with the document (vision input) and the deterministic signals, using a **forced tool call** so the model's response is constrained to the exact `AnalysisReport` JSON shape — no prompt-parsing, no malformed-JSON risk.
  - Response: `{ report: AnalysisReport }` on success, `{ error: string }` with a non-200 status on failure.
- **History/storage:** the current build stores `ScanRecord`s via a local `storageService`. The record shape is written to be directly compatible with a **Supabase** table (`scan_records`), so swapping in real persistence and multi-device history later is a config change, not a rewrite.
- **No new npm dependencies** were introduced for the frontend beyond what already ships in `package.json` (`react`, `react-dom`, `@google/genai`* pending replacement, `lucide-react`, `pdfjs-dist`, `jspdf`, `html2canvas`).

  *Note: the current `package.json` lists `@google/genai`; the backend contract described here targets Claude via `/api/analyze`. Confirm with the backend/orchestrator agent which model integration is actually wired in the deployed `api/` code before quoting a specific provider in a live demo.

## 6. Roadmap

- **DigiLocker / e-District source verification** — where a certificate carries a verifiable ID (e.g. an e-District application number), call the relevant government API to confirm the document's existence and contents against the issuing system, turning "needs external verification" into a real PASS/FAIL.
- **Sanctions & business-registry API checks** — MCA (company registration), GST, and sanctions-list lookups for the KYC/trade-invoice use case.
- **Reverse-image search** — detect certificates/stamps/photos reused across multiple unrelated applications (a strong fraud signal OCR alone cannot catch).
- **Bulk/API mode** — a batch-upload and REST API surface so a scheme's backend systems can screen applications programmatically rather than one file at a time.
- **Officer dashboard** — a queue view for reviewers: pending scans, filter by verdict/severity, assign for manual follow-up.
- **Audit trail** — immutable log of every scan (hash, verdict, reviewer action) for accountability and dispute resolution.

## 7. Risks / Limitations (honest)

- **DocsGuard is a screening aid, not a legal verdict.** A LIKELY_FAKE result should trigger manual review, not automatic rejection; a false positive (genuine document flagged) is possible, especially for low-quality scans or unusual-but-legitimate formats.
- **No live external verification yet.** Any check that would require querying a government or financial database is explicitly listed under `externalChecksNeeded` and is *not* performed — the app does not claim otherwise.
- **Vision-model limitations.** Claude's document reading can misread poor-quality scans, unusual regional certificate formats it hasn't seen examples of, or non-Latin/regional-script fields; confidence scores should be read alongside the verdict, not in isolation.
- **Metadata signals are circumstantial, not conclusive.** A "genuine-looking" PDF producer string does not prove authenticity, and a re-saved/re-scanned genuine document can look similar to a tampered one at the metadata level — these are signals that support the AI's reasoning, not standalone proof.
- **Adversarial evasion.** A sufficiently careful forgery (correct fonts, metadata stripped/spoofed, printed-and-rescanned to remove digital edit traces) can reduce the signal available to both the deterministic and AI layers. DocsGuard raises the bar for casual fraud; it is not presented as unbeatable.
- **Privacy.** Uploaded documents may contain sensitive personal data (caste, income, ID numbers). They should be handled per applicable data-protection requirements; the hackathon build does not yet implement encryption-at-rest or a data-retention policy — see Roadmap/SETUP for what is and isn't in place at demo time.
