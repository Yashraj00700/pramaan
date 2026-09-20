import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  FileQuestion,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from 'lucide-react';
import type { ScanRecord, Verdict } from '../types';
import { HistoryService } from '../services/historyService';
import ResultView from '../components/ResultView';

const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const VERDICT_CHIP: Record<Verdict, { label: string; className: string; Icon: React.ElementType }> = {
  AUTHENTIC: {
    label: 'Authentic',
    className: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
    Icon: ShieldCheck,
  },
  SUSPICIOUS: {
    label: 'Suspicious',
    className: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    Icon: ShieldAlert,
  },
  LIKELY_FAKE: {
    label: 'Likely Fake',
    className: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    Icon: ShieldX,
  },
};

/**
 * /scan/:id — a saved report rendered with ResultView, loaded from HistoryService.
 * Shows a clean "report not found" state (with a link back to /workspace) when the id
 * is unknown — e.g. a stale/shared link, or history was cleared in this browser.
 */
const ScanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  // HistoryService reads localStorage synchronously, so this is safe to resolve
  // directly on render; it re-resolves whenever the route id changes.
  // Re-read when the background dossier expansion lands, so the report fills in
  // under the user without a refresh.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail?.id || detail.id === id) setVersion((v) => v + 1);
    };
    window.addEventListener('docsguard:scan-updated', onUpdated);
    return () => window.removeEventListener('docsguard:scan-updated', onUpdated);
  }, [id]);

  const record: ScanRecord | undefined = useMemo(() => {
    if (!id) return undefined;
    return HistoryService.getAll().find((r) => r.id === id);
  }, [id, version]);

  const startNewScan = () => navigate('/workspace');

  // Escape returns to the workspace from anywhere on this page — found or not-found state.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/workspace');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  if (!record) {
    return (
      <motion.div
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-xl mx-auto text-center py-20"
      >
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#F5F8FF] border border-[#E2E8F0] flex items-center justify-center mb-6">
          <FileQuestion className="w-7 h-7 text-[#2563EB]" aria-hidden="true" />
        </div>
        <h1 className="font-display font-extrabold text-2xl text-[#0F172A] mb-2">Report not found</h1>
        <p className="text-sm text-[#475569] leading-relaxed mb-8">
          We couldn't find a scan with id <span className="font-mono text-[#1E40AF]">{id}</span> in this
          browser's history. It may have been cleared, or the link may be from a different device — scan
          history is stored locally and isn't shared between browsers yet.
        </p>
        <Link
          to="/workspace"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-5 py-2.5 min-h-[44px] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] hover:bg-[#1E40AF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>
      </motion.div>
    );
  }

  const chip = VERDICT_CHIP[record.report.verdict];
  const ChipIcon = chip.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Instrument header: sits directly under the site nav (top-16 matches its h-16) and
          above ResultView's own in-panel toolbar — file, verdict, risk & scan time at a glance. */}
      <div className="no-print sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-4 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto">
          <button
            onClick={startNewScan}
            className="flex items-center gap-1.5 shrink-0 min-h-[36px] -ml-2 px-2 rounded-lg text-xs font-semibold text-[#475569] hover:text-[#0F172A] hover:bg-[#F5F8FF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Workspace
            <span className="hidden md:inline-flex items-center rounded border border-[#E2E8F0] px-1 py-0.5 ml-1 font-mono text-[9px] leading-none text-[#94A3B8]">
              ESC
            </span>
          </button>

          <span className="w-px h-4 bg-[#E2E8F0] shrink-0" aria-hidden="true" />

          <span className="font-mono text-xs text-[#0F172A] truncate max-w-[140px] sm:max-w-[240px] shrink">
            {record.fileName}
          </span>

          <span
            className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${chip.className}`}
          >
            <ChipIcon className="w-3 h-3" aria-hidden="true" />
            {chip.label}
          </span>

          <span className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs text-[#475569]">
            <Gauge className="w-3.5 h-3.5 text-[#94A3B8]" aria-hidden="true" />
            Risk <span className="font-mono font-bold tabular-nums text-[#0F172A]">{record.report.riskScore}</span>
          </span>

          <span
            className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs text-[#475569] ml-auto"
            title={new Date(record.createdAt).toLocaleString()}
          >
            <Clock className="w-3.5 h-3.5 text-[#94A3B8]" aria-hidden="true" />
            <span className="tabular-nums font-mono">{formatRelativeTime(record.createdAt)}</span>
          </span>
        </div>
      </div>

      {record.id.startsWith('DEMO-') && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1 shrink-0">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Sample report
          </span>
          <p className="text-xs text-[#1E40AF] leading-relaxed">
            This is a fictional, pre-built demo dossier — not a live scan of an uploaded document.
          </p>
        </div>
      )}
      <ResultView record={record} onNewScan={startNewScan} onBack={startNewScan} />
    </motion.div>
  );
};

export default ScanDetail;
