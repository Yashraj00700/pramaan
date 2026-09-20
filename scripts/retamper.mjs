/**
 * Produce a REALISTIC tampered copy of the genuine specimen certificate.
 *
 * A real forger covers the original value and re-types a new one. That leaves
 * three detectable traces, which is exactly what Pramaan should find:
 *   1. the edited region has a different JPEG compression history  -> ELA hotspot
 *   2. the re-typed glyphs differ subtly in weight/spacing/baseline -> typography mismatch
 *   3. the declared income no longer agrees with other evidence     -> cross-field logic
 */
import sharp from 'sharp';

const SRC = 'samples/genuine-income-certificate.jpg';
const OUT = 'samples/tampered-income-certificate.jpg';

const BAND = { r: 254, g: 248, b: 224 };   // income band fill
const PAGE = { r: 247, g: 243, b: 234 };   // page background

const rect = (w, h, c) => ({
  create: { width: w, height: h, channels: 3, background: c },
});

const textSvg = (w, h, text, { size = 30, weight = 700, family = 'DejaVu Sans, Helvetica, Arial, sans-serif', fill = '#1a1a1a', letter = 0, anchor = 'middle', x = '50%' }) => Buffer.from(
  `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
     <text x="${x}" y="68%" text-anchor="${anchor}"
           font-family="${family}" font-size="${size}" font-weight="${weight}"
           letter-spacing="${letter}" fill="${fill}">${text}</text>
   </svg>`
);

// Simulate the document's real history: the page the forger starts from has
// already been through a scan/compression cycle. Re-typed content composited on
// top afterwards is "fresher" than the rest of the page, which is precisely the
// asymmetry Error-Level Analysis exposes.
const aged = await sharp(SRC).jpeg({ quality: 68 }).toBuffer();
const base = sharp(aged);
const { width, height } = await base.metadata();

// --- 1. wipe the original income line, then re-type a higher figure ----------
// Band interior (keeps the band's border intact).
const bandBox = { left: 118, top: 662, width: 1004, height: 74 };
// --- 2. wipe one digit group of the certificate serial and re-type it -------
const serialBox = { left: 286, top: 438, width: 300, height: 38 };

const out = await base
  .composite([
    { input: rect(bandBox.width, bandBox.height, BAND), left: bandBox.left, top: bandBox.top },
    {
      // Re-typed amount: heavier weight + slight letter-spacing + 2px baseline drift.
      input: textSvg(bandBox.width, bandBox.height, 'ANNUAL FAMILY INCOME: Rs. 96,500/-', {
        size: 31, weight: 800, letter: 0.6,
      }),
      left: bandBox.left,
      top: bandBox.top + 2,
    },
    { input: rect(serialBox.width, serialBox.height, PAGE), left: serialBox.left, top: serialBox.top },
    {
      // Re-typed serial in a mono-ish face, marginally off the original baseline.
      input: textSvg(serialBox.width, serialBox.height, 'MD/NVP/IC/2025/048219', {
        size: 20, weight: 700, family: 'DejaVu Sans Mono, Courier New, monospace', letter: 0.3,
        anchor: 'start', x: 9,
      }),
      left: serialBox.left,
      top: serialBox.top + 1,
    },
  ])
  // Save at a HIGH quality: the aged page survives near its previous quantisation
  // fixed point, while the freshly-typed regions do not — so ELA shows a localised
  // hotspot exactly over the edited amount and serial.
  .jpeg({ quality: 96 })
  .toBuffer();

await sharp(out).toFile(OUT);
const m = await sharp(OUT).metadata();
console.log(`wrote ${OUT}  ${m.width}x${m.height}  ${(out.length / 1024).toFixed(0)}KB`);
console.log('Altered: annual income figure + certificate serial (re-typed over wiped regions, re-saved @q78).');
