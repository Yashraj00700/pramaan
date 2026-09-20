import React from 'react';

/**
 * DocsGuard marks — clean, flat, premium line-art. NO fake-3D / wireframe kitsch.
 * Thin strokes, one blue accent, designed to sit on white. Each takes { className }.
 * Legacy names are exported as aliases at the bottom so existing imports keep compiling.
 */

interface P {
  className?: string;
}

const BLUE = '#2563EB';
const DEEP = '#1E40AF';

/** Document with a scan sweep + check — the core product mark. */
export const DocScan: React.FC<P> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
    <rect x="12" y="6" width="34" height="46" rx="5" stroke="currentColor" strokeWidth="2" />
    <path d="M19 18h20M19 26h20M19 34h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
    <rect x="6" y="28" width="46" height="7" rx="3.5" fill={BLUE} opacity=".16" />
    <path d="M6 31.5h46" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
    <circle cx="45" cy="45" r="11" fill="#fff" />
    <circle cx="45" cy="45" r="10" fill={BLUE} />
    <path d="M40.5 45.2l3.2 3.2 6-6.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Shield + check — trust / verified. */
export const ShieldMark: React.FC<P> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
    <defs>
      <linearGradient id="pm-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3B82F6" />
        <stop offset="1" stopColor={DEEP} />
      </linearGradient>
    </defs>
    <path d="M32 5l20 8v15c0 12-8.4 21.2-20 26C20.4 49.2 12 40 12 28V13l20-8z" fill="url(#pm-shield)" />
    <path d="M24 31.5l6 6 12-13" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Rows of pass/warn/fail marks — the cross-field consistency idea. */
export const ChecklistMark: React.FC<P> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
    <rect x="8" y="10" width="48" height="44" rx="6" stroke="currentColor" strokeWidth="2" />
    <circle cx="19" cy="23" r="4.5" fill="#10B981" />
    <path d="M17 23l1.6 1.6 3-3.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M29 23h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4" />
    <circle cx="19" cy="34" r="4.5" fill="#F59E0B" />
    <path d="M19 32v2.4M19 36.4v.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M29 34h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4" />
    <circle cx="19" cy="45" r="4.5" fill="#EF4444" />
    <path d="M17.3 43.3l3.4 3.4M20.7 43.3l-3.4 3.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M29 45h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4" />
  </svg>
);

/** Two documents compared / linked — cross-document logic. */
export const CompareMark: React.FC<P> = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
    <rect x="5" y="12" width="26" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
    <rect x="33" y="12" width="26" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
    <path d="M11 22h14M11 29h14M11 36h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".4" />
    <path d="M39 22h14M39 29h14M39 36h9" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
    <circle cx="32" cy="30" r="7.5" fill="#fff" />
    <circle cx="32" cy="30" r="6.5" fill={BLUE} />
    <path d="M29.2 30.2l1.9 1.9 3.8-4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Soft radial glow for hero backdrops. */
export const SoftGlow: React.FC<P & { color?: string }> = ({ className = '', color = 'rgba(37,99,235,.18)' }) => (
  <div
    className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
    style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
    aria-hidden
  />
);

/** Four subtle L-shaped corner crop-marks that fill the parent. */
export const CornerTicks: React.FC<P & { color?: string }> = ({ className = '', color = 'rgba(37,99,235,.28)' }) => {
  const base = 'absolute w-3 h-3 pointer-events-none';
  const s = { borderColor: color } as React.CSSProperties;
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} style={s} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} style={s} />
      <span className={`${base} left-2 bottom-2 border-l-2 border-b-2`} style={s} />
      <span className={`${base} right-2 bottom-2 border-r-2 border-b-2`} style={s} />
    </div>
  );
};

/* ---- legacy aliases (keep old imports compiling; all now flat, not 3D) ---- */
export const BlueCrystal = ShieldMark;
export const WireframeTorus = ChecklistMark;
export const CubePlatform = DocScan;
export const WarpedGrid = CompareMark;
export const ChainLink = CompareMark;
