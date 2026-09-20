import React, { useEffect, useRef } from 'react';

/**
 * InteractiveBackground
 * ----------------------
 * The signature visual of DocsGuard: a blueprint-style grid of hairline dots
 * on white, with a soft "scanning light" that eases toward the pointer and
 * brightens nearby grid nodes — the page reads as an instrument under
 * examination, not a decorative particle field.
 *
 * Two variants:
 *  - "hero":    full presence — light follows pointer, occasional scan sweep.
 *  - "ambient": calmer background for secondary sections — lower opacity,
 *               no scan sweep, gentler light.
 *
 * Performance & correctness contract:
 *  - Only transform/opacity-equivalent canvas redraws; no layout reads in the loop.
 *  - DPR-scaled canvas for crisp hairlines on retina displays.
 *  - ResizeObserver keeps the canvas matched to its container.
 *  - IntersectionObserver + document.hidden pause the rAF loop when unneeded.
 *  - prefers-reduced-motion: render exactly one static frame, never animate.
 *  - Touch / no fine pointer: light stays centred, no pointer tracking.
 *  - pointer-events: none throughout — never intercepts clicks.
 *  - All listeners removed and rAF cancelled on unmount.
 */

interface InteractiveBackgroundProps {
  className?: string;
  variant?: 'hero' | 'ambient';
}

// ---- Tuning constants -------------------------------------------------
// Adjust these to change the character of the effect without touching logic.
const TUNING = {
  hero: {
    gridSpacing: 34, // px between dot centres, before DPR scaling
    dotRadius: 1.1, // base dot radius in px
    dotAlphaBase: 0.16, // resting opacity of a grid dot (0-1, applied to blue ink)
    dotAlphaLit: 0.85, // opacity of a dot fully inside the light radius
    lightRadius: 220, // px radius of the scanning light's influence
    lightEase: 0.08, // 0-1, how quickly the light lerps toward the pointer (lower = lazier)
    lightGlowAlpha: 0.05, // peak alpha of the soft radial glow itself
    docCount: 3, // number of faint drifting document-rectangle outlines
    docAlpha: 0.05, // opacity of drifting document outlines
    docSpeed: 0.012, // px/frame drift speed
    scanIntervalMs: 7000, // time between scan-line sweeps
    scanDurationMs: 1400, // duration of one sweep
    scanAlpha: 0.16, // peak opacity of the sweeping scan line
  },
  ambient: {
    gridSpacing: 40,
    dotRadius: 1,
    dotAlphaBase: 0.1,
    dotAlphaLit: 0.5,
    lightRadius: 170,
    lightEase: 0.06,
    lightGlowAlpha: 0.03,
    docCount: 2,
    docAlpha: 0.035,
    docSpeed: 0.008,
    scanIntervalMs: 0, // ambient variant never sweeps
    scanDurationMs: 0,
    scanAlpha: 0,
  },
} as const;

// Primary ink used for grid dots / glow, as raw RGB so we can vary alpha per-draw.
const INK_RGB = '37, 99, 235'; // #2563EB

interface DriftDoc {
  x: number; // fraction of width, 0-1
  y: number; // fraction of height, 0-1
  w: number; // px
  h: number; // px
  vx: number; // fraction/frame
  vy: number; // fraction/frame
  rot: number; // radians
  vrot: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const InteractiveBackground: React.FC<InteractiveBackgroundProps> = ({
  className = '',
  variant = 'hero',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cfg = TUNING[variant];

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

    let reduceMotion = reducedMotionQuery.matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssWidth = 0;
    let cssHeight = 0;

    // Pointer target (css px) and eased light position (css px).
    let pointerX = 0;
    let pointerY = 0;
    let lightX = 0;
    let lightY = 0;
    let pointerActive = false;

    // Drifting document rectangles, seeded for deterministic layout per mount.
    const rand = seededRandom(variant === 'hero' ? 42 : 7);
    const docs: DriftDoc[] = Array.from({ length: cfg.docCount }, () => ({
      x: rand(),
      y: rand(),
      w: 90 + rand() * 70,
      h: 120 + rand() * 90,
      vx: (rand() - 0.5) * cfg.docSpeed,
      vy: (rand() - 0.5) * cfg.docSpeed,
      rot: (rand() - 0.5) * 0.15,
      vrot: (rand() - 0.5) * 0.00008,
    }));

    let scanStartTime: number | null = null;
    let nextScanAt = cfg.scanIntervalMs > 0 ? cfg.scanIntervalMs * (0.5 + rand()) : Infinity;
    let elapsed = 0;

    let rafId: number | null = null;
    let running = false;
    let visible = true;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!pointerActive) {
        pointerX = cssWidth / 2;
        pointerY = cssHeight / 2;
        lightX = pointerX;
        lightY = pointerY;
      }
    };

    const drawStatic = () => {
      // Single deterministic frame for reduced-motion: grid + faint docs, light centred, no sweep.
      draw(0);
    };

