# DocsGuard — Motion & Micro-interaction Spec

Companion to `DESIGN_REFERENCE.md` (visual ground truth) and `DESIGN_SYSTEM.md` (tokens/components).
Everything here is **CDN-safe**: pure CSS `@keyframes` + `IntersectionObserver`. No Framer Motion,
GSAP, Lottie, or any animation library — none is in `package.json` and none should be added.

Motion mood from the reference clip: **smooth, restrained, confident** — gentle float, soft reveals,
small lifts. Never bouncy, never flashy, never blocking the user.

---

## 0. Principles (read before adding any animation)

1. **Restraint.** Motion supports hierarchy and feedback; it never performs. If it doesn't clarify
   state or draw the eye once, cut it.
2. **60fps or don't.** Animate only `transform` and `opacity`. Never animate `width`, `height`, `top`,
   `left`, `box-shadow` color, or `filter: blur()` on anything that moves continuously — use
   `transform: translate/scale/rotate` and pair shadow changes with opacity-crossfaded pseudo-elements
   if needed.
3. **Stagger, don't synchronize.** Groups of siblings (cards, stepper items, grid tiles) reveal with a
   40–80ms delay per item, not all at once — reads as considered, not spammy.
4. **One idea at a time.** A hovered card lifts *or* glows, not both at full intensity. A loading
   state pulses *or* sweeps, not both.
5. **Always provide an exit.** Anything that loops indefinitely (hero float, scan line) must stop
   under `prefers-reduced-motion: reduce`. Anything that reveals-once must render in its final state
   with no JS (progressive enhancement — `.reveal` is visible by default; JS only adds the animated
   entrance).
6. **GPU layers are cheap, DOM thrash isn't.** Toggle a single class (`.is-visible`) rather than
   inline-styling every element; let CSS own the timing curve.

---

## 1. Timing & easing tokens

Define once, reuse everywhere (as CSS custom properties, global stylesheet or `:root` in `index.css`):

```css
:root {
  /* durations */
  --dur-instant: 100ms;
  --dur-fast: 180ms;   /* hover lift, pill press */
  --dur-base: 280ms;   /* reveal fade/rise, badge pop */
  --dur-slow: 480ms;   /* score ring fill start, panel transitions */
  --dur-float: 8s;     /* hero 3D loops */
  --dur-rotate: 22s;   /* hero slow rotate loops */

  /* easings */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* reveals, entrances — decelerate */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* loops — float/rotate */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* badge pop, verdict stamp — slight overshoot */
  --ease-linear: linear;                            /* scan line, progress fill */

  /* stagger */
  --stagger-step: 60ms;
}
```

Usage rule of thumb:
| Interaction | Duration | Easing |
|---|---|---|
| Hover lift (card/pill/button) | `--dur-fast` (150–200ms) | `--ease-out` |
| Scroll reveal (fade + rise) | `--dur-base` | `--ease-out` |
| Badge / verdict pop | `--dur-base`–`--dur-slow` | `--ease-spring` |
| Score ring fill | 900–1200ms | `--ease-out` |
| Scan line sweep | 1.6–2.2s loop | `--ease-linear` (or ease-in-out for a "breathing" sweep) |
| Hero float/rotate | 6–10s / 18–26s loop | `--ease-in-out` |
| Page/section transition | 220–320ms | `--ease-out` |

---

## 2. `prefers-reduced-motion` — non-negotiable, do this first

