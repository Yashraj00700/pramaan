# Pramaan — Setup & Deploy

## What you need
- Node.js 18+ (20/22 recommended)
- A Claude API key from https://console.anthropic.com  (`ANTHROPIC_API_KEY`)

## 1. Configure the key (local)
Add your key to `.env.local` in the project root (this file is git-ignored; never commit it):

```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

> The key is read **only server-side** — by the Vite dev middleware locally and by the
> Vercel serverless function in production. It is never bundled into the browser.

## 2. Install & run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 . Uploading a document calls `POST /api/analyze`, which the Vite
dev plugin (`vite.config.ts`) serves by loading `api/_core.ts` and calling Claude.

## 3. How analysis works
1. `api/_core.ts` extracts **real, deterministic** signals in code: SHA-256 fingerprint, file
   size, and (for PDFs, via `pdf-lib`) producer/creator/author + creation vs modification date
   (flagging files edited after creation).
2. Those verified facts + the document image/PDF are sent to Claude (`claude-opus-5`) with a
   strict, honest system prompt. Claude reasons over tampering, OCR text, and **cross-field
   logic**, and is forbidden from fabricating external-lookup results — anything needing a live
   source goes into `externalChecksNeeded`.
3. Claude returns a structured `AnalysisReport` (via the `submit_report` tool), which the UI renders.

## 4. Deploy to Vercel
1. Push the repo to GitHub and "Import Project" in Vercel (framework auto-detected: **Vite**).
2. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
3. Deploy. `api/analyze.ts` is deployed automatically as a serverless function
   (`vercel.json` sets `maxDuration: 60`). No other config needed.

CLI alternative:
```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
# set the env var once:
vercel env add ANTHROPIC_API_KEY
```

## 5. (Optional) Persistent history with Supabase
History is stored in `localStorage` by default (works out of the box). To share scans across
devices/users later:
1. Run `supabase/schema.sql` in your Supabase project's SQL editor.
2. Add to `.env.local` / Vercel env:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. Follow the swap notes at the top of `services/historyService.ts`.

## Limits & notes
- Vercel request body limit (~4.5 MB) caps very large uploads; typical certificate photos /
  single-page PDFs are fine. Compress large scans if needed.
- First analysis of a session can take ~15–40s (the model reasons over the document). This is
  normal; the upload screen shows progress.
- Model: `claude-opus-5` (change in `api/_core.ts` if you want a faster/cheaper tier).
- This tool assists human review; it does not replace source verification (DigiLocker /
  registry / bank confirmation) — see `externalChecksNeeded` in each report.
