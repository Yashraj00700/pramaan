import DossierSections from './DossierSections';
import ExportDossier from './ExportDossier';
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, MotionConfig, animate, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ScanLine,
  Printer,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  FileQuestion,
  Quote,
  ClipboardList,
  ListChecks,
  ExternalLink,
  Info,
  ArrowUpRight,
  Eye,
  EyeOff,
  Contrast,
  Clock,
  Hash,
  FileType2,
} from 'lucide-react';
import type {
  ScanRecord,
  Verdict,
  Severity,
  CheckStatus,
  RedFlag,
  ConsistencyCheck,
  ExtractedField,
  TechnicalSignal,
  VisualMarker,
} from '../types';
import { CornerTicks } from './motifs/Motifs';

interface ResultViewProps {
  record: ScanRecord;
  onNewScan: () => void;
  onBack: () => void;
}

// ---------- Style maps (white + blue, per docs/DESIGN_SYSTEM.md) ----------

const VERDICT_STYLES: Record<
  Verdict,
  { label: string; badge: string; solid: string; tint: string; Icon: React.ElementType }
> = {
  AUTHENTIC: {
    label: 'Authentic',
    badge: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
    solid: '#10B981',
    tint: '#ECFDF5',
    Icon: ShieldCheck,
  },
  SUSPICIOUS: {
    label: 'Suspicious',
    badge: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    solid: '#F59E0B',
    tint: '#FFFBEB',
    Icon: ShieldAlert,
  },
  LIKELY_FAKE: {
    label: 'Likely Fake',
    badge: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    solid: '#EF4444',
    tint: '#FEF2F2',
    Icon: ShieldX,
  },
};

const SEVERITY_STYLES: Record<
  Severity,
  { chip: string; dot: string; boxBorder: string; boxChip: string; solid: string }
> = {
  Critical: {
    chip: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    dot: 'bg-[#EF4444]',
    boxBorder: 'border-[#EF4444]',
    boxChip: 'bg-[#EF4444] text-white',
    solid: '#EF4444',
  },
  High: {
    chip: 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]',
    dot: 'bg-[#F97316]',
    boxBorder: 'border-[#F97316]',
    boxChip: 'bg-[#F97316] text-white',
    solid: '#F97316',
  },
  Medium: {
    chip: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    dot: 'bg-[#F59E0B]',
    boxBorder: 'border-[#F59E0B]',
    boxChip: 'bg-[#F59E0B] text-white',
    solid: '#F59E0B',
  },
  Low: {
    chip: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
    dot: 'bg-[#64748B]',
    boxBorder: 'border-[#64748B]',
    boxChip: 'bg-[#64748B] text-white',
    solid: '#64748B',
  },
};

const CHECK_STATUS_STYLES: Record<
  CheckStatus,
  { Icon: React.ElementType; text: string; bg: string; ring: string; label: string }
> = {
  PASS: { Icon: CheckCircle2, text: 'text-[#047857]', bg: 'bg-[#ECFDF5]', ring: 'ring-[#A7F3D0]', label: 'Pass' },
  WARN: { Icon: AlertTriangle, text: 'text-[#B45309]', bg: 'bg-[#FFFBEB]', ring: 'ring-[#FDE68A]', label: 'Warn' },
  FAIL: { Icon: XCircle, text: 'text-[#B91C1C]', bg: 'bg-[#FEF2F2]', ring: 'ring-[#FECACA]', label: 'Fail' },
};

/** Heuristic: does this value look like a hash / ELA readout / decoded payload that reads best in monospace? */
function looksTechnical(value: string): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length > 24 && !/\s/.test(v)) return true; // long unbroken token (hash, base64, URL-ish payload)
  if (/^[0-9a-fA-F]{16,}$/.test(v)) return true; // hex digest
  if (/^(sha-?256|md5|ela|qr|crc32|phash)[:\s]/i.test(v)) return true;
  return false;
}

