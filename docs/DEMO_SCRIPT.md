# DocsGuard — Demo Script (3–5 minutes)

## 0. Before you start
- Have two sample files ready: one clean/genuine-looking document, and one visibly **tampered** document (e.g. an income certificate with an edited income figure, or a marksheet with an altered mark/date — mismatched font or slightly misaligned text is enough).
- Confirm `/api/analyze` is live and reachable (see `docs/SETUP.md`).
- Open the app fresh, no prior scan history cluttering the screen if possible.

---

## 1. Hook (20–30 sec)

> "Every year, thousands of scheme applications in Madhya Pradesh — Ladli Behna, scholarships, ration cards, government jobs — are approved on the strength of one thing: a document a clerk has seconds to look at. A caste certificate. An income certificate. A marksheet. Editing any one of those in a photo app takes five minutes and zero skill. Catching it by eye takes a trained forensic examiner — which no front-desk officer is.
>
> This is DocsGuard. Upload any document. Know in seconds if it's real."

## 2. Story (30–40 sec)

> "Picture a scheme desk officer in a block office. Two hundred applications today, each with a photocopied or scanned certificate. She has to decide: does this go through, or does it get flagged for manual re-verification? Right now that decision is a two-second glance. DocsGuard turns that glance into a structured, evidence-backed check — without slowing her down."

## 3. Live flow (90–120 sec) — the core demo

1. **Upload the tampered certificate.** Drag it onto the upload zone (or tap to pick on mobile). Narrate: "No setup, no document-type selection — I just drop the file."
2. **While it processes (a few seconds):** "Under the hood, two things are happening at once: we hash the file and pull any raw metadata the file itself carries — that's deterministic, no AI involved. And we send the image to Claude, which reads it the way a trained clerk would — extracting every field and cross-checking them against each other."
3. **Verdict appears.** Point at the verdict badge: "SUSPICIOUS" or "LIKELY_FAKE" in amber/rose, the risk score, and the confidence.
4. **Point at the highlighted region on the document image.** "This isn't just a text claim — DocsGuard draws a box directly over the part of the document that triggered the flag. Here's the income figure — the font weight and spacing don't match the rest of the form."
5. **Scroll to the consistency checks table.** "Here's a FAILED check: the applicant's stated age doesn't reconcile with the date of birth on the same form. That's the kind of cross-field logic a plain OCR or 'edited pixels' tool doesn't do — it doesn't know what an income certificate is *supposed* to say."
6. **Point at "external checks needed."** "And here's something important: DocsGuard tells you what it *can't* confirm from the image alone — like the certificate number against the state's e-District system. It doesn't pretend to have checked that. It tells the officer exactly what still needs a phone call or a portal lookup."
7. **(Optional, if time) Upload the clean document.** Show a fast AUTHENTIC verdict with no red flags, to demonstrate it isn't just flagging everything.

## 4. Why Claude / why honest (30–40 sec)

> "We built this on two layers, deliberately kept separate. Layer one is deterministic — file hash, PDF metadata, structural signals — things a computer can state as fact, no interpretation involved. Layer two is Claude, doing the part that actually needs judgment: reading a document the way a human reviewer does, and catching cross-field inconsistencies that pixel-level forensics tools miss entirely — because they don't understand what a caste certificate is supposed to contain.
>
> And critically: we never blur those two layers into one mystery score, and we never claim to have checked a government database we haven't actually integrated with yet. If it needs a live lookup, we say so. That honesty is the whole point — a false sense of certainty is worse than no tool at all in a fraud-detection product."

## 5. Close (10–15 sec)

> "DocsGuard starts with MP government certificates because that's where the fraud is highest-stakes and highest-volume. But the same pipeline — upload, extract, cross-check, verdict — works for a bank statement, a trade invoice, a degree certificate, a rental agreement. One tool, any document."

---

## Judge Q&A — crisp answers

**Q: How do you know a company/certificate/entity is actually real — are you checking a government database?**
> "Not yet, live — and we're upfront about that in the product itself. DocsGuard's `externalChecksNeeded` field explicitly lists what still needs a real lookup, like a certificate number against e-District or DigiLocker, or a company against the MCA registry. What we *do* verify today is internal consistency and document-level forensics: does this document look and read like a genuine one of its type, and do its own fields agree with each other. Wiring in DigiLocker/e-District/MCA APIs is the next step on our roadmap, not something we're pretending already works."

**Q: What's AI and what's deterministic — how much of this is just an LLM guessing?**
> "Two explicit layers. Deterministic: SHA-256 file hash and, for PDFs, structural metadata — producer software, creation and modification timestamps — extracted with code, not a model, so it's the same answer every time on the same file. AI: Claude reads the document visually and does the reasoning a human reviewer would — extracting fields and cross-checking them, like 'does the stated age match the date of birth,' or 'does this stamp's placement match a genuine template.' We show both layers separately in the UI — technical signals versus red flags — so nothing is hidden inside one opaque score."

**Q: What about privacy — these documents have sensitive personal data?**
> "The file goes from the browser straight to our serverless function over HTTPS, which is the only place holding the Claude API key — the key never touches the client. In this hackathon build we're not yet doing encryption-at-rest or a formal retention policy for uploaded files or scan history; that's flagged explicitly in our docs as a limitation, not swept under the rug. For a production deployment handling caste/income data, that's the first hardening step: short retention windows, encryption at rest, and access-controlled history — all straightforward given the current architecture, just not built yet in a 2-hour build."

**Q: What happens if DocsGuard gets it wrong — false positive or false negative?**
> "It's designed as a triage aid, not an automatic rejection switch. A SUSPICIOUS or LIKELY_FAKE verdict routes a document to manual review — it doesn't auto-reject an applicant. We'd rather over-flag for a human to double-check than silently auto-approve a forgery."

**Q: Why Claude specifically, and not a plain OCR/forensics library?**
> "Plain OCR gives you text. Pixel-forensics (ELA, etc.) gives you 'this region was edited.' Neither one knows that an MP income certificate's issuing tehsil should be inside the stated district, or that a marksheet's total should equal the sum of its subject marks. That's a reasoning step over extracted structured content, which is exactly what a vision-capable language model is good at — and Claude's forced-tool-call output means we get that reasoning back as guaranteed-valid structured JSON, not free text we have to parse and hope matches."

**Q: Does this only work for MP government documents?**
> "No — MP government schemes are the hero use case because the stakes and volume are highest there, but the `AnalysisReport` schema and pipeline are generic. We've designed it to read whatever document type it's given — bank statements, invoices, degree certificates, rental agreements — and it reports back what document type it detected, rather than assuming one."
