/**
 * Dedicated image-forensics module — block-level ELA, multi-quality JPEG ghost
 * analysis, DQT/encoder fingerprinting, and a localized colour-ramp heatmap.
 *
 * This replaces the previous single-quality, global-mean ELA in api/_core.ts.
 * Rationale, algorithm detail, GitHub/literature research and honest cost
 * tradeoffs for every technique below are written up in docs/FORENSICS_UPGRADES.md
 * — this file implements that document's §2.1–§2.2/§2.3 recommendations
 * (block-level scoring, JPEG ghost, DQT extraction) plus the improved heatmap
 * from its §3 rank-0/3/4 priorities, using only sharp + plain byte parsing
 * (no new npm dependency).
 *
 * Every technique below is independently best-effort: a failure in one step
 * (corrupt bytes, an unusual codec, a too-small image) is caught locally and
 * turns into an honest "could not measure this" signal — it never throws out
 * of `runImageForensics` and never blocks the other techniques or the heatmap.
 * Every step — including "found nothing" — adds a TechnicalSignal so the
 * report's honesty contract ("VERIFIED TECHNICAL METADATA — trust these
 * facts") is never silently short of a fact it claims to have checked.
 */

import sharp from 'sharp';

export interface ForensicsSignal {
  label: string;
  value: string;
  concern: boolean;
}

export interface ForensicsFinding {
  label: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  /** [ymin, xmin, ymax, xmax], normalized 0-1000, origin top-left — same convention as VisualMarker. */
  box: [number, number, number, number];
}

export interface ImageForensicsResult {
  signals: ForensicsSignal[];
  /** Base64-encoded PNG (no `data:` prefix), or null if the heatmap could not be produced at all. */
  heatmapPng: string | null;
  findings: ForensicsFinding[];
}

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------

/** Block-level ELA tiles on the native JPEG 8x8 DCT grid — small enough to localize
 *  a serial-number-sized edit, matching the DCT block size itself. */
const ELA_BLOCK = 8;
/** JPEG-ghost blocks — coarser than the ELA grid since each block needs to survive
 *  an 8-quality resave sweep without becoming noise-dominated. */
const GHOST_BLOCK = 16;
const GHOST_QUALITIES = [60, 65, 70, 75, 80, 85, 90, 95];
/** Luma above which a block is treated as blank page background and excluded from
 *  the robust baseline statistics (and never flagged) — see docs/FORENSICS_UPGRADES.md §2.1. */
const NEAR_WHITE_LUMA = 248;
const Z_FLAG_THRESHOLD = 3.5;
const TOP_N_ELA_BLOCKS = 12;
const TOP_N_GHOST_BLOCKS = 8;

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

// Standard IJG/ITU-T T.81 Annex K.1 base quantization tables (quality-50 baseline,
// natural row-major order). Used only to *estimate* the effective quality of a
// table pulled from an unknown file by inverting libjpeg's own scaling formula —
// not a fingerprint database, just the documented closed-form relationship.
const BASE_LUMA_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const BASE_CHROMA_TABLE = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

/** Known editor/tool signatures worth flagging when found in JPEG APPn/COM text —
 *  same signature family already used for the EXIF-software check in api/_core.ts. */
const EDITOR_SIGNATURE = /adobe|photoshop|gimp|canva|illustrator|affinity|snapseed|pixlr|lightroom|paint\.net|inkscape|whatsapp/i;

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

