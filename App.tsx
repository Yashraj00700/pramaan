import React, { useState, useEffect, useCallback } from 'react';
import { AnalysisReport, ScanRecord } from './types';
import { analyzeDocument, fileToDataUrl, loadDemoReport } from './services/analysisService';
import { HistoryService } from './services/historyService';
import LandingPage from './components/LandingPage';
import FileUpload from './components/FileUpload';
import ResultView from './components/ResultView';
import { ShieldMark, DocScan, SoftGlow } from './components/motifs/Motifs';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Plus,
  ArrowLeft,
  Trash2,
  FileText,
  Clock,
  AlertTriangle,
  X,
  Menu,
  Lock,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';

// Friendly, safe fallback messages emitted by api/_validate.ts's toUserMessage()
// whenever the analysis engine can't be reached because the server has no
// ANTHROPIC_API_KEY configured (an unrecognized/plain Error) or is otherwise
// misconfigured (401/403 upstream). The server deliberately never echoes the
// real cause to the client, so we match on these known, stable strings to
// decide when to point the user at the sample reports instead of a raw error.
const UNCONFIGURED_SERVER_MESSAGES = [
  'Analysis failed. Please try again. If the problem persists, contact support.',
  'The server is not configured correctly (authentication problem with the analysis provider). Please contact the administrator.',
];

type View = 'landing' | 'app';
type InnerState = 'idle' | 'result';

const verdictDot: Record<string, string> = {
  AUTHENTIC: 'bg-[#10B981]',
  SUSPICIOUS: 'bg-[#F59E0B]',
  LIKELY_FAKE: 'bg-[#EF4444]',
};

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

