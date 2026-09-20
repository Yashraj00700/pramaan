# Fraud Typologies — What DocsGuard Is Actually Looking For

This is the working catalog behind DocsGuard's forensic reasoning: for each document class in
scope, how fraudsters actually forge or tamper it, which of those forgeries leave a
**detectable signal**, and which DocsGuard output field that signal should land in. It exists so
that (a) the Claude system prompt / demo script can point at concrete, real examples instead of
vague "AI checks for fraud," and (b) nobody on the team overclaims what the current build can
verify.

**Read this against `types.ts` / `api/_core.ts`, not instead of it.** Every signal below maps to
one of:

| DocsGuard field | What it means | Who/what produces it |
|---|---|---|
| `technicalSignals` | Deterministic, code-computed facts (hash, file size, PDF producer/creation-vs-modification dates via `pdf-lib`, image EXIF/editor tags via `exifr`) | `api/_core.ts::extractMetadata` — **not** the model |
| `redFlags` | Claude's visual/textual forensic observations, each with cited evidence | Claude, reasoning over pixels/OCR text |
| `consistencyChecks` | Cross-field / cross-document logic tests (PASS/FAIL/WARN) | Claude — this is the layer generic OCR/ELA tools don't do |
| `externalChecksNeeded` | Anything that needs a live registry/database DocsGuard does not query today | Claude is instructed to list these, never fabricate the result |
| `visualMarkers` | Bounding boxes on the *image* pointing at the suspicious region | Claude, images only (empty for PDFs per the schema) |

Two things this catalog deliberately does **not** claim, because the current build doesn't do
them: (1) no live lookup against DigiLocker, e-District, UIDAI, MCA/GST, or any bank/sanctions
API — those checks are named per document class below and always routed to
`externalChecksNeeded`; (2) no reverse-image search or cross-applicant duplicate-stamp
detection — that is a roadmap item (see `docs/PRODUCT.md` §6), not a current capability, even
though it is one of the highest-value checks for certificate mills (see Vyapam case below).

---

## 1. Indian government certificates — caste, income, domicile, EWS

These four are grouped because they share an issuer model (tehsildar / SDM / revenue
department), a template model (state letterhead + seal + signature + certificate number), and a
forgery model (edit a genuine scan, or print a convincing fake from scratch).