export async function runImageForensics(buf: Buffer): Promise<ImageForensicsResult> {
  const signals: ForensicsSignal[] = [];
  const findings: ForensicsFinding[] = [];
  let heatmapPng: string | null = null;

  // Normalize once to a manageable, EXIF-rotated size; every pixel-domain step
  // below reuses this buffer, same footprint as the previous single-pass ELA.
  let base: Buffer, width = 0, height = 0;
  try {
    const norm = await sharp(buf)
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    base = norm.data;
    width = norm.info.width;
    height = norm.info.height;
  } catch {
    signals.push({ label: 'Image forensics', value: 'Could not decode this image for pixel-level analysis', concern: false });
    return { signals, heatmapPng, findings };
  }

  // Shared raw RGB buffer of the normalized page (every forensic technique reuses this).
  let rawBase: { data: Buffer; info: { width: number; height: number; channels: number } } | null = null;
  try {
    rawBase = await sharp(base).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    /* individual steps below each guard against rawBase being null */
  }

  // -------------------------------------------------------------------------
  // 1. Block-level ELA — the §2.1 fix: same q=90 diff buffer as before, but
  //    scored per 8x8 block with a robust (median/MAD) z-score instead of one
  //    page-wide mean, so a small tampered patch can't be diluted away.
  // -------------------------------------------------------------------------
  let elaZGrid: { z: Float64Array; bw: number; bh: number; w: number; h: number } | null = null;
  try {
    if (!rawBase) throw new Error('no raw pixel buffer');
    const w = rawBase.info.width, h = rawBase.info.height;
    const resaved = await sharp(base).jpeg({ quality: 90 }).toBuffer();
    const resavedRaw = await sharp(resaved).removeAlpha().resize(w, h).raw().toBuffer();
    const n = Math.min(rawBase.data.length, resavedRaw.length);

    const bw = Math.ceil(w / ELA_BLOCK), bh = Math.ceil(h / ELA_BLOCK);
    const blockErrSum = new Float64Array(bw * bh);
    const blockLumaSum = new Float64Array(bw * bh);
    const blockCount = new Int32Array(bw * bh);

    for (let y = 0; y < h; y++) {
      const by = (y / ELA_BLOCK) | 0;
      for (let x = 0; x < w; x++) {
        const bx = (x / ELA_BLOCK) | 0;
        const idx = by * bw + bx;
        const i = (y * w + x) * 3;
        if (i + 2 >= n) continue;
        const d = (Math.abs(rawBase.data[i] - resavedRaw[i]) + Math.abs(rawBase.data[i + 1] - resavedRaw[i + 1]) + Math.abs(rawBase.data[i + 2] - resavedRaw[i + 2])) / 3;
        const lum = (rawBase.data[i] + rawBase.data[i + 1] + rawBase.data[i + 2]) / 3;
        blockErrSum[idx] += d;
        blockLumaSum[idx] += lum;
        blockCount[idx]++;
      }
    }

    const blockMean = new Float64Array(bw * bh);
    const blockLuma = new Float64Array(bw * bh);
    for (let i = 0; i < blockMean.length; i++) {
      blockMean[i] = blockCount[i] ? blockErrSum[i] / blockCount[i] : 0;
      blockLuma[i] = blockCount[i] ? blockLumaSum[i] / blockCount[i] : 255;
    }

    // Robust baseline over content blocks only — near-white (blank page) blocks
    // are excluded so a page that's mostly blank margin doesn't collapse the
    // MAD to near-zero and make every real block of text look "anomalous."
    let sampleIdx: number[] = [];
    for (let i = 0; i < blockMean.length; i++) if (blockLuma[i] < NEAR_WHITE_LUMA) sampleIdx.push(i);
    const usedFallback = sampleIdx.length < 8;
    if (usedFallback) sampleIdx = Array.from(blockMean.keys());

    const sortedVals = sampleIdx.map((i) => blockMean[i]).sort((a, b) => a - b);
    const median = sortedVals[sortedVals.length >> 1] ?? 0;
    const madVals = sampleIdx.map((i) => Math.abs(blockMean[i] - median)).sort((a, b) => a - b);
    const mad = madVals[madVals.length >> 1] ?? 0;
    // On real documents a large share of content blocks legitimately re-encode with
    // ZERO error at q=90 (flat fills, solid rules), which collapses MAD to exactly 0.
    // A near-zero epsilon there turns any single-digit error into a z-score in the
    // millions — not a real anomaly, a division-by-near-zero artifact. Floor sigma at
    // a value that represents genuine byte-level noise (diff values are 0-255 integers
    // averaged per block) so the z-score stays a meaningful multiple of real variation.
    const robustSigma = Math.max(1.4826 * mad, 0.75);

    const z = new Float64Array(blockMean.length);
    const includedSet = new Set(sampleIdx);
    const flagged: { idx: number; z: number }[] = [];
    let maxZ = 0;
    for (let i = 0; i < blockMean.length; i++) {
      const zi = (blockMean[i] - median) / robustSigma;
      z[i] = zi;
      if (!includedSet.has(i)) continue; // near-white background — never flagged
      if (zi > maxZ) maxZ = zi;
      if (zi > Z_FLAG_THRESHOLD) flagged.push({ idx: i, z: zi });
    }
    flagged.sort((a, b) => b.z - a.z);
    const top = flagged.slice(0, TOP_N_ELA_BLOCKS);
    for (const f of top) {
      const bx = f.idx % bw, by = (f.idx / bw) | 0;
      findings.push({
        label: `Block-level ELA anomaly (z=${f.z.toFixed(1)})`,
        severity: f.z >= 6 ? 'High' : 'Medium',
        box: boxFromBlock(bx, by, ELA_BLOCK, w, h),
      });
    }

    signals.push({
      label: 'ELA tamper analysis (block-level, 8x8 grid)',
      value: flagged.length
        ? `${flagged.length} of ${sampleIdx.length} scored block(s) exceed the z=${Z_FLAG_THRESHOLD} anomaly threshold (max z=${maxZ.toFixed(1)}) — top ${top.length} localized on the heatmap and findings`
        : `No block exceeded the z=${Z_FLAG_THRESHOLD} anomaly threshold across ${sampleIdx.length} scored block(s) (max z=${maxZ.toFixed(1)})${usedFallback ? ' — page had too little non-blank content for the near-white exclusion, so all blocks were scored' : ''}`,
      concern: flagged.length > 0,
    });

    elaZGrid = { z, bw, bh, w, h };
  } catch {
    signals.push({ label: 'ELA tamper analysis (block-level, 8x8 grid)', value: 'Could not compute — image could not be re-encoded for comparison', concern: false });
  }

  // -------------------------------------------------------------------------
  // 2. Multi-quality JPEG ghost — sweeps qualities 60..95 step 5, and for each
  //    16px block finds the quality at which ITS error is minimized. A block
  //    whose minimizing quality diverges from the page's modal quality carries
  //    a different compression history than its surroundings (splice signal).
  // -------------------------------------------------------------------------
  try {
    if (!rawBase) throw new Error('no raw pixel buffer');
    const w = rawBase.info.width, h = rawBase.info.height;
    const bw = Math.ceil(w / GHOST_BLOCK), bh = Math.ceil(h / GHOST_BLOCK);
    const D: Float64Array[] = [];
    let blockPixelCount: Int32Array | null = null;

    for (const q of GHOST_QUALITIES) {
      const resaved = await sharp(base).jpeg({ quality: q }).toBuffer();
      const resavedRaw = await sharp(resaved).removeAlpha().resize(w, h).raw().toBuffer();
      const n = Math.min(rawBase.data.length, resavedRaw.length);
      const blockSum = new Float64Array(bw * bh);
      const blockCount = new Int32Array(bw * bh);
      for (let y = 0; y < h; y++) {
        const by = (y / GHOST_BLOCK) | 0;
        for (let x = 0; x < w; x++) {
          const bx = (x / GHOST_BLOCK) | 0, idx = by * bw + bx;
          const i = (y * w + x) * 3;
          if (i + 2 >= n) continue;
          const dr = rawBase.data[i] - resavedRaw[i], dg = rawBase.data[i + 1] - resavedRaw[i + 1], db = rawBase.data[i + 2] - resavedRaw[i + 2];
          blockSum[idx] += dr * dr + dg * dg + db * db;
          blockCount[idx]++;
        }
      }
      const avg = new Float64Array(bw * bh);
      for (let i = 0; i < avg.length; i++) avg[i] = blockCount[i] ? blockSum[i] / blockCount[i] : 0;
      D.push(avg);
      blockPixelCount = blockCount; // identical pixel grid every quality pass — last write is fine
    }

    // A block's own peak per-pixel squared error across the whole sweep — used to
    // gate out blocks with essentially no compression signal at all (flat fills,
    // page margins). Their argmin-quality is pure noise, not a real "best fit,"
    // so including them would flood the modal vote and the flagged count with
    // meaningless disagreement — exactly the false-positive mode the block-grid
    // technique in docs/FORENSICS_UPGRADES.md §2.4 warns "confidence" guards against.
    const MIN_ENERGY_PER_PIXEL = 15; // sum of squared per-channel diff, 3 channels
    const qStar = new Int16Array(bw * bh);
    const hasSignal = new Uint8Array(bw * bh);
    for (let blk = 0; blk < bw * bh; blk++) {
      let maxV = 1e-9;
      for (let qi = 0; qi < D.length; qi++) maxV = Math.max(maxV, D[qi][blk]);
      const pixCount = blockPixelCount ? blockPixelCount[blk] : 0;
      hasSignal[blk] = pixCount > 0 && maxV / pixCount >= MIN_ENERGY_PER_PIXEL ? 1 : 0;
      let bestQi = 0, bestV = Infinity;
      for (let qi = 0; qi < D.length; qi++) {
        const v = D[qi][blk] / maxV;
        if (v < bestV) { bestV = v; bestQi = qi; }
      }
      qStar[blk] = GHOST_QUALITIES[bestQi];
    }

    const votingBlocks: number[] = [];
    for (let i = 0; i < qStar.length; i++) if (hasSignal[i]) votingBlocks.push(i);
    const counts = new Map<number, number>();
    for (const i of votingBlocks) counts.set(qStar[i], (counts.get(qStar[i]) ?? 0) + 1);
    const modalEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const modalQ = modalEntry ? modalEntry[0] : GHOST_QUALITIES[GHOST_QUALITIES.length - 1];

    const flaggedIdx = votingBlocks.filter((i) => Math.abs(qStar[i] - modalQ) > 5);
    flaggedIdx.sort((a, b) => Math.abs(qStar[b] - modalQ) - Math.abs(qStar[a] - modalQ));
    const top = flaggedIdx.slice(0, TOP_N_GHOST_BLOCKS);
    for (const idx of top) {
      const bx = idx % bw, by = (idx / bw) | 0;
      const deltaQ = Math.abs(qStar[idx] - modalQ);
      findings.push({
        label: `JPEG ghost: block resaves best at q${qStar[idx]} vs page mode q${modalQ}`,
        severity: deltaQ >= 15 ? 'High' : 'Medium',
        box: boxFromBlock(bx, by, GHOST_BLOCK, w, h),
      });
    }

    signals.push({
      label: 'JPEG ghost (double-compression) analysis',
      value: flaggedIdx.length
        ? `Page's dominant resave quality ≈ q${modalQ} (from ${votingBlocks.length} block(s) with a measurable compression signal, of ${bw * bh} total); ${flaggedIdx.length} block(s) minimize error at a markedly different quality — possible splice/paste region(s), top ${top.length} localized`
        : votingBlocks.length
          ? `Resave quality is consistent across all ${votingBlocks.length} block(s) with a measurable compression signal (≈ q${modalQ}) — no localized double-compression signature found`
          : `Page had no blocks with enough compression signal to compare quality-fit across the sweep (too flat/uniform for this technique)`,
      concern: flaggedIdx.length > 0,
    });
  } catch {
    signals.push({ label: 'JPEG ghost (double-compression) analysis', value: 'Could not complete the multi-quality resave sweep for this image', concern: false });
  }

  // -------------------------------------------------------------------------
  // 3. DQT / encoder fingerprint — byte-parsed straight from the ORIGINAL
  //    uploaded bytes (before any sharp resave, which would destroy the
  //    original encoder's own table). Purely a header read: works even when
  //    the pixel-domain techniques above fail, and is the one technique here
  //    that costs nothing to compute.
  // -------------------------------------------------------------------------
  try {
    const parsed = parseJpegHeader(buf);
    if (!parsed) {
      signals.push({ label: 'DQT / encoder fingerprint', value: 'Not applicable — file is not JPEG-encoded (no DQT header present)', concern: false });
    } else if (parsed.tables.length === 0) {
      signals.push({ label: 'DQT / encoder fingerprint', value: 'JPEG header parsed but no DQT segment found (unusual for a baseline JPEG)', concern: true });
    } else {
      const editorMatch = parsed.appTexts.find((t) => EDITOR_SIGNATURE.test(t));
      const estimates = parsed.tables.map((t) => ({ table: t, est: estimateQuality(t.values, t.tableId) }));
      const worstErr = Math.max(...estimates.map((e) => e.est.error));
      const summary = estimates
        .map((e) => `table ${e.table.tableId} (${e.table.precision}-bit) ≈ IJG q${e.est.quality}`)
        .join(', ');
      const concern = worstErr > 8 || Boolean(editorMatch);
      const encoderNote = editorMatch
        ? ` — APP marker text matches a known editor signature ("${editorMatch.slice(0, 40)}")`
        : worstErr > 8
          ? ' — quantization values deviate from the standard IJG scaling curve (non-standard encoder or heavily post-processed)'
          : ' — consistent with a standard single-pass IJG-family encoder';
      signals.push({
        label: 'DQT / encoder fingerprint',
        value: `${summary}${encoderNote}`,
        concern,
      });
    }
  } catch {
    signals.push({ label: 'DQT / encoder fingerprint', value: 'Could not parse JPEG header for quantization tables', concern: false });
  }

  // -------------------------------------------------------------------------
  // 4. Heatmap — per-block z-score normalized, calm blue → amber → red ramp,
  //    faint block-boundary gridlines so a reviewer can see WHERE the
  //    anomaly sits instead of one flat-contrast diff image.
  // -------------------------------------------------------------------------
  if (elaZGrid && rawBase) {
    try {
      heatmapPng = await renderHeatmap(rawBase.data, elaZGrid.w, elaZGrid.h, elaZGrid.z, elaZGrid.bw, elaZGrid.bh, ELA_BLOCK);
    } catch {
      signals.push({ label: 'ELA heatmap render', value: 'Block scores were computed but the heatmap image itself could not be rendered', concern: false });
    }
  }

  return { signals, heatmapPng, findings };
}

