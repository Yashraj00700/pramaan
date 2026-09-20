# Forensics Upgrades — Beyond Single-Pass ELA

> Research date: 2026-09-20. Scope: this document owns the answer to one measured problem —
> `imageForensics()` in `api/_core.ts` computes Error-Level Analysis as a **single JPEG resave
> at q=90** reduced to **one global mean-diff scalar**. On our own tampered specimen, the edited
> serial number's local error moved from ~1.7 to ~4.1 and did not cleanly separate from ordinary
> body text. This document (a) diagnoses *why* that specific measurement design fails on flat,
> vector-rendered documents, (b) surveys real open-source/academic forensic work on GitHub for
> techniques that don't share that failure mode, and (c) gives a ranked, algorithm-level upgrade
> plan scoped honestly to what a Vercel Node function can and cannot do. Every technical claim
> about a repo (license, language, star count) was pulled live via `gh api` (GitHub CLI,
> authenticated) on the research date; every algorithm claim is cited to a paper or a documented
> implementation — see **Sources** at the end. This document does not duplicate
> `docs/COMPETITIVE_RESEARCH.md` (the prior KYC/document-verification landscape research) — it
> goes one level deeper on the five techniques that research flagged but didn't fully specify:
> JPEG ghost, DQT extraction, block-level DCT scoring, copy-move block hashing, and noise-residual
> inconsistency.

---

## 0. Root cause: why 1.7 → 4.1 doesn't separate

Read literally, `imageForensics()` today (`api/_core.ts:552-599`) has **two independent, stacking
design flaws**, not one — fixing either alone would still leave the signal weak:

1. **The "concern" gate is a single global mean over the whole page.**
   ```ts
   const meanDiff = sum / n;                    // one number for the ENTIRE image
   signals.push({ ..., concern: meanDiff > 12 }); // one threshold, whole-page average
   ```
   A tampered serial number might be a 40×12px patch inside a 1400×1980px page — roughly
   **0.02% of the pixels**. Even if every pixel in that patch has a very high local error, its
   contribution to a whole-page mean is statistically drowned by the other 99.98% of (correctly
   low-error) pixels. A global mean moving from 1.7 to 4.1 is *exactly* what you'd expect from a
   small hot patch diluted into a large average — the raw signal was almost certainly much
   stronger locally and got averaged away before it ever reached the threshold check. **This is
   the single biggest reason the measured numbers look weak — it's a measurement-design problem,
   not (only) an ELA-sensitivity problem**, and it costs nothing to fix (§3, Tier 0).

2. **The heatmap's own contrast scaling has the same dilution bug, visually.**
   ```ts
   const scale = Math.min(25, 255 / maxD);
   for (let i = 0; i < n; i++) diff[i] = Math.min(255, Math.round(diff[i] * scale));
   ```
   `maxD` is the single hottest pixel anywhere on the page (often a hard black/white text edge,
   which always has high ELA response regardless of tampering — this is well documented in the
   ELA literature: edges and text naturally show elevated error, only *localized anomalies that
   coincide with meaningful fields* are signal). One noisy outlier pixel sets the scale for the
   entire image, so a genuinely tampered patch that's merely "somewhat higher than its
   surroundings" (not the single brightest pixel on the page) gets compressed into visual
   near-invisibility in the same way it gets compressed into the mean.

3. **Single quality factor (q=90), single resave.** A flat, vector-rendered or already-high-quality
   document has very little prior JPEG compression history for one resave to reveal — this matches
   the forensics literature's explanation of ELA's known weakness on exactly this input class (see
   §2 sources). There is nothing in the current implementation that varies quality or reasons about
   *why* a block's error is what it is (vs. just measuring "how much").

**Net effect**: even a real edit currently has to fight (a) a diluting global mean, (b) a
diluting global contrast scale, and (c) a single-quality ELA pass that's the literature's
documented weak point for flat/vector content — three compounding reasons the specimen's 1.7→4.1
never cleanly separated. §3 fixes all three, in priority order.

---

## 1. GitHub & literature research

