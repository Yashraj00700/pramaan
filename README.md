<p align="center">
  <img src="docs/assets/pramaan-banner.svg" alt="Pramaan — AI Document Authenticity & Fraud Detection" width="100%" />
</p>

<h1 align="center">Pramaan · प्रमाण</h1>
<p align="center"><b>Upload any document. Know in seconds if it's real.</b><br/>
An AI document-authenticity & fraud-detection app — built for government schemes, and for everyone.</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-2563EB?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-1E40AF?logo=vite&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="Claude" src="https://img.shields.io/badge/Claude-Opus%205-D97757">
  <img alt="Vercel" src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white">
</p>

---

## The problem

Fraudsters submit **fake and tampered documents** to claim what isn't theirs — forged
caste / income / domicile certificates and doctored bank statements for welfare schemes
(Ladli Behna, scholarships, subsidies, PDS), fabricated marksheets for jobs, and fake
turnover / experience / bank-guarantee papers in government tenders. Manual verification by
officers is slow, inconsistent, and doesn't scale — and the losses are enormous (India's DGGI
detected **₹36,374 cr** of fake-invoice GST-ITC fraud in FY24–25 alone; Madhya Pradesh's own
Vyapam and scholarship scandals show the human cost). The same fake-document problem hits
banks, landlords, employers and marketplaces every day.

## What Pramaan does

Upload a document (photo or PDF). In seconds you get a clear, defensible verdict:

- 🟢 **AUTHENTIC / 🟡 SUSPICIOUS / 🔴 LIKELY FAKE** with a 0–100 **risk score** and confidence.
- 🚩 **Red flags** — each with the exact evidence on the document that triggered it.
- 🧮 **Cross-field consistency checks** — the standout: *does the maths and logic hold up?*
  (line items vs total, DOB vs age vs issue date, declared income vs bank balance, ID-format plausibility).
- 🔍 **Highlighted evidence** — suspicious regions boxed directly on the image.
- 🧾 **Extracted fields**, **technical signals**, a **recommended action**, and an honest list of
  **what still needs live source verification**.
- 🗂️ Scan **history** and one-click **print/export** of the report.

## Why it's different — the honest architecture

Most "AI verifiers" just ask a model and let it hallucinate registry hits and WHOIS data.
Pramaan is built to be **trustworthy enough for a government officer**:

1. **Deterministic signals, in code** — SHA-256 fingerprint, file size, PDF producer +
   creation‑vs‑modification dates (`pdf-lib`), image EXIF / editor-software tags (`exifr`).
   These are *facts*, not guesses.
2. **Claude reasons over the real evidence** — `claude-opus-5` (vision + adaptive thinking)
   examines the pixels, OCR text and those verified signals, does deep **cross-field logic**,
   and may use **live web search** to check public facts.
3. **It never fabricates external lookups.** Anything that needs a live source (registry,
   DigiLocker/e-District, sanctions, bank confirmation) is listed under *externalChecksNeeded* —
   flagged, not invented. That boundary is the product's integrity.

## How it works

```
Upload  →  Deterministic extraction (hash · PDF/EXIF metadata)  →  Claude Opus 5
        →  visual forensics + OCR + cross-field logic (+ web search)  →  Verdict + evidence
```

```mermaid
flowchart LR
  A[Browser upload] --> B["/api/analyze (Vercel serverless)"]
  B --> C["Deterministic signals<br/>SHA-256 · pdf-lib · exifr"]
  B --> D["Claude Opus 5<br/>vision + cross-field logic<br/>+ web_search"]
  C --> D
  D --> E["Structured AnalysisReport"]
  E --> F["Verdict · red flags · consistency<br/>· highlighted evidence"]
```

The Claude API key lives **only** on the server (Vercel function / local dev middleware) — it is
never shipped to the browser. Documents are analyzed in-flight and not stored on any server
(history is kept locally in your browser).

## Tech stack

React 19 · Vite 6 · TypeScript · Tailwind (CDN) · framer-motion · lucide-react ·
Outfit + Plus Jakarta Sans · Anthropic SDK (`claude-opus-5`) · `pdf-lib` · `exifr` ·
Vercel serverless functions · Supabase-ready history.

## Quickstart

```bash
npm install
# add your key to .env.local:  ANTHROPIC_API_KEY=sk-ant-...
npm run dev            # http://localhost:3000
```

Full local + Vercel + Supabase instructions: **[docs/SETUP.md](docs/SETUP.md)**.

## Documentation

| Doc | What's inside |
|---|---|
| [PRODUCT.md](docs/PRODUCT.md) | Problem, solution, PRD, roadmap |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System + analysis pipeline, data model, security |
| [FORENSIC_METHODOLOGY.md](docs/FORENSIC_METHODOLOGY.md) | Exactly how a verdict is reached |
| [FRAUD_TYPOLOGIES.md](docs/FRAUD_TYPOLOGIES.md) | Document-fraud catalog (cited, India + universal) |
| [DATA_SOURCES.md](docs/DATA_SOURCES.md) | DigiLocker / Aadhaar / registries / sanctions — integration roadmap |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) · [MOTION.md](docs/MOTION.md) | The white+blue design system & motion spec |
| [PITCH_DECK.md](docs/PITCH_DECK.md) · [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [IMPACT.md](docs/IMPACT.md) | For the pitch |

## Roadmap

DigiLocker / e-District source-of-truth verification · Aadhaar offline-QR signature check ·
GST / PAN / MCA / IEC registry lookups · sanctions & reverse-image · officer dashboard,
bulk + API, tamper-proof audit trail. Priorities in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

---

> ⚠️ Pramaan assists human review; it does not replace source verification. Every report lists
> what still needs a live check. Verdicts are AI-assisted assessments, not legal determinations.