// ----------------------------------------------------------------------------
// Heatmap rendering
// ----------------------------------------------------------------------------

/** Calm blue -> amber -> red, for increasing anomaly (t in [0,1]). */
function colorRamp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [37, 99, 235]], // calm blue
    [0.5, [245, 158, 11]], // amber
    [1, [239, 68, 68]], // red
  ];
  const c = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (c >= t0 && c <= t1) {
      const f = t1 > t0 ? (c - t0) / (t1 - t0) : 0;
      return [Math.round(c0[0] + (c1[0] - c0[0]) * f), Math.round(c0[1] + (c1[1] - c0[1]) * f), Math.round(c0[2] + (c1[2] - c0[2]) * f)];
    }
  }
  return stops[stops.length - 1][1];
}

function clampByte(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

async function renderHeatmap(
  rawData: Buffer,
  width: number,
  height: number,
  z: Float64Array,
  bw: number,
  bh: number,
  blockSize: number,
): Promise<string> {
  const out = Buffer.alloc(width * height * 3);
  const Z_COLOR_DOMAIN = 6; // z=6+ saturates to full red

  for (let y = 0; y < height; y++) {
    const by = Math.min(bh - 1, (y / blockSize) | 0);
    for (let x = 0; x < width; x++) {
      const bx = Math.min(bw - 1, (x / blockSize) | 0);
      const zi = z[by * bw + bx];
      const t = Math.max(0, Math.min(1, zi / Z_COLOR_DOMAIN));
      const i = (y * width + x) * 3;
      const lum = (rawData[i] + rawData[i + 1] + rawData[i + 2]) / 3;
      const dim = lum * 0.55 + 255 * 0.12; // dimmed grayscale of the page as context
      const [cr, cg, cb] = colorRamp(t);
      const alpha = 0.12 + 0.6 * t; // near-zero anomaly stays mostly the plain page
      const oi = i;
      out[oi] = clampByte(dim * (1 - alpha) + cr * alpha);
      out[oi + 1] = clampByte(dim * (1 - alpha) + cg * alpha);
      out[oi + 2] = clampByte(dim * (1 - alpha) + cb * alpha);
    }
  }

  // Faint block-boundary gridlines so a reviewer can see exactly where the
  // scoring blocks sit, not just the colour.
  const boundaryDelta = 22;
  for (let x = 0; x < width; x += blockSize) {
    for (let y = 0; y < height; y++) {
      const oi = (y * width + x) * 3;
      out[oi] = clampByte(out[oi] - boundaryDelta);
      out[oi + 1] = clampByte(out[oi + 1] - boundaryDelta);
      out[oi + 2] = clampByte(out[oi + 2] - boundaryDelta);
    }
  }
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x++) {
      const oi = (y * width + x) * 3;
      out[oi] = clampByte(out[oi] - boundaryDelta);
      out[oi + 1] = clampByte(out[oi + 1] - boundaryDelta);
      out[oi + 2] = clampByte(out[oi + 2] - boundaryDelta);
    }
  }

  const png = await sharp(out, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 8 }).toBuffer();
  return png.toString('base64');
}

