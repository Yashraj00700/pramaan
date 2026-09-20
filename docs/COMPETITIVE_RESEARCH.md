# Competitive & Technique Research — Document Forensics Landscape

> Research date: 2026-09-20. Scope: the three projects named in the research brief, plus a
> systematic skim of the open-source "document verification" landscape on GitHub, plus a
> literature check on forensic techniques DocsGuard doesn't use yet. Every factual claim below
> (license, star count, language, technique) is sourced — see the citation after each claim and
> the **Sources** list at the end. Where GitHub's own API reports `license: null` for a repo,
> that is stated plainly: it means **no LICENSE file was detected**, not "MIT" or "free to use."

**Method note on source 4 (`github.com/search?q=document+verify`):** the logged-out web search
UI rate-limited (`HTTP 429`) on fetch. The GitHub CLI (`gh api search/repositories`, already
authenticated in this environment) hits the same search index and returns structured,
verifiable data (stars, license SPDX id, language) rather than rendered HTML, so it was used
instead — plus targeted topic searches (`topic:kyc`, `topic:mrz`, `topic:id-verification`,
`topic:document-verification`, `topic:signature-verification`) to surface the notable projects
a plain `document+verify` query buries under unrelated repos (a blockchain database, a C#
snapshot-testing library, an mRNA sequencing paper all matched the literal words "document" and
"verify"). This is the same underlying dataset the web search page would have shown, just
fetched via a route that didn't rate-limit.

---

## 1. Top-line findings (read this first)

1. **None of the three named projects are usable as-is, and none can be legally treated as
   "free."** All three ship **no LICENSE file** (`license: null` via the GitHub API for all
   three — confirmed directly, see §3). MiniAiLive and Doubango are explicitly commercial,
   trial-gated SDKs that require contacting the vendor for a license key. The signature repo
   has no license grant at all, which under default copyright law means **no permission to use,
   modify, or redistribute the code** — not "MIT-like," the opposite.
2. **MRZ checksum validation is the single best "quick win" in this whole research effort.**
   ICAO 9303's check-digit algorithm is pure arithmetic (weighted mod-10 sum, no ML, no OCR
   engine needed if Claude — which already reads text off the document — transcribes the MRZ
   string). It slots directly into DocsGuard's existing `api/verification.ts` deterministic
   module, next to the Aadhaar Verhoeff and PAN/GSTIN/IFSC/IBAN checks, with the exact same
   "honesty contract" (a checksum FAIL is proof; a PASS only proves well-formedness).
3. **PDF object/xref-level forgery analysis is a second strong quick win** that the brief didn't
   explicitly list as a "known gap" but should be treated as one: DocsGuard's PDF handling today
   (`pdf-lib` in `api/_core.ts`) reads *metadata* (producer, creation/mod dates) but never
   inspects the file's incremental-update structure — multiple `xref`/`trailer` chains, objects
   modified after signing, mismatched object generation numbers — which is a much stronger,
   harder-to-fake signal for PDF-based certificates than metadata alone, and is pure byte
   parsing with zero new dependencies.
4. **DocsGuard's single-pass ELA (JPEG resave at q=90, global mean-diff) is a real but narrow
   technique**, and the brief's own observation — that it's weak on flat, vector-rendered
   documents — matches the forensics literature: ELA depends on there being a *prior* JPEG
   compression history to diff against. A PDF rendered to PNG, a vector-drawn certificate, or an
   already very-high-quality JPEG has little to no compression history for a single resave to
   reveal, so the whole image reads as uniformly low-error and a spliced/cloned region doesn't
   stand out. The literature's answer — JPEG ghost (multi-quality resave, not single-quality)
   and quantization-table (DQT) inspection — is directly implementable in Node with `sharp` and
   a small custom byte parser; see §5.
