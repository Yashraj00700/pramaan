import type { AnalysisReport } from "../types";

/**
 * demoReport.ts
 * -------------
 * Two fully-populated, FICTIONAL AnalysisReport fixtures used to demo Pramaan
 * without a live ANTHROPIC_API_KEY. Both describe the same fictional document
 * pair already shipped in /samples (see scripts/make-samples.mjs):
 *
 *   - Genuine:   samples/genuine-income-certificate.jpg
 *   - Tampered:  samples/tampered-income-certificate.jpg
 *
 * The underlying "document" is an Income Certificate purportedly issued by
 * the (entirely fictional) "Office of the Sub-Divisional Magistrate, Navapur
 * District, Government of Madhyadesh" to a fictional applicant, Ravi Kumar
 * Tirpude. No real government body, seal, or person is referenced anywhere.
 *
 * Every field here is invented narrative content for demo purposes — it is
 * NOT the output of a live model call.
 */

const GENUINE_SERIAL = "MD/NVP/IC/2025/048213";
const TAMPERED_SERIAL = "MD/NVP/IC/2025/048219";
const ISSUER = "Office of the Sub-Divisional Magistrate, Navapur District, Government of Madhyadesh";
const APPLICANT = "Ravi Kumar Tirpude";

// ---------------------------------------------------------------------------
// GENUINE
// ---------------------------------------------------------------------------

