import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { FileQuestion, Sparkles, ArrowLeft } from 'lucide-react';
import type { ScanRecord } from '../types';
import { HistoryService } from '../services/historyService';
import ResultView from '../components/ResultView';

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
  const record: ScanRecord | undefined = useMemo(() => {
    if (!id) return undefined;
    return HistoryService.getAll().find((r) => r.id === id);
  }, [id]);

  const startNewScan = () => navigate('/workspace');

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

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
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