function truncateMono(value: string, max = 40): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function riskBand(score: number): { color: string; label: string } {
  if (score <= 33) return { color: '#10B981', label: 'Low risk' };
  if (score <= 66) return { color: '#F59E0B', label: 'Elevated risk' };
  return { color: '#EF4444', label: 'High risk' };
}

const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** A red flag annotated with its rank (1 = most severe) once sorted for display. */
interface NumberedFlag extends RedFlag {
  number: number;
}

/** Severity-sorted (Critical → Low), stable on original order within a severity tier. */
function sortFlagsBySeverity(flags: RedFlag[] | undefined): NumberedFlag[] {
  if (!flags || flags.length === 0) return [];
  return flags
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map(({ f }, idx) => ({ ...f, number: idx + 1 }));
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'was',
  'were', 'with', 'for', 'this', 'that', 'at', 'by', 'as', 'be', 'it', 'its',
  'has', 'have', 'had', 'not', 'but', 'from', 'which', 'does', 'appears',
]);

function tokenize(s: string | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  a.forEach((w) => {
    if (b.has(w)) common += 1;
  });
  return common / Math.min(a.size, b.size);
}

/**
 * Maps each visual marker to the numbered red flag it most likely illustrates, by lexical
 * overlap between the marker's label and the flag's title/detail/evidence text (both are
 * produced independently by the model, so there is no explicit id linking them). Returns
 * `null` for a marker when no flag clears the confidence floor, so the UI can degrade to an
 * unnumbered tag rather than guess.
 */