Wrap every continuous/large-distance animation. Put this near the top of the global stylesheet so it
overrides anything declared later with equal specificity (or keep specificity equal and rely on
source order — don't fight it with `!important` unless necessary):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Reveal elements must simply be visible, not mid-fade */
  .reveal {
    opacity: 1 !important;
    transform: none !important;
  }

  /* Kill continuous decorative loops outright rather than 1-frame-and-stop */
  .float-loop,
  .rotate-loop,
  .scan-line {
    animation: none !important;
  }
}
```

And in the `useReveal` hook (below), skip the class-delay entrance and just mark visible immediately
when the media query matches — this avoids a "flash then freeze" artifact from the CSS override alone.

---

## 3. Scroll reveal pattern

### 3.1 CSS

```css
/* Base state: invisible + offset. Visible by default with no-JS fallback via <noscript> class if needed. */
.reveal {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
  will-change: opacity, transform;
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children of a revealed group via nth-child delay, or via inline --i custom prop (see hook) */
.reveal[data-stagger] {
  transition-delay: calc(var(--i, 0) * var(--stagger-step));
}
```

Progressive-enhancement note: if you're worried about content being invisible when JS fails to load,
default `.reveal` to `opacity: 1` and only apply the `opacity: 0` starting state via a `.js-ready`
class added to `<html>` once your bundle mounts. For an internal dashboard app (DocsGuard is not a
crawled marketing-only site) this is optional — pick it up if SEO/no-JS matters for the landing page.

### 3.2 `useReveal` hook (TSX, copy-paste)

```tsx
// hooks/useReveal.ts
import { useEffect, useRef } from "react";

interface UseRevealOptions {
  threshold?: number;      // 0-1, how much of the element must be visible
  rootMargin?: string;     // e.g. "0px 0px -10% 0px" to fire slightly before full entry
  once?: boolean;          // default true — reveal once, don't re-hide on scroll-out
}

/**
 * Attach the returned ref to any element with className="reveal".
 * Adds .is-visible when it scrolls into view; respects prefers-reduced-motion
 * by marking visible immediately (skips the observer entirely).
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {}
) {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } = options;
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReduced) {
      el.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            entry.target.classList.remove("is-visible");
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return ref;
}
```

Usage:

```tsx
function FeatureCard({ title, index }: { title: string; index: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal"
      data-stagger
      style={{ "--i": index } as React.CSSProperties}
    >
      <h3>{title}</h3>
    </div>
  );
}
```

For a whole grid, a small wrapper avoids repeating `useReveal` per item:

```tsx
// components/RevealGroup.tsx
import React, { Children, cloneElement, isValidElement } from "react";
import { useReveal } from "../hooks/useReveal";

export function RevealItem({
  children,
  index = 0,
}: {
  children: React.ReactElement;
  index?: number;
}) {
  const ref = useReveal<HTMLElement>();
  if (!isValidElement(children)) return children;
  return cloneElement(children as any, {
    ref,
    className: `${(children.props as any).className ?? ""} reveal`.trim(),
    "data-stagger": true,
    style: { ...(children.props as any).style, ["--i" as any]: index },
  });
}
```

---

## 4. Hero 3D float / rotate loops

Applies to the wireframe illustrations described in `DESIGN_REFERENCE.md` §"Signature illustrations":
blue crystal/octahedron, wireframe torus, cube platform, warped grid plane, chain-link motif. All are
inline SVG — animate the SVG wrapper `<div>`/`<g>` with CSS, not SMIL/JS.

### 4.1 CSS

```css
/* Wrap each hero SVG in a container that owns the loop */
.hero-float {
  animation: float-y var(--dur-float) var(--ease-in-out) infinite;
  transform-origin: center;
}

.hero-float--slow {
  animation-duration: 10s;
}

.hero-rotate {
  animation: rotate-slow var(--dur-rotate) linear infinite;
  transform-origin: center;
}

/* Combine float + rotate on the same element via two nested wrappers
   (never combine two `transform` animations on ONE element — they clobber
   each other unless you hand-author a single keyframe set) */
.hero-float-rotate-outer { animation: float-y 8s var(--ease-in-out) infinite; }
.hero-float-rotate-inner { animation: rotate-slow 22s linear infinite; }

@keyframes float-y {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-14px) rotate(1.5deg); }
}

@keyframes rotate-slow {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(360deg); }
}

/* Crystal-specific: subtle scale breathing, very small amplitude — do not overdo */
@keyframes crystal-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.03); }
}
.hero-crystal {
  animation: float-y 7s var(--ease-in-out) infinite,
             crystal-pulse 4s var(--ease-in-out) infinite;
  transform-origin: 50% 50%;
}
```

Nesting rule: put `rotate` on an inner wrapper and `translateY` float on an outer wrapper — two
separate elements — so both keyframes apply independently without one CSS `transform` shorthand
overwriting the other:

```html
<div class="hero-float-rotate-outer">
  <div class="hero-float-rotate-inner">
    <svg class="hero-crystal">...</svg>
  </div>
