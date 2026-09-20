# Pramaan — Upgrade Plan (v2)

## What went wrong in v1 (diagnosed, not guessed)

| Symptom | Real cause | Status |
|---|---|---|
| "Analysis failed" on the deployed site | `ERR_MODULE_NOT_FOUND: /var/task/api/_core` — Vercel compiles the TS functions to ESM and Node's ESM resolver needs explicit `.js` extensions. Extensionless imports worked locally (Vite dev middleware) so it only failed in production. | **Fixed** (`666767c`) |
| No URL routing | Whole app was one component with `useState` view switching. No deep links, browser Back breaks, a report cannot be shared or reloaded. | Phase 1 |
| Report "comes out bad" | The 12-module dossier existed in the schema but `ResultView` never rendered it; and the primary-pass prompt allows thin narratives. | Renderer fixed; prompt quality = Phase 3 |
| Sample data weak | Fixtures were written to fill fields, not to read like real casework. | Phase 3 |
| Features from the original missing | Dashboard, entity/company search, AI assistant, export, marketing pages were dropped in the rewrite. | Phase 2 |

## Architecture direction

Keep the honest engine (deterministic forensics + Claude + adversarial court, maths binding).
Fix the shell around it: real routes, real pages, real persistence, real export.

## Phase 1 — Foundation: routing + shell
- `react-router-dom` with real URLs:
  - `/` landing · `/app` workspace · `/scan/:id` a saved report (deep-linkable, shareable)
  - `/dashboard` · `/intel` entity search · `/about` · `/pricing`
- Route-level code splitting; 404; scroll restoration; Back/Forward correct.
- History moves to an addressable store so `/scan/:id` reloads standalone.

## Phase 2 — Features (parallel, one owner per file)
- **Dashboard** — scan stats, verdict distribution, risk trend, recent activity.
- **AI assistant** — ask questions about the open report (`/api/chat`, grounded strictly in that report; refuses to speculate beyond it).
- **Entity intelligence** — search a company/person named on a document; honest about what needs live sources.
- **Export** — print-accurate paginated PDF dossier.

## Phase 3 — Quality
- Prompt hardening so every module earns its narrative (no filler, cite the artifact).
- Rewrite both sample fixtures to read like genuine analyst casework.
- Add the research-backed deterministic wins: **ICAO 9303 MRZ check digits**, **PDF xref / incremental-update analysis**, **JPEG quantisation-table + ghost analysis** (see `COMPETITIVE_RESEARCH.md`).

## Explicitly out of scope (and why)
Signature verification, copy-move (ORB/SIFT), face-swap detection and template matching need a
Python/ONNX service — not a Vercel Node function. The three reference SDKs are `license: null`
or AGPL and cannot be vendored. Documented in `COMPETITIVE_RESEARCH.md`.