function mapMarkersToFlagNumbers(markers: VisualMarker[], flags: NumberedFlag[]): (number | null)[] {
  if (flags.length === 0) return markers.map(() => null);
  const flagTokens = flags.map((f) => tokenize(`${f.title} ${f.detail} ${f.evidence}`));
  const MIN_SCORE = 0.2;
  return markers.map((m) => {
    const markerTokens = tokenize(m.label);
    let bestIdx = -1;
    let bestScore = 0;
    flags.forEach((f, idx) => {
      let score = overlapScore(markerTokens, flagTokens[idx]);
      if (score > 0 && f.severity === m.severity) score += 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx === -1 || bestScore < MIN_SCORE) return null;
    return flags[bestIdx].number;
  });
}

function formatScanTime(createdAt: number | undefined): string | null {
  if (!createdAt || Number.isNaN(createdAt)) return null;
  try {
    const d = new Date(createdAt);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

/** Pulls the raw hex prefix out of a technicalSignals entry like "SHA-256 fingerprint" → "a1b2c3…". */
function findHashSignal(signals: TechnicalSignal[] | undefined): string | null {
  if (!signals) return null;
  const hit = signals.find((s) => /sha-?256|checksum|hash|fingerprint/i.test(s.label));
  return hit?.value || null;
}

// ---------- Motion variants ----------

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

// ---------- Small building blocks ----------

/** White card: hairline border, soft shadow, subtle blue corner ticks. */
const Panel: React.FC<{ className?: string; children: React.ReactNode; as?: 'div' | 'section' }> = ({
  className = '',
  children,
}) => (
  <motion.section
    variants={itemVariants}
    className={`relative bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] p-5 sm:p-6 ${className}`}
  >
    <CornerTicks />
    {children}
  </motion.section>
);

const PanelTitle: React.FC<{ title: string; icon?: React.ElementType; right?: React.ReactNode }> = ({
  title,
  icon: Icon,
  right,
}) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <h3 className="font-display flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-[#0F172A]">
      {Icon && (
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] shrink-0">
          <Icon className="w-4 h-4" />
        </span>
      )}
      {title}
    </h3>
    {right}
  </div>
);

/** 10-11px uppercase, wide-tracked micro-label — the eyebrow/data-caption unit used throughout. */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8] ${className}`}>
    {children}
  </span>
);

/** Circular risk-score gauge — stroke fill + number count-up animated via framer-motion. */
const RiskRing: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const { color, label } = riskBand(clamped);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState(prefersReduced ? clamped : 0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(clamped);
      return;
    }
    const controls = animate(0, clamped, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [clamped, prefersReduced]);

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div className="relative w-32 h-32 sm:w-36 sm:h-36">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Tick marks every 10 units — instrument-dial detail, not decoration: they read the same scale the arc fills. */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * 360;
            const major = i % 5 === 0;
            const r1 = major ? 47 : 49;
            const r2 = 51.5;
            const rad = (angle * Math.PI) / 180;
            const x1 = 50 + r1 * Math.cos(rad);
            const y1 = 50 + r1 * Math.sin(rad);
            const x2 = 50 + r2 * Math.cos(rad);
            const y2 = 50 + r2 * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#E2E8F0"
                strokeWidth={major ? 1 : 0.6}
              />
            );
          })}
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: prefersReduced ? circumference * (1 - clamped / 100) : circumference }}
            animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
            transition={{ duration: prefersReduced ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#0F172A] leading-none tabular-nums">
            {display}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8] mt-1">Risk / 100</span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
};

// ---------- Document preview (left column) ----------

const MARKER_LEGEND: { severity: Severity; label: string }[] = [
  { severity: 'Critical', label: 'Critical' },
  { severity: 'High', label: 'High' },
  { severity: 'Medium', label: 'Medium' },
  { severity: 'Low', label: 'Low' },
];

/** Slim ruler caption spelling out the marker coordinate space — a measured-instrument detail, not decoration. */
const CoordinateRuler: React.FC = () => (
  <div className="mt-3 px-0.5" aria-hidden>
    <div className="relative h-3">
      {[0, 250, 500, 750, 1000].map((v) => (
        <span
          key={v}
          className="absolute top-0 w-px h-2 bg-[#CBD5E1]"
          style={{ left: `${v / 10}%` }}
        />
      ))}
      <span className="absolute top-0 right-0 w-px h-2 bg-[#CBD5E1]" />
    </div>
    <div className="flex justify-between font-mono text-[9px] tabular-nums text-[#94A3B8] leading-none mt-0.5">
      <span>0</span>
      <span>250</span>
      <span>500</span>
      <span>750</span>
      <span>1000</span>
    </div>
  </div>
);

const EvidenceToolbar: React.FC<{
  markerCount: number;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  hasEla: boolean;
  showEla: boolean;
  onToggleEla: () => void;
}> = ({ markerCount, showMarkers, onToggleMarkers, hasEla, showEla, onToggleEla }) => (
  <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[#E2E8F0]">
    <Eyebrow className="mr-0.5">Evidence view</Eyebrow>
    {markerCount > 0 && (
      <button
        type="button"
        onClick={onToggleMarkers}
        aria-pressed={showMarkers}
        className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
          showMarkers
            ? 'bg-[#EFF6FF] border-[#DBEAFE] text-[#1E40AF]'
            : 'bg-white border-[#E2E8F0] text-[#94A3B8] hover:text-[#475569]'
        }`}
      >
        {showMarkers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        Markers
        <span className="font-mono tabular-nums">{markerCount}</span>
      </button>
    )}
    {hasEla && (
      <button
        type="button"
        onClick={onToggleEla}
        aria-pressed={showEla}
        className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1 ${
          showEla
            ? 'bg-[#EFF6FF] border-[#DBEAFE] text-[#1E40AF]'
            : 'bg-white border-[#E2E8F0] text-[#94A3B8] hover:text-[#475569]'
        }`}
      >
        <Contrast className="w-3.5 h-3.5" />
        {showEla ? 'ELA heatmap' : 'Original'}
      </button>
    )}
  </div>
);

const DocumentPreview: React.FC<{ record: ScanRecord; markerNumbers: (number | null)[] }> = ({
  record,
  markerNumbers,
}) => {
  const isImage = record.mediaType?.startsWith('image/');
  const markers: VisualMarker[] = record.report.visualMarkers ?? [];
  const ela = record.report.elaImage;
  const prefersReduced = useReducedMotion();

  const [showMarkers, setShowMarkers] = useState(true);
  const [showEla, setShowEla] = useState(false);
  const fadeDuration = prefersReduced ? 'duration-0' : 'duration-500';

  return (
    <Panel>
      <PanelTitle title="Document Preview" icon={FileText} />
      {isImage && record.thumbnail ? (
        <>
          {(markers.length > 0 || !!ela) && (
            <EvidenceToolbar
              markerCount={markers.length}
              showMarkers={showMarkers}
              onToggleMarkers={() => setShowMarkers((v) => !v)}
              hasEla={!!ela}
              showEla={showEla}
              onToggleEla={() => setShowEla((v) => !v)}
            />
          )}
          <div className="relative w-full rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F5F8FF]">
            <CornerTicks color="#2563EB" />
            <img
              src={record.thumbnail}
              alt={record.fileName}
              className="w-full h-auto block select-none"
              draggable={false}
            />
            {ela && (
              <img
                src={ela}
                alt={`${record.fileName} — Error Level Analysis heatmap`}
                className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity ${fadeDuration}`}
                style={{ opacity: showEla ? 1 : 0 }}
                draggable={false}
              />
            )}
            {showMarkers &&
              markers.map((marker, idx) => {
                const [ymin, xmin, ymax, xmax] = marker.box;
                const style = SEVERITY_STYLES[marker.severity];
                const num = markerNumbers[idx];
                return (
                  <div
                    key={idx}
                    className={`absolute border-2 ${style.boxBorder} rounded-sm pointer-events-none transition-opacity ${fadeDuration}`}
                    style={{
                      top: `${ymin / 10}%`,
                      left: `${xmin / 10}%`,
                      height: `${(ymax - ymin) / 10}%`,
                      width: `${(xmax - xmin) / 10}%`,
                      opacity: showEla ? 0.35 : 1,
                    }}
                  >
                    <span
                      className={`absolute -top-5 left-0 whitespace-nowrap inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.boxChip} shadow-sm`}
                    >
                      {num != null && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-black/20 font-mono tabular-nums text-[9px] leading-none">
                          {num}
                        </span>
                      )}
                      {marker.label}
                    </span>
                  </div>
                );
              })}
          </div>
          {markers.length > 0 && (
            <>
              <CoordinateRuler />
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-4 border-t border-[#E2E8F0]">
                {MARKER_LEGEND.map(({ severity, label }) => (
                  <div key={severity} className="flex items-center gap-1.5 text-xs text-[#475569]">
                    <span className={`w-2.5 h-2.5 rounded-sm ${SEVERITY_STYLES[severity].dot}`} />
                    {label}
                  </div>
                ))}
                <span className="ml-auto text-[10px] font-mono text-[#94A3B8]">
                  {markerNumbers.filter((n) => n != null).length}/{markers.length} linked to findings
                </span>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-xl border border-[#E2E8F0] bg-[#F5F8FF]">
          <FileQuestion className="w-10 h-10 text-[#94A3B8] mb-3" />
          <p className="text-[#0F172A] font-medium break-all">{record.fileName}</p>
          <p className="text-[#475569] text-xs mt-2 max-w-xs">
            PDF analyzed — visual overlay available for images.
          </p>
        </div>
      )}
    </Panel>
  );
};

