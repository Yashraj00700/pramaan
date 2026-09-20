# DocsGuard — Pitch Deck

**Upload any document. Know in seconds if it is real.**

12 slides for a 2-hour hackathon judging round. Each slide: title, punchy content, and a visual note for whoever builds the deck (Figma/Slides/Canva). Every stat below is sourced — see footnotes — so nothing here is invented.

---

## Slide 1 — Title

**DocsGuard**
*Upload any document. Know in seconds if it is real.*

- AI-powered document-authenticity and fraud detection, built for a 2-hour hackathon
- Hero use case: Madhya Pradesh government scheme documents
- Universal underneath: any document, any domain

**Visual:** Full-bleed dark slide, DocsGuard wordmark in Devanagari + Latin, one hero screenshot of the app's verdict card (AUTHENTIC/SUSPICIOUS/LIKELY_FAKE badge) bottom-right, subtle document-scan-line animation motif.

---

## Slide 2 — The Hook / Problem

**Every scheme application in MP is decided by a two-second glance at a document.**

- Ladli Behna Yojana, post-/pre-matric scholarships, PDS ration cards, and caste/income/domicile-linked job & tender reservations all gate eligibility on an **uploaded certificate**.
- A front-desk clerk or block officer has seconds per file — no time to check font kerning, stamp geometry, or whether the numbers even add up.
- Editing a scanned income figure, DOB, or caste category in a phone photo-editor takes under five minutes and zero skill.
- This is not hypothetical: fake-caste-certificate fraud has repeatedly surfaced in MP government hiring, with employees including teachers, doctors, and engineers found to have used fabricated SC certificates to secure posts.¹

**Visual:** Split screen — left: a stack of paper certificates and an overwhelmed clerk icon/silhouette with a clock; right: a single edited digit on a certificate circled in red, "5 min to fake it, 2 sec to approve it."

---

## Slide 3 — The Stakes (verified)

**This already happened at scale — more than once.**

- **Vyapam Scam (MP, 2009–2015):** rigged entrance exams and recruitment tests; over **2,000 people arrested by June 2015**, including a former state education minister and 250+ candidates who got in through fraudulent means.²
- **MP Scholarship Scam (2013):** tribal-welfare scholarship funds siphoned through fake/ghost institutes — one institute alone pocketed **₹1.5 crore** claiming ~180 fake student admissions.³
- **Tender & bank-guarantee fraud hits MP directly:** the Enforcement Directorate is pursuing a **₹202 crore fake bank-guarantee scam** where forged PNB/Bank of Baroda guarantees were submitted to **Madhya Pradesh Jal Nigam Maryadit** and Rajasthan Renewable Energy Corp to win public contracts.⁴
- A related **₹183 crore** fake-guarantee racket, run by a Kolkata syndicate, is suspected to have hit public contracts across multiple states.⁵

**Visual:** Three stat cards in a row — "2,000+ arrested (Vyapam)" / "₹1.5 Cr siphoned (MP scholarship scam)" / "₹202 Cr fake guarantees (MP Jal Nigam)" — each with its footnote number and source logo (Wikipedia / ED / news masthead) small underneath for credibility.

---

## Slide 4 — The Solution

**DocsGuard: one upload, a structured verdict, in seconds.**

- Drop a document (image or PDF) — no signup, no document-type picker, no setup.
- Get back: **AUTHENTIC / SUSPICIOUS / LIKELY_FAKE**, a 0–100 risk score, a plain-language summary, evidence-linked red flags, cross-field consistency checks, extracted fields, and — for images — bounding boxes drawn over the exact suspicious region.
- Built for the person with the least time and the least forensic training: a scheme desk clerk on a shared, low-spec device.

**Visual:** Product screenshot — the full verdict screen with the risk-score gauge, a red-flag card, and one bounding box overlaid on a sample certificate image.

---

## Slide 5 — Live Demo

**Watch it catch a real edit, live.**

- Upload a visibly tampered sample (e.g. an income certificate with an altered figure) → verdict, risk score, and a bounding box over the exact edited region appear in seconds.
- Upload a clean document next → fast AUTHENTIC verdict, no red flags — proving it isn't just flagging everything.
- Point at the consistency-checks table: a FAILED check where stated age doesn't reconcile with date of birth — logic a plain OCR/ELA tool cannot do because it doesn't know what an income certificate is *supposed* to say.