</div>
```

### 4.2 Stagger multiple hero shapes

If several wireframe shapes float in the same hero band, give each a different `animation-delay`
(negative delays start them mid-cycle instead of in sync, avoiding the "breathing in unison" look):

```css
.hero-float:nth-of-type(1) { animation-delay: -1.2s; }
.hero-float:nth-of-type(2) { animation-delay: -3.8s; }
.hero-float:nth-of-type(3) { animation-delay: -5.1s; }
```

### 4.3 TSX wrapper (optional convenience)

```tsx
// components/ui/FloatingShape.tsx
export function FloatingShape({
  children,
  speed = "base",
  className = "",
}: {
  children: React.ReactNode;
  speed?: "slow" | "base" | "fast";
  className?: string;
}) {
  const dur = speed === "slow" ? "10s" : speed === "fast" ? "6s" : "8s";
  return (
    <div
      className={`hero-float ${className}`}
      style={{ animationDuration: dur }}
    >
      {children}
    </div>
  );
}
```

---

## 5. Hover-lift (cards, pills, buttons)

Single shared utility class — apply to any interactive surface (nav pills, upload cards, result
cards, CTA buttons).

```css
.hover-lift {
  transition: transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}

.hover-lift:hover,
.hover-lift:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -8px rgba(14, 27, 43, 0.18);
}

.hover-lift:active {
  transform: translateY(0);
  transition-duration: var(--dur-instant);
}

/* Dark pill button variant: lift + slight darken per DESIGN_REFERENCE */
.pill-dark {
  background: var(--navy);
  transition: transform var(--dur-fast) var(--ease-out),
              background-color var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}
.pill-dark:hover {
  transform: translateY(-2px);
  background-color: #13233a; /* slightly lighter/darker navy step, tune to token */
  box-shadow: 0 8px 20px -6px rgba(14, 27, 43, 0.35);
}

/* Trailing arrow-up-right icon: nudge on hover */
.pill-dark .icon-arrow {
  transition: transform var(--dur-fast) var(--ease-out);
}
.pill-dark:hover .icon-arrow {
  transform: translate(2px, -2px);
}
```

Always pair `:hover` with `:focus-visible` so keyboard users get the same feedback — never
hover-only affordances.

---

## 6. Upload: scan-line sweep + stepper fill

### 6.1 Scan-line (during "analyzing" state on the dashed upload card)

```css
.scan-container {
  position: relative;
  overflow: hidden; /* clip the line to the card bounds */
}

.scan-line {
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--blue) 20%,
    var(--blue) 80%,
    transparent
  );
  box-shadow: 0 0 12px 2px rgba(47, 107, 255, 0.5);
  animation: scan-sweep 1.8s var(--ease-in-out) infinite;
}

@keyframes scan-sweep {
  0%   { transform: translateY(0); opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { transform: translateY(calc(100% - 2px)); opacity: 0; }
}
```

```tsx
{isAnalyzing && (
  <div className="scan-container">
    {/* upload card content */}
    <div className="scan-line" aria-hidden="true" />
  </div>
)}
```

### 6.2 Stepper fill (e.g. "Uploading → Extracting → Cross-checking → Scoring")

```css
.stepper-item {
  opacity: 0.4;
  transform: translateX(-4px);
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}
.stepper-item.is-active {
  opacity: 1;
  transform: translateX(0);
}
.stepper-item.is-done {
  opacity: 1;
}
.stepper-item.is-done .stepper-dot {
  background: var(--blue);
  transform: scale(1);
}

.stepper-dot {
  transform: scale(0.6);
  transition: transform var(--dur-fast) var(--ease-spring),
              background-color var(--dur-fast) var(--ease-out);
}

/* connecting line between steps fills like a progress bar */
.stepper-line {
  position: relative;
  overflow: hidden;
  background: var(--line);
}
.stepper-line::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--blue);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-slow) var(--ease-out);
}
.stepper-line.is-filled::after {
  transform: scaleX(1);
}
```

Drive `.is-active` / `.is-done` / `.is-filled` from the actual upload/analysis state machine in React
— this is presentational only, no timers baked into CSS.

---

## 7. Verdict reveal (score ring + badge pop)

### 7.1 Score ring — animate stroke from 0

Use an SVG `<circle>` with `stroke-dasharray`/`stroke-dashoffset`, driven by a CSS custom property so
React only has to set one variable per score, not touch keyframes per value.

```css
.score-ring {
  --ring-size: 120px;
  --ring-stroke: 8;
  --pct: 0; /* 0–100, set inline by React once data arrives */
  width: var(--ring-size);
  height: var(--ring-size);
  transform: rotate(-90deg); /* start at 12 o'clock */
}

