# Sample documents (synthetic specimens)

These files are **fictional, synthetic specimens generated for testing Pramaan's
fraud detection**. They are watermarked `SPECIMEN — DEMO ONLY`, name a fictional
state ("Madhyadesh"), a fictional office and fictional people. They are **not**
valid records, confer no rights, and must never be presented as real documents.

Regenerate with:

```bash
npm run samples
```

| File | What it is |
|---|---|
| `genuine-income-certificate.jpg` | The clean, unaltered specimen (single-pass JPEG). |
| `tampered-income-certificate.jpg` | The same certificate after a realistic forgery. |

## What was altered in the tampered copy

1. **Annual income figure** — the original line was wiped and a new figure re-typed
   in a heavier weight, with slight letter-spacing and a ~2px baseline drift.
2. **Certificate serial** — same treatment, re-typed in a mono face.
3. **Compression history** — the page is aged (q68) before the edit is composited,
   then saved at q96, so the edited regions are "fresher" than the page around them.

## What Pramaan should catch — and what it won't

Reliable on this document:

- **Typography / baseline mismatch** on the re-typed amount and serial (vision).
- **Cross-field logic** — the declared income contradicts other evidence when the
  certificate is submitted alongside a bank statement.
- **Identifier validation** — any Aadhaar/PAN/GSTIN/IFSC/IBAN present is checked
  against its real checksum in code; a failure is mathematical proof of fabrication.
- **Metadata** — re-save history and producer/EXIF traces.

Honest limitation:

- **Error-Level Analysis is weak on documents like this.** ELA is designed for
  photographs; on flat, vector-rendered pages the body text naturally produces as
  much error as a spliced region, so the heatmap is *indicative only* and should
  not be read as proof on its own. Measured on these samples, the edited serial
  does rise (≈1.7 → ≈4.1) but does not cleanly separate from ordinary body text.
  Pramaan therefore treats ELA as one weak signal among several, never as a verdict.