**Visual:** This is the "screen share" slide — minimal text, big empty canvas/browser-chrome placeholder where the live app will run. Include a QR code to the deployed Vercel URL as a fallback if the live connection drops.

---

## Slide 6 — The Honest Architecture (unique, defensible)

**Two layers, kept deliberately separate — nothing hidden in one opaque AI score.**

1. **Deterministic layer (code, not AI):** SHA-256 hash of the file; for PDFs, `pdf-lib` reads producer/creator software and creation-vs-modification timestamps — a >60-second gap between "created" and "modified" is flagged as a real, reproducible signal that the file was edited after the fact.
2. **Reasoning layer (Claude):** the document + those verified facts go to Claude, which does visual tampering analysis, OCR/field extraction, and **cross-field logic** — the actual specialty (does the DOB imply the stated age? does the income match the bank balance shown? do line items sum to the total?).
3. **The honesty rule:** Claude is explicitly forbidden from fabricating the result of any external lookup (DigiLocker, e-District, MCA, sanctions lists, WHOIS). Anything needing a live source is listed under `externalChecksNeeded` — never invented, never silently assumed.

**Visual:** A simple left-to-right pipeline diagram — `Upload → Deterministic Extraction (hash / PDF metadata) → Claude Vision + Reasoning → Structured AnalysisReport` — with a small padlock icon on step 2 labeled "never fabricates."

---

## Slide 7 — Why Now / Why Claude

**This only works because of what frontier models can do today, not a rules engine.**

