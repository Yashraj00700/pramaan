import React from 'react';

/**
 * DocsGuard identity.
 *
 * The mark is a document sheet with a folded corner, guarded by a shield that
 * carries a check — "the paper, verified". Rebuilt as SVG rather than a raster
 * so it stays crisp at favicon size and inherits the design tokens.
 */

const BLUE = '#2563EB';
const BLUE_DEEP = '#1D4ED8';
const INK = '#111827';

/** Icon only — nav, favicon, avatars. */
export const DocsGuardMark: React.FC<{ className?: string; title?: string }> = ({
  className = '',
  title = 'DocsGuard',
}) => (
  <svg viewBox="0 0 64 64" fill="none" className={className} role="img" aria-label={title}>
    <defs>
      <linearGradient id="dg-doc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3B82F6" />
        <stop offset="1" stopColor={BLUE_DEEP} />
      </linearGradient>
      <linearGradient id="dg-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#60A5FA" />
        <stop offset="1" stopColor={BLUE_DEEP} />
      </linearGradient>
    </defs>

    {/* document sheet with a folded top-right corner */}
    <path d="M10 8a5 5 0 0 1 5-5h22l13 13v30a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V8z" fill="url(#dg-doc)" />
    <path d="M37 3l13 13H41a4 4 0 0 1-4-4V3z" fill="#fff" fillOpacity=".55" />

    {/* inner page */}
    <rect x="17" y="13" width="22" height="28" rx="3" fill="#fff" fillOpacity=".92" />
    <g stroke={BLUE_DEEP} strokeWidth="2.2" strokeLinecap="round" opacity=".85">
      <path d="M21.5 20h13M21.5 25.5h13M21.5 31h8" />
    </g>

    {/* shield + check, overlapping the sheet */}
    <path d="M34 30l13 5v9c0 8-5.5 13.8-13 16.5C26.5 57.8 21 52 21 44v-9l13-5z" fill="url(#dg-shield)" stroke="#fff" strokeWidth="2.5" />
    <path d="M28 44.5l4.2 4.2L41 39.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Full lockup — mark + wordmark. "Docs" in ink, "Guard" in blue. */
export const DocsGuardLogo: React.FC<{ className?: string; markClassName?: string }> = ({
  className = '',
  markClassName = 'w-8 h-8',
}) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <DocsGuardMark className={markClassName} />
    <span className="font-display font-extrabold tracking-tight leading-none text-[19px]">
      <span style={{ color: INK }}>Docs</span>
      <span style={{ color: BLUE }}>Guard</span>
    </span>
  </span>
);

export default DocsGuardLogo;