5. **Real signature verification, real face-swap/photo-substitution detection, and real
   copy-move forgery detection (ORB/SIFT-grade) all require a model runtime Vercel Node
   functions cannot host.** The honest path is a separate inference service (Python/PyTorch
   behind a small API, or ONNX-exported models via `onnxruntime-node` if the models are small
   enough and licensing allows redistribution) — not something to bolt onto `api/_core.ts`. Node
   can get an *approximate* version of copy-move detection and a *statistical proxy* for photo
   tampering (using Claude's own bounding boxes) without any of that — see §5 vs §6 for the
   line between the two.

---

## 2. Comparison table

| Project | What it does | Core technique | License | Language/runtime | Usable in DocsGuard's Vercel/Node stack? | What it would add |
|---|---|---|---|---|---|---|
| [MiniAiLive/ID-DocumentRecognition-Windows](https://github.com/MiniAiLive/ID-DocumentRecognition-Windows) | ID/passport/driver's-license OCR + data extraction, 200+ countries, 8,000+ templates | Neural-net OCR + MRZ recognition + template matching | **No LICENSE file; commercial, trial-only** — repo says "Contact US to get a trial License" [[1]](#s1) | Python 3.6+, **Windows only**, on-prem server | No — Windows-only binary/trial SDK, no license to redistribute or self-host | Template-matched field extraction across many ID formats (if licensed) |
| [amaljoseph/…YOLOv5-and-CycleGAN](https://github.com/amaljoseph/EndToEnd_Signature-Detection-Cleaning-Verification_System_using_YOLOv5-and-CycleGAN) | Detects signatures on a scanned doc, cleans overlapping noise, verifies against a reference signature | YOLOv5 (detection) → CycleGAN (cleaning) → VGG16 feature embedding + cosine similarity (verification) | **No LICENSE file at all** — no grant to use/modify/redistribute [[2]](#s2). Its YOLOv5 dependency (Ultralytics) is separately **AGPL-3.0**, which forces full source disclosure of anything that ships it commercially, or purchase of Ultralytics' Enterprise License [[7]](#s7) | Python, PyTorch + TensorFlow/Keras, Streamlit demo | No, directly — needs a Python/PyTorch+TF runtime a Vercel Node function can't host, **and** has no license grant, **and** its detector dependency is AGPL | Signature presence detection + genuine-vs-forged similarity scoring — DocsGuard has none of this today |
| [DoubangoTelecom/KYC-Documents-Verif-SDK](https://github.com/DoubangoTelecom/KYC-Documents-Verif-SDK) | ID/passport/visa/resident-card recognition + field extraction across 5,000+ formats, 140+ languages, 250+ countries | Deep learning (Keras/TensorFlow), GPU (CUDA) or CPU (Intel OpenVINO) accelerated | **No LICENSE file**; model weights are in a **private repo gated by approval**, and the README explicitly forbids decompiling/reverse-engineering [[3]](#s3) | C++, with C++/C#/Java/Python bindings, Windows/Linux x86_64 | No — proprietary model weights behind an approval gate, not redistributable, C++/native | Broad-format ID recognition (if licensed) |
| [FaceOnLive/ID-Verification-OpenKYC](https://github.com/FaceOnLive/ID-Verification-OpenKYC) — landscape highlight | Face recognition + liveness + ID document recognition, marketed as "OpenKYC Community Project" | Deep learning face/liveness models | **`license: null`** — "Open" in name only [[4]](#s4) | JavaScript, 461★ | No — no license despite the "Open" branding | Same category as above; included to show this is a pattern, not an outlier |
| [camilooscargbaptista/cv-fraud-detection](https://github.com/camilooscargbaptista/cv-fraud-detection) — landscape highlight | Document/image fraud detection pipeline: ELA, clone detection, CNN classifier, metadata checks | Pixel analysis (ELA, noise, clone detection) + CNN classification + EXIF/compression-history checks | **MIT** [[5]](#s5) | Python 3.10+, PyTorch, OpenCV | Reference-only (Python/PyTorch) — but MIT license means its *approach* (not code, directly) is safe to study and its architecture diagram validates DocsGuard's own ELA+clone+metadata direction | Confirms clone/copy-move detection and multi-signal fusion as the right next step (see §5) |
| [Attestto-com/attestto-verify](https://github.com/Attestto-com/attestto-verify) — landscape highlight | Client-side PDF digital-signature verification (PAdES/CAdES/PKCS#7/X.509) in the browser | Cryptographic signature chain validation, zero upload | **Apache-2.0** [[6]](#s6) | **TypeScript**, runs in-browser | Directly relevant architecture (permissive license, JS/TS) — but solves a different problem (verifying a *real* PKI-signed PDF) than DocsGuard's (assessing an *unsigned* scanned/rendered document for tampering) | Not a capability gap for DocsGuard today (no documents in scope carry PAdES signatures), but the license/stack is a useful proof that PDF-structure forensics belongs in TS, not Python |
| [moov-io/watchman](https://github.com/moov-io/watchman) — landscape highlight | AML/CTF/KYC watchlist search across OFAC + several other global sanctions lists | Fuzzy name matching over multiple public list sources | **Apache-2.0** [[8]](#s8) | Go, 509★ | Not directly (Go service) but the *scope* is instructive | DocsGuard's `api/sanctions.ts` only screens **OFAC SDN**; watchman/yente screen OFAC + EU + UN + UK + PEP lists — a genuine breadth gap outside this brief's explicit scope, noted for completeness |
| [opensanctions/yente](https://github.com/opensanctions/yente) — landscape highlight | API over the OpenSanctions consolidated dataset (sanctions + PEP + crime lists, 100+ sources) | Entity resolution / fuzzy matching, Elasticsearch-backed | **MIT** [[9]](#s9) | Python, 178★ | Not directly (needs Elasticsearch + Python) | Same breadth gap as watchman — a much larger free list than OFAC alone, if DocsGuard later wants to widen sanctions screening |
| [konstantint/PassportEye](https://github.com/konstantint/PassportEye) — landscape highlight | Extracts MRZ text from passport/visa/ID images via OCR | Tesseract OCR + custom MRZ-region detection | **MIT** [[10]](#s10) | Python, 468★ | Not directly usable (Python/Tesseract) but validates that MRZ OCR is a solved, permissively-licensed problem elsewhere | Confirms DocsGuard doesn't need to solve MRZ *OCR* — Claude's vision already transcribes text — only MRZ *checksum validation* is missing (see §5) |
| [Arg0s1080/mrz](https://github.com/Arg0s1080/mrz) — landscape highlight | MRZ generator **and checker** (checksum validation) for TD1/TD2/TD3/MRVA/MRVB | Pure ICAO 9303 arithmetic, no ML | **GPL-3.0** [[11]](#s11) | Python, 389★ | Not directly portable (GPL-3.0 is copyleft; also Python) but **proves the checksum-only approach DocsGuard should build is a known, minimal, non-ML pattern** — DocsGuard should write its own small TS implementation rather than port GPL code | Validates the design in §5, item 1 — write our own, don't port theirs |

---

## 3. Per-project detail

### 3.1 MiniAiLive/ID-DocumentRecognition-Windows <a id="s1"></a>

**What it does.** OCR + structured data extraction for ID cards, passports, driver's licenses
and credit cards across 200+ countries, using 8,000+ pre-built document templates and neural
OCR supporting 100+ languages; ships as an on-premise server (data doesn't leave the host)
[[github.com/MiniAiLive/ID-DocumentRecognition-Windows]](https://github.com/MiniAiLive/ID-DocumentRecognition-Windows).

**Technique.** Template-matched OCR: the incoming image is matched against a template library
(by country/document type), then field regions from the matched template are OCR'd. This is the
same broad approach as §5's "document-template/layout matching" gap — just done as a fully
proprietary, closed product rather than something DocsGuard could build toward.

**License.** GitHub reports `license: null` for this repo — confirmed via `gh api
repos/MiniAiLive/ID-DocumentRecognition-Windows`. The README's own words are explicit: *"Feel
free to Contact US to get a trial License. We are 24/7 online on WhatsApp."* Activation requires
generating a license request file (`MIRequest.exe`), sending it to MiniAiLive, and installing a
returned license file. **This is a commercial, trial-gated SDK, not open source, regardless of
being hosted on GitHub.**

**Runtime.** Python 3.6+, **Windows-only**, 2+ CPU cores / 8GB+ RAM. Not deployable inside a
Vercel Node function under any circumstance (wrong OS, wrong runtime, and no license to run it
in production even if it were).

**Verdict for DocsGuard.** Not usable. Its only value to this research is confirming that
"template-matched OCR across many ID formats" is a real, demanded capability — but the honest
path to it (if ever pursued) is either licensing a commercial SDK like this one, or building a
much smaller in-house template library scoped to the handful of Indian document types DocsGuard
actually needs (see §5/§6, "template/layout matching").

### 3.2 amaljoseph/EndToEnd_Signature-Detection-Cleaning-Verification_System_using_YOLOv5-and-CycleGAN <a id="s2"></a>

**What it does.** A three-stage pipeline directly on point for DocsGuard's "no signature/stamp
detection or verification" gap:
1. **Detection** — YOLOv5 locates signature regions on a scanned document (trained on a custom
   dataset derived from Tobacco800).
2. **Cleaning** — a CycleGAN removes overlapping noise (stamps, printed lines, background text)
   from the cropped signature, trained on the Kaggle Signature Dataset with synthetic noise.
3. **Verification** — a VGG16-based feature extractor (fine-tuned on the Kaggle dataset)
   produces an embedding for the cleaned signature; genuine-vs-questioned similarity is scored
   by cosine distance, with a 0.8 threshold for "verified" and 0.7–0.8 flagged for manual review
   [[github.com/amaljoseph/...]](https://github.com/amaljoseph/EndToEnd_Signature-Detection-Cleaning-Verification_System_using_YOLOv5-and-CycleGAN).

**License — the important part.** GitHub reports `license: null` for this repo: **there is no
LICENSE file and no license statement anywhere in the README.** Under default copyright law,
that means the author retains all rights and **no one has permission to use, copy, modify, or
redistribute this code** — not "assume MIT," the opposite assumption is legally correct. On top
of that, its YOLOv5 dependency is Ultralytics' YOLOv5, which is licensed **AGPL-3.0**: using it
in a hosted product requires either open-sourcing the entire product under AGPL-3.0, or buying
an Ultralytics Enterprise License [[github.com/orgs/ultralytics/discussions/3974]](https://github.com/orgs/ultralytics/discussions/3974), [[ultralytics.com/license]](https://www.ultralytics.com/license), [[github.com/ultralytics/ultralytics/issues/22458]](https://github.com/ultralytics/ultralytics/issues/22458). **Two independent
licensing blockers stack here: no grant from the repo author, and AGPL copyleft from its
dependency.** DocsGuard cannot fork or vendor this code, full stop.

**Runtime.** Python, PyTorch (YOLOv5, CycleGAN) + TensorFlow/Keras (VGG16), Streamlit demo UI.
Three separate deep-learning models in the inference path. This cannot run inside a Vercel Node
serverless function — there is no PyTorch/TensorFlow runtime available there, the combined model
weights are in the hundreds of MB (well past comfortable cold-start budgets even where the
platform's function-size ceiling technically allows it), and Vercel Node functions have no GPU.

**What deployment would honestly require** (the brief specifically asked for this): a
**separate inference service** — e.g., a small Python/FastAPI container (Render, Fly.io, Cloud
Run, a GPU-enabled host if latency matters) exposing `POST /verify-signature` that DocsGuard's
existing `api/_core.ts` calls over HTTPS, the same way it already calls the Anthropic API. The
alternative — exporting the three models to ONNX and running them via `onnxruntime-node` inside
the Vercel function — is technically possible for a *single* small model but is a poor fit for
a *three-model* pipeline (detector + generator + embedder) under serverless cold-start and
package-size constraints; a dedicated service is the more honest recommendation. Either way,
**this specific repo cannot be the source of the model** — it would need to be retrained from
scratch on a properly licensed base (e.g. a permissively-licensed detector, or a paid Ultralytics
license) and DocsGuard's own signature-verification pairs, or a commercial signature-verification
API would need to be purchased.

**Verdict for DocsGuard.** The pipeline shape (detect → clean → embed → cosine-similarity) is a
good reference architecture to imitate conceptually, but **zero code or weights from this repo
are usable**, and building an equivalent requires a real ML project (data, training, a hosted
inference service) — not a quick addition to `api/_core.ts`.

### 3.3 DoubangoTelecom/KYC-Documents-Verif-SDK <a id="s3"></a>

**What it does.** Automatic recognition and field extraction for passports, driver's licenses,
ID cards, visas and resident cards across 5,000+ formats, 140+ languages, 250+
countries/territories, including portrait and signature region extraction with bounding boxes
[[github.com/DoubangoTelecom/KYC-Documents-Verif-SDK]](https://github.com/DoubangoTelecom/KYC-Documents-Verif-SDK).

**Technique.** Deep learning (Keras/TensorFlow), GPU-accelerated via CUDA or CPU-optimized via
Intel OpenVINO, claiming millisecond-scale inference.

**License.** `license: null` via the GitHub API. The README is silent on pricing/terms, but is
explicit that **"deep learning models are on a private repository"** requiring email approval
from a corporate domain, and that **"terms of use do not allow you to decompile or reverse
engineer the models."** This is a proprietary SDK with a public wrapper repo and gated model
weights — functionally identical in restriction to the MiniAiLive product, just with less
upfront trial-licensing detail published in the README.

**Runtime.** C++ core with C++/C#/Java/Python bindings, Windows/Linux x86_64. Not a Node/JS
target at all; would need an FFI/native-addon bridge even if licensed, which rules out Vercel's
managed Node runtime.

**Verdict for DocsGuard.** Not usable, for the same two reasons as the other two named repos:
gated/undisclosed licensing, and a native/GPU runtime incompatible with Vercel serverless
functions. Doubango's broader MRZ-specific product, `ultimateMRZ-SDK`, is likewise
`license: NOASSERTION` (GitHub's marker for "a license file exists but isn't a recognized
SPDX license" — i.e., still not a normal open-source grant) [[github.com/DoubangoTelecom/ultimateMRZ-SDK]](https://github.com/DoubangoTelecom/ultimateMRZ-SDK), reinforcing that this vendor's entire
product line is commercial.

### 3.4 The wider landscape (github.com/search?q=document+verify and topic searches)

A literal `document+verify` search is dominated by unrelated hits — `codenotary/immudb` (a
tamper-evident database, 9,035★, not document forensics), `VerifyTests/Verify` (a .NET snapshot
*testing* library, 3,464★), and an mRNA-vaccine-sequencing preprint (3,354★) all match the bare
words. Filtering to topic tags (`kyc`, `mrz`, `id-verification`, `document-verification`,
`signature-verification`) surfaces the actually relevant projects, all captured with license/star
data pulled live via `gh api search/repositories`:

- **The MiniAiLive/Doubango/FaceOnLive/recognito-vision/kby-ai/Faceplugin-ltd family** — a whole
  cluster of near-identical "ID document recognition + face liveness" repos, every single one
  either `license: null` or `license: NOASSERTION`. This is the dominant pattern in this space:
  vendors publish a public wrapper/demo repo on GitHub for discoverability, keep the actual
  models private, and sell licenses. `FaceOnLive/ID-Verification-OpenKYC` (461★) is a good
  example — "Open" is in the project name, but GitHub still reports no license file
  [[github.com/FaceOnLive/ID-Verification-OpenKYC]](https://github.com/FaceOnLive/ID-Verification-OpenKYC).
- **`ballerine-io/ballerine`** (2,434★, `license: NOASSERTION`) — an open-source-adjacent
  KYC/risk-decisioning orchestration platform (TypeScript). `NOASSERTION` means GitHub found a
  license file but couldn't map it to a standard SPDX identifier — worth a manual read of its
  actual license terms before any reliance, not "assume open."
- **`moov-io/watchman`** (Apache-2.0, Go, 509★) and **`opensanctions/yente`** (MIT, Python,
  178★) — both are genuinely permissively licensed, and both screen **far more sanctions/PEP
  lists than OFAC alone**. This is outside the brief's explicit scope (which is about document
  forgery detection, not sanctions breadth), but it's a real, low-effort gap worth flagging:
  DocsGuard's `api/sanctions.ts` currently only screens the US Treasury OFAC SDN list, not EU, UN,
  UK, or PEP lists that these two free/open tools cover.
- **MRZ specifically**: `konstantint/PassportEye` (MIT, Python, 468★) does MRZ *OCR*;
  `Arg0s1080/mrz` (GPL-3.0, Python, 389★) does MRZ *generation and checksum validation*;
  `sivakumar-mahalingam/fastmrz` (AGPL-3.0, Python, 190★) does MRZ extraction. None are portable
  to DocsGuard (wrong language, and GPL/AGPL preclude vendoring even if it were Node) — but
  collectively they confirm MRZ checksum validation is a small, well-understood, already-solved
  problem elsewhere that DocsGuard should just reimplement from the public ICAO 9303 spec (see
  §5), not adapt from any of these repos.
- **Signature-specific**: `ahmetozlu/signature_extractor` (MIT, Python, 526★) is a genuinely
  lightweight classical-CV (OpenCV + scikit-image thresholding/contour) signature extractor —
  no deep learning, no GPU — the closest thing in this landscape to something portable in spirit
  (not code) to a Node/sharp pipeline for *locating* a signature blob, as distinct from
  *verifying* it. `gnbaron/signature-recognition` (MIT, 211★) and `seanbenhur/siamese_net` (MIT,
  129★) do genuine Siamese-network verification — MIT-licensed, but still Python/PyTorch/Keras,
  so still a separate-service candidate, not a code port.
- **`camilooscargbaptista/cv-fraud-detection`** (MIT, Python, 11★) is the single most
  architecturally relevant landscape find: an ELA + clone-detection + CNN-classification +
  metadata-consistency pipeline explicitly for "document fraud detection and digital forensics"
  [[github.com/camilooscargbaptista/cv-fraud-detection]](https://github.com/camilooscargbaptista/cv-fraud-detection). It's small (11★, unlikely
  production-hardened) but its documented architecture is a working validation that "ELA +
  clone/copy-move detection + compression-history analysis + metadata checks," run together, is
  the right shape for exactly the gap the brief describes — DocsGuard should treat it as a design
  reference, not a code source (still Python/PyTorch).

---

## 4. Techniques worth adopting — ranked by impact × feasibility in DocsGuard's stack

DocsGuard's stack is: Vercel Node serverless functions, TypeScript, `sharp` (libvips) for image
processing, `pdf-lib` for PDF structure, `exifr` for EXIF, `jsqr` for QR, and Claude (vision +
tool use) for reasoning — no Python, no GPU, no long-running server by default. "Feasibility" below
means "buildable inside that stack without adding a new runtime."

| Tier | Technique | Impact | Feasibility (this stack) | Why |
|---|---|---|---|---|
| **1** | MRZ / ICAO 9303 check-digit validation | High — closes a named gap (passports, ID cards) entirely | Very high — pure arithmetic, no deps | Claude already transcribes the MRZ text off the image; the missing piece is a deterministic checksum function, exactly like the existing Aadhaar/PAN validators |
| **1** | PDF object/xref-level tamper analysis | High — many of DocsGuard's target documents (certificates, tender docs) are PDFs | High — pure byte/structure parsing, `pdf-lib` already a dependency | Detects incremental-update forgery (content changed after the document was "finalized") that metadata-only checks (producer/dates) miss entirely |
| **1** | Multi-quality JPEG ghost + quantization-table (DQT) analysis | Medium-High — directly answers the brief's "ELA is weak on flat/vector docs" finding | High — extends the existing single-pass `sharp` resave loop in `imageForensics()`; DQT parsing is a small custom byte parser, no new deps | Reveals localized double-compression the current single-quality global-mean-diff ELA misses, and works even when a single-pass ELA reads as uniformly flat |
| **2** | Block-hash approximate copy-move (clone-stamp) detection | Medium — catches a specific, common forgery pattern (duplicated digit/signature/stamp) | Medium — new algorithm to write, but pure Node/`sharp`, no OpenCV | Weaker than true ORB/SIFT-based copy-move (misses rotated/rescaled clones) but catches the common unrotated case; a real engineering task, not a one-liner |
| **2** | Region-specific ELA/noise statistics on Claude's own evidence bounding boxes | Medium — targets photo-substitution specifically | Medium-High — reuses the existing ELA pipeline and the `box: [ymin,xmin,ymax,xmax]` field the report schema (`types.ts:33`) already returns | A statistical proxy for "does the photo region's noise/compression profile match the rest of the page," not true face-swap detection, but real signal with no new model |
| **2** | Wider sanctions/PEP screening (EU/UN/UK/PEP, not just OFAC) | Medium — compliance breadth, not forgery detection | High — same architecture as existing `api/sanctions.ts`, more free CSV/JSON list sources | Outside the brief's explicit forgery-detection scope, but a real, cheap, honest-architecture-compatible improvement surfaced by the research |
| **3** | Font/glyph consistency module (per-character OCR + stroke/anti-aliasing statistics) | Medium | Low-Medium — needs an OCR engine (`tesseract.js`/WASM) as a real new dependency with cold-start cost; Claude's vision prompt already asks it to look for "font/kerning/weight inconsistencies" qualitatively | Marginal value over what Claude already does by eye; only worth it if false-negative rate on font forgery turns out to matter in practice |
| — | Signature detection + verification (YOLOv5/CycleGAN/Siamese-grade) | High | **Not feasible in this stack** — needs a Python/PyTorch/TF runtime or ONNX via a separate service | See §6 |
| — | True ORB/SIFT-grade copy-move detection | Medium-High | **Not feasible in this stack** — needs OpenCV (native binding or Python) | See §6 |
| — | Face-swap / photo-substitution deep-learning detection | High | **Not feasible in this stack** — needs a trained CNN + GPU-friendly runtime | See §6 |
| — | Document-template/layout matching against known genuine templates | High | **Not a code problem — a data/ops problem.** Needs a curated, maintained template library (coordinates + reference images) per document type before any matching technique (keypoint alignment, perceptual hashing) is useful | See §6 |
| **Skip** | PRNU / camera sensor-noise fingerprinting | Low **for DocsGuard's actual documents** | Low | PRNU needs a reference population of images from a *known* camera to build a fingerprint, and typically degrades badly under recompression/rescaling — which is exactly what happens to a scanned/rephotographed/WhatsApp-forwarded government certificate before it reaches DocsGuard. Recommended against, not merely deprioritized — including it in the roadmap would overstate what it can deliver here |

---

## 5. Quick wins — implementable today in Node, no ML, no new runtime

These four fit directly into the existing deterministic pattern (`api/verification.ts` for pure
validators, `api/_core.ts`'s `extractMetadata()`/`imageForensics()` for signal extraction) with
**no Python, no GPU, no new model, and no violation of the "never fabricate a result" honesty
contract** — each one is either provably correct arithmetic or a direct byte-level structural
fact.

1. **MRZ / ICAO 9303 check-digit validation** (closes the brief's named MRZ gap)
   - The ICAO 9303 check-digit algorithm: map each MRZ character to a value (`0`–`9` → itself,
     `A`–`Z` → `10`–`35`, filler `<` → `0`), multiply by a repeating weight cycle **7, 3, 1**
     positionally, sum, and take `mod 10` — the same algorithm computes the document-number
     check digit, DOB check digit, expiry check digit, and (for TD3 passports) a final composite
     check digit over document number + DOB + expiry + their own check digits + the optional
     data field [[planetcalc.com/9535]](https://planetcalc.com/9535/), [[signzy.com/general-glossary/icao-9303]](https://www.signzy.com/general-glossary/icao-9303), [[en.wikipedia.org/wiki/Machine-readable_passport]](https://en.wikipedia.org/wiki/Machine-readable_passport).
   - **Integration**: add `validateMRZ(line1, line2, docType)` to `api/verification.ts` next to
     `validateAadhaar`/`validatePAN`, following the exact same shape (`{ valid, reason }`). The
     MRZ *text* itself doesn't need a new OCR engine — Claude's vision pass already transcribes
     printed text off the document; the prompt just needs to ask it to include the raw MRZ lines
     verbatim in its extracted fields, and the new deterministic function checks them.
   - **Honest limit**: this proves the MRZ is *internally self-consistent* (not tampered/OCR'd
     wrong), exactly like the Verhoeff check proves an Aadhaar number is well-formed — it does
     not prove the passport itself is genuine or that a live registry has this exact person.
     State that limit in the UI the same way the Aadhaar/PAN checks already do.

2. **PDF object/xref-level tamper analysis** (not explicitly named in the brief, but directly
   relevant to DocsGuard's PDF-heavy document mix — certificates, tender submissions)
   - PDF's incremental-update mechanism lets an editor append changes without rewriting the
     file; each save session adds its own `xref` table/stream with a `/Prev` pointer to the one
     before it. **One `xref` chain (single `%%EOF`) = created once and never resaved. Two or
     more chained `xref`/`trailer` sections = the file was opened and saved again after initial
     creation** [[dev.to/iurii_rogulia/pdf-xref-table-forensics-detect-edits-from-file-structure-3n7i]](https://dev.to/iurii_rogulia/pdf-xref-table-forensics-detect-edits-from-file-structure-3n7i), [[arxiv.org/pdf/2507.00827]](https://arxiv.org/pdf/2507.00827).
   - Concretely checkable signals, all pure byte/text scanning of the raw PDF bytes (which
     DocsGuard already has in hand before handing off to `pdf-lib`): count of `%%EOF` markers;
     count/chain of `startxref`/`trailer`/`/Prev` entries; whether **page content objects**
     (`/Contents`, `/Resources` on a `/Type /Page`) were touched in a *later* incremental update
     than the document's own creation objects (a strong tamper signal — legitimate re-saves
     typically touch annotation/signature objects, not page content); mismatched or
     out-of-sequence object generation numbers.
   - **Integration**: a new pure function (e.g. `analyzePdfStructure(buf)`) in `api/_core.ts` or
     a new module, feeding `ConsistencyCheck`/`TechnicalSignal` entries into the existing report
     shape, same pattern as the current `extractMetadata()`.
   - **Honest limit**: a single-`xref` PDF is *consistent with* "never resaved," not proof of
     authorship; a chained-`xref` PDF is *consistent with* "resaved after creation" (which is
     also true of, e.g., legitimately adding a digital signature) — report it as a signal for
     Claude to reason over with the rest of the evidence, not a standalone verdict, exactly like
     the existing ELA and metadata signals are used today.

3. **Multi-quality JPEG ghost + quantization-table (DQT) analysis** (directly answers the
   brief's "ELA is weak on flat vector-rendered documents" finding)
   - Two complementary, both Node-native additions to `imageForensics()`:
     - **JPEG ghost**: instead of the current single resave at `q=90`, resave the base image at
       a sweep of qualities (e.g. `q = 50, 55, …, 95`) with `sharp`, compute the per-block (not
       just global-mean) diff at each quality, and look for a *region* whose error-minimizing
       quality differs from the rest of the image's error-minimizing quality — that mismatch,
       not the raw error magnitude, is the actual "ghost" signal, and it's what still shows up
       even when the whole image is otherwise flat/low-detail
       [[researchgate.net/publication/290737715]](https://www.researchgate.net/publication/290737715_Automated_Image_Forgery_Detection_through_Classification_of_JPEG_Ghosts), [[link.springer.com/article/10.1007/s11042-016-4290-5]](https://link.springer.com/article/10.1007/s11042-016-4290-5).
     - **Quantization-table (DQT) inspection**: JPEG stores its quantization tables in a simple,
       public, fixed binary segment (marker `0xFFDB`). `sharp`/libvips doesn't expose these
       directly, but they're trivial to read with ~30 lines of buffer parsing over the *original
       uploaded bytes* (before any resave) — no new npm dependency needed. A quantization table
       that doesn't match any known camera/phone/scanner/editor signature (Photoshop, common
       phone defaults, WhatsApp's characteristic re-compression table) is itself a signal, and
       **two different quantization tables detected in different 8×8-aligned regions of the same
       image** is strong, direct evidence of localized re-compression (splicing) — this is the
       real mechanism most serious forensic tools use instead of naive ELA
       [[researchgate.net/publication/393898030]](https://www.researchgate.net/publication/393898030_Forensic_Software_Tool_for_Detecting_JPEG_Double_Compression_Using_an_Adaptive_Quantization_Table_Database), [[link.springer.com/article/10.1007/s10851-015-0602-z]](https://link.springer.com/article/10.1007/s10851-015-0602-z).
   - **Honest limit — this technique only applies to JPEG-origin content.** A PDF rendered
     straight to PNG, a native PNG/WEBP upload, or a vector-drawn document has no quantization
     table or JPEG compression history at all, so this specific check simply doesn't fire for
     those inputs (report "not applicable," never a fabricated pass) — it closes the JPEG-photo
     half of the gap, not the vector/PDF half (which item 2, PDF structure analysis, and existing
     PDF metadata checks address instead).

4. **PDF metadata cross-checks DocsGuard already half-does, extended** — not a new technique, but
   worth calling out as a quick win alongside item 2: while adding xref/structure parsing,
   also cross-check the PDF `/ModDate` against the newest `xref` chain's implied save time, and
   flag PDF producer/creator strings that are inconsistent with the claimed document source
   (e.g. a "scanned government form" whose producer string says a photo-editing tool rather than
   a scanner/print driver) — this is a natural, cheap extension of the existing
   `extractMetadata()` once the raw-byte xref parsing from item 2 is in place anyway.

**What ties all four together**: none require a model, a GPU, Python, or a new runtime. All four
produce a `PASS`/`FAIL`/`WARN`-shaped deterministic signal that slots into the existing
`ConsistencyCheck`/`TechnicalSignal` report shape and existing honesty contract ("a FAIL is
proof; a PASS only proves what it mathematically can").

---

## 6. Needs a separate service — what real deployment would require

These are real, valuable capabilities the research surfaced, but **none of them can be added to
`api/_core.ts` as a Node function** without either a new always-on service or accepting a real
engineering/ops project, not a quick patch. Listed honestly so nothing here gets oversold as a
near-term addition.

1. **Signature detection + verification (the YOLOv5/CycleGAN/VGG16-Siamese shape from §3.2).**
   Requires a Python/PyTorch(+TensorFlow) runtime. Realistic options, in order of effort:
   - **Cheapest to start, least Vercel-native**: a small hosted Python/FastAPI service (Render,
     Fly.io, Railway, Cloud Run) exposing one endpoint; DocsGuard's Vercel function calls it over
     HTTPS the same way it already calls Anthropic. Straightforward, but adds a second service
     to operate, monitor, and pay for.
   - **More Vercel-native, more engineering**: export a *single* small model (e.g. just the
     detector, or just the embedding/verification model — not the whole three-stage pipeline) to
     ONNX and run it via `onnxruntime-node` inside the existing Node function. Realistic only for
     one model at a time given Vercel's function package-size and cold-start constraints; the
     three-stage pipeline as a whole is a poor fit for this path.
   - **No-build option**: buy a commercial signature-verification API (several exist in the KYC
     vendor space) instead of self-hosting anything.
   - **In every path, the specific repo researched here (§3.2) cannot be the source of the
     model** — no license grant, and its detector dependency is AGPL-3.0. A real implementation
     needs either a properly licensed base model + DocsGuard's own training data, a paid
     Ultralytics Enterprise license, or a different base architecture entirely.

2. **True copy-move forgery detection at ORB/SIFT quality** (rotation/scale-invariant, the
   research-grade version, as distinct from §5 item 2's approximate Node block-hash version).
   Needs OpenCV — either a native Node binding (heavy native build, historically fragile on
   Vercel's managed build environment) or a Python microservice. Recommendation: ship the Node
   approximate version first (§5, Tier 2), and only invest in a real OpenCV-backed service if the
   approximate version's false-negative rate (missed rotated/rescaled clones) turns out to matter
   in practice.

3. **Face-swap / photo-substitution deep-learning detection** (as distinct from §5's
   region-statistics proxy). The literature's actual detectors are trained CNNs (two-stream
   noise-residual + RGB architectures, or dedicated face-swap classifiers)
   [[arxiv.org/pdf/1909.04217]](https://arxiv.org/pdf/1909.04217), [[arxiv.org/pdf/1803.11276]](https://arxiv.org/pdf/1803.11276) — needs a trained model, a GPU-friendly
   runtime, and ideally a labeled dataset of genuine vs. substituted ID photos to validate
   against, which DocsGuard does not currently have. This is a real ML project, not a service
   deployment problem alone.

4. **Document-template/layout matching against known genuine templates.** This is fundamentally
   a **data curation problem before it's a technique problem**: the matching technique itself
   (perceptual-hash or keypoint-based alignment against a reference layout) is buildable in
   Node/`sharp`, but it's useless without a maintained library of genuine reference
   templates/coordinates per document type DocsGuard wants to check (each Indian state's caste
   certificate format, each bank's statement layout, etc.) — the kind of library MiniAiLive's
   "8,000+ templates" and Doubango's "5,000+ formats" represent years of vendor data-collection
   work behind. Realistic path: start with the 3–5 highest-volume document types DocsGuard
   actually sees, hand-build reference templates for those, and grow the library over time — not
   a general-purpose solution to build in one pass.

5. **PRNU sensor-noise fingerprinting — explicitly not recommended**, included here rather than
   in §4 for visibility: even setting aside that it needs a reference-image population per camera
   and heavy denoising-filter computation, it is **the wrong tool for DocsGuard's actual documents**
   — scanned, rephotographed, and repeatedly-recompressed (WhatsApp/email-forwarded) government
   certificates destroy the PRNU signal well before DocsGuard ever sees them. Do not add this to
   any roadmap; it would not deliver the signal the name promises for this use case.

---

## 7. Licensing summary — read before reusing anything from this research

| Source | License status | Can DocsGuard use/vendor the code? |
|---|---|---|
| MiniAiLive/ID-DocumentRecognition-Windows | No LICENSE file; explicitly commercial trial SDK | **No** |
| amaljoseph/…YOLOv5-and-CycleGAN | No LICENSE file (no grant at all); YOLOv5 dependency is AGPL-3.0 | **No**, on two independent grounds |
| DoubangoTelecom/KYC-Documents-Verif-SDK | No LICENSE file; private/gated model weights, reverse-engineering forbidden | **No** |
| FaceOnLive/ID-Verification-OpenKYC | `license: null` despite "Open" in the name | **No** |
| ballerine-io/ballerine | `license: NOASSERTION` (non-standard license file) | **Read the actual license text before relying on "open source" framing** |
| moov-io/watchman | Apache-2.0 | Yes, if ever adopted for sanctions-list breadth (attribution required) |
| opensanctions/yente | MIT | Yes, if ever adopted for sanctions-list breadth |
| camilooscargbaptista/cv-fraud-detection | MIT | Yes as a design reference; still Python, not a direct port |
| Attestto-com/attestto-verify | Apache-2.0 | Yes as architectural reference (TS, PDF signature verification) — solves a different problem than DocsGuard's |
| konstantint/PassportEye | MIT | Reference only (Python); reimplement the small checksum piece from the public ICAO spec directly |
| Arg0s1080/mrz | GPL-3.0 | **Do not vendor/port** — copyleft; write an independent TS implementation from the public spec instead |
| sivakumar-mahalingam/fastmrz | AGPL-3.0 | **Do not vendor/port** — strong copyleft |
| ahmetozlu/signature_extractor | MIT | Reference only (Python/OpenCV) |
| gnbaron/signature-recognition, seanbenhur/siamese_net | MIT | Reference only (Python/PyTorch/Keras) |

**General rule applied throughout this document**: a permissive license (MIT/Apache-2.0/BSD) on
a *reference* project means it's safe to read and learn the architecture from — it does not mean
its code can be copy-pasted into DocsGuard without checking the specific file's license header, and
in every case above the reference projects are in a different language/runtime (Python/Go) than
DocsGuard's TypeScript/Node stack anyway, so "port," not "copy," would be the operation — and for
the GPL/AGPL and no-license projects, **not even that** — those need independent reimplementation
from public specifications (ICAO 9303, PDF spec) or a paid commercial license, never a fork.

---

## Sources

<a id="s1"></a>[1] [github.com/MiniAiLive/ID-DocumentRecognition-Windows](https://github.com/MiniAiLive/ID-DocumentRecognition-Windows) — README + `gh api repos/MiniAiLive/ID-DocumentRecognition-Windows` (license: null, 87★, Python)

<a id="s2"></a>[2] [github.com/amaljoseph/EndToEnd_Signature-Detection-Cleaning-Verification_System_using_YOLOv5-and-CycleGAN](https://github.com/amaljoseph/EndToEnd_Signature-Detection-Cleaning-Verification_System_using_YOLOv5-and-CycleGAN) — README + `gh api repos/amaljoseph/...` (license: null, 206★, Jupyter Notebook/Python)

<a id="s3"></a>[3] [github.com/DoubangoTelecom/KYC-Documents-Verif-SDK](https://github.com/DoubangoTelecom/KYC-Documents-Verif-SDK) — README + `gh api repos/DoubangoTelecom/KYC-Documents-Verif-SDK` (license: null, 74★, C++)

<a id="s4"></a>[4] [github.com/FaceOnLive/ID-Verification-OpenKYC](https://github.com/FaceOnLive/ID-Verification-OpenKYC) — `gh api search/repositories?q=topic:id-verification` (license: none, 461★, JavaScript)

<a id="s5"></a>[5] [github.com/camilooscargbaptista/cv-fraud-detection](https://github.com/camilooscargbaptista/cv-fraud-detection) — README + `gh api repos/camilooscargbaptista/cv-fraud-detection` (license: MIT, Python/PyTorch/OpenCV)

<a id="s6"></a>[6] [github.com/Attestto-com/attestto-verify](https://github.com/Attestto-com/attestto-verify) — `gh api repos/Attestto-com/attestto-verify` (license: Apache-2.0, TypeScript)

<a id="s7"></a>[7] Ultralytics YOLOv5/YOLO licensing: [github.com/orgs/ultralytics/discussions/3974](https://github.com/orgs/ultralytics/discussions/3974), [ultralytics.com/license](https://www.ultralytics.com/license), [github.com/ultralytics/ultralytics/issues/22458](https://github.com/ultralytics/ultralytics/issues/22458), [libreyolo.com/articles/yolo-commercial-license](https://www.libreyolo.com/articles/yolo-commercial-license)

<a id="s8"></a>[8] [github.com/moov-io/watchman](https://github.com/moov-io/watchman) — `gh api repos/moov-io/watchman` (license: Apache-2.0, Go, 509★)

<a id="s9"></a>[9] [github.com/opensanctions/yente](https://github.com/opensanctions/yente) — `gh api repos/opensanctions/yente` (license: MIT, Python, 178★)

<a id="s10"></a>[10] [github.com/konstantint/PassportEye](https://github.com/konstantint/PassportEye) — `gh api search/repositories?q=topic:mrz` (license: MIT, Python, 468★)

<a id="s11"></a>[11] [github.com/Arg0s1080/mrz](https://github.com/Arg0s1080/mrz) — `gh api search/repositories?q=topic:mrz` (license: GPL-3.0, Python, 389★)

**Landscape search (§3.4)**: `gh api search/repositories` with `q=document+verify` and
`q=topic:{kyc,mrz,id-verification,document-verification,signature-verification}` — equivalent to
[github.com/search?q=document+verify&type=repositories](https://github.com/search?q=document+verify&type=repositories),
which returned HTTP 429 on direct fetch; GitHub CLI (`gh`, authenticated in this environment)
was used against the same search API instead. Also cited directly:
[github.com/DoubangoTelecom/ultimateMRZ-SDK](https://github.com/DoubangoTelecom/ultimateMRZ-SDK) (license: NOASSERTION),
[github.com/ballerine-io/ballerine](https://github.com/ballerine-io/ballerine) (license: NOASSERTION),
[github.com/ahmetozlu/signature_extractor](https://github.com/ahmetozlu/signature_extractor) (MIT),
[github.com/gnbaron/signature-recognition](https://github.com/gnbaron/signature-recognition) (MIT),
[github.com/seanbenhur/siamese_net](https://github.com/seanbenhur/siamese_net) (MIT).

**ICAO 9303 / MRZ checksum algorithm**: [planetcalc.com/9535 — Online calculator: ICAO MRZ Check Digit](https://planetcalc.com/9535/), [signzy.com/general-glossary/icao-9303](https://www.signzy.com/general-glossary/icao-9303), [en.wikipedia.org/wiki/Machine-readable_passport](https://en.wikipedia.org/wiki/Machine-readable_passport), [highprogrammer.com/alan/numbers/mrp.html](http://www.highprogrammer.com/alan/numbers/mrp.html), [mrzcode.org/en/mrz-validator](https://mrzcode.org/en/mrz-validator).

**JPEG ghost / double-compression / quantization-table forensics**: [researchgate.net — Forensic Software Tool for Detecting JPEG Double Compression Using an Adaptive Quantization Table Database](https://www.researchgate.net/publication/393898030_Forensic_Software_Tool_for_Detecting_JPEG_Double_Compression_Using_an_Adaptive_Quantization_Table_Database), [researchgate.net — Automated Image Forgery Detection through Classification of JPEG Ghosts](https://www.researchgate.net/publication/290737715_Automated_Image_Forgery_Detection_through_Classification_of_JPEG_Ghosts), [link.springer.com/article/10.1007/s11042-016-4290-5 — Forensics for partially double compressed doctored JPEG images](https://link.springer.com/article/10.1007/s11042-016-4290-5), [link.springer.com/article/10.1007/s10851-015-0602-z — Quantization-Unaware Double JPEG Compression Detection](https://link.springer.com/article/10.1007/s10851-015-0602-z), [dl.acm.org/doi/abs/10.1016/j.dsp.2024.104954](https://dl.acm.org/doi/abs/10.1016/j.dsp.2024.104954), [ncbi.nlm.nih.gov/pmc/articles/PMC12134093 — Multi-branch network for double JPEG detection and localization](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12134093/), [arxiv.org/pdf/2001.06564 — Media Forensics and DeepFakes: an overview](https://arxiv.org/pdf/2001.06564).

**Copy-move forgery detection**: [dl.acm.org/doi/10.1007/s11042-014-2431-2 — Copy-move forgery detection based on scaled ORB](https://dl.acm.org/doi/10.1007/s11042-014-2431-2), [ietresearch.onlinelibrary.wiley.com/doi/10.1049/iet-ipr.2019.1145 — Image copy-move forgery detection algorithm based on ORB and novel similarity metric](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/iet-ipr.2019.1145), [arxiv.org/pdf/2404.17310 — Image Copy-Move Forgery Detection via Deep PatchMatch and Pairwise Ranking Learning](https://arxiv.org/pdf/2404.17310).

**PRNU / sensor-noise fingerprinting**: [arxiv.org/pdf/2006.11539 — On Addressing the Impact of ISO Speed upon PRNU and Forgery Detection](https://arxiv.org/pdf/2006.11539), [arxiv.org/pdf/1808.08396 — Noiseprint: a CNN-based camera model fingerprint](https://arxiv.org/pdf/1808.08396), [arxiv.org/pdf/2102.09444 — Testing Robustness of Camera Fingerprint (PRNU) Detectors](https://arxiv.org/pdf/2102.09444).

**Face swap / photo substitution detection**: [arxiv.org/pdf/1909.04217 — Swapped Face Detection using Deep Learning and Subjective Assessment](https://arxiv.org/pdf/1909.04217), [arxiv.org/pdf/1803.11276 — Two-Stream Neural Networks for Tampered Face Detection](https://arxiv.org/pdf/1803.11276), [regulaforensics.com/blog/photo-substitution-in-id-documents](https://regulaforensics.com/blog/photo-substitution-in-id-documents/), [gbg.com/en-us/verify-identity/document-fraud-detection](https://www.gbg.com/en-us/verify-identity/document-fraud-detection/), [idmission.com/en/tamper-detection](https://www.idmission.com/en/tamper-detection).

**PDF forensics (xref/incremental-update)**: [arxiv.org/pdf/2507.00827 — A Technique for the Detection of PDF Tampering or Forgery](https://arxiv.org/pdf/2507.00827), [dev.to/iurii_rogulia/pdf-xref-table-forensics-detect-edits-from-file-structure-3n7i](https://dev.to/iurii_rogulia/pdf-xref-table-forensics-detect-edits-from-file-structure-3n7i), [dev.to/iurii_rogulia/how-to-detect-tampered-pdfs-forensics-tutorial-4ken](https://dev.to/iurii_rogulia/how-to-detect-tampered-pdfs-forensics-tutorial-4ken), [dev.to/iurii_rogulia/detect-pdf-tampering-programmatically-developer-guide-2ohb](https://dev.to/iurii_rogulia/detect-pdf-tampering-programmatically-developer-guide-2ohb), [arxiv.org/pdf/2103.02702 — Robust PDF Files Forensics Using Coding Style](https://arxiv.org/pdf/2103.02702), [checkfile.ai/en-CA/blog/detect-pdf-metadata-tampering](https://www.checkfile.ai/en-CA/blog/detect-pdf-metadata-tampering).

**Font/glyph forensics and document-template matching**: [arxiv.org/pdf/1910.08993 — Identity Document and banknote security forensics: a survey](https://arxiv.org/pdf/1910.08993), [arxiv.org/pdf/1810.08016 — Optical Font Recognition in Smartphone-Captured Images, and its Applicability for ID Forgery Detection](https://arxiv.org/pdf/1810.08016), [arxiv.org/pdf/2607.01442 — From Forgeries to Foundation Models: A Systematic Survey of Identity Document Attack and Detection](https://arxiv.org/pdf/2607.01442), [ieeexplore.ieee.org/document/7333827 — A Conditional Random Field model for font forgery detection](https://ieeexplore.ieee.org/document/7333827/), [arxiv.org/pdf/2311.12663 — Similar Document Template Matching Algorithm](https://arxiv.org/pdf/2311.12663), [klearstack.com/blogs/template-based-ocr](https://klearstack.com/blogs/template-based-ocr).

**DocsGuard codebase (for accuracy of "current gaps" claims)**: `api/verification.ts` (deterministic checksum validators, Verhoeff/Aadhaar pattern), `api/_core.ts` (`imageForensics()` — single-pass `q=90` ELA + `jsQR`; `extractMetadata()` — `pdf-lib`/`exifr`), `api/sanctions.ts` (OFAC-SDN-only screening), `types.ts:33` (existing `box: [ymin,xmin,ymax,xmax]` evidence-region field already in the report schema, referenced in §4/§5 as the hook for region-specific ELA).
