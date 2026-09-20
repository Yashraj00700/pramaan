# DocsGuard — Signature & Seal Forgery Forensics

This document describes, concretely, how forged or digitally-pasted signatures,
rubber stamps, and official seals are actually detected in questioned-document
examination — and how those tells translate into things a vision model can look
for in a photographed or scanned document image. It is the research basis for
`api/prompts/signatureGuidance.ts`, the prompt fragment concatenated into
DocsGuard's forensic system prompt (`api/_core.ts`).

It covers four things: (1) tells of a **digitally pasted** signature, (2)
**genuine-ink** characteristics for contrast, (3) tells of a forged/fake
**stamp or seal**, and (4) the **honest limits** of all of the above — none of
it is proof by itself.

---

## 1. Digitally pasted signature — tells

A "digitally pasted" signature is a genuine or forged signature that was
captured elsewhere (photographed, scanned, or lifted from another document),
then composited into the target document as an image layer — as opposed to
being physically written on that page with a pen. It never touches the paper,
so it leaves none of the physical evidence real ink leaves, and it leaves
digital-compositing evidence instead:

- **Uniform stroke opacity, no pressure variation.** A pen deposits more or
  less ink depending on stroke speed, angle, and hand pressure, so a genuine
  signature's stroke density visibly varies along its own length — thin,
  faint hairlines on fast connecting strokes; darker, heavier ink where the
  writer slowed or pressed at a turn. A pasted signature is a flat raster
  layer: opacity and stroke width are the same from one end of a stroke to
  the other, because there was no pen behind it — only a uniform-alpha cutout.
- **Unnaturally clean edges, or a faint halo / matte line.** Cutting a
  signature out of one image and compositing it onto another almost always
  leaves a trace at the boundary: a thin lighter or darker fringe (leftover
  anti-aliasing or matte from the cutout mask), a hard, too-crisp edge where
  a real ink stroke would taper and feather slightly into the paper fiber, or
  a faint rectangular/irregular "shadow" where the source crop's background
  didn't perfectly match the destination page's tone.
- **Resolution or JPEG-blockiness mismatch against the page.** If the
  signature was captured from a different source (a different scan
  resolution, a different camera, a different compression pass), its local
  sharpness, noise pattern, and 8×8 JPEG block grid usually won't line up
  with the surrounding page — it may look slightly softer/blurrier, slightly
  more compressed, or have visible blocking artifacts the rest of the page
  doesn't have (or vice versa: crisper than a scanned page around it).
- **A bounding box of near-identical background tone.** Look at the small
  rectangle immediately around the signature versus the paper further away.
  A pasted layer's background patch is frequently a slightly different white
  point, has no visible paper grain/texture, or has a subtly different tone
  than the true page background — because it's a different piece of image
  data, not the same photographed page.
- **No interaction with underlying ruling or text.** Real ink sits ON the
  paper and interacts with whatever is already printed there: it crosses a
  ruled line, and either bleeds slightly into it or is interrupted by print
  toner already on the fiber; it darkens or bleeds unevenly where it crosses
  a printed line or watermark. A pasted signature is composited as a layer
  that sits cleanly on top (or is z-ordered oddly beneath) the print — it
  never shows the tiny bleed, gap, or ink-toner interaction a physically
  drawn stroke would show where it crosses existing marks.
- **Identical pixel geometry to a signature seen elsewhere.** A real hand
  never reproduces a signature with pixel-for-pixel identical stroke
  geometry twice — natural variation (see Section 2) is expected and
  genuine. If two signatures — on this document and on a reference/another
  document you have access to — are geometrically identical (same stroke
  shape, same relative proportions, same start/end points, differing only in
  scale/rotation/position), that is strong evidence of a copied/reused image
  asset rather than two independent acts of signing.

## 2. Genuine-ink characteristics — for contrast

These are what a **physically written**, pen-on-paper signature should show —
useful as the baseline the Section 1 tells are measured against:

- **Pressure-driven stroke width variation.** Width and ink density change
  continuously along a stroke as speed and pressure change — thickest at
  slow direction changes, thinnest on fast connecting strokes ("hairlines").
- **Fluent, natural tremor and pen lifts.** A genuine signature is normally
  executed quickly and fluently: it shows fine, high-frequency micro-tremor
  from ordinary hand physiology, and pen lifts occur at natural stroke
  boundaries (letter transitions), producing clean stroke starts/stops. This
  is the opposite of the coarse, low-frequency wavering, hesitation, and
  retouching seen when someone is slowly and carefully copying a model
  signature (see the forgery caveat in Section 4) — fast-and-smooth-with-
  micro-tremor reads as genuine; slow-and-wavering reads as a traced/copied
  simulation.
- **Ink pooling at direction changes.** Where a pen slows or briefly pauses
  — at a sharp turn, a loop, or the end of a stroke — ink has more time to
  flow onto the paper, producing a small, slightly darker/thicker pool. This
  is a physical ink-flow effect a pasted raster image cannot reproduce
  because it was never actually deposited by a moving pen.
- **Interaction with paper texture and underlying print.** Genuine ink
  follows the paper's micro-texture (fiber, coating) — look for tiny gaps or
  uneven absorption along a stroke, and for real bleed/interruption where
  the stroke crosses a printed rule, box, or watermark, rather than a clean
  pass-over.

## 3. Official seal / stamp — tells

A rubber ink stamp is a mechanical, imprecise instrument; a genuine "seal"
impression is never geometrically perfect. Contrast that with what a
graphic-design tool or copy-paste produces:

- **A perfectly circular, vector-crisp outline where a rubber stamp should
  be uneven.** A genuine rubber stamp impression has a slightly irregular
  outline — minute waviness from the rubber die, tool wear, and uneven
  contact pressure. A mathematically perfect circle/oval with clean,
  antialiased vector edges is more consistent with a digitally generated or
  digitally overlaid seal graphic than a physical stamp pressed by hand.
- **Uniform ink density where a real stamp is blotchy.** Hand-stamped
  impressions are never evenly inked across the whole die — density varies
  with how the stamp was inked and how evenly pressure was applied, so you
  expect lighter and heavier patches, sometimes a faint "doughnut" where the
  center under-inks. Perfectly even, uniform ink density across the entire
  impression is a red flag for a digital fill rather than a physical stamp.
- **Text perfectly on-path with no rotation/skew relative to the page.** Real
  stamps show minor imperfections in how circular/curved text sits on its
  arc, and the whole impression is virtually never dead-level with the page
  — a genuine stamp is pressed by hand at a slight angle. Text that curves
  with mathematical precision along its arc, and an impression that is
  perfectly axis-aligned with the page/field it sits in, both suggest a
  vector or template graphic rather than a physical press.
- **No partial impression or edge fade.** A real stamp, especially near the
  edge of its die, nearly always shows some fade, a partially missing
  character, or a lighter contact zone where pressure was uneven —
  especially on a larger seal. A crisp, fully legible impression at uniform
  density edge-to-edge, with no fade anywhere, is unusual for a physically
  applied stamp.
- **Sits on top of text without the expected translucency.** Real stamp ink
  is semi-transparent — where it overlaps existing printed text or a
  signature, you should be able to still make out the underlying mark
  through the stamp ink, and the overlap area often shows a slightly
  different, blended color. A seal that fully occludes what's beneath it
  with opaque, uniform color (or that is obviously z-ordered as a flat layer
  with a hard edge) is consistent with a digitally composited graphic rather
  than actual ink laid on top of existing ink/toner.

## 4. Honest limits — none of this is proof

Every tell above is a **probabilistic indicator**, not a determination. State
this plainly whenever these tells are used:

- **A clean result proves nothing conclusively, and a suspicious result is
  not conclusive either.** These are visual heuristics from a photograph or
  scan, not an instrumental examination (no microscopy, no infrared/UV, no
  ink chromatography, no original document in hand) — the kind of physical
  testing a real questioned-document examiner would still want before
  reaching a conclusion.
- **A genuine document can be scanned or photographed badly.** Poor
  lighting, low resolution, harsh JPEG compression, glare, a flattened phone
  scan, or an app's auto-enhance filter can all flatten stroke-width
  variation, sharpen edges unnaturally, or produce compression artifacts
  that mimic a "pasted" look on a perfectly genuine, physically signed and
  stamped document.
- **A good photograph of a real signature/stamp defeats most of these
  tells.** If someone photographs (rather than scans) an already-signed,
  already-stamped genuine page, or if a high-resolution scan captures a real
  signature with all its natural pressure variation and a real stamp with
  all its physical imperfections, none of the "digital pasting" tells in
  Section 1 or the "fake seal" tells in Section 3 will fire — because the
  ink and impression genuinely are physical. Conversely, a skilled forger
  can trace or freehand-simulate a signature slowly enough to avoid obvious
  tremor/hesitation tells, and a well-made counterfeit stamp die can be
  manufactured with deliberately irregular edges specifically to defeat the
  "too-perfect" tell.
- **One weak tell is never a verdict.** A single soft edge, one slightly
  mismatched compression level, or one unusually round stamp outline can
  each have an entirely innocent explanation. Treat these as evidence to
  weigh together, cite specifically, and combine with the rest of the
  document's forensic picture (see `docs/FORENSIC_METHODOLOGY.md`) — never as
  a standalone basis to call a signature or seal forged.
- **Nothing here substitutes for a live/registry check.** Whether a
  signatory is actually authorized, whether a seal design matches the
  issuing authority's genuine die on file, or whether a signature matches a
  specimen on record are all questions that need an external source DocsGuard
  does not have — they belong in `externalChecksNeeded`, not in an asserted
  verdict.

---

## Sources consulted

- [Features of digitally captured signatures vs. pen and paper signatures — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0379073820304497)
- [Forensic Handwriting Examination — Regula Forensics](https://regulaforensics.com/blog/forensic-handwriting-examination/)
- [How to Spot Signature Fraud: Expert Guide & Forensic Analysis](https://experthandwritingexaminer.com/2024/12/16/signature-fraud-how-to-spot-a-fake-signature-like-an-expert/)
- [Signatures & Forgery — Norwitch Document Laboratory](https://www.questioneddocuments.com/questioned-document-overviews/signatures-forgery/)
- [Signature Verification vs Forensic Handwriting Examination — Speckin Forensics](https://4n6.com/blog/signature-verification-vs-handwriting-examination/)
- [Forged Seal Detection Based on the Seal Overlay Metric — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0379073811004026)
- [Examination of Handwritten Signatures Forged Using Photosensitive Signature Stamp — Forensic Sciences Research / PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8330766/)
- ASTM E2289 — Standard Guide for Examination of Rubber Stamps (referenced via the above)
- [Image Splicing Detection Using Inherent Lens Radial Distortion / JPEG-artifact literature — arXiv](https://arxiv.org/pdf/2108.12947)
- [An Image Forensic Technique Based on JPEG Ghosts — arXiv](https://arxiv.org/pdf/2106.06439)