// ----------------------------------------------------------------------------
// Byte-level JPEG marker parsing — DQT + APPn/COM text, ITU-T T.81 §B.2.4.1
// ----------------------------------------------------------------------------

interface DqtTable { tableId: number; precision: 8 | 16; values: number[] }

function parseJpegHeader(buf: Buffer): { tables: DqtTable[]; appTexts: string[] } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not a JPEG (SOI missing)

  const tables: DqtTable[] = [];
  const appTexts: string[] = [];
  let p = 2;

  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) { p++; continue; } // resync on corrupt stream
    const marker = buf[p + 1];
    if (marker === 0xff) { p++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) break; // EOI
      p += 2;
      continue;
    }
    if (p + 4 > buf.length) break;
    const len = buf.readUInt16BE(p + 2);
    if (len < 2 || p + 2 + len > buf.length) break; // corrupt segment length — stop parsing safely
    const segStart = p + 4, segEnd = p + 2 + len;

    if (marker === 0xda) break; // SOS — everything needed is always before this for baseline JPEG

    if (marker === 0xdb) {
      let q = segStart;
      while (q < segEnd) {
        const pq = buf[q] >> 4, tq = buf[q] & 0x0f;
        q++;
        const precision: 8 | 16 = pq === 0 ? 8 : 16;
        const nat = new Array<number>(64).fill(0);
        let ok = true;
        for (let i = 0; i < 64; i++) {
          if (precision === 8) {
            if (q >= segEnd) { ok = false; break; }
            nat[ZIGZAG[i]] = buf[q++];
          } else {
            if (q + 2 > segEnd) { ok = false; break; }
            nat[ZIGZAG[i]] = buf.readUInt16BE(q);
            q += 2;
          }
        }
        if (!ok) break;
        tables.push({ tableId: tq, precision, values: nat });
      }
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // APPn or COM — pull out printable ASCII for an encoder signature scan.
      let text = '';
      for (let i = segStart; i < segEnd && i < buf.length; i++) {
        const c = buf[i];
        text += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : ' ';
      }
      const trimmed = text.trim();
      if (trimmed) appTexts.push(trimmed);
    }

    p += 2 + len;
  }

  return { tables, appTexts };
}