- Plain OCR gives text. Pixel-forensics (ELA, etc.) gives "this region was edited." **Neither knows what a document is supposed to contain** — that a caste certificate's issuing tehsil should sit inside the stated district, or that a marksheet's total should equal the sum of its subject marks.
- That's a reasoning step over structured, extracted content — exactly what a vision-capable language model does well, and poorly-suited to hand-coded rules for every document type and every Indian state's certificate format.
- We call **`claude-opus-5`** (Anthropic's current-generation Opus model, released July 2026) with a **forced structured-output tool call**, so every response is guaranteed-valid JSON matching our `AnalysisReport` schema — no free-text parsing, no schema drift, no hallucinated fields.⁶

**Visual:** Side-by-side comparison table — "OCR tool" / "ELA forensics tool" / "DocsGuard (Claude + deterministic)" — rows: reads text, detects pixel edits, cross-field logic, structured guaranteed output, honest about limits. Only the DocsGuard column has all checkmarks.

---

## Slide 8 — Market & Use Cases

**One schema, one pipeline — government first, universal by design.**

- **Government (hero use case):** caste/income/domicile certificates, marksheets, forged bank statements for scheme eligibility, fake experience/turnover/bank-guarantee documents in tenders (see Slide 3 — this is a live, ongoing problem in MP procurement).
- **Banking/KYC:** onboarding documents, submitted bank statements, proof-of-income checks.
- **Trade & procurement:** invoices, bank guarantees, turnover/experience certificates in tender bids.
- **HR/education:** degree and marksheet verification for hiring.
- **Rentals/marketplaces:** ID and ownership-proof checks between individuals.
- The `AnalysisReport` schema and pipeline are identical across every one of these — the document type is *detected*, not hard-coded per use case.

**Visual:** A hub-and-spoke diagram — DocsGuard logo in the center, six spokes to icons for Government, Banking/KYC, Trade/Tenders, HR/Education, Rentals/Marketplace, "+ anywhere trust is established by document."

---

## Slide 9 — Roadmap (honest about what's not built yet)

**What exists today vs. what's next — no overclaiming.**

- ✅ **Today:** deterministic hashing + PDF metadata, Claude vision + cross-field reasoning, structured verdict with evidence, bounding boxes on images, client-side scan history (schema Supabase-compatible for later).
- 🔜 **Next — DigiLocker / e-District integration:** turn `externalChecksNeeded` items like a certificate number into a real, live PASS/FAIL against the issuing government system.
- 🔜 **Sanctions & registry checks:** MCA company registration, GST, sanctions-list lookups for the KYC/trade-invoice use case.
- 🔜 **Reverse-image search:** catch stamps/photos reused across multiple unrelated applications — a fraud pattern text-based checks alone miss.
- 🔜 **Bulk/API mode + officer dashboard + audit trail:** so a scheme's backend can screen applications at volume, with a reviewer queue and an immutable log for accountability.

**Visual:** A simple horizontal roadmap timeline, "Today" as a solid filled marker, the four "Next" items as outlined/dotted markers moving right — visually distinct from the shipped features, so judges see exactly where the line is.

---

## Slide 10 — Impact & The Ask

**What this is worth if it ships beyond the hackathon.**

- Every one of the fraud cases on Slide 3 involved a **document that a human was trusted to eyeball and approve**. DocsGuard doesn't replace that human — it gives them, in seconds, the evidence a trained forensic examiner would take hours to produce.
- At MP's scheme volume (a single block office can process thousands of applications per cycle), even a small reduction in fraudulent approvals reaching disbursement protects both the exchequer and the genuine beneficiaries whose slot a fraudulent claim displaces.
- **The ask:** a pilot with one MP district scheme desk or one tender-verification cell — real applications, real documents, DocsGuard running alongside the existing manual process for a scheme cycle, measured against manual-only outcomes.

**Visual:** One large stat callout — "Built and demoed end-to-end in 2 hours. No mocked data." — with a secondary line: "Ask: one district, one scheme cycle, real documents."

---

## Slide 11 — Team / How We Built It

- Built solo/team in a 2-hour hackathon sprint: React 19 + Vite + TypeScript frontend, deployed on Vercel; a single Vercel serverless function (`/api/analyze`) holding the Claude API key server-side.
- No mocked demo data — a real file, uploaded live, produces a real structured verdict from a real model call.
- [Fill in: names, roles, one-line bios, contact/GitHub handles before presenting.]

**Visual:** Team photo/avatars row + a small "Tech Stack" badge strip (React, Vite, TypeScript, Vercel, Claude Opus 5, pdf-lib, exifr).

---

## Slide 12 — Close

**DocsGuard. Proof, in seconds, that doesn't lie about what it knows.**

- Starts with MP government certificates because that's where the fraud is highest-stakes and highest-volume.
- The same upload → extract → cross-check → verdict pipeline works for any document, anywhere trust is established on paper.
- Thank you — questions welcome.

**Visual:** Return to title-slide branding, large QR code to the live Vercel deployment, contact/GitHub link.

---

## Sources

1. Fake Caste Certificate Fraud Unearthed In Gwalior — [Free Press Journal](https://www.freepressjournal.in/bhopal/madhya-pradesh-fake-caste-certificate-fraud-unearthed-in-gwalior)
2. Vyapam scam — [Wikipedia](https://en.wikipedia.org/wiki/Vyapam_scam) (2,000+ arrests by June 2015; 250+ candidates selected fraudulently; STF formed August 2013)
3. Madhya Pradesh Scholarship scam — [Wikipedia](https://en.wikipedia.org/wiki/Madhya_Pradesh_Scholarship_scam) (2013 tribal-welfare scholarship fraud; ₹1.5 crore single-institute example)
4. Fake Guarantees, Real Loss: ₹202 Crore Bank Guarantee Scam — [The420.in](https://the420.in/fake-guarantees-real-loss-rs202-crore-bank-guarantee-scam-ed-attaches-assets/) (forged PNB/Bank of Baroda guarantees submitted to Madhya Pradesh Jal Nigam Maryadit and Rajasthan Renewable Energy Corp)
5. Fake Bank Guarantee Scam: CBI Arrests 2 in ₹183 Crore Fraud Case — [Angel One](https://www.angelone.in/news/market-updates/fake-bank-guarantee-scam-cbi-arrests-2-in-183-crore-fraud-case)
6. Introducing Claude Opus 5 — [Anthropic](https://www.anthropic.com/news/claude-opus-5); Anthropic launches Opus 5 — [TechCrunch](https://techcrunch.com/2026/07/24/anthropic-launches-opus-5/) (released July 24, 2026; API endpoint `claude-opus-5`)

*Architecture and schema details (Slides 4, 6, 8, 9) are drawn directly from this repo's own code and docs: `api/_core.ts`, `types.ts`, `docs/PRODUCT.md`, `README.md` — not aspirational claims.*