/** Shared sidebar content — reused by the mobile drawer and the permanent desktop rail. */
const SidebarPanel: React.FC<{
  history: ScanRecord[];
  onSelect: (rec: ScanRecord) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}> = ({ history, onSelect, onDelete }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_10px_30px_-12px_rgba(15,23,42,0.08)] overflow-hidden">
    <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E2E8F0]">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
        Recent Scans
      </span>
      <span className="ml-auto text-xs font-medium text-[#475569] tabular-nums">{history.length}</span>
    </div>

    {history.length === 0 ? (
      <div className="px-5 py-10 text-center">
        <DocScan className="w-10 h-10 text-[#E2E8F0] mx-auto mb-3" />
        <p className="text-sm text-[#475569]">No scans yet.</p>
        <p className="text-xs text-[#475569] mt-1">Your analyzed documents will appear here.</p>
      </div>
    ) : (
      <ul className="max-h-[440px] overflow-y-auto divide-y divide-[#E2E8F0]">
        {history.map((rec) => (
          <li key={rec.id} className="relative group">
            <button
              onClick={() => onSelect(rec)}
              className="w-full text-left pl-5 pr-11 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-[#F5F8FF] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-inset"
            >
              <FileText className="w-4 h-4 text-[#94A3B8] shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-[#0F172A] truncate">{rec.fileName}</span>
                <span className="flex items-center gap-1.5 text-xs text-[#475569] mt-0.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      verdictDot[rec.report.verdict] ?? 'bg-[#94A3B8]'
                    }`}
                    aria-hidden="true"
                  />
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {formatRelativeTime(rec.createdAt)}
                </span>
              </span>
            </button>
            <button
              onClick={(e) => onDelete(rec.id, e)}
              aria-label={`Delete scan ${rec.fileName}`}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] cursor-pointer transition-all duration-200 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<View>('landing');
  const [inner, setInner] = useState<InnerState>('idle');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [current, setCurrent] = useState<ScanRecord | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const refreshHistory = useCallback(() => {
    setHistory(HistoryService.getAll());
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setIsAnalyzing(true);
    try {
      const report: AnalysisReport = await analyzeDocument(file);
      const thumbnail = file.type.startsWith('image/') ? await fileToDataUrl(file) : undefined;
      const rec: ScanRecord = {
        id: 'PR-' + Date.now(),
        createdAt: Date.now(),
        fileName: file.name,
        mediaType: file.type || 'image/png',
        thumbnail,
        report,
      };
      HistoryService.save(rec);
      refreshHistory();
      setCurrent(rec);
      setInner('result');
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : 'Something went wrong while analyzing this document. Please try again.';
      const looksUnconfigured = UNCONFIGURED_SERVER_MESSAGES.some((m) => rawMessage.includes(m));
      setError(
        looksUnconfigured
          ? "The live analysis engine isn't reachable right now — this usually means the server's analysis key isn't configured yet. While that's being sorted out, try one of the sample reports below to see a full Pramaan forensic dossier."
          : rawMessage
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const DEMO_META: Record<'genuine' | 'tampered', { fileName: string; thumbnail: string }> = {
    genuine: { fileName: 'SAMPLE — genuine-income-certificate.jpg', thumbnail: '/samples/genuine-income-certificate.jpg' },
    tampered: { fileName: 'SAMPLE — tampered-income-certificate.jpg', thumbnail: '/samples/tampered-income-certificate.jpg' },
  };

  /** Loads one of the two built-in, fully-populated FICTIONAL sample reports — no API key required. */
  const handleLoadDemo = async (kind: 'genuine' | 'tampered') => {
    setError(null);
    setIsAnalyzing(true);
    try {
      const report: AnalysisReport = await loadDemoReport(kind);
      const meta = DEMO_META[kind];
      const rec: ScanRecord = {
        id: 'DEMO-' + kind.toUpperCase() + '-' + Date.now(),
        createdAt: Date.now(),
        fileName: meta.fileName,
        mediaType: 'image/jpeg',
        thumbnail: meta.thumbnail,
        report,
      };
      HistoryService.save(rec);
      refreshHistory();
      setCurrent(rec);
      setInner('result');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectRecord = (rec: ScanRecord) => {
    setCurrent(rec);
    setInner('result');
    setError(null);
    setSidebarOpen(false);
  };

  const handleDeleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    HistoryService.remove(id);
    refreshHistory();
    if (current?.id === id) {
      setCurrent(null);
      setInner('idle');
    }
  };

  const startNewScan = () => {
    setCurrent(null);
    setInner('idle');
    setError(null);
    setSidebarOpen(false);
  };

  const enterApp = () => {
    setView('app');
    setInner('idle');
    setCurrent(null);
    setError(null);
  };

  const backToLanding = () => {
    setView('landing');
  };

  if (view === 'landing') {
    return <LandingPage onEnter={enterApp} />;
  }

  const viewTransition = {
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: prefersReducedMotion ? 0 : -10 },
    transition: { duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] as const },
  };

  return (
    <div className="min-h-screen bg-white font-body flex flex-col">
      {/* Nav bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden shrink-0 w-11 h-11 -ml-1 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#475569] hover:bg-[#F5F8FF] hover:text-[#0F172A] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              aria-label="Toggle recent scans sidebar"
              aria-expanded={sidebarOpen}
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              onClick={backToLanding}
              className="flex items-center gap-2.5 group shrink-0 min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 rounded-lg"
              aria-label="Back to landing page"
            >
              <ShieldMark className="w-8 h-8 shrink-0" />
              <span className="font-display font-extrabold tracking-tight text-lg text-[#0F172A] truncate hidden sm:inline">
                Pramaan
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <motion.button
              onClick={startNewScan}
              whileHover={prefersReducedMotion ? undefined : { y: -1 }}
              whileTap={prefersReducedMotion ? undefined : { y: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-3.5 sm:px-5 py-2.5 min-h-[44px] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] hover:bg-[#1E40AF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New scan</span>
            </motion.button>
            <button
              onClick={backToLanding}
              className="inline-flex items-center gap-1.5 rounded-full text-[#475569] hover:text-[#0F172A] px-2.5 sm:px-3 py-2.5 min-h-[44px] text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Landing</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3.5 text-[#B91C1C]">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm flex-1 leading-relaxed">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="p-1 -m-1 rounded text-[#B91C1C]/70 hover:text-[#B91C1C] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {inner === 'result' && current ? (
            <motion.div key="result" {...viewTransition}>
              {current.id.startsWith('DEMO-') && (
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
              <ResultView record={current} onNewScan={startNewScan} onBack={() => setInner('idle')} />
            </motion.div>
          ) : (
            <motion.div key="idle" {...viewTransition}>
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8 items-start">
                {/* Sidebar — mobile drawer (collapses under the menu button) */}
                <div className="lg:hidden">
                  <AnimatePresence initial={false}>
                    {sidebarOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 pb-1">
                          <SidebarPanel history={history} onSelect={handleSelectRecord} onDelete={handleDeleteRecord} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Sidebar — permanent desktop rail */}
                <aside className="hidden lg:block lg:sticky lg:top-24">
                  <SidebarPanel history={history} onSelect={handleSelectRecord} onDelete={handleDeleteRecord} />
                </aside>

                {/* Work area */}
                <section className="min-w-0">
                  <div className="relative bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.10)] p-5 sm:p-10 overflow-hidden">
                    <SoftGlow className="-top-16 -right-16 w-64 h-64" />
                    <div className="relative mb-7 max-w-xl">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB] mb-2">
                        New scan
                      </p>
                      <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#0F172A] leading-tight">
                        Verify a document
                      </h1>
                      <p className="text-sm text-[#475569] mt-1.5">
                        Upload a certificate, ID, invoice or statement — Pramaan cross-checks it for
                        tampering, inconsistencies and forgery signals.
                      </p>
                    </div>
                    <div className="relative">
                      <FileUpload onFileSelect={handleFileSelect} isAnalyzing={isAnalyzing} />
                    </div>
                    <div className="relative mt-6 flex items-center justify-center gap-1.5 text-xs text-[#475569]">
                      <Lock className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
                      <span>Your document is analyzed securely and never stored on our servers.</span>
                    </div>

                    {/* Sample reports — no upload or API key required, useful for a quick demo. */}
                    <div className="relative mt-8 pt-7 border-t border-[#E2E8F0]">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                        <h2 className="font-display text-sm font-bold text-[#0F172A]">See a sample report</h2>
                      </div>
                      <p className="text-xs text-[#475569] mb-4 max-w-xl">
                        No file handy? Load a full, fictional Pramaan dossier instantly — one clean certificate, one
                        forged one — to see every section of the report.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <motion.button
                          type="button"
                          disabled={isAnalyzing}
                          whileHover={isAnalyzing ? undefined : { y: -2 }}
                          whileTap={isAnalyzing ? undefined : { y: 0 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => handleLoadDemo('genuine')}
                          className="flex items-center gap-3 text-left rounded-xl border border-[#E2E8F0] bg-white hover:border-[#10B981]/50 hover:bg-[#ECFDF5]/40 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3.5 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                        >
                          <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#10B981]">
                            <ShieldCheck className="w-4.5 h-4.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#0F172A]">Genuine certificate</span>
                            <span className="block text-xs text-[#475569] mt-0.5">Clean pass — AUTHENTIC verdict</span>
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#94A3B8] ml-auto shrink-0" aria-hidden="true" />
                        </motion.button>
                        <motion.button
                          type="button"
                          disabled={isAnalyzing}
                          whileHover={isAnalyzing ? undefined : { y: -2 }}
                          whileTap={isAnalyzing ? undefined : { y: 0 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => handleLoadDemo('tampered')}
                          className="flex items-center gap-3 text-left rounded-xl border border-[#E2E8F0] bg-white hover:border-[#EF4444]/50 hover:bg-[#FEF2F2]/40 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3.5 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                        >
                          <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#EF4444]">
                            <ShieldAlert className="w-4.5 h-4.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#0F172A]">Tampered certificate</span>
                            <span className="block text-xs text-[#475569] mt-0.5">Forged income figure — LIKELY_FAKE verdict</span>
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#94A3B8] ml-auto shrink-0" aria-hidden="true" />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-6">
        <p className="text-center text-xs text-[#475569] px-4">
          Pramaan • Powered by Claude • Documents are analyzed securely and not stored on our servers.
        </p>
      </footer>
    </div>
  );
};

export default App;