/** Inverts libjpeg's own quality->table scaling formula (ITU-T T.81, same closed
 *  form IJG uses to derive a table from a quality number) to estimate which
 *  quality produced an observed table, and how well it actually fits that curve. */
function estimateQuality(observed: number[], tableId: number): { quality: number; error: number } {
  const base = tableId === 0 ? BASE_LUMA_TABLE : BASE_CHROMA_TABLE;
  let bestQ = 50, bestErr = Infinity;
  for (let q = 1; q <= 100; q++) {
    const scale = q < 50 ? 5000 / q : 200 - 2 * q;
    let err = 0;
    for (let i = 0; i < 64; i++) {
      const pred = Math.min(255, Math.max(1, Math.round((base[i] * scale) / 100)));
      err += Math.abs(pred - observed[i]);
    }
    if (err < bestErr) { bestErr = err; bestQ = q; }
  }
  return { quality: bestQ, error: bestErr / 64 };
}

function boxFromBlock(bx: number, by: number, blockSize: number, width: number, height: number): [number, number, number, number] {
  const x0 = bx * blockSize, y0 = by * blockSize;
  const x1 = Math.min(width, x0 + blockSize), y1 = Math.min(height, y0 + blockSize);
  return [
    Math.round((y0 / height) * 1000),
    Math.round((x0 / width) * 1000),
    Math.round((y1 / height) * 1000),
    Math.round((x1 / width) * 1000),
  ];
}