// ---------- Right column sections ----------

const VerdictHero: React.FC<{ record: ScanRecord; topFlag: NumberedFlag | null }> = ({ record, topFlag }) => {
  const { report } = record;
  const style = VERDICT_STYLES[report.verdict];
  const VIcon = style.Icon;

  return (
    <Panel>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="min-w-0">
          <Eyebrow className="inline-flex items-center gap-1.5 text-[#2563EB]">
            <FileText className="w-3.5 h-3.5" />
            {report.documentType}
          </Eyebrow>
          <h2
            className="font-display mt-2 text-4xl sm:text-5xl font-extrabold leading-[0.98] tracking-tight flex items-center gap-3"
            style={{ color: style.solid }}
          >
            <VIcon className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" style={{ color: style.solid }} />
            {style.label}
          </h2>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs font-semibold text-[#475569] shrink-0">
              Confidence{' '}
              <span className="text-[#0F172A] font-mono tabular-nums">{report.confidence}%</span>
            </span>
            <div className="h-1.5 w-40 max-w-full rounded-full bg-[#E2E8F0] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[#2563EB]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, report.confidence))}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              />
            </div>
          </div>
        </div>
        <RiskRing score={report.riskScore} />
      </div>

      {report.summary && (
        <p className="text-[#334155] text-sm leading-relaxed mt-6 pt-6 border-t border-[#E2E8F0]">
          {report.summary}
        </p>
      )}

      {topFlag && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3">
          <span
            className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full font-mono text-[10px] font-bold text-white tabular-nums"
            style={{ background: SEVERITY_STYLES[topFlag.severity].solid }}
          >
            {topFlag.number}
          </span>
          <div className="min-w-0">
            <Eyebrow className="text-[#94A3B8]">What decided this</Eyebrow>
            <p className="text-[#0F172A] text-sm font-medium leading-snug mt-0.5">{topFlag.title}</p>
          </div>
        </div>
      )}
    </Panel>
  );
};