    function drawGrid(alphaBoost: (dx: number, dy: number) => number) {
      const spacing = cfg.gridSpacing;
      const cols = Math.ceil(cssWidth / spacing) + 1;
      const rows = Math.ceil(cssHeight / spacing) + 1;
      for (let i = 0; i < cols; i++) {
        const x = i * spacing;
        for (let j = 0; j < rows; j++) {
          const y = j * spacing;
          const dx = x - lightX;
          const dy = y - lightY;
          const boost = alphaBoost(dx, dy);
          const alpha = cfg.dotAlphaBase + boost * (cfg.dotAlphaLit - cfg.dotAlphaBase);
          const r = cfg.dotRadius + boost * 0.6;
          ctx.beginPath();
          ctx.fillStyle = `rgba(${INK_RGB}, ${alpha.toFixed(3)})`;
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawDocs(dt: number) {
      ctx.save();
      ctx.strokeStyle = `rgba(${INK_RGB}, ${cfg.docAlpha})`;
      ctx.lineWidth = 1;
      for (const d of docs) {
        if (!reduceMotion) {
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.rot += d.vrot * dt;
          // wrap softly within [-0.1, 1.1] so rectangles drift off and re-enter
          if (d.x < -0.15) d.x = 1.15;
          if (d.x > 1.15) d.x = -0.15;
          if (d.y < -0.15) d.y = 1.15;
          if (d.y > 1.15) d.y = -0.15;
        }
        const cx = d.x * cssWidth;
        const cy = d.y * cssHeight;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(d.rot);
        ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      }
      ctx.restore();
    }

    function drawLightGlow() {
      if (cfg.lightGlowAlpha <= 0) return;
      const grad = ctx.createRadialGradient(
        lightX,
        lightY,
        0,
        lightX,
        lightY,
        cfg.lightRadius * 1.6
      );
      grad.addColorStop(0, `rgba(${INK_RGB}, ${cfg.lightGlowAlpha})`);
      grad.addColorStop(1, `rgba(${INK_RGB}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }

    function drawScanLine(now: number) {
      if (cfg.scanDurationMs <= 0) return;
      if (elapsed >= nextScanAt && scanStartTime === null) {
        scanStartTime = now;
      }
      if (scanStartTime === null) return;
      const t = (now - scanStartTime) / cfg.scanDurationMs;
      if (t >= 1) {
        scanStartTime = null;
        nextScanAt = elapsed + cfg.scanIntervalMs * (0.7 + rand() * 0.6);
        return;
      }
      const y = t * cssHeight;
      // fade in over first 15%, fade out over last 40%
      const fade = t < 0.15 ? t / 0.15 : t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
      const alpha = cfg.scanAlpha * fade;
      const grad = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      grad.addColorStop(0, `rgba(${INK_RGB}, 0)`);
      grad.addColorStop(0.5, `rgba(${INK_RGB}, ${alpha.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${INK_RGB}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 40, cssWidth, 80);

      // crisp core line
      ctx.strokeStyle = `rgba(${INK_RGB}, ${(alpha * 1.4).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }

    let lastTime: number | null = null;

    function draw(dt: number) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      drawDocs(dt);

      drawGrid((dx, dy) => {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= cfg.lightRadius) return 0;
        const t = 1 - dist / cfg.lightRadius;
        return t * t; // ease-in falloff, precise-instrument feel
      });

      drawLightGlow();
    }

    function frame(now: number) {
      if (!running) return;
      if (lastTime === null) lastTime = now;
      const dt = Math.min(now - lastTime, 48); // clamp to avoid huge jumps on tab-back
      lastTime = now;
      elapsed += dt;

      // Ease the light position toward the pointer target — never snaps.
      lightX += (pointerX - lightX) * cfg.lightEase;
      lightY += (pointerY - lightY) * cfg.lightEase;

      draw(dt);
      drawScanLine(now);

      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      lastTime = null;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // --- Event wiring -----------------------------------------------------
    const handlePointerMove = (e: PointerEvent) => {
      if (!hasFinePointer) return;
      const rect = container.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      pointerActive = true;
    };

    const handlePointerLeave = () => {
      pointerActive = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else if (visible && !reduceMotion) {
        start();
      }
    };

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      if (reduceMotion) {
        stop();
        resize();
        drawStatic();
      } else if (visible && !document.hidden) {
        start();
      }
    };

    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion || !running) {
        drawStatic();
      }
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        visible = !!entry && entry.isIntersecting;
        if (visible && !document.hidden && !reduceMotion) {
          start();
        } else {
          stop();
        }
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(container);

    if (hasFinePointer) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    } else if (typeof (reducedMotionQuery as any).addListener === 'function') {
      // Safari < 14 fallback
      (reducedMotionQuery as any).addListener(handleReducedMotionChange);
    }

    if (reduceMotion) {
      drawStatic();
    } else {
      start();
    }

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (hasFinePointer) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerleave', handlePointerLeave);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (typeof reducedMotionQuery.removeEventListener === 'function') {
        reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      } else if (typeof (reducedMotionQuery as any).removeListener === 'function') {
        (reducedMotionQuery as any).removeListener(handleReducedMotionChange);
      }
    };
  }, [variant]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default InteractiveBackground;