### How they're forged
- **Photoshop-a-genuine-copy**: take a real (often someone else's, or an expired/old) certificate
  scan and edit the name, caste category, income figure, or validity date in an image editor,
  then re-save/re-print/re-scan to remove obvious edit artifacts.
- **Template forgery from scratch**: recreate the state's certificate letterhead, seal, and
  format using a word processor or design tool, when no genuine base document is available.
  Common for Madhya Pradesh's caste (जाति), income (आय), and domicile (मूल निवासी) certificates
  because the layouts are simple and publicly visible on sample documents.
- **Wrong-category "help"**: a tehsildar-office tout or cyber café operator files a real
  application with false underlying facts (inflated household size to lower per-capita income,
  wrong caste category) — the certificate itself is genuinely issued but rests on a false
  declaration. This is the hardest fraud type for *any* document-forensics tool (including
  DocsGuard) to catch, because the artifact is authentic; only the underlying facts are false. A
  2026-era report on the EWS quota noted exactly this pattern: "unauthorised agents and cyber
  cafés are offering to 'arrange' caste, income and EWS certificates for a fee, often without
  applicants verifying their authenticity" (see Real Cases §6.4).
- **Recycled certificate number**: reuse a real certificate number (or a plausible-looking one)
  on a fabricated document, betting the verifier won't cross-check the e-District/Lok Seva Kendra
  portal.

### Detectable signals
**Visual**
- Font mismatch between the fixed template text (printed by the issuing office's software) and
  the variable fields (name, income figure, dates) — classic sign of a field being retyped over a
  genuine scan.
- Seal/stamp that is too crisp, flat, or perfectly axis-aligned compared to a hand-stamped
  original (real ink stamps show pressure variation, slight rotation, occasional smudging).
- Signature that looks pasted (clean rectangular edges, different resolution/anti-aliasing than
  the surrounding scan, or a signature that is suspiciously identical pixel-for-pixel to another
  known-genuine specimen if one is available for comparison).
- Compression/resolution seams: the edited region (e.g. the income figure) has visibly different
  JPEG blockiness or sharpness than the rest of the page — a strong tampering tell when a number
  was pasted in from a different source image.
- Misaligned text baseline where a field was overwritten.

**Textual / OCR**
- Certificate number format that doesn't match the stated issuing district's known numbering
  convention.
- Office name / tehsil name that doesn't exist in the stated district, or a district–state
  mismatch (e.g. a tehsil name that belongs to a different state than the one on the letterhead).
- Language/register inconsistencies — a certificate that mixes bureaucratic Hindi phrasing
  incorrectly, or uses a template phrase pattern inconsistent with the claimed issuing years'
  format changes.

**Metadata**
- For PDF submissions: `PDF modified` timestamp significantly after `PDF creation` timestamp
  (DocsGuard's own deterministic flag, see `api/_core.ts` — "PDF edited after creation"), or a
  `PDF producer`/`creator` string identifying a consumer image editor (e.g. a photo-editing app)
  rather than a scanner/scanning-app signature.
- For photographed/scanned images: EXIF/editor tags showing the file passed through an editing
  tool after the scan timestamp.

**Cross-field / logical**
- Declared income on the income certificate inconsistent with other documents in the same
  application bundle (e.g. bank statement showing materially higher balances/credits than the
  "income" claimed).
- Domicile certificate issue date earlier than the applicant's stated date of birth, or
  inconsistent with the stated years of continuous residence.
- Caste certificate issued in a district the applicant's other documents (Aadhaar, marksheet)
  place them as never having resided in.
- EWS income threshold (₹8 lakh/year family income under the central EWS scheme, or the state's
  own threshold for local quotas) inconsistent with other declared income/asset fields on the
  same form.

### Maps to DocsGuard
`redFlags` (font/seal/paste anomalies, evidence-cited) · `consistencyChecks` (income vs. other
docs, DOB vs. issue date, district plausibility) · `technicalSignals` (PDF edit-after-create,
editor metadata) · `externalChecksNeeded` (certificate-number verification against the state
e-District/Lok Seva Kendra portal — DocsGuard does not and cannot query this live today).

---

## 2. Marksheets and degree certificates

### How they're forged
- **Grade inflation on a genuine marksheet**: change individual subject marks or the aggregate
  percentage on a real scanned marksheet, keeping the rest of the document untouched.
- **Fabricated marksheet from a fake/non-existent board or university**: entirely invented
  document using a plausible-looking university seal and format, sometimes for a university that
  doesn't hold the accreditation it claims (UGC-recognition fraud), or an outright fictitious
  institution.
- **Genuine marksheet, fabricated backing exam**: the Vyapam pattern — the underlying "exam" was
  never taken honestly (proxy candidates, leaked papers, rigged evaluation), so the marksheet is
  procedurally authentic but the result is fraudulent. As with certificate-of-convenience fraud
  above, no pixel-level forensic tool (DocsGuard included) can detect this from the document alone;
  it requires cross-checking against the issuing board's own result database.
- **Degree-mill diplomas**: purchased "degrees" from unaccredited or non-existent institutions,
  formatted to resemble a real university's certificate.

### Detectable signals
**Visual**
- Digit-level tampering on marks/percentage fields: font size or weight mismatch vs. the printed
  table, misaligned digits within a grid cell, or visible erasure/overwrite halos.
- University seal/crest that is a low-resolution raster paste (visible pixelation or a hard
  rectangular edge) rather than part of the original print run.
- Grand total that visually doesn't sum from the individual subject marks shown in the same
  table — the single most catchable marksheet fraud, because forgers often update the headline
  percentage without recalculating (or bothering to alter) every subject score.

**Textual**
- University/board name spelled inconsistently with its official name, or a name similar-but-not-
  identical to a real accredited institution (a classic degree-mill pattern).
- Roll number / registration number format inconsistent with the stated board's known scheme.

**Metadata**
- Same PDF-edit-after-creation and image-editor-signature checks as §1.

**Cross-field / logical**
- Subject-wise marks do not arithmetically sum to the stated aggregate/percentage.
- Date of examination inconsistent with the applicant's stated date of birth (implausible age at
  exam) or with the claimed subsequent degree's admission year.
- Grading scale/pattern inconsistent with what that board actually used in the stated year (e.g.
  a CGPA scale on a board known to have only issued percentage marksheets that year) — this
  specific check needs the board's historical grading-scheme record and should be flagged under
  `externalChecksNeeded` rather than asserted from general knowledge.

### Maps to DocsGuard
`redFlags` (seal paste, digit tampering) · `consistencyChecks` (marks-sum-to-aggregate — a clean
arithmetic check DocsGuard can actually run with certainty, no external source needed) ·
`technicalSignals` · `externalChecksNeeded` (verify roll number / result against the board's or
university's own portal, e.g. NAD/DigiLocker-linked academic records, UGC accreditation status).

---

## 3. Aadhaar, PAN, and ration cards

### How they're forged
- **Full fabrication**: entirely fake Aadhaar/PAN card generated with a fictitious number and a
  real or stock photo, produced with widely available card-template generators.
- **Number tampering**: a real card's photo/name is kept but the 12-digit Aadhaar number or
  10-character PAN is altered to impersonate someone else or to defeat a duplicate check.
- **Photocopy/print quality masking**: low-resolution photocopies submitted specifically to hide
  tampering evidence that would be visible on a higher-quality scan.
- **Ration card ghost entries**: household member additions/removals or income-category changes
  to qualify for a different subsidy tier — closer to the certificate-of-convenience pattern in
  §1 than to visual forgery.

### Detectable signals
**Visual**
- Aadhaar's QR code (present on the standard PDF/print) that doesn't visually correspond to a
  well-formed, decodable pattern, or is missing where the template expects one — a strong signal,
  though DocsGuard's current pipeline does not decode QR payloads; a mismatched/garbled/absent QR
  region is a *visual* red flag Claude can note, not a payload-verified one.
- PAN card's guilloché/security-pattern background inconsistent or absent (genuine PAN cards
  since ~2018 carry a QR code and specific micro-text security features; a card lacking these on
  a claimed-recent issue date is suspicious).
- Photo region with a different resolution/compression signature than the surrounding card body
  (classic photo-swap tell).
- Font used for the printed name/number not matching the issuing authority's known typeface for
  that document generation.

**Textual**
- Aadhaar number failing the public Verhoeff checksum structure (a purely mathematical
  well-formedness check on the 12-digit number — DocsGuard can validate this deterministically
  without any external lookup, though it does **not** confirm the number is actually assigned to
  anyone real).
- PAN format violating the fixed 10-character pattern (5 letters, 4 digits, 1 letter), where the
  4th character must encode the holder-type (P=individual, C=company, etc.) — a mismatch between
  the declared holder type and the 4th character is a pure-format red flag.

**Metadata**
- Standard PDF/image tampering signals as in §1.

**Cross-field**
- Name/DOB on the Aadhaar/PAN inconsistent with the same fields on other documents in the same
  submission bundle (marksheet, bank statement, application form).
- Ration card category (APL/BPL/AAY) inconsistent with the income certificate submitted in the
  same bundle.

### Maps to DocsGuard
`redFlags` (photo-swap, missing/garbled QR, font mismatch) · `consistencyChecks` (Aadhaar
Verhoeff checksum, PAN structural format, cross-document name/DOB match) ·
`externalChecksNeeded` (this is the single most important category to be explicit about: DocsGuard
does **not** call UIDAI's Aadhaar verification API or the Income Tax Department's PAN
verification service — a structurally valid Aadhaar/PAN number is not proof it is real or belongs
to the applicant, and the report must say so).

---

## 4. Bank statements and salary slips

### How they're forged
- **Balance/transaction inflation**: edit a genuine e-statement (PDF export or scanned passbook)
  to raise closing balances or insert fictitious high-value credits, typically to qualify for a
  loan, visa, or a scheme's asset/income threshold.
- **Salary-slip fabrication**: create a plausible-looking payslip for a job that doesn't exist or
  inflate the stated salary, often using a downloaded payslip template with the company logo
  swapped in.
- **Selective statement periods**: submit only the months that look favorable, omitting overdrafts
  or bounced-cheque periods — not a forgery of the document itself, but a completeness gap
  DocsGuard can flag as a limitation rather than "prove."
- **PDF text-layer editing**: because most bank e-statements are digitally generated PDFs (not
  scans), fraudsters can edit the underlying text layer directly in a PDF editor rather than
  photoshopping an image — often leaving weaker visual artifacts but stronger metadata artifacts.

### Detectable signals
**Visual**
- Row misalignment in the transaction table (a single edited row's font, size, or vertical
  spacing doesn't match the surrounding rows — very catchable when the statement was originally a
  clean digitally-typeset table).
- Running-balance column that doesn't mathematically update credit-by-credit, debit-by-debit —
  i.e. balance(row n) ≠ balance(row n−1) ± transaction(row n). This is a strict arithmetic
  invariant real bank statements always satisfy and is one of the highest-confidence checks
  available, because it requires no external data at all.
- Bank logo/letterhead resolution or color profile inconsistent with the rest of the page (a
  pasted or template-recycled header).

**Textual**
- IFSC code format invalid (must be 11 characters: 4-letter bank code + 0 + 6-character branch
  code) or the stated bank name inconsistent with the IFSC's bank-code prefix — a pure format
  check needing no live lookup.
- Account number length/format inconsistent with that bank's known numbering convention.

**Metadata**
- `PDF producer`/`creator` string is a generic PDF editor (e.g. a desktop PDF tool) rather than
  the bank's own statement-generation system (many Indian banks embed identifiable producer
  strings in genuinely system-generated statements) — a mismatch is circumstantial, not proof, but
  worth surfacing as a `technicalSignal`.
- `PDF modified` well after `PDF creation` on a document that should have been generated once and
  never re-saved.

**Cross-field / logical**
- Running balance doesn't reconcile transaction-by-transaction (see above).
- Salary credited on the statement inconsistent with the salary slip's stated figure submitted in
  the same bundle.
- Statement period dates inconsistent with the account-opening date implied elsewhere in the
  bundle, or with the stated employer's claimed tenure.
- Payslip's stated employer PAN/GST inconsistent with a separately submitted company document.

### Maps to DocsGuard
`redFlags` (row misalignment, header paste) · `consistencyChecks` (running-balance arithmetic —
DocsGuard's strongest, least-external-dependency check for this document class; IFSC-bank name
match; salary-slip-vs-statement cross-check) · `technicalSignals` (producer string, edit-after-
creation) · `externalChecksNeeded` (confirming the statement against the bank directly — DocsGuard
has no core-banking integration and must say so, not infer authenticity from a plausible-looking
IFSC/format alone).

---

## 5. Commercial invoices and packing lists (trade/GST)

### How they're forged
- **Bogus invoicing for fake Input Tax Credit (ITC)**: the dominant real-world pattern in India
  today — a network of shell/dummy firms issues invoices for goods or services that were never
  actually supplied, purely to let a buyer claim GST input tax credit or to launder money through
  paper trails. This is large-scale, organized fraud, not a one-off tampered PDF (see Real Cases
  §6.2 for cited figures).
  - Modus operandi documented by DGGI: obtain genuine individuals' Aadhaar/PAN/KYC documents
    (often paid for), register dummy GST firms in their names, and generate invoices/e-way bills
    for goods that never moved.
- **Quantity/value inflation or deflation**: altering unit prices, quantities, or totals on an
  otherwise real trade invoice to misstate the transaction's value — for customs under/over-
  invoicing, or to inflate turnover for a tender eligibility claim (see §7).
- **Packing-list/invoice mismatch**: a packing list describing different goods, weights, or
  quantities than the paired commercial invoice, used to disguise the true nature or value of a
  shipment.
- **Fake letterhead/GSTIN**: an invoice printed with a company name and GSTIN that either doesn't
  exist or belongs to an unrelated entity.

### Detectable signals
**Visual**
- Line-item table row insertion/edit artifacts (font/alignment mismatch), same pattern as bank
  statements.
- Letterhead/logo pasted or resolution-mismatched relative to the invoice body.

**Textual / structural**
- GSTIN format invalid: must be 15 characters — 2-digit state code, 10-character PAN, entity code,
  a fixed 'Z', and a checksum character. A state-code prefix inconsistent with the invoice's
  stated billing address, or a PAN-substring inconsistent with the stated legal entity name
  pattern, is a pure-format red flag needing no external call.
- HSN/SAC codes inconsistent with the stated goods description.

**Cross-field / logical (this is where DocsGuard's reasoning layer earns its keep)**
- Line items don't sum to the stated subtotal, or GST rate applied doesn't match the stated
  HSN/SAC's typical rate bracket.
- Invoice date sequence implausible relative to the packing list or e-way bill dates in the same
  bundle.
- Packing-list weights/quantities inconsistent with the invoice's stated quantities.
- Invoice value inconsistent with typical market pricing for the stated goods at the stated
  quantity — flagged as a plausibility observation, not a certainty, since DocsGuard has no live
  pricing database.

### Maps to DocsGuard
`redFlags` (line-item tampering, letterhead paste) · `consistencyChecks` (line-items-sum-to-total,
GSTIN structural validity, invoice-vs-packing-list quantity match) · `externalChecksNeeded`
(confirming the GSTIN is active and the invoicing entity is a real, filing business — this needs
the GST Network's public GSTIN-search API, which DocsGuard does not currently call; confirming
actual movement of goods needs e-way bill/logistics data DocsGuard does not have access to).

---

## 6. Tender documents — turnover/experience certificates, bank guarantees, GST/PAN proofs

This is the category with the highest financial stakes per document and the most real,
large-rupee-figure Indian cases (see §6 of Real Cases below), because a single forged eligibility
document can unlock a contract worth crores.

### How they're forged
- **Turnover/experience certificate fabrication**: a bidder needs to prove past project value or
  years of experience to meet eligibility criteria; a common fraud is a fabricated
  client-completion certificate — either wholly invented, or a genuine certificate from a small
  project altered to inflate the stated contract value or completion date.
- **Fake bank guarantees (BG) / Performance Bank Guarantees (PBG)** — the highest-value pattern
  seen in India's tender ecosystem: forgers impersonate a bank via a spoofed email domain (e.g. a
  lookalike of the real bank's domain) to "confirm" a fabricated BG's authenticity when the
  issuing authority calls to verify it. Documented cases include a ₹183 crore fake BG scheme
  exploiting a Madhya Pradesh Jal Nigam irrigation tender, and a spoofed-SBI-domain forged
  guarantee tied to a Reliance Power-linked solar tender dispute (see Real Cases §6.5 and §6.6).
- **GST/PAN eligibility-proof forgery**: submitting a GSTIN or PAN registration certificate for an
  entity that either doesn't exist, is not actually registered under the bidder's name, or has a
  turnover/registration date altered to meet the tender's minimum-eligibility threshold.
- **Backdated documents**: altering issue/registration dates on genuine certificates so a
  newly-formed or ineligible firm appears to meet a "N years in business" requirement.

### Detectable signals
**Visual**
- BG letterhead/logo resolution mismatch; bank seal that is a flat digital paste rather than
  physically stamped (a real BG issued by a bank branch typically carries a wet stamp with visible
  ink variation, or is digitally signed with a verifiable certificate — a BG with neither is
  itself a red flag).
- Signature on the BG inconsistent in style/pressure with the bank officer's known signing
  pattern where a comparison specimen exists (rarely available to DocsGuard without external data).
- Client-completion certificate letterhead/format inconsistent with that client organization's
  known official letterhead (best-effort visual comparison only).

**Textual**
- BG reference number format inconsistent with the issuing bank's known numbering scheme.
- Turnover figures inconsistent in formatting/rounding pattern with how that filing entity
  typically reports (a soft signal, not conclusive).
- GSTIN/PAN structural validity as in §5/§3.

**Metadata**
- PDF edit-after-creation timing, editor/producer signature — especially relevant here because
  BGs and certificates are frequently issued as scanned/signed PDFs, so a "recently re-saved" long
  after the stated issue date is a meaningful flag.

**Cross-field / logical**
- Stated contract/turnover value on the experience certificate inconsistent with the bidder's own
  declared annual turnover elsewhere in the same tender bid.
- BG validity period inconsistent with the tender's required bid-validity window.
- BG amount inconsistent with the tender's stated EMD/PBG percentage requirement relative to the
  bid value.
- Client organization named on the experience certificate doesn't match any publicly known
  project of that scale — flagged as needing verification, not asserted false.

### Maps to DocsGuard
`redFlags` (letterhead/seal/signature anomalies) · `consistencyChecks` (turnover-vs-declared,
BG-amount-vs-tender-requirement, validity-period math) · `technicalSignals` (PDF edit timing) ·
`externalChecksNeeded` — **this is the single category where "call the bank directly to confirm
the BG" is not optional advice but the actual documented failure mode**: every fake-BG case cited
in §6.5–6.6 below succeeded specifically because the verifying authority confirmed the BG via an
email address or phone number *provided by the fraudster* (a spoofed bank-lookalike domain)
instead of the bank's own published contact channel. DocsGuard's honest limitation here is explicit
and important: it cannot call the bank either — its job is to flag the artifact-level anomalies
and put "confirm this BG directly through the issuing bank branch, using contact details obtained
independently — never from the document itself" into `externalChecksNeeded`, in plain language.

---

## 7. Rental agreements and marketplace listings

### How they're forged
- **Ownership-proof forgery**: a rental/lease agreement or a "for sale" listing document backed
  by a property title, tax receipt, or utility bill that doesn't actually belong to the person
  listing it — either fabricated outright or a genuine document with the owner's name/address
  altered.
- **Stamp-paper/registration tampering**: altering the stamp paper's denomination, date of
  purchase, or the registration/notarization stamp on a rental agreement to misrepresent its legal
  validity or backdate it.
- **Duplicate-listing fraud**: the same property photos and "ownership" documents reused across
  multiple unrelated listings by different "landlords" — a strong fraud signal that requires
  cross-listing comparison, which is outside what a single-document analysis (DocsGuard's current
  scope) can detect; flagged here as a known limitation, not a capability.
- **Fabricated tenant-side documents**: on the other side of the same transaction, fake
  employment/salary proof submitted by a prospective tenant to a landlord or broker (same pattern
  as §4).

### Detectable signals
**Visual**
- Stamp-paper watermark/security-thread pattern inconsistent with genuine judicial/non-judicial
  stamp paper (visible under normal image inspection when resolution allows).
- Notary/registrar seal that is a flat digital paste rather than a physical stamp impression.
- Signature blocks with inconsistent ink/pressure characteristics across signatories on the same
  page (harder to assess reliably from a scan, so treated as a lower-confidence signal).

**Textual**
- Stamp-paper serial number format inconsistent with the issuing state's known stamp-paper
  numbering scheme.
- Property address format/pincode inconsistent with the stated city/state.

**Metadata**
- Standard PDF/image tampering signals.

**Cross-field / logical**
- Stamp-paper purchase date after the agreement's stated execution date (a stamp paper must be
  purchased before or on the date it's used — a purchase date *after* the agreement date is a
  hard logical contradiction, not a judgment call).
- Rent amount stated in the agreement inconsistent with a separately submitted rent receipt or
  bank transfer record.
- Property tax receipt or utility bill's named owner inconsistent with the agreement's named
  landlord.

### Maps to DocsGuard
`redFlags` (stamp/seal anomalies) · `consistencyChecks` (stamp-purchase-date-vs-execution-date —
a clean, high-confidence logical check; owner-name cross-match across submitted documents) ·
`externalChecksNeeded` (confirming actual property ownership requires the state's land-records
portal — DocsGuard does not query this; confirming stamp-paper authenticity requires the state
treasury's stamp-verification system, also not queried live). Duplicate-listing / reused-photo
detection is explicitly **not** implemented — listed in `docs/PRODUCT.md` roadmap as
"reverse-image search," not claimed as a current feature.

---

## 8. Real Indian cases and patterns (verified, with sources)

These are cited, not invented — each figure below is attributed to a specific reported source.
Use them to make the demo credible; do not extrapolate beyond what's cited.

### 6.1 — Vyapam scam (Madhya Pradesh), the MP-specific precedent for document/exam fraud
The Vyapam (Madhya Pradesh Professional Examination Board) scam, exposed in 2013, centered on
rigged entrance and recruitment exams from roughly 2007–2013, run by the MPPEB for medical-college
admissions and state government jobs (food inspectors, transport constables, police, school
teachers, forest guards, and more). The methods included proxy candidates sitting exams for real
applicants, leaked question papers, bribed evaluators, and **fabricated educational certificates
and medical reports submitted alongside exam results**. About 1,800 accused were apprehended, with
the SIT still searching for roughly 800 more as of a March 2015 Supreme Court update. Prosecutions
proceeded under IPC cheating (§420), forgery (§467–468), and using forged documents as genuine
(§471). As recently as December 2025, a CBI court in Indore sentenced 10 people to five years'
rigorous imprisonment in a Vyapam-linked Patwari (revenue official) recruitment-exam fraud case —
this scam's legal fallout is still working through the courts more than a decade later. This is
the direct local precedent for why MP's own certificate/marksheet ecosystem is a credible hero use
case for DocsGuard. *Sources: [iPleaders overview](https://blog.ipleaders.in/all-you-need-to-know-about-the-vyapam-scam/), [India TV — Indore CBI court sentencing, Dec 2025](https://www.indiatvnews.com/madhya-pradesh/vyapam-scam-indore-cbi-court-sentences-10-people-to-five-years-of-rigorous-imprisonment-2025-12-16-1022018), [The420.in — sentencing detail](https://the420.in/vyapam-scam-cbi-court-patwari-exam-fraud-10-convicts-sentenced/).*

### 6.2 — Fake GST invoices / Input Tax Credit (ITC) fraud
This is India's largest-scale, best-documented paper-fraud pattern and squarely matches DocsGuard's
"commercial invoices" scope (§5 above). Per DGGI's own enforcement data: **₹36,374 crore in fake
ITC detected in FY2024–25** alone (a 51% year-on-year increase), with 182 arrests and over 15,000
fake/dummy entities identified; **cumulative fake ITC detected 2020–2025 exceeds ₹1.14 lakh
crore**. Individual busts reported in the same period include a ₹1,500 crore Ahmedabad ITC scam
(December 2025), a ₹645 crore Delhi racket built on 229 dummy GST-registered firms, and a ₹140
crore Thane/Palghar ITC claim traced to ₹760 crore in fake invoices (October 2024). The documented
modus operandi is directly relevant to DocsGuard's design: fraudsters **misuse real people's
Aadhaar, PAN, and KYC documents**, obtained for payment, to register the dummy firms that then
issue the fraudulent invoices — i.e. the identity-document layer (§3) and the invoice layer (§5)
are the same fraud, feeding each other. *Sources: [Deccan Herald — FY24 ITC detection stats](https://www.deccanherald.com/business/fake-itc-claims-detection-by-central-gst-officers-up-51-at-rs-36374-crore-in-fy24-3126661), [DeshGujarat — ₹1,500 crore Ahmedabad case, Dec 2025](https://deshgujarat.com/2025/12/23/dggi-busts-alleged-%E2%82%B91500-crore-gst-input-tax-credit-scam-in-ahmedabad/), [Tribune India — ₹645 crore Delhi racket](https://www.tribuneindia.com/news/business/delhi-rs-645-crore-fake-input-tax-credit-racket-busted-key-operator-arrested), [News on Air — ₹140 crore Thane/Palghar case](https://www.newsonair.gov.in/cgst-mumbai-busts-%e2%82%b9140-crore-fake-input-tax-credit-rackets-in-thane-and-palghar).*

### 6.3 — Scholarship fraud built on fake caste/income documentation
The Himachal Pradesh scholarship scam is the most-cited large-scale example: a CBI case
(registered 2019) against private educational institutions for fraudulent SC/ST/OBC scholarship
claims **totaling roughly ₹181 crore between 2013–2017**, within a broader scheme estimated around
₹250 crore, where more than 2,38,089 eligible ST/SC students were reportedly deprived of funds
while ~₹226 crore was disbursed through fake admissions — one institution alone was found to have
listed 800–1,000 students who did not exist on the ground, drawing ₹20–25 crore on that fake
list. Separately, an internal Ministry of Minority Affairs enquiry found irregularities across 830
institutions amounting to **over ₹144 crore over five years** in the minority-scholarship scheme.
More recently, Tripura issued show-cause notices to 34 ST students for submitting false income
certificates to obtain post-matric scholarships (against a legitimate 2023–24 disbursal of ₹68.13
crore to 34,436 students in the same state scheme) — a useful reminder that fraud and legitimate
high-volume disbursement coexist in the same program, which is exactly why per-application
screening (DocsGuard's pitch) matters more than blanket suspicion. *Sources: [Tribune India — Himachal ED asset attachment](https://www.tribuneindia.com/news/himachal/himachal-scholarship-scam-ed-attaches-assets-worth-rs-4-42-crore-of-kc-educational-and-social-welfare-society-382709), [Deccan Herald — Himachal CBI chargesheet](https://www.deccanherald.com/amp/story/india%2Fhimachal-pradesh%2Fhimachal-multi-crore-scholarship-scam-cbi-files-charge-sheet-against-20-institutes-105-persons-2957644), [Deccan Herald — Minority Ministry scholarship scam](https://www.deccanherald.com/amp/story/india%2Fprobe-reveals-major-scam-in-minority-ministrys-scholarship-program-2654064), [Careers360 — Tripura fake-document notices](https://news.careers360.com/tripura-government-issues-show-cause-notices-34-st-students-who-submitted-fake-documents-get-post-matric-scholarship/amp).*

### 6.4 — EWS / income-certificate fraud at the individual-applicant level
Beyond large institutional scams, EWS quota fraud shows up routinely at the individual level: a
Haryana private school under the state's Rule 134-A (≤₹2 lakh/year family income threshold for the
EWS admission quota) detected and booked seven parents under IPC §420 (cheating), §181 (false
statement on oath), and §200 (using a false declaration as true) for submitting false income
certificates to secure admission. A separate, still-developing case as of late December 2025
involves formal government inquiry into whether a serving IAS officer's 2021 Civil Services
appointment rested on a valid EWS/income certificate — illustrating that this fraud type reaches
the most senior recruitment processes in the country, not just school admissions. Commentary
around these cases (December 2025 reporting) notes the enabling mechanism directly: unauthorised
agents and cyber cafés routinely "arrange" caste/income/EWS certificates for a fee without the
applicant necessarily even knowing whether the resulting document will hold up to scrutiny — the
certificate-of-convenience pattern described in §1 above. *Sources: [Tribune India — Haryana EWS false-certificate case](https://www.tribuneindia.com/news/archive/haryana/ews-quota-seven-booked-for-giving-false-income-papers-593847), [LawChakra — IAS Ravi Sihag EWS-certificate probe](https://lawchakra.in/other-courts/ias-upsc-ews-certificate-fraud-ravi-sihag/).*

### 6.5 — Fake bank guarantee fraud in government tenders (Madhya Pradesh-linked)
CBI arrested two people, including a serving Punjab National Bank official, in a **₹183 crore fake
bank-guarantee scam** connected to a Madhya Pradesh Jal Nigam Ltd (MPJNL) irrigation tender:
fraudulently confirmed bank guarantees — reportedly using emails sent from a domain impersonating
PNB — misled MPJNL into awarding **₹974 crore worth of contracts** to a private contractor in
2023. This is a directly-on-point precedent for DocsGuard's tender-document use case (§6 above) and
for MP specifically. *Source: [Angel One — CBI ₹183 crore fake BG arrests](https://www.angelone.in/news/market-updates/fake-bank-guarantee-scam-cbi-arrests-2-in-183-crore-fraud-case).*

### 6.6 — Fake bank guarantees in other high-value tender/energy contexts
The same spoofed-bank-domain pattern recurs outside MP: Mumbai's Economic Offences Wing registered
four FIRs over forged Performance Bank Guarantees submitted under Maharashtra's solar-agriculture
scheme (MSKVY 2.0) to secure power-purchase agreements with MSEDCL, with fraud exceeding ₹122.85
crore and investigators alleging fake email domains mimicking real banks were used to "confirm"
the bogus guarantees. In an earlier, larger case tied to Reliance Power, a forged bank guarantee
(reported around ₹68.2 crore / $2 billion case context) used a spoofed domain resembling State Bank
of India's own web address to fake confirmation to India's Solar Energy Corporation. Separately, an
APEDA sugar-export case involved a Mumbai exporter booked for allegedly submitting a forged ₹6.43
crore bank guarantee. The consistent thread across all of these: the fraud succeeds specifically
when the verifying party confirms the BG through contact details *supplied by the document itself*
rather than the bank's independently-obtained official channel — precisely the limitation DocsGuard
calls out in §6's `externalChecksNeeded` guidance above. *Sources: [Free Press Journal — MSKVY 2.0 solar BG fraud](https://www.freepressjournal.in/mumbai/mumbai-news-four-fir-registered-in-fake-bank-guarantee-scam-under-mukhyamantri-saur-krushi-vahini-yojana-20-fraud-worth-over-12285-cr-detected), [Free Press Journal — APEDA ₹6.43 crore case](https://www.freepressjournal.in/mumbai/ghatkopar-exporter-booked-for-allegedly-submitting-fake-rs-643-crore-bank-guarantee), [Gulf News — Reliance Power-linked $2bn case](https://gulfnews.com/business/markets/anil-ambani-loan-fraud-case-india-probe-agency-makes-first-arrest-in-2bn-scam-1.500220661).*

---

## What this catalog implies for the demo

1. **Lead with the arithmetic/logical checks, not the visual ones.** Line-items-sum-to-total,
   running-balance reconciliation, subject-marks-sum-to-aggregate, and stamp-purchase-date-before-
   execution-date are the checks DocsGuard can assert with near-certainty and zero external
   dependency — they are also exactly the class of check a busy clerk has no time to do by hand.
   These make the best live-demo "gotcha" because judges can verify the math themselves in
   seconds.
2. **The `externalChecksNeeded` list is not a weakness to hide — it's the credibility feature.**
   Every real case above (bank-guarantee fraud especially) succeeded because a human verifier
   trusted a self-reported contact channel instead of an independent one. DocsGuard explicitly
   telling the reviewer "go verify this at the source, here's exactly what to check and where" is
   more honest and more useful than a tool that silently pretends to have already done it.
3. **Identity-document fraud (Aadhaar/PAN/GST) and invoice/ITC fraud are the same underlying
   crime wave** (§6.2) — a network buys real people's KYC documents to stand up fake firms that
   then issue fake invoices. DocsGuard's per-document, cross-field reasoning is one layer of defense
   against this; it is not a substitute for the KYC-document verification APIs (UIDAI, GSTN) that
   would close the loop, and the docs should keep saying so.