const RedFlagsSection: React.FC<{ flags: NumberedFlag[] }> = ({ flags }) => {
  if (!flags || flags.length === 0) return null;
  return (
    <Panel>
      <PanelTitle
        title="Red Flags"
        icon={AlertTriangle}
        right={<Eyebrow>{flags.length} finding{flags.length === 1 ? '' : 's'}, most severe first</Eyebrow>}
      />
      <div className="space-y-3">
        {flags.map((flag) => {
          const style = SEVERITY_STYLES[flag.severity];
          return (
            <div key={flag.number} className="flex gap-3">
              <div className="shrink-0 pt-0.5">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-[11px] font-bold text-white tabular-nums"
                  style={{ background: style.solid }}
                >
                  {flag.number}
                </span>
              </div>
              <div
                className={`min-w-0 flex-1 rounded-xl border border-l-4 border-[#E2E8F0] bg-[#F8FAFC] p-4`}
                style={{ borderLeftColor: style.solid }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <h4 className="text-[#0F172A] font-semibold text-sm">{flag.title}</h4>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.chip}`}>
                    {flag.severity}
                  </span>
                </div>
                <p className="text-[#475569] text-sm leading-relaxed">{flag.detail}</p>
                {flag.evidence && (
                  <div
                    className={`mt-2.5 flex items-start gap-2 rounded-lg bg-white border-l-2 ${style.boxBorder} border-y border-r border-[#E2E8F0] px-3 py-2`}
                  >
                    <Quote className="w-3.5 h-3.5 text-[#94A3B8] mt-0.5 shrink-0" />
                    <code className="text-xs text-[#334155] font-mono leading-relaxed break-words">
                      {flag.evidence}
                    </code>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const ConsistencyChecksSection: React.FC<{ checks: ConsistencyCheck[] }> = ({ checks }) => {
  if (!checks || checks.length === 0) return null;
  const counts = checks.reduce(
    (acc, c) => {
      acc[c.status] += 1;
      return acc;
    },
    { PASS: 0, WARN: 0, FAIL: 0 } as Record<CheckStatus, number>
  );

  return (
    <Panel className="ring-2 ring-[#2563EB]/20">
      <div className="-mx-5 sm:-mx-6 -mt-5 sm:-mt-6 mb-5 px-5 sm:px-6 py-3.5 rounded-t-2xl bg-[#EFF6FF] border-b border-[#DBEAFE] flex items-center justify-between gap-3">
        <h3 className="font-display flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-[#1E40AF]">
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-white text-[#2563EB] shrink-0 shadow-sm">
            <ListChecks className="w-4 h-4" />
          </span>
          Consistency Checks
        </h3>
        <div className="hidden sm:flex items-center gap-1.5">
          {(['PASS', 'WARN', 'FAIL'] as CheckStatus[]).map((s) =>
            counts[s] > 0 ? (
              <span
                key={s}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CHECK_STATUS_STYLES[s].bg} ${CHECK_STATUS_STYLES[s].text}`}
              >
                {counts[s]} {CHECK_STATUS_STYLES[s].label}
              </span>
            ) : null
          )}
        </div>
      </div>
      <div className="flex sm:hidden items-center gap-1.5 flex-wrap -mt-2 mb-4">
        {(['PASS', 'WARN', 'FAIL'] as CheckStatus[]).map((s) =>
          counts[s] > 0 ? (
            <span
              key={s}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CHECK_STATUS_STYLES[s].bg} ${CHECK_STATUS_STYLES[s].text}`}
            >
              {counts[s]} {CHECK_STATUS_STYLES[s].label}
            </span>
          ) : null
        )}
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {checks.map((c, idx) => {
          const style = CHECK_STATUS_STYLES[c.status];
          const CIcon = style.Icon;
          return (
            <div key={idx} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${style.bg} ${style.ring}`}>
                <CIcon className={`w-4 h-4 ${style.text}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[#0F172A] text-sm font-semibold">{c.check}</p>
                <p className="text-[#475569] text-xs mt-0.5 leading-relaxed">{c.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const ExtractedFieldsSection: React.FC<{ fields: ExtractedField[] }> = ({ fields }) => {
  if (!fields || fields.length === 0) return null;
  return (
    <Panel>
      <PanelTitle title="Extracted Fields" icon={ClipboardList} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {fields.map((f, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#94A3B8]">{f.label}</dt>
            <dd className="text-[#0F172A] text-sm mt-0.5 break-words">{f.value || '—'}</dd>
          </div>
        ))}
      </div>
    </Panel>
  );
};

const TechnicalSignalsSection: React.FC<{ signals: TechnicalSignal[] }> = ({ signals }) => {
  if (!signals || signals.length === 0) return null;
  return (
    <Panel>
      <PanelTitle title="Forensic Signals" icon={ScanLine} />
      <div className="divide-y divide-[#E2E8F0]">
        {signals.map((s, idx) => {
          const mono = looksTechnical(s.value);
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${
                s.concern ? 'px-3 -mx-3 rounded-lg bg-[#FFFBEB]' : ''
              }`}
            >
              {s.concern ? (
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
              ) : (
                <span className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#94A3B8]">{s.label}</dt>
                <dd
                  title={mono ? s.value : undefined}
                  className={`text-sm mt-0.5 break-words ${
                    mono ? 'font-mono text-xs text-[#334155] tabular-nums' : 'text-[#0F172A]'
                  } ${s.concern ? 'font-semibold text-[#B91C1C]' : ''}`}
                >
                  {mono ? truncateMono(s.value) : s.value}
                </dd>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const RecommendedActionSection: React.FC<{ action: string }> = ({ action }) => {
  if (!action) return null;
  return (
    <motion.div
      variants={itemVariants}
      className="relative rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-5 sm:p-6 flex items-start gap-3"
    >
      <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-white text-[#2563EB] shrink-0 shadow-sm">
        <Info className="w-4 h-4" />
      </span>
      <div>
        <h4 className="font-display text-sm font-bold text-[#1E40AF] uppercase tracking-wide mb-1">
          Recommended Action
        </h4>
        <p className="text-[#0F172A] text-sm leading-relaxed">{action}</p>
      </div>
    </motion.div>
  );
};

const ExternalChecksSection: React.FC<{ items: string[] }> = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <Panel>
      <PanelTitle title="External Checks Needed" icon={ExternalLink} />
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-[#334155]">
            <span className="w-1 h-1 rounded-full bg-[#94A3B8] mt-2 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-[#94A3B8] mt-3 pt-3 border-t border-[#E2E8F0]">
        Requires live verification (registry / DigiLocker / sanctions) — not yet automated.
      </p>
    </Panel>
  );
};

/** Quiet mono footer: the case's chain-of-custody strip. Every field degrades independently. */
const AnalysisMetadataFooter: React.FC<{ record: ScanRecord }> = ({ record }) => {
  const scanTime = formatScanTime(record.createdAt);
  const hash = findHashSignal(record.report.technicalSignals);

  const items: { icon: React.ElementType; label: string; value: string }[] = [];
  if (record.fileName) items.push({ icon: FileText, label: 'File', value: record.fileName });
  if (record.mediaType) items.push({ icon: FileType2, label: 'Media type', value: record.mediaType });
  if (scanTime) items.push({ icon: Clock, label: 'Scanned', value: scanTime });
  if (hash) items.push({ icon: Hash, label: 'SHA-256', value: hash });

  if (items.length === 0) return null;

  return (
    <motion.div variants={itemVariants} className="mt-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3 h-3 text-[#94A3B8] shrink-0" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8] shrink-0">
              {label}
            </span>
            <span className="text-[11px] font-mono text-[#475569] truncate max-w-[16rem]" title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// ---------- Main component ----------

const ResultView: React.FC<ResultViewProps> = ({ record, onNewScan, onBack }) => {
  const { report } = record;

  const sortedFlags = useMemo(() => sortFlagsBySeverity(report.redFlags), [report.redFlags]);
  const markerNumbers = useMemo(
    () => mapMarkersToFlagNumbers(report.visualMarkers ?? [], sortedFlags),
    [report.visualMarkers, sortedFlags]
  );
  const topFlag = sortedFlags.length > 0 ? sortedFlags[0] : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-white">
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: #ffffff !important; }
          }
        `}</style>

        {/* Top bar */}
        <div className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 min-h-11 px-2 -mx-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                onClick={() => window.print()}
                className="flex items-center gap-2 min-h-11 text-sm font-medium px-3.5 py-2 rounded-xl bg-white border border-[#DBEAFE] text-[#1E40AF] hover:border-[#2563EB] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Download / Print report</span>
              </motion.button>
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                onClick={onNewScan}
                className="flex items-center gap-2 min-h-11 text-sm font-semibold px-4 py-2 rounded-full bg-[#2563EB] hover:bg-[#1E40AF] text-white transition-colors duration-200 cursor-pointer shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                <ScanLine className="w-4 h-4" />
                New scan
                <ArrowUpRight className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={record.id}
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start"
            >
              {/* LEFT */}
              <div className="lg:sticky lg:top-24">
                <DocumentPreview record={record} markerNumbers={markerNumbers} />
              </div>

              {/* RIGHT */}
              <div className="space-y-6 min-w-0">
                <VerdictHero record={record} topFlag={topFlag} />
                <ConsistencyChecksSection checks={report.consistencyChecks} />
                <RedFlagsSection flags={sortedFlags} />
                <ExtractedFieldsSection fields={report.extractedFields} />
                <TechnicalSignalsSection signals={report.technicalSignals} />
                <RecommendedActionSection action={report.recommendedAction} />
                <ExternalChecksSection items={report.externalChecksNeeded} />
                <AnalysisMetadataFooter record={record} />
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Deep forensic dossier: modules, adversarial court, risk, timeline, ELA */}
          <DossierSections report={report} originalImage={record.thumbnail} />

          {/* Print-only paginated dossier: hidden on screen, this is what Print produces. */}
          <div className="hidden print:block">
            <ExportDossier record={record} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );
};

export default ResultView;
