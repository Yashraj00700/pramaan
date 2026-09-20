# Pramaan — Design System (WHITE + BLUE)  ·  authoritative

> This supersedes the earlier navy version and `docs/DESIGN_REFERENCE.md` (navy). The app is a
> **white-background, blue-accent, fintech-trust** product. Clean, confident, editorial — NOT a
> dark theme, NOT generic-AI (no purple gradients, no Inter, no cookie-cutter card grids).

## Voice
Trustworthy, precise, modern gov-tech / fintech. Big confident headings, lots of white space,
one strong blue, crisp cards with **soft shadows** (not heavy borders), a blue "verified crystal"
motif with a soft glow. Restrained motion.

## Color tokens (defined in index.html `:root`)
| token | hex | use |
|---|---|---|
| `--blue` | `#2563EB` | primary: buttons, links, active, key accents |
| `--blue-deep` | `#1E40AF` | logo, some headings/emphasis, crystal base |
| `--blue-bright` | `#3B82F6` | secondary/hover |
| `--blue-50` | `#EFF6FF` | tint fills (icon tiles, callouts, chips) |
| `--blue-100` | `#DBEAFE` | stronger tint / borders on tint |
| `--wash` | `#F5F8FF` | alternating section background |
| `--ink` | `#0F172A` | headings, primary text |
| `--body` | `#475569` | body / secondary text |
| `--muted` | `#94A3B8` | captions, meta |
| `--line` | `#E2E8F0` | hairlines / card borders |
| `--ok`/`--warn`/`--bad` | `#10B981`/`#F59E0B`/`#EF4444` | verdict + severity ONLY (never decorative) |

Backgrounds: page `#FFFFFF`; alternate sections `--wash` or `--blue-50`; cards `#FFFFFF`.
Use arbitrary Tailwind values, e.g. `bg-[#2563EB]`, `text-[#0F172A]`, `border-[#E2E8F0]`.

## Typography
- Display / headings: **Outfit** via `class="font-display"` — weights 700/800/900, tight tracking.
  Hero 44–72px, section 30–44px, card title 18–24px. Color `#0F172A` (or `#1E40AF` for accent words).
- Body / UI: **Plus Jakarta Sans** (default body font) — 400/500/600. Body `#475569`, ~16px, relaxed leading.
- Labels/eyebrows: uppercase, tracking-widest, 11–12px, `#2563EB` or `#94A3B8`.

## Surfaces & elevation
- Cards: `bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)]`.
  On hover (interactive): lift + stronger blue-tinted shadow `hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.30)] hover:-translate-y-0.5 transition`.
- Icon tile: `w-12 h-12 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center`.
- Section rhythm: alternate white and `--wash`; generous `py-20 md:py-28`; max width `max-w-6xl mx-auto px-6`.
- Optional texture: `.dotgrid` (subtle blue dot grid) behind hero only. Soft blue radial glow behind the hero crystal.

## Buttons
- Primary: `bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold rounded-xl px-6 py-3 shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] transition` (optionally rounded-full pill with a trailing `ArrowUpRight`).
- Secondary: `bg-white text-[#1E40AF] border border-[#DBEAFE] hover:border-[#2563EB] rounded-xl px-6 py-3`.
- Ghost/link: `text-[#2563EB] font-semibold hover:underline`.

## Components
- **Top nav:** white, sticky, hairline bottom, subtle blur (`bg-white/80 backdrop-blur border-b border-[#E2E8F0]`). Logo = ShieldCheck in a blue rounded tile + "Pramaan" in font-display. Primary pill CTA right.
- **Verdict badge:** pill, colored by verdict — AUTHENTIC `bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]`; SUSPICIOUS `bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]`; LIKELY_FAKE `bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]`. Big, with an icon.
- **Score ring:** SVG donut, stroke colored by band (green/amber/red), animates 0→N, big number in center (font-display).
- **Dashed upload card:** `bg-[#F5F8FF] border-2 border-dashed border-[#2563EB]/40 rounded-3xl` with a light doc icon, bold title, primary button; hover tint deepens.
- **Chips:** `rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs px-3 py-1`; concern chips use `--bad`/`--warn` tints.
- **Consistency check rows** (the standout): white card, each row a status icon (PASS green check / WARN amber / FAIL red x) + check text + detail; show pass/warn/fail counts.

## Motifs (components/motifs/Motifs.tsx)
`BlueCrystal` (hero/verified, has soft glow), `WireframeTorus`, `CubePlatform`, `WarpedGrid`,
`ChainLink`, `CornerTicks`. Wireframes use `currentColor` — set `text-slate-300` or `text-[#1E40AF]`
on white. Use the crystal as the hero centerpiece with its glow; use wireframes as light accents.
Do not overuse — one strong motif per section max.

## Motion
Per `docs/MOTION.md` (theme-agnostic): staggered hero load, `.reveal` scroll-in, hover-lift,
crystal float+glow, upload scan-line, verdict ring count-up. `prefers-reduced-motion` respected.

## Anti-patterns (DO NOT)
- ❌ Dark/navy page backgrounds (this is a LIGHT product). ❌ Low-contrast text (ink on tint only, never on blue). ❌ Purple gradients, rainbow gradients, glassmorphism overload. ❌ Inter/Roboto/system fonts. ❌ Evenly-distributed timid color — commit to blue with white. ❌ Decorative use of green/amber/red (reserve for verdict/severity). ❌ Generic 3-equal-cards-in-a-row everywhere; vary rhythm, use an asymmetric hero and at least one feature row with a product/scan mock.
- Aim: looks like a real, funded gov-tech product a judge would trust — not an AI template.
