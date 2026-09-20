# DocsGuard — Visual Reference Analysis (ground truth)

Distilled from the user's reference design (the "DocImmutable" doc-verification UI + motion clip).
This is the authoritative description of the target look. Design agents expand this into
`DESIGN_SYSTEM.md` / `MOTION.md`; build agents implement it. Do not deviate from these facts.

## Overall vibe
Clean, bold, **web3 / fintech doc-verification** aesthetic. Big confident geometric type,
lots of white space, a cobalt-blue accent, and thin-line **3D wireframe** illustrations paired
with a solid **blue crystal (octahedron)**. Feels trustworthy, modern, a little "blockchain".
Motion is smooth and restrained (gentle float, scroll reveal, hover lift) — never flashy.

## Canvas & surfaces
- Page canvas: **deep navy** `#0E1B2B` (almost blue-black).
- Primary content lives in large **WHITE panels** that float on the navy, separated by
  **1px hairlines** and decorated with small **corner ticks** (L-shaped crop marks) at panel corners.
- Full-bleed **navy bands** hold the 3D illustrations (hero corners, step grids).
- Very light **blue-tinted cards** `#F4F8FF` with **dashed blue borders** for upload/drop zones.
- Secondary gray surface for modals/preview backdrops: `#E9EDF3`.

## Color tokens
- `--navy` `#0E1B2B` (canvas, dark pills, headings-on-light can also use `#0D1B2A`)
- `--ink` `#0D1B2A` (headings/text on white)
- `--muted` `#5B6B7A` (body/secondary text)
- `--blue` `#2F6BFF` (primary accent: links, active nav, solid CTA, crystal)
- `--blue-600` `#1E4FD8` (crystal gradient bottom, hover)
- `--blue-50` `#F4F8FF` (tinted card fill)
- `--line` `#E3E8EF` (hairlines on light) / `rgba(255,255,255,.12)` (hairlines on navy)
- Verdict/status accents (used sparingly on white cards): green `#10B981`, amber `#F59E0B`, red `#EF4444`.

## Typography
- **Display / headings:** a bold, geometric, slightly-rounded sans — use **Poppins** (700/800),
  tight leading (~1.05), near-black `#0D1B2A`. Headings are LARGE and confident
  (hero 44–72px, section 32–44px, card title 20–26px). Expose as `.font-display`.
- **Body / UI:** **Inter** (400–600), `#5B6B7A` for secondary, `#0D1B2A` for primary.
- Small labels: uppercase, letter-spaced, 11–12px, muted.

## Buttons
- **Dark pill** (most common): navy `#0E1B2B`, white text, `rounded-full`, medium padding,
  often with a trailing **↗ (arrow-up-right)** icon. Hover: slight lift + darken.
- **Solid blue**: `#2F6BFF`, white text, `rounded-xl` (used for primary modal actions, "Create document ⊕").
- **Ghost/link**: blue text + small round icon chip (e.g. "Download Example ⭳").

## Signature illustrations (rebuild as inline SVG + CSS, NO 3D libs)
- **Blue crystal / octahedron** (diamond gem) with a blue vertical gradient — the "verified/authentic" hero motif.
- **Wireframe torus ring** (thin black lines) with a blue check or crystal inside.
- **Wireframe cube platform / grid plane** (isometric) with a blue up-arrow or crystal rising from it (the "upload/mint" motif).
- **Warped wireframe grid plane** (a tilted mesh) with a small blue crystal resting on it.
- **Chain-link 3D motif** (interlocking wireframe links) — the "immutable/secure" corner accent.
- All render as clean inline SVG, thin strokes (`#0D1B2A` @ ~1px or white on navy), the solid element in blue gradient. Give each a **gentle float/rotate** animation.

## Layout system
- **Bento grid** with hard 1px separators + corner ticks; big type; generous padding.
- **Top nav (marketing/app):** white bar — logo left (a mark + wordmark), centered nav links,
  a pill CTA, optional status/wallet chip right.
- **Dashboard (upload) screen** (see ref): left **sidebar** (profile block with avatar + name +
  "profile info ▾", nav items where the active one has a **blue-gradient** highlight + icon,
  Settings/Logout pills pinned bottom) and a right **work area** titled "Upload …" with two
  stacked **dashed upload cards** (icon + bold title + dark pill button + side helper text).
- **Result/preview**: white "paper" card on a soft gray backdrop, zoom controls, clean type.

## Motion (from the clip + best practice)
- Hero 3D shapes: continuous **gentle float + slow rotate** (6–10s ease-in-out loops), subtle.
- Sections **reveal on scroll** (fade + 12px rise) via IntersectionObserver.
- Cards/pills: **hover lift** (translateY -2px + soft shadow) with 150–200ms ease.
- Upload: animated **scan line** sweeping the drop zone while analyzing; stepper fills in.
- Verdict reveal: the score ring **animates from 0**, badge pops in.
- Respect `prefers-reduced-motion` (disable loops/large transitions).

## What to change vs keep (for DocsGuard)
- KEEP: cobalt blue + white-on-navy bento, bold Poppins headings, wireframe-3D + blue-crystal motifs, dashed upload cards, dark pill buttons, smooth restrained motion.
- CHANGE the story: this is **AI document authenticity & fraud detection**, NOT NFT minting.
  The crystal reads as "verified/authentic". Swap "mint NFT" language for "verify / detect fraud".
- Keep all app behavior identical — only the visual layer changes.