const genuine: AnalysisReport = {
  documentType: "Income Certificate (State Welfare Scheme Eligibility)",
  verdict: "AUTHENTIC",
  riskScore: 6,
  confidence: 93,
  summary:
    "This income certificate is internally consistent end to end: the printed income figure agrees with its own spelled-out words, the certificate serial passes its issuing office's check-digit format, and Error-Level Analysis shows flat, uniform compression across the whole page with no localized hotspot anywhere. No paste, re-typing, or re-save signature was found on any field. Recommended: approve, subject only to the standard routine registry confirmation applied to every certificate of this type.",

  redFlags: [
    {
      severity: "Low",
      title: "No signed QR/barcode on this certificate template",
      detail:
        "This certificate format does not carry a QR or barcode payload, so a tamper check cannot lean on a cryptographic payload cross-check the way some newer e-certificates allow. This is a template characteristic, not a defect in this specific document, and is fully corroborated here by the ELA, checksum, and cross-field consistency checks, all of which pass independently.",
      evidence: "Image forensics scan: no QR/barcode payload detected anywhere on the page.",
    },
  ],

  consistencyChecks: [
    {
      check: "Numeral vs. spelled-out income",
      status: "PASS",
      detail: "Printed figure 'Rs. 2,45,000/-' matches the spelled-out line '(Rupees Two Lakh Forty-Five Thousand Only)' directly beneath it.",
    },
    {
      check: "Certificate serial check-digit",
      status: "PASS",
      detail: "Recomputing the Navapur SDM office's trailing check digit over sequence 048213 yields 3, matching the printed serial exactly.",
    },
    {
      check: "Declared income vs. linked bank statement",
      status: "PASS",
      detail: "Applicant's bank statement filed with the same application shows a March 2025 closing balance of Rs. 2,58,900 — plausible and consistent with a Rs. 2,45,000 declared annual household income.",
    },
    {
      check: "Issue date vs. assessment period vs. validity window",
      status: "PASS",
      detail: "14 March 2025 issue date falls within the stated FY 2024-25 assessment period; the one-year validity window (through 13 March 2026) is internally consistent.",
    },
    {
      check: "Applicant identity across fields",
      status: "PASS",
      detail: "Applicant name, father's name, village, tehsil and district are stated consistently in the certificate body and match the attached application form.",
    },
    {
      check: "Seal, signature and signatory title placement",
      status: "PASS",
      detail: "Seal, signature and the printed signatory block (name, designation, jurisdiction) sit in the expected position and are mutually consistent with each other.",
    },
  ],

  extractedFields: [
    { label: "Document Type", value: "Income Certificate" },
    { label: "Certificate No.", value: GENUINE_SERIAL },
    { label: "Date of Issue", value: "14 March 2025" },
    { label: "Applicant", value: APPLICANT },
    { label: "Father's Name", value: "Devidas Tirpude" },
    { label: "Address", value: "Village Kothari, Tehsil Navapur, District Navapur, Madhyadesh" },
    { label: "Assessment Period", value: "FY 2024-25" },
    { label: "Declared Annual Family Income (printed)", value: "Rs. 2,45,000/-" },
    { label: "Declared Annual Family Income (words)", value: "Rupees Two Lakh Forty-Five Thousand Only" },
    { label: "Issuing Authority", value: ISSUER },
    { label: "Signing Officer", value: "R. K. Deshmukh, Sub-Divisional Magistrate" },
    { label: "Linked Bank Statement — A/c ...2217 Closing Balance (Mar 2025)", value: "Rs. 2,58,900" },
    { label: "Validity", value: "One year from date of issue (through 13 March 2026)" },
  ],

  technicalSignals: [
    { label: "File", value: "genuine-income-certificate.jpg (image/jpeg), 1240×1754, 304.7 KB", concern: false },
    { label: "SHA-256 fingerprint", value: "7c2f0a9e6b4d1c8f3a5e9b0d2c7f4a1e6b8d3c0f9a2e5b7d1c4f8a0e3b6d9c2f", concern: false },
    { label: "Image software / editor fingerprint", value: "No EXIF editor-software tag present — consistent with a direct scan/export pipeline, not a screen-edited file.", concern: false },
    { label: "ELA tamper analysis", value: "Mean error 3.1, flat and uniform across the entire page — no localized hotspot detected anywhere.", concern: false },
    { label: "JPEG generation signature", value: "Single-pass JPEG, quality ≈92, 4:4:4 chroma subsampling — consistent with one clean scan/export generation.", concern: false },
    { label: "QR / barcode", value: "None present — expected for this certificate template.", concern: false },
  ],

  recommendedAction:
    "Approve. No tampering, arithmetic, or identity-validation anomaly was found on any field. Proceed with the standard live confirmation of the certificate number against the issuing office's register as routine due diligence — not because this analysis raised any doubt.",

  externalChecksNeeded: [
    "Confirm certificate MD/NVP/IC/2025/048213 against the Navapur SDM issuing register (routine, not risk-driven).",
    "Confirm R. K. Deshmukh's signing authority as SDM, Navapur District, for the stated issue date (routine).",
  ],

  visualMarkers: [],

  modules: [
    {
      id: "executive",
      title: "Executive Summary",
      status: "PASS",
      score: 95,
      narrative:
        "This is an Income Certificate purportedly issued to Ravi Kumar Tirpude by the Office of the Sub-Divisional Magistrate, Navapur District, certifying a household annual income of Rs. 2,45,000 for FY 2024-25. Every field that can be independently tested — the numeral-vs-words income figure, the certificate serial's check digit, the issue-date-to-validity window, and the applicant's own linked bank statement — is internally consistent with the others.\n\nThe forensic layer (Error-Level Analysis, JPEG generation history, EXIF/editor fingerprint) shows a single, uniform compression generation across the whole page with no localized anomaly. Typography, spacing and seal/signature placement match a normal single-pass document. Taken together, three independent evidence classes (arithmetic/content, identity validation, and pixel-level forensics) agree with no contradiction, which is what drives the low 6/100 risk score.",
      checks: [
        { category: "Overall determination", status: "PASS", detail: "No tampering indicator found across forensic, typographic, arithmetic, or identity-validation checks." },
        { category: "Evidence agreement", status: "PASS", detail: "All three independent evidence classes (pixel forensics, cross-field arithmetic, identity checksum) agree with each other." },
      ],
      findings: [
        "No localized ELA hotspot anywhere on the page.",
        "Certificate serial checksum passes.",
        "Declared income matches its own spelled-out words and the linked bank statement.",
      ],
    },
    {
      id: "forensics",
      title: "Document Forensics",
      status: "PASS",
      score: 96,
      narrative:
        "Error-Level Analysis of the full page returns a mean error of 3.1 with a flat spatial distribution — no region differs meaningfully from its neighbors, including around the income figure, the certificate serial, the seal, and the signature. This is the signature of a single JPEG encoding generation, not of a document assembled from multiple pasted-in edits at different quality levels.\n\nJPEG structure confirms this: the whole file is quality ≈92 with 4:4:4 chroma subsampling throughout, with no secondary, higher- or lower-quality generation detectable underneath any field. No EXIF editor-software tag (Photoshop, GIMP, Canva, etc.) is present; the absence of camera Make/Model data alongside the absence of an editor tag is exactly what a direct office scan-to-file or template-export pipeline produces, as opposed to a photographed or screen-edited copy.",
      checks: [
        { category: "Error-Level Analysis", status: "PASS", detail: "Mean error 3.1, uniform across the page — no localized hotspot." },
        { category: "JPEG generation history", status: "PASS", detail: "Single compression generation, quality ≈92, 4:4:4 chroma, consistent throughout." },
        { category: "EXIF / editing-tool fingerprint", status: "PASS", detail: "No editor-software tag present; consistent with an unedited scan/export." },
      ],
      findings: ["Flat ELA distribution with no localized anomaly.", "Single, consistent JPEG generation across the entire page."],
    },
    {
      id: "typography",
      title: "Typography & Layout",
      status: "PASS",
      score: 94,
      narrative:
        "Font family, weight and baseline are consistent across the entire document: the header and body copy sit on a uniform Georgia/Arial pairing throughout, the income figure uses the same bold weight and baseline as the surrounding certificate text, and the certificate serial is set in the same monospace weight end to end. No field shows the soft edge, anti-aliasing mismatch, or baseline drift that a pasted-in replacement typically leaves behind.\n\nLayout and spacing (margins, line heights, the boxed income field, the seal and signature placement) match a single coherent template render rather than a composite of separately generated pieces.",
      checks: [
        { category: "Font/weight consistency", status: "PASS", detail: "Income figure and certificate serial match the surrounding document's font, weight and baseline throughout." },
        { category: "Edge / anti-aliasing consistency", status: "PASS", detail: "No soft-edge or resolution mismatch detected around any field." },
      ],
      findings: ["No font, weight, or baseline mismatch detected on any field."],
    },
    {
      id: "content",
      title: "Content & Cross-Field Logic",
      status: "PASS",
      score: 97,
      narrative:
        "Every testable cross-field relationship on this document agrees. The printed numeral 'Rs. 2,45,000/-' matches its own spelled-out words line exactly. The assessment period (FY 2024-25) is consistent with the issue date (14 March 2025) and with the stated one-year validity window. The applicant's name, father's name, village, tehsil and district are stated identically in the certificate body and are not contradicted anywhere else on the page.\n\nCross-checked against the applicant's linked bank statement (closing balance Rs. 2,58,900 as of March 2025), the declared Rs. 2,45,000 annual income is plausible rather than contradicted — a household with that income profile carrying a comparable closing balance is unremarkable and requires no further explanation.",
      checks: [
        { category: "Numeral vs. words", status: "PASS", detail: "Rs. 2,45,000/- matches 'Rupees Two Lakh Forty-Five Thousand Only'." },
        { category: "Income vs. linked bank statement", status: "PASS", detail: "Rs. 2,58,900 closing balance is plausible against a Rs. 2,45,000 declared annual income." },
        { category: "Date sequencing", status: "PASS", detail: "Assessment period, issue date and validity window are mutually consistent." },
      ],
      findings: ["No arithmetic or logical contradiction found anywhere on the document."],
    },
    {
      id: "identity",
      title: "Identity & Number Validation",
      status: "PASS",
      score: 95,
      narrative:
        "The certificate serial MD/NVP/IC/2025/048213 follows the Navapur SDM office's known numbering convention: a district/office/document-type prefix, the issue year, and a six-digit sequence whose trailing digit is a check digit over the preceding five. Recomputing that check digit over 04821 yields 3, which matches the printed serial's final digit exactly — a clean pass on the one identity signal that is independently verifiable from the document alone.\n\nNo other identifier on the document (applicant name, address, bank account reference) shows an internal formatting inconsistency.",
      checks: [{ category: "Certificate serial checksum", status: "PASS", detail: "Computed check digit 3 matches the printed trailing digit for sequence 048213." }],
      findings: ["Certificate serial checksum passes."],
    },
    {
      id: "security",
      title: "Security Features",
      status: "PASS",
      score: 90,
      narrative:
        "The document carries a circular office seal and a handwritten-style signature in the expected bottom-right position, both showing normal, uniform error levels with no localized ELA anomaly — i.e., no indication either was pasted in separately from the rest of the page. The seal's engraved text (office name, 'Navapur * Madhyadesh') is legible and internally consistent with the printed signatory block below it.\n\nThe page also carries a repeating diagonal watermark and a printed footer identifying it as a specimen document generated for software demonstration purposes. This is an openly declared characteristic of the source material rather than a concealment attempt, and is not scored as a risk factor here. This certificate template carries no QR or barcode; its absence is a template characteristic, not a defect, and does not affect the verdict given that every other independently testable signal passes.",
      checks: [
        { category: "Seal/signature integrity", status: "PASS", detail: "No localized ELA anomaly around the seal or signature block." },
        { category: "QR/barcode presence", status: "WARN", detail: "None present — expected for this template, not itself a risk signal here given all other checks pass." },
      ],
      findings: ["Seal and signature show no evidence of separate compositing."],
    },
    {
      id: "issuer",
      title: "Issuer & Entity Intelligence",
      status: "INFO",
      score: 80,
      narrative:
        "The certificate names the Office of the Sub-Divisional Magistrate, Navapur District, Government of Madhyadesh as issuer, signed by R. K. Deshmukh in the capacity of Sub-Divisional Magistrate. The office name, seal format and signatory title follow a plausible pattern for a sub-divisional revenue-certificate authority; nothing in the format itself is anomalous or internally contradictory.\n\nWhat cannot be confirmed from the document alone is whether R. K. Deshmukh in fact held the SDM post on the stated issue date, or whether this exact serial appears in the office's register — both require a live registry check and are listed under externalChecksNeeded rather than assumed.",
      checks: [{ category: "Issuer plausibility", status: "PASS", detail: "Office name, seal and signatory title format are internally consistent with a sub-divisional issuing authority." }],
      findings: ["Issuer identity is plausible on document evidence alone; live confirmation is a routine follow-up, not a risk driver."],
    },
    {
      id: "financial",
      title: "Financial Integrity",
      status: "PASS",
      score: 93,
      narrative:
        "The declared amount (Rs. 2,45,000/-) is not a suspiciously round number, agrees with its own spelled-out words, and is plausible against the applicant's linked bank statement closing balance (Rs. 2,58,900). There is no digit-pattern anomaly, no truncation, and no mismatch between the boxed figure and the surrounding certificate text.",
      checks: [{ category: "Income plausibility & round-number check", status: "PASS", detail: "Rs. 2,45,000/- is a plausible, non-round figure consistent with the linked bank statement." }],
      findings: ["No financial anomaly detected."],
    },
    {
      id: "compliance",
      title: "Compliance & Legal",
      status: "PASS",
      score: 91,
      narrative:
        "All fields expected on a certificate of this type and jurisdiction are present: applicant identity and address, assessment period, declared income (numeral and words), issue date, signing officer and designation, office seal, and a stated validity period. Nothing required for this document class is missing.",
      checks: [{ category: "Mandatory field completeness", status: "PASS", detail: "All fields expected for this certificate type and jurisdiction are present." }],
      findings: ["No missing mandatory field."],
    },
    {
      id: "screening",
      title: "Screening & Reputation",
      status: "INFO",
      score: 100,
      narrative:
        "Named parties on this document (the applicant and the signing officer) were checked against the locally available reference list bundled with this demo pass; neither matched. A live sanctions/PEP/watchlist screen against an authoritative external source was not performed in this offline demonstration and should not be inferred from this pass.",
      checks: [{ category: "Named-party watchlist screening", status: "PASS", detail: "No match against the local reference list; a live external screen was not performed." }],
      findings: ["No local watchlist match; live screening remains an external check."],
    },
    {
      id: "predictive",
      title: "Fraud Typology & Prediction",
      status: "PASS",
      score: 97,
      narrative:
        "No fraud typology is indicated by any signal on this document. The residual, near-zero probability reflects that no single verification method is absolute proof of authenticity, not any specific suspicion raised by this analysis — every test that could be run (arithmetic, typographic, forensic, identity-validation) returned a clean result.",
      checks: [{ category: "Typology match", status: "PASS", detail: "No known forgery pattern (paste-edit, checksum mismatch, income manipulation) matched." }],
      findings: ["No fraud typology indicated."],
    },
    {
      id: "verdict",
      title: "Verdict & Actions",
      status: "PASS",
      score: 94,
      narrative:
        "AUTHENTIC, risk 6/100, confidence 93%. Three independent evidence classes — pixel-level forensics (flat ELA, single JPEG generation), cross-field arithmetic (numeral vs. words, income vs. bank statement), and identity validation (serial checksum) — all agree with no contradiction anywhere on the page. Recommended action: approve, subject to the standard routine registry confirmation applied to every certificate of this type — not because this analysis raised any doubt, but as ordinary due diligence.",
      checks: [{ category: "Final verdict", status: "PASS", detail: "AUTHENTIC — risk 6/100, confidence 93%." }],
      findings: ["Approve subject to routine registry confirmation."],
    },
  ],

  riskBreakdown: [
    { label: "Document Forensics", score: 4 },
    { label: "Typography & Layout", score: 5 },
    { label: "Content & Cross-Field Logic", score: 3 },
    { label: "Identity & Number Validation", score: 4 },
    { label: "Security Features", score: 8 },
    { label: "Issuer Intelligence", score: 15 },
    { label: "Financial Integrity", score: 5 },
    { label: "Compliance & Legal", score: 6 },
    { label: "Screening & Reputation", score: 2 },
  ],

  timeline: [
    { date: "2024-04-01", event: "FY 2024-25 income-assessment period begins", entity: "Ravi Kumar Tirpude household", consistency: "Consistent" },
    { date: "2025-03-14", event: "Certificate issued", entity: "Office of the SDM, Navapur District", consistency: "Consistent" },
    { date: "2025-03-14", event: "Linked bank statement closing balance recorded: Rs. 2,58,900", entity: "Applicant bank account ...2217", consistency: "Consistent" },
    { date: "2026-03-13", event: "Certificate validity expires (12 months from issue)", entity: "Office of the SDM, Navapur District", consistency: "Consistent" },
  ],

  fraudTypology: {
    name: "No fraud typology indicated",
    probability: 3,
    rationale:
      "No forensic, typographic, arithmetic, or identity-validation anomaly was found anywhere on the document. The small residual probability reflects the general limits of document-image analysis, not any specific indicator found here.",
    nextSteps: ["None required beyond the standard routine registry confirmation."],
  },

  issuerIntel:
    "Office of the Sub-Divisional Magistrate, Navapur District, Government of Madhyadesh — a small-district revenue authority. The office name, seal format and signatory title follow a plausible pattern for a sub-divisional certificate-issuing authority; nothing in the format itself is anomalous. Confirming that R. K. Deshmukh held the SDM post on the stated issue date, and that this exact serial exists in the office's register, requires a live registry check (listed under externalChecksNeeded) and is routine, not risk-driven.",

  missingDocuments: ["None required for this determination — registry confirmation remains routine, not risk-driven."],

  court: {
    prosecution: {
      position: "PROSECUTION",
      headline: "The page shows uniform JPEG recompression and an unconfirmed serial format, which together warrant a closer look before approval.",
      points: [
        {
          claim: "The entire page shows JPEG compression artifacts",
          evidence: "Global 4:4:4 chroma JPEG at quality ≈92 shows visible 8×8 DCT blocking under magnification, most noticeable around the fine seal linework.",
          weight: "Weak",
        },
        {
          claim: "Certificate serial format cannot be independently confirmed from the document alone",
          evidence: "MD/NVP/IC/2025/048213 follows a plausible pattern, but no live registry lookup was performed in this pass.",
          weight: "Weak",
        },
        {
          claim: "No signed QR/barcode is present to cryptographically bind the printed fields",
          evidence: "Image forensics scan found no QR/barcode payload anywhere on this certificate.",
          weight: "Moderate",
        },
      ],
    },
    defense: {
      position: "DEFENSE",
      headline: "Every independently testable signal — ELA uniformity, the checksum, and the numeral-vs-words cross-check — passes, and the compression argument misreads a normal single-save artifact as evidence of editing.",
      points: [
        {
          claim: "Uniform, page-wide JPEG compression is the expected signature of a single scan/export, not of editing",
          evidence: "ELA mean error is 3.1 and flat across the entire page — no region differs from its neighbors, which is exactly what one clean encoding generation produces.",
          weight: "Strong",
        },
        {
          claim: "The certificate serial checksum passes",
          evidence: "Computed check digit 3 matches the printed digit for sequence 048213.",
          weight: "Strong",
        },
        {
          claim: "Numeral and spelled-out income agree",
          evidence: "Rs. 2,45,000/- matches 'Rupees Two Lakh Forty-Five Thousand Only'.",
          weight: "Strong",
        },
        {
          claim: "Absence of a QR code is a template characteristic, not a defect",
          evidence: "This certificate format has no QR field to begin with; its absence is expected and not itself an anomaly given every other check passes.",
          weight: "Moderate",
        },
      ],
    },
    ruling: {
      verdict: "AUTHENTIC",
      riskScore: 6,
      confidence: 93,
      reasoning:
        "The defense's case rests on signals that are independently verifiable and all point the same direction: a flat, uniform ELA distribution across the whole page, a passing identity checksum, and an internally consistent numeral-vs-words income figure corroborated by the applicant's own bank statement. None of these can be produced by coincidence on a document that had actually been edited — a genuine paste-edit leaves a localized ELA hotspot and a font/baseline mismatch, neither of which is present anywhere on this page.\n\nProsecution's strongest point — the absence of a QR/barcode — is a real observation but is explained entirely by the template: this certificate type has no QR field, so its absence carries no independent weight once every other testable signal (checksum, arithmetic, forensics) has already passed. The remaining two prosecution points are weak on their own terms and are addressed below.",
      decisive: [
        "ELA shows flat, uniform error across the entire page with no localized hotspot — the single most reliable signal against paste-based editing.",
        "The certificate serial's check digit computes correctly against the printed value.",
        "The printed income figure agrees with its own spelled-out words and with the applicant's linked bank statement.",
      ],
      dismissed: [
        "Prosecution's argument that uniform, page-wide JPEG recompression is itself suspicious was dismissed: that pattern is fully explained by the normal single-pass scanning/export workflow and is indistinguishable from any unedited document processed the same way. Treating ordinary compression as guilt would produce false positives on nearly every genuine scanned certificate.",
        "Prosecution's point about the unconfirmed serial format was accepted as a valid routine follow-up but not treated as a risk signal — the checksum already validates the printed digits; a live registry call is standard due diligence, not evidence of doubt.",
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// TAMPERED
// ---------------------------------------------------------------------------

const tampered: AnalysisReport = {
  documentType: "Income Certificate (State Welfare Scheme Eligibility)",
  verdict: "LIKELY_FAKE",
  riskScore: 91,
  confidence: 96,
  summary:
    "This income certificate has two digitally edited fields — the declared annual income and the certificate serial number — both pasted in and re-saved after the base page had already been through one generation of JPEG compression. The printed income contradicts its own spelled-out words and the applicant's linked bank statement, and the certificate serial fails the issuing office's check-digit format. Do not approve or act on this document; treat it as fabricated pending manual verification with the issuing office.",

  redFlags: [
    {
      severity: "Critical",
      title: "Declared income field digitally replaced",
      detail:
        "The 'ANNUAL FAMILY INCOME' field reads Rs. 96,500/- set in a different font family and weight (Trebuchet MS/Verdana, regular) than the surrounding Arial-Bold document typography, with a visible baseline offset. Error-Level Analysis shows a sharp, rectangular bright hotspot exactly bounding this field against an otherwise low, uniform error level for the rest of the page — direct evidence the region was pasted in and the page re-saved.",
      evidence: "ANNUAL FAMILY INCOME: Rs. 96,500/- — font/baseline mismatch, ELA hotspot precisely bounding the field box.",
    },
    {
      severity: "Critical",
      title: "Printed numeral contradicts the spelled-out amount on the same document",
      detail:
        "Directly beneath the edited income figure, the untouched words line still reads '(Rupees Two Lakh Forty-Five Thousand Only)' — the amount from before the edit. The fraudster changed the numeral but did not update (or could not update) the spelled-out line, leaving a direct, unmissable arithmetic contradiction on the same page.",
      evidence: "Numeral 'Rs. 96,500/-' printed directly above the words '(Rupees Two Lakh Forty-Five Thousand Only)'.",
    },
    {
      severity: "High",
      title: "Certificate serial fails issuer check-digit",
      detail:
        "Recomputing the Navapur SDM office's trailing check digit over the printed sequence yields 3; the certificate actually reads 048219 — check digit 9. This is a hard validation failure, not a matter of interpretation, and coincides with a second, separate ELA hotspot over the serial field.",
      evidence: "Printed serial MD/NVP/IC/2025/048219 — expected trailing check digit 3, found 9.",
    },
    {
      severity: "High",
      title: "Declared income implausible against the applicant's own linked bank statement",
      detail:
        "The same application bundle includes a bank statement for the applicant showing a March 2025 closing balance of Rs. 9,84,600 — an order of magnitude above what is plausible for a household reporting Rs. 96,500 in total annual income. This is exactly the pattern expected when a fraudster lowers the income figure to qualify for a scheme threshold without correspondingly altering the supporting financial paperwork.",
      evidence: "Linked bank statement, A/c ...2217, closing balance Rs. 9,84,600 vs. declared annual income Rs. 96,500.",
    },
    {
      severity: "Medium",
      title: "Distinct re-save / quantization history versus the rest of the page",
      detail:
        "The full page carries a JPEG quality of ≈68 with 4:2:0 chroma subsampling, while the two edited regions show a second, higher-quality compression generation underneath the visible layer — the signature of a base document decoded, edited, and re-encoded as a whole, rather than a single untouched scan.",
      evidence: "Page-wide JPEG: quality ≈68, 4:2:0 chroma; edited-region substructure shows an earlier, higher-quality generation beneath it.",
    },
  ],

  consistencyChecks: [
    {
      check: "Numeral vs. spelled-out income",
      status: "FAIL",
      detail: "'Rs. 96,500/-' contradicts '(Rupees Two Lakh Forty-Five Thousand Only)' printed directly beneath it.",
    },
    {
      check: "Certificate serial check-digit",
      status: "FAIL",
      detail: "Computed check digit 3 for sequence 048219's preceding digits does not match the printed trailing digit 9.",
    },
    {
      check: "Declared income vs. linked bank statement",
      status: "FAIL",
      detail: "Rs. 96,500/- declared annual household income is implausible against a Rs. 9,84,600 closing balance on the applicant's own bank statement filed with the same application.",
    },
    {
      check: "Issue date vs. validity window",
      status: "PASS",
      detail: "14 March 2025 issue date is within the stated FY 2024-25 assessment period; the one-year validity window is internally consistent — the forgery is confined to the two edited fields, not the dates.",
    },
    {
      check: "Applicant identity across fields",
      status: "PASS",
      detail: "Name, father's name and address are consistent between the certificate body and the rest of the application — these fields were not altered.",
    },
    {
      check: "Seal/signature block position",
      status: "WARN",
      detail: "Signature and seal sit in the expected position with no localized ELA anomaly of their own, but the office seal shows no separately verifiable registration index, so it cannot independently confirm the (already-failing) serial.",
    },
  ],

  extractedFields: [
    { label: "Document Type", value: "Income Certificate" },
    { label: "Certificate No. (as printed)", value: TAMPERED_SERIAL },
    { label: "Date of Issue", value: "14 March 2025" },
    { label: "Applicant", value: APPLICANT },
    { label: "Father's Name", value: "Devidas Tirpude" },
    { label: "Address", value: "Village Kothari, Tehsil Navapur, District Navapur, Madhyadesh" },
    { label: "Assessment Period", value: "FY 2024-25" },
    { label: "Declared Annual Family Income (printed)", value: "Rs. 96,500/-" },
    { label: "Declared Annual Family Income (words, unchanged)", value: "Rupees Two Lakh Forty-Five Thousand Only" },
    { label: "Issuing Authority", value: ISSUER },
    { label: "Signing Officer", value: "R. K. Deshmukh, Sub-Divisional Magistrate" },
    { label: "Linked Bank Statement — A/c ...2217 Closing Balance (Mar 2025)", value: "Rs. 9,84,600" },
  ],

  technicalSignals: [
    { label: "File", value: "tampered-income-certificate.jpg (image/jpeg), 1240×1754, 156.5 KB", concern: false },
    { label: "SHA-256 fingerprint", value: "e4a1f0c9b8d2637a4f9e0c1b2a3d4e5f6071829a3b4c5d6e7f8091a2b3c4d5e6", concern: false },
    { label: "EXIF / editor fingerprint", value: "Software tag present: 'Adobe Photoshop 25.x (Windows)'; no camera Make/Model data — consistent with a screen-edited file, not a camera or direct scan original.", concern: true },
    { label: "ELA tamper analysis", value: "Mean error 14.7 (page baseline ≈4.2) — two sharp, rectangular hotspots isolated over the income-figure box and the certificate-serial field.", concern: true },
    { label: "JPEG re-save signature", value: "Whole page quality ≈68, 4:2:0 chroma; the two edited regions show a second, distinct, higher-quality compression generation beneath the visible layer.", concern: true },
    { label: "QR / barcode", value: "None present — this certificate template carries no signed QR, so the edited fields cannot be caught by payload cross-check alone; ELA and checksum carry the finding here.", concern: true },
  ],

  recommendedAction:
    "Reject this certificate and do not approve the associated scheme application on the basis of it. Request the applicant resubmit an original certificate obtained directly from the Navapur SDM office, and refer the file for manual fraud review given the failed checksum, the numeral-vs-words contradiction, and the mismatch against the applicant's own linked bank statement.",

  externalChecksNeeded: [
    "Confirm with the Navapur SDM issuing register whether certificate MD/NVP/IC/2025/048213 (the checksum-valid form of this serial) exists and what income figure it actually states.",
    "Verify the applicant's bank statement closing balance directly with the issuing bank.",
    "Confirm R. K. Deshmukh's signing authority and tenure as SDM, Navapur District, for the stated issue date.",
  ],

  visualMarkers: [
    { label: "Income figure — ELA hotspot / re-saved region", severity: "Critical", box: [374, 89, 417, 911] },
    { label: "Certificate serial — edited digit", severity: "High", box: [252, 237, 267, 447] },
  ],

  modules: [
    {
      id: "executive",
      title: "Executive Summary",
      status: "FAIL",
      score: 8,
      narrative:
        "This purported Income Certificate for Ravi Kumar Tirpude, issued by the Office of the SDM, Navapur District, shows two digitally edited fields: the declared annual income (now reading Rs. 96,500/-) and the certificate serial (now reading ...048219). Both sit under sharply localized Error-Level Analysis hotspots against an otherwise uniform page, both show a font or weight mismatch against the surrounding document typography, and the serial fails its issuing office's check-digit format outright.\n\nThree independent evidence classes agree: pixel-level forensics (ELA + re-save signature), cross-field arithmetic (the edited numeral contradicts both the unedited words line and the applicant's own bank statement), and identity validation (the serial checksum). That level of agreement across unrelated evidence types is why this lands at 91/100 risk with 96% confidence rather than a borderline call.",
      checks: [
        { category: "Overall determination", status: "FAIL", detail: "Two independently edited fields plus a failed identity checksum place this document in the LIKELY_FAKE band (risk 91/100)." },
        { category: "Evidence agreement", status: "FAIL", detail: "Pixel forensics, cross-field arithmetic, and identity validation all independently agree the document was altered." },
      ],
      findings: [
        "Declared income field digitally replaced after the base page was already compressed once.",
        "Certificate serial fails its issuing-office check digit.",
        "Printed income contradicts both the spelled-out words line and the applicant's linked bank statement.",
      ],
    },
    {
      id: "forensics",
      title: "Document Forensics",
      status: "FAIL",
      score: 6,
      narrative:
        "Error-Level Analysis returns a page-wide mean error of 14.7 against a background level of ≈4.2 — already elevated — but the distribution is not uniform: two sharp, rectangular hotspots sit precisely over the income-figure box and the certificate-serial field, and nowhere else. That spatial precision, exactly bounding two editable fields and nothing else on the page, is inconsistent with a global artifact (like a low-quality scan) and consistent with local compositing.\n\nJPEG structure corroborates this: the visible page is quality ≈68 with 4:2:0 chroma subsampling, but the two hotspot regions carry a second, distinct compression generation underneath — evidence the base page was decoded from an earlier, higher-quality JPEG, edited, and the whole page re-encoded. An EXIF software tag identifying 'Adobe Photoshop 25.x (Windows)' is present with no accompanying camera Make/Model data, further consistent with a screen-edited file rather than a direct scan.",
      checks: [
        { category: "Error-Level Analysis", status: "FAIL", detail: "Mean error 14.7 with two sharp, spatially isolated hotspots over the income and serial fields." },
        { category: "JPEG generation history", status: "FAIL", detail: "Two distinct compression generations detected: page-wide quality ≈68, with a higher-quality generation beneath the two hotspot regions." },
        { category: "EXIF / editing-tool fingerprint", status: "WARN", detail: "Photoshop software tag present with no camera data — consistent with screen editing." },
      ],
      findings: ["Two spatially isolated ELA hotspots, precisely bounding two editable fields.", "Two distinct JPEG compression generations detected on the same page."],
    },
    {
      id: "typography",
      title: "Typography & Layout",
      status: "FAIL",
      score: 10,
      narrative:
        "The income figure is set in a different font family and weight than the rest of the document — a regular-weight Trebuchet MS/Verdana rather than the bold Arial used everywhere else on the page — with a visible vertical baseline offset of roughly three to four pixels relative to where the surrounding text sits. The edges of the pasted text are also softer than the crisp anti-aliasing on the rest of the page, consistent with a lower-generation re-render being composited on top.\n\nThe certificate serial shows the same pattern at smaller scale: a slightly heavier monospace weight than the rest of the serial field, isolated to exactly the edited digits.",
      checks: [
        { category: "Font/weight consistency", status: "FAIL", detail: "Income figure uses a different font family and weight than the surrounding Arial-Bold document; certificate serial shows a localized weight mismatch." },
        { category: "Baseline alignment", status: "FAIL", detail: "Income figure sits on a baseline offset by roughly 3-4px from the surrounding text." },
        { category: "Edge/anti-aliasing consistency", status: "WARN", detail: "Softer edges on the pasted income text versus the crisp rendering elsewhere on the page." },
      ],
      findings: ["Font, weight and baseline mismatch on the income figure.", "Localized weight mismatch on the certificate serial digits."],
    },
    {
      id: "content",
      title: "Content & Cross-Field Logic",
      status: "FAIL",
      score: 5,
      narrative:
        "The single clearest content-level finding: the printed numeral 'Rs. 96,500/-' directly contradicts its own spelled-out words line, which still reads '(Rupees Two Lakh Forty-Five Thousand Only)' — a mismatch of nearly 2.5x that could not survive even a cursory manual review, let alone forensic analysis. This is the classic signature of a numeral-only edit that left the harder-to-alter spelled-out line untouched.\n\nCross-checked against the applicant's own linked bank statement (closing balance Rs. 9,84,600 as of March 2025), the edited Rs. 96,500 income figure is also financially implausible on its own terms — a household with that bank balance reporting annual income an order of magnitude lower than the balance itself is exactly the pattern expected when income is lowered specifically to qualify for a scheme's income ceiling.",
      checks: [
        { category: "Numeral vs. words", status: "FAIL", detail: "Rs. 96,500/- contradicts 'Rupees Two Lakh Forty-Five Thousand Only'." },
        { category: "Income vs. linked bank statement", status: "FAIL", detail: "Rs. 9,84,600 closing balance is implausible against a Rs. 96,500 declared annual income." },
        { category: "Date sequencing", status: "PASS", detail: "Assessment period, issue date and validity window remain internally consistent — the forgery is confined to the income and serial fields." },
      ],
      findings: ["Numeral-vs-words contradiction on the declared income.", "Declared income is implausible against the applicant's own bank statement."],
    },
    {
      id: "identity",
      title: "Identity & Number Validation",
      status: "FAIL",
      score: 12,
      narrative:
        "The certificate serial as printed reads MD/NVP/IC/2025/048219. Recomputing the Navapur SDM office's trailing check digit over the preceding five digits of the sequence (04821) yields 3 — but the printed serial's final digit is 9. This is a hard, binary validation failure: either the check digit is correct or it is not, and here it is not.\n\nThis is also fully consistent with the ELA finding: the serial field sits under its own isolated compression hotspot, meaning the printed digit was very likely changed after the base document was generated, and whoever made the edit either did not know or did not apply the correct check-digit formula.",
      checks: [{ category: "Certificate serial checksum", status: "FAIL", detail: "Computed check digit 3 does not match the printed trailing digit 9 for sequence 048219." }],
      findings: ["Certificate serial fails its check-digit validation."],
    },
    {
      id: "security",
      title: "Security Features",
      status: "WARN",
      score: 42,
      narrative:
        "The office seal and signature block show no ELA anomaly of their own — both sit within the page's normal error-level range, suggesting they were not separately edited, only the income and serial fields were. This is worth stating plainly: an intact seal and signature do not clear the document, since the two fields that were altered are independently sufficient grounds for rejection.\n\nThe page also carries a repeating diagonal watermark and a printed footer identifying it as a specimen document generated for software testing purposes. This is an openly declared characteristic of the underlying test material, not a concealment attempt, and is not itself scored as a risk factor here — the risk comes entirely from the two edited fields and the failed checksum. This certificate template carries no QR or barcode, so tampering here could not have been caught by a payload cross-check and had to be surfaced by ELA and the checksum instead.",
      checks: [
        { category: "Seal/signature integrity", status: "PASS", detail: "No localized ELA anomaly around the seal or signature block." },
        { category: "QR/barcode presence", status: "WARN", detail: "None present on this template — tampering had to be caught by ELA and checksum instead of a payload cross-check." },
      ],
      findings: ["Seal and signature appear untouched; the forgery is confined to the two edited fields."],
    },
    {
      id: "issuer",
      title: "Issuer & Entity Intelligence",
      status: "WARN",
      score: 55,
      narrative:
        "The certificate names the Office of the Sub-Divisional Magistrate, Navapur District, Government of Madhyadesh as issuer, signed by R. K. Deshmukh. The office name, seal format and signatory title follow a plausible pattern for a sub-divisional revenue authority — nothing about the issuer's identity itself is anomalous. The problem is not who supposedly issued this document, but what was done to it after issuance (or fabrication).\n\nWhether the checksum-valid serial MD/NVP/IC/2025/048213 exists in the office's actual register, and what income figure it states there, cannot be confirmed from the document alone and requires a direct registry check.",
      checks: [{ category: "Issuer plausibility", status: "PASS", detail: "Office name, seal and signatory title format are internally consistent with a sub-divisional issuing authority." }],
      findings: ["Issuer identity itself is plausible; the forgery lies in the edited fields, not the named issuer."],
    },
    {
      id: "financial",
      title: "Financial Integrity",
      status: "FAIL",
      score: 9,
      narrative:
        "The declared income of Rs. 96,500/- is implausible on two independent grounds: it directly contradicts the unedited spelled-out words line on the same document, and it is an order of magnitude below the applicant's own linked bank statement closing balance of Rs. 9,84,600. Both point to the same underlying pattern — a genuine higher income was lowered specifically to bring the applicant under a scheme's income-eligibility ceiling.",
      checks: [{ category: "Income plausibility vs. linked financial record", status: "FAIL", detail: "Rs. 96,500/- declared income is implausible against a Rs. 9,84,600 bank statement closing balance for the same applicant." }],
      findings: ["Declared income is financially implausible against the applicant's own linked bank statement."],
    },
    {
      id: "compliance",
      title: "Compliance & Legal",
      status: "WARN",
      score: 48,
      narrative:
        "All fields structurally expected on a certificate of this type are present (applicant identity, assessment period, income figure and words, issue date, signing officer, seal, validity period), so the document is not deficient on a checklist basis. The compliance concern here is substantive, not structural: a document with a failed identity checksum and a direct arithmetic contradiction cannot be relied upon regardless of which boxes are filled in.",
      checks: [{ category: "Mandatory field completeness", status: "PASS", detail: "All fields expected for this certificate type are present." }],
      findings: ["Structurally complete, but substantively unreliable given the failed checksum and content contradictions."],
    },
    {
      id: "screening",
      title: "Screening & Reputation",
      status: "INFO",
      score: 70,
      narrative:
        "Named parties on this document (the applicant and the signing officer) were checked against the locally available reference list bundled with this demo pass; neither matched. A live sanctions/PEP/watchlist screen against an authoritative external source was not performed in this offline demonstration and should not be inferred from this pass — the verdict here rests entirely on the document-level forensic and arithmetic findings above, not on any screening result.",
      checks: [{ category: "Named-party watchlist screening", status: "PASS", detail: "No match against the local reference list; a live external screen was not performed." }],
      findings: ["No local watchlist match; live screening remains an external check and did not factor into the verdict."],
    },
    {
      id: "predictive",
      title: "Fraud Typology & Prediction",
      status: "FAIL",
      score: 10,
      narrative:
        "This matches a well-known scheme-eligibility fraud pattern: an applicant's genuine income certificate is edited to lower the declared figure below a welfare or scholarship scheme's income ceiling, while leaving supporting paperwork (in this case, the bank statement) unchanged because updating it convincingly is harder. The spelled-out words line was left untouched for the same reason — the fraudster prioritized the field a human reviewer is most likely to glance at (the boxed numeral) over the one they are least likely to read closely (the words line).\n\nIf this pattern goes undetected, the typical next step is submission to the scheme's approving authority, followed — if approved — by continued use of the same edited certificate as supporting proof for renewal cycles or related benefit applications.",
      checks: [{ category: "Typology match", status: "FAIL", detail: "Matches income-threshold manipulation for scheme-eligibility fraud." }],
      findings: ["Fraud typology: income-threshold manipulation for welfare-scheme eligibility, high probability."],
    },
    {
      id: "verdict",
      title: "Verdict & Actions",
      status: "FAIL",
      score: 8,
      narrative:
        "LIKELY_FAKE, risk 91/100, confidence 96%. Three independent evidence classes agree: pixel-level forensics (two isolated ELA hotspots plus a distinct re-save signature), cross-field arithmetic (numeral-vs-words contradiction, corroborated by the applicant's own bank statement), and identity validation (a failed serial checksum). No single one of these would need the others to justify rejection; together they leave no reasonable doubt. Recommended action: reject, do not approve the associated application, and refer for manual fraud review.",
      checks: [{ category: "Final verdict", status: "FAIL", detail: "LIKELY_FAKE — risk 91/100, confidence 96%." }],
      findings: ["Reject and refer for manual fraud review."],
    },
  ],

  riskBreakdown: [
    { label: "Document Forensics", score: 93 },
    { label: "Typography & Layout", score: 88 },
    { label: "Content & Cross-Field Logic", score: 95 },
    { label: "Identity & Number Validation", score: 90 },
    { label: "Security Features", score: 25 },
    { label: "Issuer Intelligence", score: 45 },
    { label: "Financial Integrity", score: 92 },
    { label: "Compliance & Legal", score: 50 },
    { label: "Screening & Reputation", score: 15 },
  ],

  timeline: [
    { date: "2024-04-01", event: "FY 2024-25 income-assessment period begins", entity: "Ravi Kumar Tirpude household", consistency: "Consistent" },
    { date: "2025-03-14", event: "Certificate issued (per printed date)", entity: "Office of the SDM, Navapur District", consistency: "Consistent" },
    { date: "2025-03-14", event: "Linked bank statement closing balance recorded: Rs. 9,84,600", entity: "Applicant bank account ...2217", consistency: "Inconsistent" },
    { date: "2026-03-13", event: "Certificate validity expires (12 months from issue)", entity: "Office of the SDM, Navapur District", consistency: "Consistent" },
  ],

  fraudTypology: {
    name: "Income-threshold manipulation for welfare-scheme eligibility",
    probability: 92,
    rationale:
      "A genuine-format certificate has had its declared income figure lowered — from a checksum-consistent original around Rs. 2,45,000 to Rs. 96,500 — almost certainly to qualify under a scheme's income ceiling, while the harder-to-alter spelled-out words line and the applicant's bank statement were left unchanged, producing two independent contradictions.",
    nextSteps: [
      "Reject the certificate and do not approve the linked application.",
      "Re-verify the certificate number directly with the issuing office.",
      "Escalate to the district vigilance or anti-fraud cell given the failed checksum.",
      "Cross-check any other documents submitted by the same applicant for the same edit signature (font/ELA fingerprint).",
    ],
  },

  issuerIntel:
    "Office of the Sub-Divisional Magistrate, Navapur District, Government of Madhyadesh — a small-district revenue authority. The office name, seal format and signatory title follow a plausible pattern for a sub-divisional certificate-issuing authority; nothing in the format itself is anomalous. What cannot be confirmed from the document alone is whether R. K. Deshmukh held the SDM post on the stated issue date, or whether certificate MD/NVP/IC/2025/048213 (the checksum-valid form of this serial) exists in the office's register — both require a live registry check.",

  missingDocuments: [
    "Original (unedited) income certificate obtained directly from the issuing office.",
    "Applicant's complete bank statement (all pages) to independently verify the closing balance.",
    "Government-issued photo ID matching the applicant name, for identity cross-verification.",
    "Prior year's income certificate, if any, to assess income-trend plausibility.",
  ],

  court: {
    prosecution: {
      position: "PROSECUTION",
      headline: "The income figure and certificate serial were both digitally edited after the document was already compressed once, and the serial fails its own check-digit format.",
      points: [
        {
          claim: "The income field was pasted in after the base document was compressed",
          evidence: "ELA hotspot precisely bounds the income box; font is Trebuchet MS/Verdana versus the document's Arial-Bold elsewhere, with a baseline offset of roughly 3-4px.",
          weight: "Strong",
        },
        {
          claim: "The certificate serial was separately edited",
          evidence: "A second, isolated ELA hotspot sits over the serial field; the recomputed check digit is 3, but the printed serial reads 9.",
          weight: "Strong",
        },
        {
          claim: "The printed numeral contradicts the spelled-out words on the same document",
          evidence: "'Rs. 96,500/-' sits directly above '(Rupees Two Lakh Forty-Five Thousand Only)', a nearly 2.5x discrepancy.",
          weight: "Strong",
        },
        {
          claim: "The declared income is implausible against the applicant's own linked bank statement",
          evidence: "The bank statement filed with the same application shows a Rs. 9,84,600 closing balance.",
          weight: "Moderate",
        },
        {
          claim: "The fact that the entire page was recompressed at a different quality, not just the two fields, suggests the whole file was regenerated by an editing tool rather than lightly touched up",
          evidence: "Page-wide JPEG quality ≈68 / 4:2:0 chroma, distinct from a typical single office scan/export.",
          weight: "Weak",
        },
      ],
    },
    defense: {
      position: "DEFENSE",
      headline: "The core forgery evidence (ELA plus checksum plus arithmetic contradiction) is not seriously contestable, but the page-wide-recompression argument on its own overreaches.",
      points: [
        {
          claim: "Page-wide recompression alone does not prove tampering",
          evidence: "A document that is re-scanned, re-exported, or re-saved once during handling legitimately changes its global JPEG parameters without any localized paste; only the two rectangular ELA hotspots that align with actual editable fields are meaningfully suspicious on their own.",
          weight: "Strong",
        },
        {
          claim: "The seal and signature are untouched",
          evidence: "No ELA anomaly was detected around the seal or signature block; both remain within the page's normal error-level range.",
          weight: "Moderate",
        },
        {
          claim: "The rest of the document's layout, fonts, and applicant details are internally consistent",
          evidence: "Name, father's name, address and dates match across the certificate body and the rest of the application bundle.",
          weight: "Moderate",
        },
      ],
    },
    ruling: {
      verdict: "LIKELY_FAKE",
      riskScore: 91,
      confidence: 96,
      reasoning:
        "Prosecution's three strongest points — the isolated ELA hotspots over the income and serial fields with an accompanying font/baseline mismatch, the failed serial checksum, and the numeral-vs-words contradiction — are independently verifiable and mutually reinforcing. No innocent single-save workflow produces two spatially isolated compression hotspots that happen to align exactly with an editable income figure and an editable serial number while leaving the rest of the page uniform; that spatial precision is the key fact that separates this case from ordinary re-scanning.\n\nThe defense is right that seal and signature integrity, and the page-wide recompression argument taken alone, do not individually prove forgery — and the ruling gives weight to that: it does not treat an intact seal as suspicious, and it does not lean on the page-wide compression argument as decisive evidence. But those concessions do not rescue the document, because the income and serial edits stand on their own forensic and arithmetic merits independent of the seal or the global compression question.",
      decisive: [
        "Two spatially isolated ELA hotspots precisely bounding the income figure and certificate serial, each with a corroborating font/baseline mismatch — not explainable by any single global re-save.",
        "Certificate serial check digit computes to 3; the printed serial reads 9 — a binary identity-validation failure.",
        "Printed income directly contradicts both the spelled-out words on the same document and the applicant's own linked bank statement.",
      ],
      dismissed: [
        "Prosecution's page-wide-recompression argument was dismissed as weak on its own: a single re-scan or re-save legitimately changes global JPEG quality and chroma subsampling without indicating paste-based tampering — this uniform-recompression pattern is explained by ordinary scanning/export workflow and only the two hotspots that align with actual editable fields carry real weight.",
        "Defense's point that the seal and signature are untouched was accepted as true but did not change the verdict — the two forged fields are independently sufficient grounds for rejection regardless of an intact seal.",
      ],
    },
  },
};

export const DEMO_REPORTS: { genuine: AnalysisReport; tampered: AnalysisReport } = {
  genuine,
  tampered,
};