.score-ring circle {
  fill: none;
  stroke-width: var(--ring-stroke);
}

.score-ring .track {
  stroke: var(--line);
}

.score-ring .fill {
  stroke: var(--blue);
  stroke-linecap: round;
  stroke-dasharray: 314; /* 2 * PI * r, r=50 → update to match your radius */
  stroke-dashoffset: 314;
  transition: stroke-dashoffset 1s var(--ease-out);
}

/* Once React sets --pct, flip the offset via a data attribute or inline style */
.score-ring.is-filled .fill {
  stroke-dashoffset: calc(314 - (314 * var(--pct) / 100));
}
```

```tsx
function ScoreRing({ score }: { score: number }) {
  const [filled, setFilled] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true)); // next frame, so transition fires
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <svg
      className={`score-ring ${filled ? "is-filled" : ""}`}
      viewBox="0 0 120 120"
      style={{ ["--pct" as any]: score }}
    >
      <circle className="track" cx="60" cy="60" r="50" />
      <circle className="fill" cx="60" cy="60" r="50" />
    </svg>
  );
}
```

Radius/circumference note: if you change `r`, recompute `stroke-dasharray` = `2 * Math.PI * r` (e.g.
r=50 → 314.16, r=54 → 339.3) and update both the CSS literal and the `calc()` above.

### 7.2 Badge pop (verified / flagged / fraud-risk stamp)

```css
@keyframes badge-pop {
  0%   { transform: scale(0.5); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.verdict-badge {
  animation: badge-pop var(--dur-slow) var(--ease-spring) both;
  animation-delay: 400ms; /* let the ring read first, badge lands after */
}
```

Sequencing: ring fill starts at `t=0` (≈1s duration) → badge pop starts at `t=400ms`, finishes around
`t=880ms` — the badge lands slightly before the ring completes, giving a natural "confirmed" beat
rather than two competing animations finishing simultaneously.

---

## 8. Page / section transitions

Keep transitions between dashboard views/routes minimal — this is a utility app, not a marketing
carousel.

```css
.page-transition-enter {
  opacity: 0;
  transform: translateY(8px);
}
.page-transition-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}

/* Section-to-section inside a long page (e.g. landing) reuse .reveal instead
   of a bespoke transition — don't invent a second system. */
```

For React without a routing-transition library, the simplest CDN-safe approach is a `key`-driven
remount + CSS class toggled on mount via `useEffect` (same one-frame-delay trick as the score ring),
or simply let `.reveal` on the new view's top-level container handle it — most section transitions in
this app **are** scroll reveals, so reuse §3 rather than building a parallel mechanism.

---

## 9. Corner-tick / bento-panel accents (motion notes)

The panel corner ticks and hairlines from `DESIGN_REFERENCE.md` are static by default. The only
motion they get: a very subtle fade-in as part of the panel's own `.reveal`, and — optionally — on
hover of an interactive panel, the near corner tick can nudge 1px outward to imply "clickable":

```css
.panel-tick {
  transition: transform var(--dur-fast) var(--ease-out);
}
.panel.hover-lift:hover .panel-tick {
  transform: translate(-1px, -1px);
}
```

Do not animate ticks continuously — they're a structural/print-register motif, not a live element.

---

## 10. Checklist for implementers

- [ ] Global `prefers-reduced-motion` block added near top of stylesheet (§2).
- [ ] `useReveal` hook added at `hooks/useReveal.ts`; `.reveal`/`.is-visible` CSS in global sheet.
- [ ] Hero shapes each wrapped in float/rotate containers with staggered negative delays (§4.3).
- [ ] All interactive surfaces (cards, pills, buttons, nav items) carry `.hover-lift` or an
      equivalent transform+shadow transition, with `:focus-visible` parity.
- [ ] Upload flow: `.scan-line` mounted only while `isAnalyzing`; stepper driven by real state, not
      a hardcoded timer.
- [ ] Verdict screen: score ring fill triggers one frame after mount (`requestAnimationFrame`), badge
      pop delayed ~400ms after ring start.
- [ ] No animation touches anything but `transform`/`opacity` (grep for `transition:.*(width|height|top|left|margin)` and fix any hits).
- [ ] No animation library in `package.json` (framer-motion, gsap, lottie-*, etc.) — everything above
      is CSS + `IntersectionObserver` only.
