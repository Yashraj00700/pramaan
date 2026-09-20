/**
 * Signature & seal forgery guidance — a prompt fragment concatenated into
 * DocsGuard's existing forensic system prompts (api/_core.ts, api/court.ts).
 *
 * Research basis: docs/SIGNATURE_SEAL_FORENSICS.md. Keep this fragment tight
 * (it is appended to an already-long system prompt) and self-contained: it
 * must not restate or contradict the honesty rules already present in the
 * prompt it's concatenated into (never fabricate, cite concrete evidence,
 * defer unverifiable claims to externalChecksNeeded) — it only adds the
 * signature/seal-specific playbook those rules should be applied to.
 */

export const SIGNATURE_SEAL_GUIDANCE = `===== SIGNATURE & SEAL FORENSICS =====
When a signature, stamp, or official seal is visible, examine it specifically — in addition to your general forensic read — and cite the exact visual evidence you saw (which stroke, which edge, which region of the stamp) rather than asserting a category of tell in the abstract.

DIGITALLY PASTED SIGNATURE — look for: uniform stroke opacity/width with no pressure variation (a pen thins and thickens along its own stroke; a pasted layer does not); a too-clean edge, faint halo, or matte line consistent with a cutout; a resolution/sharpness or JPEG-block mismatch against the surrounding page; a bounding-box patch of background tone/texture that doesn't match the paper around it; no interaction with underlying ruling, print, or a crossing signature/stamp (no bleed, no interruption — it just sits on top); and pixel-identical geometry to a signature you can see elsewhere (a real hand never reproduces a signature exactly — identical geometry means a copied image asset, not independent signing).

GENUINE INK — for contrast, expect: pressure-driven stroke-width/density variation; fluent, fast execution with fine natural tremor and pen lifts at natural letter boundaries (NOT the same as coarse, slow, hesitant wavering — that pattern instead suggests a careful hand-traced simulation of someone else's signature); ink pooling at direction changes and stroke ends; and visible interaction with paper texture and any print/ruling the stroke crosses.

SEAL / RUBBER STAMP — look for: a perfectly circular, vector-crisp outline (a real stamp die is never geometrically perfect); uniform ink density with no blotching or lighter/heavier patches (real stamps ink unevenly); text sitting with mathematical precision on its arc and the whole impression dead-level with the page (real stamps are pressed slightly off-angle by hand); no partial impression, fade, or missing character anywhere in the die (real stamps almost always show some edge fade); and opaque coverage of any text/signature it overlaps instead of the semi-transparent, blended look real stamp ink produces over existing marks.

CALIBRATION — you MUST NOT assert a signature or seal is forged/pasted from a single weak tell (one soft edge, one round outline, one mismatched compression level can each be innocent — poor scanning, compression, or a genuine photograph can produce them). Only flag a signature or seal as suspicious when multiple independent tells corroborate each other, and always name the specific ones you observed. State plainly when the evidence is inconclusive rather than rounding up to a verdict, and never claim you verified a signature belongs to a specific person, that a seal die matches an issuing authority's genuine stamp on file, or any other claim that would require a specimen/registry you were not given — those belong in externalChecksNeeded like any other unconfirmed lookup.`;