`gh api search/repositories` (GitHub's official search API, authenticated) was queried per
technique named in the brief. Results below are the load-bearing ones; every license was
re-verified with `gh api repos/<owner>/<repo>` (not assumed from a badge).

| Repo | Technique | License | Lang | Stars | Usable in DocsGuard's Node stack? |
|---|---|---|---|---|---|
| [esimov/forensic](https://github.com/esimov/forensic) | Copy-move forgery detection via block-wise DCT features, lexicographic sort, shift-vector voting (based on [arxiv.org/pdf/1308.5661](https://arxiv.org/pdf/1308.5661)) | **MIT** [[1]](#s1) | Go | 145 | **Technique yes, code no** — MIT permits reading it, but it's Go, not Node; the *algorithm* (§3.5) is directly portable to TypeScript |
| [CodeRafay/Forensic-Image-Analysis-Toolkit](https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit) | Desktop toolkit combining ELA, JPEG Ghost, noise map, metadata, copy-move — same shape this document recommends | **BSD-3-Clause** [[2]](#s2) | Python | 14 | Reference-only (Python/Tkinter) — validates that "ELA + JPEG Ghost + noise map + copy-move together" is a real, working combination, not a novel idea |
| [kalinkinisaac/auto-forgery-detection](https://github.com/kalinkinisaac/auto-forgery-detection) | Implementation of Zach/Riess/Angelopoulou's "Automated Image Forgery Detection through Classification of JPEG Ghosts" [[3]](#s3) | **MIT** | Python | 12 | Reference-only (Python) — confirms JPEG Ghost has a working open reimplementation with a permissive license to study |
| [tinankh/GOD](https://github.com/tinankh/GOD) | Local JPEG **Block Artifact Grid** detector via a-contrario statistical voting (Grompone von Gioi & Nikoukhah, IPOL) [[4]](#s4) | AGPL-3.0 | C | 11 | **Not usable even as a code reference for vendoring** (AGPL) — but the published algorithm (a-contrario grid-origin voting) is public research, safe to reimplement independently from the paper, not from this GPL code |
| [sim-pez/prnu](https://github.com/sim-pez/prnu) | PRNU camera-fingerprint extraction, multiple denoisers | **MIT** | Python | 23 | Reference-only — confirms PRNU needs a real denoising pipeline + Python runtime; supports the "skip for DocsGuard" call in §4 |
| [jpeg-js/jpeg-js](https://github.com/jpeg-js/jpeg-js) | Pure-JS JPEG encode/decode (used as a marker-format reference, not a dependency) | BSD-3-style (GitHub reports `NOASSERTION`; the LICENSE file itself is a standard 3-clause BSD grant — verified by reading it directly) [[5]](#s5) | **JavaScript** | 588 | Confirms DQT/marker parsing is a solved, ~60-line problem in JS; DocsGuard should still hand-roll its own ~40-line marker walker (§3.2) rather than add a full decoder dependency, since only the DQT segment is needed |
| [Ztrimus/Document-Forgery-Detection](https://github.com/Ztrimus/Document-Forgery-Detection) | Document-specific forgery detection via computer vision | MIT | Makefile (thin wrapper) | 3 | Too small/thin to be a real reference; noted for completeness only |
| [Vinu-1975/Image-Forgery-Localization](https://github.com/Vinu-1975/Image-Forgery-Localization) | Dual ELA+CNN / YOLO pipeline specifically targeting **document** forgery localization | `license: null` | Python/Flask | 4 | **Not usable** (no license grant) — but its dual-branch shape (generic ELA+CNN branch plus a *document-specialized* branch) is worth naming: DocsGuard's own "flat/vector document" problem is exactly why generic photo-forensics tools split into a document-specific branch elsewhere too |
| [redrob-labs/redrob-verify](https://github.com/redrob-labs/redrob-verify) | Open evaluation harness for OCR/forgery/face-match/identity APIs | Apache-2.0 | Python | 3 | Reference-only; an eval-harness shape (test corpus + scoring), not a technique — worth imitating structurally when DocsGuard builds a regression corpus for the specimen described in §0 |

**Everything in the "needs Python/PyTorch" or "no license" column above is excluded from the
Node/Vercel recommendations in §3 — those recommendations are built only from public
papers/specs plus the *shape* validated by the MIT/BSD/Apache repos above, never from copying
GPL/AGPL/unlicensed code.**

---

## 2. The five required techniques — algorithm detail

Each entry: what it detects, why it beats plain global-mean ELA on flat/vector documents, the
algorithm in implementable detail, expected output shape, approximate cost, and a Node/`sharp`
pseudocode sketch that plugs into the existing `imageForensics(buf, signals, extraImages)`
function shape (same `Signal[]`/`ExtraImage[]` types already in `api/_core.ts:65-74`).

### 2.1 Block-level DCT/pixel scoring (replaces the single global mean) — do this first

**What it detects.** Localized error-level anomalies, at the resolution of actual forgery
patches (tens of pixels), instead of one whole-page number.

**Why it beats the current approach.** This is §0's root-cause fix. It doesn't need a new
technique — it needs the *existing* ELA diff buffer scored per-block instead of globally.

**Algorithm.**
1. Keep the existing single-resave ELA diff computation (`api/_core.ts:566-582`) — no change
   there yet.
2. Instead of one `sum/n` mean, tile the diff buffer into non-overlapping `b×b` blocks (b=16px is
   a reasonable default — small enough to localize a serial-number-sized edit, large enough to
   average out single-pixel JPEG ringing noise). For each block compute:
   - `blockMean` = average diff in the block
   - `blockP95` = 95th-percentile diff in the block (robust to a single outlier pixel inside an
     otherwise-clean block)
3. Compute a **robust baseline** across all blocks: `median` and `MAD` (median absolute
   deviation) of `blockMean` across the whole page — median/MAD are used instead of mean/stdev
   specifically *because* they're not dragged around by the few genuinely-high-error blocks
   (text edges, the tamper itself) the same way a plain mean is.
4. Score each block: `z = (blockMean - median) / (1.4826 * MAD + ε)` (the `1.4826` constant makes
   MAD a consistent estimator of standard deviation under a normal-noise assumption — standard
   robust-statistics practice, not specific to forensics).
5. Flag blocks with `z > 3.5` (tunable) as anomalous. Report `maxZ` and `count of flagged
   blocks`, not a page mean, as the `concern` gate.

**Expected output.** A `W/b × H/b` grid of per-block `{mean, z}`, a flagged-block list with
pixel-space bounding boxes (reusable by the existing `box: [ymin,xmin,ymax,xmax]` normalized
field already in `types.ts:33`), and a heatmap rendered from **per-block z-score**, not raw diff
— so contrast is set by the anomaly distribution, not by whatever pixel happens to be brightest.

**Cost.** Near-zero additional — it's a re-aggregation of a buffer already computed. Milliseconds
on a 1400×1400 image.

**Node/sharp sketch** (drop-in replacement for the `meanDiff`/`scale` block in
`imageForensics()`):
```ts
const B = 16; // block size in px
const bw = Math.ceil(width / B), bh = Math.ceil(height / B);
const blockMean = new Float64Array(bw * bh);
// diff is the existing per-pixel abs-diff buffer (3 channels) already computed above
for (let by = 0; by < bh; by++) {
  for (let bx = 0; bx < bw; bx++) {
    let s = 0, c = 0;
    for (let y = by*B; y < Math.min((by+1)*B, height); y++) {
      for (let x = bx*B; x < Math.min((bx+1)*B, width); x++) {
        const i = (y*width + x) * 3;
        s += (diff[i] + diff[i+1] + diff[i+2]) / 3;
        c++;
      }
    }
    blockMean[by*bw + bx] = s / c;
  }
}
const sorted = Float64Array.from(blockMean).sort();
const median = sorted[sorted.length >> 1];
const mad = Float64Array.from(blockMean, v => Math.abs(v - median)).sort()[sorted.length >> 1];
const robustSigma = 1.4826 * mad + 1e-6;
const flagged: {bx:number, by:number, z:number}[] = [];
let maxZ = 0;
for (let i = 0; i < blockMean.length; i++) {
  const z = (blockMean[i] - median) / robustSigma;
  if (z > maxZ) maxZ = z;
  if (z > 3.5) flagged.push({ bx: i % bw, by: (i / bw) | 0, z });
}
signals.push({
  label: 'ELA tamper analysis (block-level)',
  value: `${flagged.length} anomalous block(s) of ${bw*bh}, max z=${maxZ.toFixed(1)}`,
  concern: flagged.length > 0,
});
```

---

### 2.2 DQT (quantization table) extraction — encoder fingerprint + resave detection

**What it detects.** Which encoder/pipeline produced the *current* file (a page-level fact, read
straight from the JPEG header, zero image processing needed), and whether that's consistent with
the document's claimed origin (e.g., "scanned original" whose table matches WhatsApp's
characteristic re-compression signature, or Photoshop's, instead of a scanner/camera's).

**Why it beats plain ELA.** It needs no resave and no resolution-dependent diffing at all — it's
a deterministic fact read from bytes already in hand, so it works identically well on
high-quality and flat images where pixel-domain ELA is weak. It directly extends DocsGuard's
existing "VERIFIED TECHNICAL METADATA — trust these facts" pattern (`api/_core.ts:513-515`),
which is exactly the class of fact the honesty contract wants more of.

**One important correction to make explicit** (refining a looser claim in
`docs/COMPETITIVE_RESEARCH.md §5.3`): a standard baseline JPEG file stores **one** set of DQT
tables in its header, applied uniformly to the whole image — you cannot literally read "two
different quantization tables from two different regions of the same file" from the header,
because the header only ever has one. What DQT parsing *does* give you is a single **global**
fact about the file as a whole (which encoder/quality produced it). **Localized** re-compression
evidence — proof that one region was quantized differently before being pasted into this file —
has to come from the block-level techniques in §2.3/§2.4 (grid alignment, JPEG ghost), not from
DQT parsing alone. This document treats DQT extraction as the **global provenance** signal and
JPEG ghost / block grid as the **localization** signal — they're complementary, not the same
claim restated.

**Algorithm — byte parsing (JPEG marker segments, ITU-T T.81 §B.2.4.1).**
1. Confirm the buffer starts with SOI (`0xFF 0xD8`); if not, this technique doesn't apply
   (non-JPEG input — report "not applicable," never a fabricated pass, matching the honesty
   contract already used for the PDF/non-JPEG case).
2. Walk marker segments from offset 2: each segment is `0xFF <marker-byte> <2-byte big-endian
   length, length INCLUDES the 2 length bytes> <length-2 bytes of payload>`. Skip standalone
   markers with no length (`0xFFD0`-`0xFFD7` RST, `0xFFD8` SOI, `0xFFD9` EOI, `0xFF01`) by
   advancing 2 bytes only.
3. On marker `0xFFDB` (DQT): parse the payload as one or more table entries. Each entry starts
   with 1 byte: high nibble = precision (`0` = 8-bit values, `1` = 16-bit), low nibble = table ID
   (0-3, conventionally 0=luma, 1=chroma). Followed by 64 values (8-bit) or 128 bytes / 64
   big-endian 16-bit values (16-bit precision), **stored in zig-zag scan order** — remap to
   natural 8×8 row-major order via the standard JPEG zig-zag index table:
   `[0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,
   49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63]`.
   A DQT segment can carry multiple tables back-to-back; keep parsing entries until the segment's
   declared length is consumed.
4. Stop walking at `0xFFDA` (SOS, start of entropy-coded scan data) — everything needed is always
   in the header, before the first scan, for baseline JPEG.
5. Compare the extracted table(s) against a small **hand-maintained fingerprint table** of known
   signatures — e.g. the standard IJG/libjpeg tables derived by linear scaling of Annex K's base
   tables by quality (a closed-form formula: `scale = quality < 50 ? 5000/quality :
   200 - 2*quality`, `table[i] = clamp(round(base[i]*scale/100), 1, 255)` — this closed form is
   how libjpeg itself derives a table from a "quality" number, per the same ITU spec, and lets
   you *estimate the effective JPEG quality* of a table you didn't recognize by inverting the
   formula, not just exact-matching a lookup list) plus a handful of table dumps: Photoshop
   "Save for Web," common phone camera defaults, WhatsApp's well-documented re-compression
   table — the same approach JPEGsnoop's signature database uses [[6]](#s6), [[7]](#s7).

**Expected output.** `{ tableId, precision, values: number[64] (natural order), estimatedQuality:
number, matchedEncoder: string | 'unknown' }` per table, surfaced as a `TechnicalSignal` (e.g.
`"DQT: matches ~q87 IJG-standard table (no known editor signature)"`) — a page-level fact, not a
heatmap.

**Cost.** Trivial — one linear pass over a header that's typically a few hundred bytes to a few
KB. Sub-millisecond.

**Honest limit.** Only fires on JPEG-origin bytes. PNG/WEBP uploads and PDF-rendered pages carry
no DQT at all — report "not applicable" for those, exactly as the existing metadata code already
does for non-EXIF images (`api/_core.ts:505`).

**Node sketch** (pure byte parsing, zero new npm dependency):
```ts
const ZIGZAG = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,
  7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,
  61,54,47,55,62,63];

function extractDQT(buf: Buffer): { tableId: number; precision: 8|16; values: number[] }[] {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return []; // not a JPEG
  const tables: { tableId: number; precision: 8|16; values: number[] }[] = [];
  let p = 2;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xFF) { p++; continue; } // resync on corrupt stream
    const marker = buf[p + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { p += 2; continue; }
    if (marker === 0xDA) break; // start of entropy-coded scan data — DQTs are always before this
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xDB) {
      let q = p + 4, end = p + 2 + len;
      while (q < end) {
        const pq = buf[q] >> 4, tq = buf[q] & 0x0F; q++;
        const precision: 8|16 = pq === 0 ? 8 : 16;
        const nat = new Array(64);
        for (let i = 0; i < 64; i++) {
          const v = precision === 8 ? buf[q++] : (buf.readUInt16BE(q), q += 2, buf.readUInt16BE(q-2));
          nat[ZIGZAG[i]] = v;
        }
        tables.push({ tableId: tq, precision, values: nat });
      }
    }
    p += 2 + len;
  }
  return tables;
}
```
Call this on the **original uploaded bytes**, before any `sharp` resave (resaving destroys the
original encoder's table).

---

### 2.3 Multi-quality JPEG ghost analysis — localizes double compression

**What it detects.** A region that was compressed once at quality `q0`, then pasted into a page
that was (re-)saved as a whole at quality `q1 > q0` — the classic splice signature. This is
exactly the "localization" half that §2.2's DQT parsing explicitly cannot give you (one global
table only).

**Why it beats the current single-pass ELA.** Today's `imageForensics()` resaves at one fixed
`q=90` and looks at raw error magnitude. JPEG ghost instead sweeps *many* qualities and looks at
**which quality minimizes local error** — a fundamentally different signal (a location, not a
magnitude) that survives exactly the case where flat/low-detail content makes every single-quality
error reading look uniformly small: even on a flat region, the error-minimizing quality itself
still differs between an untouched patch and a spliced one, because that minimum is determined by
the patch's *own prior compression history*, not by how much visual detail it has [[8]](#s8),
[[9]](#s9).

**Algorithm** (Farid, "Exposing Digital Forgeries from JPEG Ghosts," 2009 [[8]](#s8); classifier
refinement by Zach/Riess/Angelopoulou [[3]](#s3)):
1. Take the normalized base image `I` (already computed in `imageForensics()` at
   `api/_core.ts:557`).
2. Choose a quality sweep, e.g. `Q = {40, 45, 50, ..., 90}` (step 5, ~11 resaves — coarser than
   Farid's original step=1 sweep to keep this inside a Vercel function's time budget; see cost
   note below).
3. For each `q ∈ Q`: resave `I` at quality `q` → `I_q`. Compute the per-pixel squared difference
   `d_q(x,y) = (I(x,y) - I_q(x,y))^2`, then **block-average** it over `b×b` blocks (b=16, same
   grid as §2.1) to get `D_q(bx,by)`.
4. **Per-block normalize across the quality axis**: for each block `(bx,by)`, rescale its own
   `D_q` values across all `q ∈ Q` to `[0,1]` (divide by that block's own max across the sweep) —
   this step is what makes the *shape* of the curve comparable between blocks regardless of each
   block's absolute texture/detail level.
5. For each block, find `q*(bx,by) = argmin_q D_q(bx,by)` — the quality at which *this block's*
   error is smallest, i.e., the quality closest to whatever quality actually compressed it before.
6. Compute the **page-modal** `q*` (the most common `q*` value across all blocks — this
   approximates the file's own overall resave quality, since most of the page was genuinely saved
   once at the file's real quality). Flag any block whose `q*` differs from the modal `q*` by more
   than one sweep step **and** whose block sits in a semantically meaningful region (cross-reference
   with Claude's own evidence bounding boxes per `types.ts:33`, or simply surface all flagged
   blocks and let the model's visual read decide relevance — consistent with how ELA output is
   already handled today, "supporting evidence, not proof").

**Expected output.** A `q*` value per block (a small 2D map, same grid shape as §2.1), a flagged
list of blocks whose modal quality diverges from the page, and (optionally) a ghost-overlay image
using the classic red→green→blue gradient from the original technique's visualizations
[[10]](#s10).

**Cost.** The dominant cost is `|Q|` JPEG resaves + block-diffs of a ~1400×1400 image. `sharp`
(libvips, native code) does each resave+diff in low tens of milliseconds; 11 sweep steps is
comfortably sub-second total. This is the most expensive of the five techniques but still well
inside a Vercel function's default execution budget for a single document.

**Node/sharp sketch:**
```ts
const QUALITIES = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const B = 16;
const bw = Math.ceil(width / B), bh = Math.ceil(height / B);
const D: Float64Array[] = []; // D[qi][block] = block-averaged squared error at that quality

for (const q of QUALITIES) {
  const resaved = await sharp(base).jpeg({ quality: q }).toBuffer();
  const b = await sharp(resaved).removeAlpha().resize(width, height).raw().toBuffer();
  const blockSum = new Float64Array(bw * bh);
  const blockCount = new Float64Array(bw * bh);
  for (let y = 0; y < height; y++) {
    const by = (y / B) | 0;
    for (let x = 0; x < width; x++) {
      const bx = (x / B) | 0, idx = by * bw + bx;
      const i = (y * width + x) * 3;
      const d = (a.data[i]-b[i])**2 + (a.data[i+1]-b[i+1])**2 + (a.data[i+2]-b[i+2])**2;
      blockSum[idx] += d; blockCount[idx]++;
    }
  }
  D.push(blockSum.map((s, i) => s / blockCount[i]));
}
// per-block normalize across the quality axis, then argmin
const qStar = new Int16Array(bw * bh);
for (let blk = 0; blk < bw*bh; blk++) {
  let maxV = 1e-9;
  for (let qi = 0; qi < D.length; qi++) maxV = Math.max(maxV, D[qi][blk]);
  let bestQi = 0, bestV = Infinity;
  for (let qi = 0; qi < D.length; qi++) {
    const v = D[qi][blk] / maxV;
    if (v < bestV) { bestV = v; bestQi = qi; }
  }
  qStar[blk] = QUALITIES[bestQi];
}
// modal q* across the page, then flag outliers
const counts = new Map<number, number>();
for (const q of qStar) counts.set(q, (counts.get(q) ?? 0) + 1);
const modalQ = [...counts.entries()].sort((a,b) => b[1]-a[1])[0][0];
const flagged = [...qStar.keys()].filter(i => Math.abs(qStar[i] - modalQ) > 5);
```

---

### 2.4 Block-level DCT / Block Artifact Grid (BAG) alignment — the vector-document-specific check

**What it detects.** Whether the file's 8×8 JPEG compression grid is consistent across the whole
page, or shifted/misaligned in one region — the signature left when a region is copy-pasted at a
pixel offset that doesn't land on the destination file's own 8×8 grid, then the whole page is
re-saved as one JPEG. This is genuinely the strongest of the five techniques **specifically for
the brief's named failure case (flat, vector-rendered documents)**, because it doesn't depend on
texture or detail at all — it depends purely on pixel-grid geometry, which a flat/vector-rendered
region still has once it's rasterized into the final raster image.

**Why it beats plain ELA.** ELA's signal strength is proportional to how much the pasted content's
*compression error* differs from its surroundings — weak on flat content with little error to
begin with. BAG alignment instead asks a binary geometric question — "does this block's
compression grid start at the same `(x mod 8, y mod 8)` offset as the rest of the page?" — which
is either true or false regardless of how flat or detailed the content is. This is the published
technique behind `tinankh/GOD` (§1) [[4]](#s4), and its lightweight local variant is described in
[[11]](#s11).

**Algorithm** (a practical Node-feasible approximation of the a-contrario grid detector — not a
literal port of the AGPL code, an independent reimplementation from the published method):
1. Take the base image's luma channel `Y` (from the normalized `sharp` buffer).
2. For a candidate grid origin `(ox, oy)` with `ox, oy ∈ {0..7}`, measure the **blockiness score**
   at that origin: sum the absolute second-difference of pixel intensity **across** 8-pixel
   boundaries aligned to `(ox, oy)` (the classic block-artifact measure — genuine JPEG blocking
   produces a small but consistent intensity "step" exactly every 8 pixels; this is stronger at
   the *true* grid origin than any other offset because JPEG's block-DCT quantization
   systematically introduces boundary discontinuities at true block edges).
   ```
   blockiness(ox,oy) = Σ_{x ≡ ox mod 8} |2·Y(x,y) − Y(x-1,y) − Y(x+1,y)|   (vertical boundaries)
                      + Σ_{y ≡ oy mod 8} |2·Y(x,y) − Y(x,y-1) − Y(x,y+1)|   (horizontal boundaries)
   ```
3. For each **local window** (e.g. 64×64px, stepped every 32px), compute `blockiness(ox,oy)` for
   all 64 candidate origins and take the origin with the maximum score as that window's **detected
   grid origin**.
4. The page's dominant grid origin is the mode across all windows (should be `(0,0)` for an
   untouched, once-compressed JPEG whose grid was never shifted). **Any window whose detected
   origin differs from the page's dominant origin is evidence that window's content did not
   originate at the same pixel position it currently occupies** — i.e., it was moved (copy-pasted
   or spliced) after its own original compression.
5. Also compute a **confidence** per window: the ratio of the best origin's blockiness score to
   the second-best — a low ratio (many origins score similarly) means "no reliable grid detected
   here" (e.g., a genuinely flat/blank region with no compression signal at all — report this
   honestly as "inconclusive," never as a false pass or false flag), which is itself useful
   negative information distinct from "grid confirmed matching."

**Expected output.** A `W/32 × H/32` grid of `{originX, originY, confidence}`, a flagged-window
list where `origin ≠ pageMode` **and** `confidence` is high enough to trust, and an overlay
visualization.

**Cost.** `O(width × height × 64)` for the naive all-origins scan — for a 1400×1400 image that's
~125M operations; in plain JS loops that's realistically low-hundreds-of-milliseconds to low
seconds depending on Node's JIT — not exact-measured here, but the honest ballpark. Optimization:
compute the two second-difference arrays (`Σ` over `x mod 8` and `Σ` over `y mod 8`) with a single
pass and accumulate into 8 running sums instead of scanning per-origin separately, which drops
this to `O(width × height)` with a small constant — recommended if this ships. **Only applies to
JPEG-origin images**, same honest limit as §2.2/§2.3 — a native PNG/PDF-rendered page has no JPEG
grid to detect at all.

**Node sketch** (optimized single-pass form):
```ts
function gridOrigin(Y: Uint8Array, width: number, height: number, x0: number, y0: number, w: number, h: number) {
  const scoreX = new Float64Array(8), scoreY = new Float64Array(8);
  for (let y = y0 + 1; y < Math.min(y0 + h, height - 1); y++) {
    for (let x = x0 + 1; x < Math.min(x0 + w, width - 1); x++) {
      const i = y * width + x;
      scoreX[x % 8] += Math.abs(2*Y[i] - Y[i-1] - Y[i+1]);
      scoreY[y % 8] += Math.abs(2*Y[i] - Y[i-width] - Y[i+width]);
    }
  }
  let bestOx = 0, bestOy = 0, best = -1, second = -1;
  for (let ox = 0; ox < 8; ox++) for (let oy = 0; oy < 8; oy++) {
    const s = scoreX[ox] + scoreY[oy];
    if (s > best) { second = best; best = s; bestOx = ox; bestOy = oy; }
    else if (s > second) second = s;
  }
  return { originX: bestOx, originY: bestOy, confidence: second > 0 ? best / second : 0 };
}
// slide a 64x64 window, step 32, over the page; take the page-mode origin; flag mismatches.
```

---

### 2.5 Copy-move (clone) detection via block hashing / DCT-feature matching

**What it detects.** A region of the page duplicated elsewhere on the same page — a common,
low-effort forgery (covering an unwanted mark by cloning a clean patch over it, or duplicating a
signature/stamp).

**Why it beats plain ELA.** ELA detects *re-compression* evidence; it has nothing to say about
*duplication* — a cloned patch copied from elsewhere in the *same* file, at the *same* JPEG
quality, produces **no** ELA anomaly at all, because there was no differential re-save. Copy-move
detection is a structurally different check that closes that blind spot.

**Algorithm** — this is a direct, from-spec reimplementation of the technique documented (not the
code) in `esimov/forensic`'s README (§1) [[1]](#s1), itself based on Bo Liu et al.'s DCT-based
copy-move method [[12]](#s12):
1. Convert the image to a luma channel `Y` (matches the existing ELA buffer's greyscale-adjacent
   step, no new conversion needed).
2. Slide a `b×b` block (b=8 or 16) across the image with **stride `s` > 1** (this is the
   critical Node-feasibility lever — see cost note) at every `(x, y)`.
3. For each block, compute its 2D DCT and keep the **first 9-16 coefficients in zig-zag order**
   (low-frequency — these are the most stable/robust part of a block's identity, matching the
   `9`-per-block feature the reference implementation uses) as that block's feature vector, along
   with its `(x, y)` top-left coordinate.
4. **Quantize** each feature vector's components (round to a coarse bucket, e.g. nearest integer
   after scaling) — this makes two *near-duplicate* blocks (duplication that survived quality
   changes/tiny noise) collapse to the *same* quantized key, which is what makes the next step
   cheap.
5. Group blocks by their quantized feature key into a hash map (`Map<string, {x,y}[]>`) instead of
   a full lexicographic sort — algorithmically equivalent to "sort then scan neighbors" but avoids
   an O(n log n) sort of a very large block set, and is the natural Node/JS data structure for
   this.
6. For every bucket with more than one block, form all pairs and compute each pair's **shift
   vector** `(dx, dy) = (x2-x1, y2-y1)`, but **reject pairs whose blocks are spatially close**
   (e.g. `|dx| + |dy| < 4·b`) — adjacent similar blocks in smooth/flat regions (sky, a blank page
   background) are the dominant source of false positives, and rejecting near-zero shifts removes
   almost all of them.
7. Histogram the surviving shift vectors. A **shift vector that recurs many times** (above a
   threshold, e.g. ≥ 8 block-pairs sharing the same `(dx,dy)` within a small tolerance) is strong
   evidence of a genuine copy-move: many blocks across a whole region were all moved by the exact
   same offset, which coincidence essentially never produces, whereas texture similarity alone
   (e.g. a repeating watermark pattern) does not concentrate onto one dominant shift vector the
   same way.
8. Render the flagged block set (both source and destination locations for the dominant shift
   vector(s)) as an overlay mask.

**Expected output.** A list of `{shiftVector, blocks: [{x,y}], blocks2: [{x,y}]}` clusters (each
cluster = one candidate clone event), an overlay image marking both the source and destination
regions, and a boolean `concern` if any cluster exceeds the count threshold.

**Cost — the one technique here genuinely at risk of being too slow for a Node function without
care.** A naive stride-1 block scan of a 1400×1400 image with b=16 produces roughly
`(1400-16)^2 ≈ 1.9M` blocks — a full DCT per block at that count is the real cost driver. Use
**stride 4-8** (reduces block count by 16-64×, to ~30K-120K blocks) and a **fast approximate
DCT-lite** (a small fixed set of low-frequency basis sums computed directly, not a full 2D-DCT
library call) — with those two levers this is comfortably a low-single-digit-seconds operation in
plain JS; without them it risks exceeding a serverless function's time budget on a large scan.
**Ship this with the coarser stride by default and treat it as the one technique in this document
that needs an actual perf pass (a small benchmark on real specimens) before enabling by default in
production**, rather than assuming the pseudocode's first cut is fast enough — this is the honest
caveat the brief asked for.

**Node sketch (feature extraction + shift-vector voting):**
```ts
function blockFeature(Y: Uint8Array, width: number, x0: number, y0: number, b: number): number[] {
  // low-frequency 2D-DCT-lite: a handful of separable basis-sum coefficients, not a full DCT-II.
  const feat: number[] = [];
  for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) {
    let s = 0;
    for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
      s += Y[(y0+y)*width + (x0+x)] * Math.cos((Math.PI/b)*(x+0.5)*u) * Math.cos((Math.PI/b)*(y+0.5)*v);
    }
    feat.push(Math.round(s / (b*b) / 4)); // quantize
  }
  return feat;
}

const buckets = new Map<string, {x:number,y:number}[]>();
const B = 16, STRIDE = 6;
for (let y = 0; y + B <= height; y += STRIDE) {
  for (let x = 0; x + B <= width; x += STRIDE) {
    const key = blockFeature(Y, width, x, y, B).join(',');
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ x, y });
  }
}
const shiftVotes = new Map<string, {x1:number,y1:number,x2:number,y2:number}[]>();
for (const blocks of buckets.values()) {
  if (blocks.length < 2) continue;
  for (let i = 0; i < blocks.length; i++) for (let j = i+1; j < blocks.length; j++) {
    const dx = blocks[j].x - blocks[i].x, dy = blocks[j].y - blocks[i].y;
    if (Math.abs(dx) + Math.abs(dy) < 4*B) continue; // reject near-adjacent (smooth-region) matches
    const key = `${dx},${dy}`;
    (shiftVotes.get(key) ?? shiftVotes.set(key, []).get(key)!).push({x1:blocks[i].x,y1:blocks[i].y,x2:blocks[j].x,y2:blocks[j].y});
  }
}
const clusters = [...shiftVotes.entries()].filter(([,pairs]) => pairs.length >= 8);
```

---

### 2.6 Noise-residual inconsistency — the second vector-document-friendly technique

**What it detects.** A region whose local noise characteristics (sensor/scan noise, or
rendering/anti-aliasing texture) differ from the rest of the page — evidence that region was
generated, scanned, or rendered by a different process than its surroundings, even if it was never
JPEG-recompressed at all.

**Why it beats plain ELA, and why it's specifically good for flat/vector documents.** This is the
one technique in this document that doesn't depend on JPEG compression history *at all* — it
works on PNG, on a PDF page rasterized straight to pixels, on anything with pixels. For a
vector-rendered document, "noise" isn't camera sensor noise — it's **rendering texture**: the
specific anti-aliasing/sub-pixel pattern a given renderer, resolution, and font-hinting setting
produce. If one field was edited in a different tool, at a different zoom/DPI, or re-rendered by a
different code path than the rest of the page, its micro-texture differs from its surroundings
even though the whole page is otherwise low-error and "flat" to ELA — precisely the case the brief
says current ELA misses.

**Algorithm** (Mahdian & Saic's noise-inconsistency method [[13]](#s13), extended by Pan/Zhang/Lyu
[[14]](#s14)):
1. Take the luma channel `Y`.
2. Apply a single-level **Haar wavelet transform** (a 2-tap, trivially-implementable transform —
   no wavelet library needed): for each 2×2 pixel group, the `HH` (diagonal high-pass) subband
   coefficient is `HH = (Y(x,y) - Y(x+1,y) - Y(x,y+1) + Y(x+1,y+1)) / 2`. This subband captures
   fine texture/noise while suppressing the page's actual content (edges/gradients dominate the
   `LL`/`LH`/`HL` subbands instead).
3. Tile `HH` into `b×b` blocks (b=16-32, coarser than the ELA grid since noise estimation needs
   more samples per block to be stable).
4. For each block, estimate local noise standard deviation via the **median absolute deviation
   (MAD) estimator**, a standard robust noise estimator (Donoho 1995, applied to wavelet
   coefficients specifically by Mahdian & Saic for forensic use):
   `σ_block = median(|HH_block - median(HH_block)|) / 0.6745`
   (the constant `0.6745` is the MAD-to-stdev conversion factor for a Gaussian, the same
   normalization used in wavelet denoising literature generally).
5. Compute the page's **dominant** `σ` (mode/median across all blocks — assume most of the page is
   from one process) and flag blocks whose `σ_block` deviates from it by a robust z-score
   (same `1.4826·MAD` formula as §2.1) beyond a threshold, **in either direction** — both
   suspiciously *lower* noise (a cleanly-rendered replacement patch pasted onto a scanned/noisy
   original) and suspiciously *higher* noise (a photographed/re-scanned patch pasted into an
   otherwise clean digital render) are meaningful anomalies here, unlike ELA where only "higher
   error" is the signal.

**Expected output.** A `σ_block` grid (same shape family as §2.1/§2.3's block grids), a flagged
list, and an overlay. Works identically on JPEG, PNG, and rasterized-PDF input — the one technique
in this set with no "not applicable to non-JPEG" caveat.

**Cost.** One Haar pass is `O(width × height)` with a tiny constant (4 additions per 2×2 group);
MAD per block needs a sort of each block's samples (`b² log b²`), trivial at typical block sizes.
Comfortably tens of milliseconds on a normalized page.

**Node sketch:**
```ts
function haarHH(Y: Uint8Array, width: number, height: number): Float32Array {
  const hw = width >> 1, hh = height >> 1;
  const HH = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const i = (2*y)*width + 2*x;
    HH[y*hw+x] = (Y[i] - Y[i+1] - Y[i+width] + Y[i+width+1]) / 2;
  }
  return HH;
}
function blockMAD(vals: number[]): number {
  const sorted = [...vals].sort((a,b)=>a-b);
  const med = sorted[sorted.length >> 1];
  const dev = vals.map(v => Math.abs(v - med)).sort((a,b)=>a-b);
  return dev[dev.length >> 1] / 0.6745;
}
// tile HH into B×B blocks (B=16), compute blockMAD per block -> sigmaBlock[]
// compute page-median sigma + MAD-of-sigma, robust z-score per block, threshold, flag.
```

---

## 3. Priority-ranked upgrade plan

| Rank | Item | Impact on the measured problem | Node/Vercel feasible now? | Approx. added cost |
|---|---|---|---|---|
| **0** | §2.1 Block-level scoring (fix the global-mean/global-scale bug) | **Directly fixes the reported 1.7→4.1 non-separation** — same data already computed, just aggregated correctly | Yes — near-zero new code, reuses the existing diff buffer | ~0ms |
| **1** | §2.6 Noise-residual inconsistency | Works on flat/vector/PNG content with **no JPEG dependency at all** — closes the exact gap the brief describes | Yes | Tens of ms |
| **2** | §2.4 Block Artifact Grid alignment | Geometric, not texture-dependent — the other technique specifically strong on flat content, but JPEG-only | Yes, with the single-pass optimization noted | Low hundreds of ms – low seconds (needs a real perf check) |
| **3** | §2.3 Multi-quality JPEG ghost | Strong general double-compression localizer; JPEG-only | Yes | Sub-second (11-step sweep) |
| **4** | §2.2 DQT extraction | Cheap, deterministic, good provenance signal; global not local; JPEG-only | Yes | Sub-millisecond |
| **5** | §2.5 Copy-move block hashing | Catches a blind spot (duplication) ELA/ghost/BAG can't see at all | Yes, **but needs a perf pass before shipping** (see §2.5 cost note) — the one technique here that's a real engineering task, not a quick add | Low seconds at coarse stride; needs benchmarking on real specimens |
| — | Real ORB/SIFT-grade copy-move (rotation/scale invariant) | Higher recall than §2.5's block-hash version | **No** — needs OpenCV (native binding or Python service) | N/A |
| — | Trained CNN-based forgery classifiers | Highest potential accuracy, but needs labeled training data DocsGuard doesn't have | **No** — needs a Python/ONNX training+inference pipeline | N/A |
| **Skip** | PRNU sensor-noise fingerprinting | Confirmed again this round (`sim-pez/prnu`, §1) — needs a Python denoising runtime **and** a reference-camera image population, and degrades badly under the recompression/rescan DocsGuard's actual documents go through | No, and not recommended even if it were | N/A |

**Items 0-4 (everything except copy-move) are honestly shippable inside `api/_core.ts` as pure
TypeScript/`sharp` code, no new runtime, no new npm dependency, in the same "deterministic signal,
Claude interprets it" pattern the codebase already uses for ELA/metadata/QR.** Item 5 (copy-move)
is feasible in the same stack but is the one item here that needs a dedicated performance pass on
real specimen images before it should run on every scan by default — recommend landing it behind
a flag or as an opt-in "deep scan" pass rather than blocking the main analysis path, consistent
with how `mode: 'dossier'` already exists as a heavier, opt-in second pass
(`api/_core.ts` `AnalyzeInput.mode`).

---

## 4. What needs a separate service — explicitly out of scope for `api/_core.ts`

Confirmed again by this round of research (consistent with `docs/COMPETITIVE_RESEARCH.md §6`):

- **True ORB/SIFT-grade copy-move** (rotation/scale-invariant) — needs OpenCV; no viable pure-JS
  equivalent at that quality. `esimov/forensic`'s DCT-block method (§2.5) is the honest Node-native
  ceiling without OpenCV.
- **Trained deep-learning forgery/splice classifiers** (the CNN branches in
  `CodeRafay/Forensic-Image-Analysis-Toolkit`, `Vinu-1975/Image-Forgery-Localization`, and the
  academic double-JPEG CNN work found this round) — needs training data DocsGuard doesn't have and
  a GPU-friendly runtime Vercel Node functions don't provide.
- **PRNU** — explicitly not recommended at all for this document type (see table above), not
  merely deferred for runtime reasons.

None of these should be represented in the UI/roadmap as "coming soon in the current stack" —
they are real capabilities that would need a genuinely separate inference service (the same
honest line drawn in the prior research document).

---

## 5. Integration shape (how this slots into the existing report)

All six techniques above produce the same two output shapes DocsGuard's report schema already
has room for, so no schema change is needed:
- A **page-level fact** (§2.2 DQT, and the `concern` boolean from any of the others) →
  `TechnicalSignal { label, value, concern }` — the "VERIFIED TECHNICAL METADATA" block
  (`api/_core.ts:513-515`) that's already presented to Claude as "extracted deterministically in
  code — trust these facts."
- A **region-level anomaly with a bounding box** (any flagged block from §2.1/§2.3/§2.4/§2.5/§2.6)
  → maps directly onto `VisualMarker { label, severity, box }` (`types.ts:30-34`), the exact same
  normalized `[ymin,xmin,ymax,xmax]` shape Claude's own evidence markers already use — meaning
  code-computed anomalies and Claude-observed anomalies render through one existing UI component,
  not two.
- The existing honesty contract carries over unchanged: **a flagged block is a signal for Claude
  to reason over alongside the rest of the evidence, not a standalone verdict** — exactly how ELA
  is described today (`api/_core.ts:232`, "Treat ELA as supporting evidence, not proof"). None of
  these techniques should be wired to auto-fail a document; they should be wired to feed better,
  spatially-localized evidence into the same reasoning step that already happens.

---

## Top 5 recommendations

1. **Fix the aggregation, not (only) the algorithm, first (§2.1).** The measured 1.7→4.1 failure
   is substantially a global-mean/global-contrast-scale dilution bug in existing code, not proof
   ELA itself is unsalvageable — re-score the *already-computed* ELA diff buffer per 16×16 block
   with a robust (median/MAD) z-score instead of one page-wide mean, and the specimen's local
   signal will very likely separate cleanly without writing a single new forensic technique.
   Near-zero cost, ship this immediately.
2. **Add noise-residual inconsistency (§2.6) as the primary new technique for flat/vector
   documents.** It's the only one of the five requested techniques with zero dependence on JPEG
   compression history, which makes it the direct, honest answer to "ELA is weak on flat,
   vector-rendered documents" — it measures rendering/scan texture instead of compression error.
3. **Add Block Artifact Grid alignment (§2.4) as the second new technique.** It's the only other
   technique here that's geometry-based rather than texture/error-magnitude-based, so it's
   likewise strong on low-detail content — but it only fires on JPEG-origin images, so it's
   complementary to, not a replacement for, item 2.
4. **Add multi-quality JPEG ghost (§2.3) and DQT extraction (§2.2) together** as the pair that
   handles JPEG-specific provenance and localization — DQT gives a cheap, always-on global fact
   ("what produced this file"); ghost analysis gives the localized double-compression map the
   brief specifically asked for. Both are inexpensive and clearly Node/`sharp`-feasible.
5. **Treat copy-move block hashing (§2.5) as a scoped follow-up, not part of this batch.** The
   technique is real and closes a genuine blind spot (duplication invisible to every other check
   here), and `esimov/forensic` (MIT, Go) is a solid, legally-clean *reference* for the algorithm
   — but it's the one item that needs an actual performance benchmark on real specimen documents
   before it's safe to run on every scan; ship it as an opt-in deep-scan pass, not blocking the
   default analysis path, and revisit true OpenCV/ORB-grade detection only if the coarse Node
   version's false-negative rate turns out to matter in practice.

---

## Sources

<a id="s1"></a>[1] [github.com/esimov/forensic](https://github.com/esimov/forensic) — README + `gh api repos/esimov/forensic` (license: MIT, Go, 145★); underlying method: [arxiv.org/pdf/1308.5661](https://arxiv.org/pdf/1308.5661)

<a id="s2"></a>[2] [github.com/CodeRafay/Forensic-Image-Analysis-Toolkit](https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit) — `gh api repos/CodeRafay/Forensic-Image-Analysis-Toolkit` (license: BSD-3-Clause, Python, 14★)

<a id="s3"></a>[3] [github.com/kalinkinisaac/auto-forgery-detection](https://github.com/kalinkinisaac/auto-forgery-detection) (license: MIT, Python, 12★) implementing Zach/Riess/Angelopoulou, "Automated Image Forgery Detection through Classification of JPEG Ghosts": [faui1-files.cs.fau.de/public/publications/mmsec/2012-Zach-AIF.pdf](https://faui1-files.cs.fau.de/public/publications/mmsec/2012-Zach-AIF.pdf), also [researchgate.net/publication/290737715](https://www.researchgate.net/publication/290737715_Automated_Image_Forgery_Detection_through_Classification_of_JPEG_Ghosts)

<a id="s4"></a>[4] [github.com/tinankh/GOD](https://github.com/tinankh/GOD) — `gh api repos/tinankh/GOD` (license: AGPL-3.0, C, 11★); method described in-repo as "Local JPEG Grid Detector via Blocking Artifacts" (Grompone von Gioi & Nikoukhah), IPOL online demo: [ipolcore.ipol.im/demo/clientApp/demo.html?id=283](https://ipolcore.ipol.im/demo/clientApp/demo.html?id=283)

<a id="s5"></a>[5] [github.com/jpeg-js/jpeg-js](https://github.com/jpeg-js/jpeg-js) — `gh api repos/jpeg-js/jpeg-js` (GitHub reports `license: NOASSERTION`; LICENSE file content read directly via `gh api repos/jpeg-js/jpeg-js/contents/LICENSE` confirms a standard 3-clause BSD grant, JavaScript, 588★) — used here only as a marker-format cross-check, not as a dependency

<a id="s6"></a>[6] DFRWS 2008, "Using JPEG Quantization Tables to Identify Imagery Processed by Software": [dfrws.org/sites/default/files/session-files/2008_USA_paper-using_jpeg_quantization_tables_to_identify_imagery_processed_by_software.pdf](https://dfrws.org/sites/default/files/session-files/2008_USA_paper-using_jpeg_quantization_tables_to_identify_imagery_processed_by_software.pdf), also [researchgate.net/publication/228956264](https://www.researchgate.net/publication/228956264_Using_JPEG_quantization_tables_to_identify_imagery_processed_by_software)

<a id="s7"></a>[7] [jpegsnoop.com](https://jpegsnoop.com/) — quantization-table/encoder signature-database approach (product documentation, referenced for the general technique, not vendored)

<a id="s8"></a>[8] H. Farid, "Exposing Digital Forgeries from JPEG Ghosts," IEEE TIFS 2009 — summarized via [researchgate.net/publication/224379976](https://www.researchgate.net/publication/224379976_Exposing_digital_forgeries_from_JPEG_ghosts) and the GIMP Forensics wiki's plain-language walkthrough: [sourceforge.net/p/gimp-forensics/wiki/JPEG%20Ghost](https://sourceforge.net/p/gimp-forensics/wiki/JPEG%20Ghost/)

<a id="s9"></a>[9] "A Generalized Ghost Detection and Segmentation Method for Double-JPEG Compression": [pmc.ncbi.nlm.nih.gov/articles/PMC6839440](https://pmc.ncbi.nlm.nih.gov/articles/PMC6839440/)

<a id="s10"></a>[10] GIMP Forensics JPEG Ghost visualization (red→green→blue gradient description): [sourceforge.net/p/gimp-forensics/wiki/JPEG%20Ghost](https://sourceforge.net/p/gimp-forensics/wiki/JPEG%20Ghost/)

<a id="s11"></a>[11] Local JPEG grid / blocking-artifact detection, general method background used for §2.4's independent reimplementation (not the AGPL code itself): see [4] above, plus [link.springer.com/article/10.1007/s11042-016-4290-5](https://link.springer.com/article/10.1007/s11042-016-4290-5) for the related double-compression detection framing

<a id="s12"></a>[12] DCT-based block-feature copy-move method underlying `esimov/forensic` (§1): [arxiv.org/pdf/1308.5661](https://arxiv.org/pdf/1308.5661); broader copy-move literature: [dl.acm.org/doi/10.1007/s11042-014-2431-2](https://dl.acm.org/doi/10.1007/s11042-014-2431-2) (scaled-ORB copy-move), [ietresearch.onlinelibrary.wiley.com/doi/10.1049/iet-ipr.2019.1145](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/iet-ipr.2019.1145) (ORB + similarity metric)

<a id="s13"></a>[13] B. Mahdian, S. Saic, "Using Noise Inconsistencies for Blind Image Forensics," 2009 — summarized via [link.springer.com/content/pdf/10.1007/s11042-016-3660-3.pdf](https://link.springer.com/content/pdf/10.1007/s11042-016-3660-3.pdf) and [yaoheng.info/Papers/2017%20MTAP.pdf](http://yaoheng.info/Papers/2017%20MTAP.pdf)

<a id="s14"></a>[14] X. Pan, X. Zhang, S. Lyu, "Exposing Image Splicing with Inconsistent Local Noise Variances," referenced via the same survey sources as [13]; PRNU comparison/limits: [github.com/sim-pez/prnu](https://github.com/sim-pez/prnu) (license: MIT, Python, 23★) confirms the Python-runtime + reference-image-population requirement cited in §1/§4

**GitHub search methodology**: `gh api search/repositories` (GitHub CLI, authenticated in this
environment) with queries `copy-move+forgery+detection`, `jpeg+ghost+forgery`, `error+level
+analysis+forgery`, `double+jpeg+compression+detection`, `block+artifact+grid+jpeg`,
`PRNU+camera+fingerprint`, `document+forgery+detection`, each sorted by stars; every license shown
above was independently re-verified with a direct `gh api repos/<owner>/<repo>` call rather than
trusted from search-result metadata alone.

**DocsGuard codebase (for accuracy of "current implementation" claims)**: `api/_core.ts:552-599`
(`imageForensics()` — the single-pass q=90 ELA implementation this document is upgrading),
`api/_core.ts:65-74` (`Signal`/`ExtraImage` types), `api/_core.ts:513-515` ("VERIFIED TECHNICAL
METADATA" pattern), `types.ts:13-34` (`ConsistencyCheck`, `TechnicalSignal`, `VisualMarker`
report-schema types this document's outputs slot into), `docs/COMPETITIVE_RESEARCH.md §5.3`
(the prior research this document refines/corrects on the DQT-locality point, §2.2).
