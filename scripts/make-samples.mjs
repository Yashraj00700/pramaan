#!/usr/bin/env node
/**
 * make-samples.mjs
 * ------------------------------------------------------------------------
 * Generates two synthetic, unmistakably FICTIONAL test documents for
 * exercising the Pramaan forensic pipeline end-to-end:
 *
 *   samples/genuine-income-certificate.jpg   - a clean, single-pass JPEG
 *   samples/tampered-income-certificate.jpg  - the SAME base document with
 *                                               two fields digitally edited
 *                                               and re-saved at a different
 *                                               JPEG quality, so the edit
 *                                               carries a distinct
 *                                               compression history.
 *
 * No real government names, seals, emblems or logos are used anywhere.
 * Every page carries a visible "SPECIMEN — DEMO ONLY" watermark plus a
 * footer disclaimer. These files must never be presented as real documents.
 *
 * Uses only the already-installed `sharp` package (SVG rasterization +
 * JPEG re-encoding) - no new dependencies.
 * ------------------------------------------------------------------------
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'samples');

const WIDTH = 1240;
const HEIGHT = 1754; // ~A4 portrait at 150dpi

// ---------------------------------------------------------------------
// Shared field values. The genuine and tampered documents share every
// field EXCEPT the two that a fraudster would realistically edit:
// the declared annual income figure, and one digit of the certificate
// serial number. The spelled-out "words" line is deliberately left
// untouched in the tampered copy, so it still reads "Two Lakh Forty-Five
// Thousand" next to a numeral that now says "96,500" - a numeral-vs-words
// contradiction Pramaan's typography/content modules should also catch.
// ---------------------------------------------------------------------
const SERIAL_GENUINE = 'MD/NVP/IC/2025/048213';
const SERIAL_TAMPERED = 'MD/NVP/IC/2025/048219'; // last digit 3 -> 9

const AMOUNT_GENUINE = 'Rs. 2,45,000/-';
const AMOUNT_TAMPERED = 'Rs. 96,500/-';
const AMOUNT_WORDS = '(Rupees Two Lakh Forty-Five Thousand Only)';

// Geometry shared between the base document and the tamper patches so the
// edits land exactly on top of the original fields.
const SERIAL_LABEL_X = 110;
const SERIAL_VALUE_X = 300;
const SERIAL_Y = 460;
const SERIAL_PATCH = { x: 294, y: 442, w: 260, h: 26 };

const AMOUNT_BOX = { x: 110, y: 656, w: 1020, h: 76 };
const AMOUNT_CENTER_X = 620;
const AMOUNT_Y = 707;
const AMOUNT_PATCH = { x: 430, y: 682, w: 380, h: 38 };

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------
// Watermark tile, shared by both documents.
// ---------------------------------------------------------------------
function watermarkGroup() {
  const lines = [];
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * 420 - 100;
      const y = row * 240 + 60;
      lines.push(
        `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#1a2b4c" fill-opacity="0.085" letter-spacing="3">SPECIMEN — DEMO ONLY</text>`
      );
    }
  }
  return `<g transform="rotate(-30 ${WIDTH / 2} ${HEIGHT / 2})">${lines.join('')}</g>`;
}

// ---------------------------------------------------------------------
// The fictional round seal + cursive signature squiggle.
// ---------------------------------------------------------------------
function sealAndSignature() {
  return `
    <g transform="rotate(-6 950 1010)">
      <circle cx="950" cy="1010" r="66" fill="none" stroke="#a3282f" stroke-width="2.5"/>
      <circle cx="950" cy="1010" r="53" fill="none" stroke="#a3282f" stroke-width="1"/>
      <text x="950" y="988" text-anchor="middle" font-family="Georgia, serif" font-size="12" font-weight="700" fill="#a3282f" letter-spacing="2">OFFICE OF THE SDM</text>
      <text x="950" y="1016" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="700" fill="#a3282f">SPECIMEN</text>
      <text x="950" y="1036" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#a3282f" letter-spacing="2">NAVAPUR * MADHYADESH</text>
    </g>
    <path d="M 800 1045 C 830 1015, 850 1065, 875 1030 S 915 1000, 935 1040 S 975 1010, 1000 1035 S 1040 1005, 1070 1032"
          fill="none" stroke="#132a54" stroke-width="2.2" stroke-linecap="round"/>
    <text x="1130" y="1078" text-anchor="end" font-family="Georgia, serif" font-style="italic" font-size="18" fill="#1a1a1a">R. K. Deshmukh</text>
    <text x="1130" y="1100" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#1a1a1a">Sub-Divisional Magistrate</text>
    <text x="1130" y="1118" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#4a4a4a">Navapur District, Madhyadesh (Fictional)</text>
  `;
}

// ---------------------------------------------------------------------
// Builds the full base-document SVG. `amount` / `serial` let us render
// the same layout with either the genuine or tampered values baked in
// directly (used to sanity-check geometry); the actual tampered JPEG is
// produced by patching the rasterized genuine image instead (see below),
// which is what gives it a distinct, localized compression history.
// ---------------------------------------------------------------------
function documentSvg({ amount, serial }) {
  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f7f3ea"/>
  <rect x="34" y="34" width="${WIDTH - 68}" height="${HEIGHT - 68}" fill="none" stroke="#132a54" stroke-width="2.5"/>
  <rect x="42" y="42" width="${WIDTH - 84}" height="${HEIGHT - 84}" fill="none" stroke="#132a54" stroke-width="1"/>

  <!-- Fictional emblem: an abstract sunburst, NOT any real state/government emblem -->
  <g transform="translate(620 140)">
    <circle r="52" fill="none" stroke="#132a54" stroke-width="2.5"/>
    <circle r="40" fill="none" stroke="#132a54" stroke-width="1"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180;
      const x1 = Math.cos(a) * 42, y1 = Math.sin(a) * 42;
      const x2 = Math.cos(a) * 50, y2 = Math.sin(a) * 50;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#132a54" stroke-width="2"/>`;
    }).join('')}
    <text text-anchor="middle" y="6" font-family="Georgia, serif" font-size="16" font-weight="700" fill="#132a54">SDM</text>
  </g>

  <text x="620" y="230" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-weight="700" letter-spacing="1" fill="#132a54">GOVERNMENT OF MADHYADESH</text>
  <text x="620" y="258" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-style="italic" fill="#666">(a fictional state — for software demonstration only)</text>
  <text x="620" y="298" text-anchor="middle" font-family="Georgia, serif" font-size="21" font-weight="700" fill="#132a54">OFFICE OF THE SUB-DIVISIONAL MAGISTRATE</text>
  <text x="620" y="326" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#132a54" letter-spacing="1">NAVAPUR DISTRICT</text>

  <line x1="110" y1="352" x2="1130" y2="352" stroke="#132a54" stroke-width="2"/>
  <line x1="110" y1="357" x2="1130" y2="357" stroke="#132a54" stroke-width="1"/>

  <text x="620" y="412" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="700" letter-spacing="5" fill="#7a1f1f">INCOME CERTIFICATE</text>
  <line x1="470" y1="426" x2="770" y2="426" stroke="#7a1f1f" stroke-width="1.5"/>

  <text x="${SERIAL_LABEL_X}" y="${SERIAL_Y}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#1a1a1a">Certificate No:</text>
  <text x="${SERIAL_VALUE_X}" y="${SERIAL_Y}" font-family="'Courier New', monospace" font-size="16" font-weight="700" fill="#1a1a1a">${esc(serial)}</text>
  <text x="1130" y="${SERIAL_Y}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#1a1a1a">Date of Issue: 14 March 2025</text>

  <text font-family="Georgia, serif" font-size="17" fill="#1a1a1a">
    <tspan x="110" y="524">This is to certify that Shri/Smt. RAVI KUMAR TIRPUDE, son of Shri DEVIDAS</tspan>
    <tspan x="110" y="553">TIRPUDE, resident of Village Kothari, Tehsil Navapur, District Navapur,</tspan>
    <tspan x="110" y="582">Madhyadesh, belongs to a family whose gross annual income from all sources</tspan>
    <tspan x="110" y="611">for the financial year 2024-25 is assessed by this office as under:</tspan>
  </text>

  <rect x="${AMOUNT_BOX.x}" y="${AMOUNT_BOX.y}" width="${AMOUNT_BOX.w}" height="${AMOUNT_BOX.h}" fill="#fff8e1" stroke="#c9a227" stroke-width="1.5" rx="4"/>
  <text x="${AMOUNT_CENTER_X}" y="${AMOUNT_Y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" fill="#1a1a1a">ANNUAL FAMILY INCOME: ${esc(amount)}</text>
  <text x="${AMOUNT_CENTER_X}" y="${AMOUNT_BOX.y + AMOUNT_BOX.h - 12}" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-style="italic" fill="#4a4a4a">${esc(AMOUNT_WORDS)}</text>

  <text font-family="Georgia, serif" font-size="17" fill="#1a1a1a">
    <tspan x="110" y="778">This income certificate is issued to the applicant for availing benefits</tspan>
    <tspan x="110" y="807">under the applicable state welfare scheme and remains valid for a period</tspan>
    <tspan x="110" y="836">of one year from the date of issue mentioned above.</tspan>
  </text>

  <rect x="110" y="920" width="140" height="172" fill="none" stroke="#666" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="180" y="1000" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#888">APPLICANT</text>
  <text x="180" y="1018" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#888">PHOTO</text>

  ${sealAndSignature()}

  <line x1="110" y1="1560" x2="1130" y2="1560" stroke="#132a54" stroke-width="0.75"/>
  <text x="620" y="1592" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#666">This is a fictional specimen document generated for software testing purposes only.</text>
  <text x="620" y="1610" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#666">It is not a valid government record and confers no rights or entitlements.</text>
  <text x="620" y="1636" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#7a1f1f" letter-spacing="1">SPECIMEN — GENERATED FOR PRAMAAN FRAUD-DETECTION TESTING</text>

  ${watermarkGroup()}
</svg>`;
}

// ---------------------------------------------------------------------
// Tamper patches: small SVG fragments rasterized separately and
// composited onto an already-JPEG-decoded copy of the genuine page, so
// only these regions receive the *final* generation of JPEG compression
// while the rest of the page carries the base document's own history.
// ---------------------------------------------------------------------
function amountPatchSvg() {
  return `
<svg width="${AMOUNT_PATCH.w}" height="${AMOUNT_PATCH.h}" viewBox="0 0 ${AMOUNT_PATCH.w} ${AMOUNT_PATCH.h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${AMOUNT_PATCH.w}" height="${AMOUNT_PATCH.h}" fill="#fff8e1"/>
  <text x="${AMOUNT_CENTER_X - AMOUNT_PATCH.x + 4}" y="${AMOUNT_Y - AMOUNT_PATCH.y + 3}" text-anchor="middle"
        font-family="'Trebuchet MS', Verdana, sans-serif" font-size="23" font-weight="400" fill="#151515">ANNUAL FAMILY INCOME: ${esc(AMOUNT_TAMPERED)}</text>
</svg>`;
}

function serialPatchSvg() {
  return `
<svg width="${SERIAL_PATCH.w}" height="${SERIAL_PATCH.h}" viewBox="0 0 ${SERIAL_PATCH.w} ${SERIAL_PATCH.h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SERIAL_PATCH.w}" height="${SERIAL_PATCH.h}" fill="#f7f3ea"/>
  <text x="${SERIAL_VALUE_X - SERIAL_PATCH.x}" y="${SERIAL_Y - SERIAL_PATCH.y + 1}"
        font-family="'Courier New', monospace" font-size="16" font-weight="600" fill="#0d0d0d">${esc(SERIAL_TAMPERED)}</text>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. GENUINE: rasterize once, encode once, single-pass JPEG.
  const genuineSvg = documentSvg({ amount: AMOUNT_GENUINE, serial: SERIAL_GENUINE });
  const genuineBuffer = await sharp(Buffer.from(genuineSvg))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const genuinePath = path.join(OUT_DIR, 'genuine-income-certificate.jpg');
  await writeFile(genuinePath, genuineBuffer);

  // 2. TAMPERED: decode the genuine JPEG back to raw pixels (this is the
  //    document a fraudster would start from), composite the two edited
  //    fields on top, then re-encode the WHOLE page at a different JPEG
  //    quality. The edited regions therefore have a compression history
  //    distinct from the rest of the page, which is exactly what
  //    Error-Level-Analysis is designed to surface as a localized hotspot.
  const amountPatchBuf = await sharp(Buffer.from(amountPatchSvg())).png().toBuffer();
  const serialPatchBuf = await sharp(Buffer.from(serialPatchSvg())).png().toBuffer();

  const tamperedBuffer = await sharp(genuineBuffer)
    .composite([
      { input: amountPatchBuf, left: AMOUNT_PATCH.x, top: AMOUNT_PATCH.y },
      { input: serialPatchBuf, left: SERIAL_PATCH.x, top: SERIAL_PATCH.y },
    ])
    .jpeg({ quality: 68, chromaSubsampling: '4:2:0' })
    .toBuffer();

  const tamperedPath = path.join(OUT_DIR, 'tampered-income-certificate.jpg');
  await writeFile(tamperedPath, tamperedBuffer);

  // 3. Verify both files are valid JPEGs and report dimensions/sizes.
  const [genuineMeta, tamperedMeta] = await Promise.all([
    sharp(genuinePath).metadata(),
    sharp(tamperedPath).metadata(),
  ]);

  if (genuineMeta.format !== 'jpeg' || tamperedMeta.format !== 'jpeg') {
    throw new Error(
      `Output validation failed: expected format "jpeg", got genuine="${genuineMeta.format}" tampered="${tamperedMeta.format}"`
    );
  }

  const kb = (n) => (n / 1024).toFixed(1);

  console.log('\n=== Pramaan test samples generated ===\n');
  console.log(`Genuine:  ${genuinePath}`);
  console.log(`          ${genuineMeta.width}x${genuineMeta.height} JPEG, quality ~92, ${kb(genuineBuffer.length)} KB`);
  console.log(`Tampered: ${tamperedPath}`);
  console.log(`          ${tamperedMeta.width}x${tamperedMeta.height} JPEG, quality ~68, ${kb(tamperedBuffer.length)} KB\n`);

  console.log('--- What was altered in the tampered copy ---');
  console.log(`1. Declared annual income changed from "${AMOUNT_GENUINE}" to "${AMOUNT_TAMPERED}",`);
  console.log(`   composited in a different font (Trebuchet/Verdana, regular weight, +4px/+3px baseline`);
  console.log(`   offset) over the original Arial-bold figure, while the spelled-out words line`);
  console.log(`   ("${AMOUNT_WORDS}") was left untouched — a numeral-vs-words contradiction.`);
  console.log(`2. Certificate serial changed from "${SERIAL_GENUINE}" to "${SERIAL_TAMPERED}" (last digit 3->9),`);
  console.log(`   composited in a slightly heavier monospace weight over the original field.`);
  console.log(`3. The whole page was re-decoded from the genuine JPEG (quality 92) and re-saved at`);
  console.log(`   quality 68 with 4:2:0 chroma subsampling (vs 4:4:4 in the genuine file) — a different`);
  console.log(`   re-save/quantization history than the original.\n`);

  console.log('--- What Pramaan should detect ---');
  console.log('- ELA: a localized bright hotspot exactly over the income figure box and the serial-');
  console.log('  number field, against an otherwise uniform/dark error level for the rest of the page,');
  console.log('  because those two regions were pasted in after the base image had already been');
  console.log('  through one generation of JPEG compression.');
  console.log('- Typography/content module: font-weight and baseline mismatch on the income figure');
  console.log('  versus the surrounding Arial-bold document typography; the amount box loses its');
  console.log('  clean edge alignment.');
  console.log('- Consistency check: numeral "Rs. 96,500/-" contradicts the spelled-out');
  console.log('  "Two Lakh Forty-Five Thousand" words line on the same document.');
  console.log('- Technical signals: distinct JPEG quality/quantization table and chroma-subsampling');
  console.log('  mode versus the genuine file, i.e. a re-save history.');
  console.log('- Cross-field: if paired with an income/bank-statement document declaring the original');
  console.log('  Rs. 2,45,000 figure, the two documents would contradict each other on the same');
  console.log('  applicant\'s declared income.\n');
}

main().catch((err) => {
  console.error('make-samples failed:', err);
  process.exitCode = 1;
});
