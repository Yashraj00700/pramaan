
import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Camera,
  ArrowUpRight,
  Fingerprint,
  ScanLine,
  Gavel,
  ShieldCheck,
  ShieldAlert,
  GitCompare,
  Hash,
  QrCode,
  Clock,
} from 'lucide-react';
import { CornerTicks, DocScan } from './motifs/Motifs';

interface Props {
  onFileSelect: (file: File) => void;
  isAnalyzing: boolean;
}

// Honest, tasteful step labels — no mention of any model/vendor or external DB.
const SCAN_STEPS = [
  { label: 'Reading document…', icon: FileText },
  { label: 'Extracting text & metadata…', icon: Fingerprint },
  { label: 'Running forensic + cross-field checks…', icon: ScanLine },
  { label: 'Preparing verdict…', icon: Gavel },
];

// What the engine actually looks at — shown as chips on the idle drop zone.
const ENGINE_CHECKS = [
  { label: 'Tampering', icon: ShieldAlert },
  { label: 'Metadata', icon: Fingerprint },
  { label: 'Cross-field logic', icon: GitCompare },
  { label: 'Checksums', icon: Hash },
  { label: 'QR', icon: QrCode },
];

// Stage thresholds in ms — presentational pacing only. The real analysis
// promise in App.tsx is what actually gates isAnalyzing; these never claim
// a stage is "done" beyond what elapsed time makes reasonable to show.
const STAGE_TIMINGS = [1200, 3000, 5200, 7200];
const REASSURANCE_AFTER_SEC = 25;

// How long the "confirming" pulse holds on-screen after a drop/pick before the
// scan state takes over — purely a perceptual beat, not a real processing delay.
const CONFIRM_PULSE_MS = 360;

const FileUpload: React.FC<Props> = ({ onFileSelect, isAnalyzing }) => {
  const [dragActive, setDragActive] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // Advance through the stepper while a scan is running. Presentational only —
  // driven purely by elapsed time, never by an actual "stage complete" signal
  // we don't have.
  useEffect(() => {
    if (isAnalyzing) {
      setScanStep(0);
      const timers = STAGE_TIMINGS.map((time, index) =>
        setTimeout(() => setScanStep(index + 1), time)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [isAnalyzing]);

  // Elapsed-seconds counter, also presentational — a live clock, not an ETA.
  useEffect(() => {
    if (!isAnalyzing) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Cleanup any pending confirm-pulse timer on unmount.
  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Accepts a file the same way for drop and for the file/camera inputs: a brief
  // "confirmed" pulse plays first, then the file is handed up to the parent —
  // this never changes which file is selected, only when the parent learns of it.
  const acceptFile = (file: File) => {
    setConfirming(true);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    const delay = prefersReducedMotion ? 0 : CONFIRM_PULSE_MS;
    confirmTimerRef.current = setTimeout(() => {
      setConfirming(false);
      onFileSelect(file);
    }, delay);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      acceptFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      acceptFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const onButtonClick = () => inputRef.current?.click();
  const onCameraClick = () => cameraInputRef.current?.click();

  const onCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onButtonClick();
    }
  };

  // Smooth, continuously-rising fill for the progress rail. Asymptotic and
  // capped well short of 100% — it visualizes "work is happening," it never
  // asserts a stage or the whole scan has actually finished.
  const railPct = Math.min(96, Math.round(100 * (1 - Math.exp(-elapsedSec / 6))));
  const clampedStep = Math.min(scanStep, SCAN_STEPS.length - 1);

  return (
    <MotionConfig reducedMotion="user">
    <div className="w-full max-w-3xl mx-auto">
      <AnimatePresence mode="wait" initial={false}>
        {isAnalyzing ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative min-h-[480px] rounded-3xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col items-center justify-center py-10"
          >
            <CornerTicks className="text-[#2563EB]/25" />

            {/* Subtle shimmer sweep across the whole panel — decorative only, gated for reduced motion */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 motion-reduce:hidden pointer-events-none"
              style={{
                background:
                  'linear-gradient(100deg, transparent 30%, rgba(37,99,235,0.05) 45%, rgba(59,130,246,0.09) 50%, rgba(37,99,235,0.05) 55%, transparent 70%)',
                backgroundSize: '250% 100%',
              }}
              animate={{ backgroundPosition: ['0% 0%', '100% 0%'] }}
              transition={{ duration: 3.2, ease: 'linear', repeat: Infinity }}
            />

            {/* Live elapsed-time indicator */}
            <div className="absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-full bg-[#F5F8FF] border border-[#E2E8F0] px-3 py-1 text-[11px] font-semibold text-[#475569] tabular-nums">
              <Clock className="w-3 h-3 text-[#2563EB]" aria-hidden="true" />
              <span aria-live="off">{elapsedSec}s elapsed</span>
            </div>

            {/* Screen-reader-only live announcement of the current stage */}
            <p className="sr-only" aria-live="polite">
              {SCAN_STEPS[clampedStep].label}
            </p>

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">
              {/* Document silhouette with a scan line genuinely sweeping across it */}
              <div className="relative w-36 h-44 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] overflow-hidden mb-7 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="absolute inset-0 p-4 flex flex-col gap-2 opacity-70">
                  <div className="h-2 w-1/2 rounded-full bg-[#CBD5E1]" />
                  {[85, 65, 90, 45, 75, 60].map((w, i) => (
                    <div key={i} className="h-1.5 rounded-full bg-[#E2E8F0]" style={{ width: `${w}%` }} />
                  ))}
                </div>
                <motion.div
                  aria-hidden="true"
                  className="absolute left-0 right-0 top-0 h-10 motion-reduce:hidden"
                  style={{
                    background:
                      'linear-gradient(180deg, transparent, rgba(37,99,235,0.16) 45%, rgba(37,99,235,0.16) 55%, transparent)',
                  }}
                  initial={{ y: -26 }}
                  animate={{ y: [-26, 176] }}
                  transition={{ duration: 2.1, ease: 'easeInOut', repeat: Infinity }}
                />
                <motion.div
                  aria-hidden="true"
                  className="absolute left-0 right-0 top-0 h-0.5 motion-reduce:hidden"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #2563EB 30%, #3B82F6 50%, #2563EB 70%, transparent)',
                    boxShadow: '0 0 12px 2px rgba(37,99,235,0.6)',
                  }}
                  initial={{ y: -4, opacity: 0 }}
                  animate={{ y: [-4, 172], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 2.1, ease: 'easeInOut', repeat: Infinity, times: [0, 0.1, 0.9, 1] }}
                />
                <div className="motion-reduce:block hidden absolute inset-x-0 top-1/2 h-0.5 bg-[#2563EB]/50" />
              </div>

              <h3 className="font-display text-2xl font-bold text-[#0F172A] mb-1 tracking-tight text-center">
                Scanning your document
              </h3>
              <p className="text-[#94A3B8] text-[11px] uppercase tracking-widest font-semibold mb-6 text-center">
                Progress indication — not a fixed countdown
              </p>

              {/* Progress rail */}
              <div className="w-full h-1.5 rounded-full bg-[#EFF6FF] overflow-hidden mb-8">
                <motion.div
                  className="h-full w-full rounded-full origin-left"
                  style={{ background: 'linear-gradient(90deg, #2563EB, #3B82F6)' }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: railPct / 100 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <div className="w-full relative pl-1">
                {/* Rail track connecting the stages */}
                <div className="absolute left-3 top-3 bottom-3 w-px bg-[#E2E8F0]" aria-hidden="true" />
                <div className="absolute left-3 top-3 bottom-3 w-px overflow-hidden" aria-hidden="true">
                  <motion.div
                    className="w-px bg-[#2563EB] origin-top"
                    style={{ height: '100%' }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: clampedStep / (SCAN_STEPS.length - 1) }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  />
                </div>

                <div className="space-y-5">
                  {SCAN_STEPS.map((step, i) => {
                    const isDone = scanStep > i;
                    const isActive = scanStep === i;
                    return (
                      <motion.div
                        key={step.label}
                        initial={false}
                        animate={{ opacity: scanStep >= i ? 1 : 0.4, x: scanStep >= i ? 0 : -8 }}
                        transition={{
                          opacity: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
                          x: { type: 'spring', stiffness: 420, damping: 32 },
                        }}
                        className="relative flex items-center gap-4"
                      >
                        {/* Each completed stage settles with a small spring — deliberate, mechanical, never bouncy. */}
                        <motion.div
                          initial={false}
                          animate={isDone ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                          className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors duration-300 ${
                            isDone
                              ? 'bg-[#2563EB] text-white'
                              : isActive
                              ? 'bg-[#2563EB] text-white animate-pulse'
                              : 'bg-white text-[#475569] border border-[#E2E8F0]'
                          }`}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {isDone ? (
                              <motion.span
                                key="done"
                                initial={{ scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.4, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                                className="flex"
                              >
                                <ShieldCheck className="w-3 h-3" />
                              </motion.span>
                            ) : (
                              <motion.span
                                key="pending"
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.6, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="flex"
                              >
                                <step.icon className="w-3 h-3" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.div>
                        <span
                          className={`text-sm ${
                            isActive ? 'text-[#2563EB] font-semibold' : isDone ? 'text-[#0F172A]' : 'text-[#475569]'
                          }`}
                        >
                          {step.label}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {elapsedSec >= REASSURANCE_AFTER_SEC && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-[#475569] text-xs text-center mt-7 max-w-xs"
                  >
                    Deep analysis — larger documents take longer.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            role="button"
            tabIndex={0}
            aria-label="Upload a document to scan"
            initial={{ opacity: 0, y: 8, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: dragActive ? 1.018 : 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              opacity: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
              scale: { type: 'spring', stiffness: 340, damping: 22 },
            }}
            whileHover={{ y: -2 }}
            onClick={onButtonClick}
            onKeyDown={onCardKeyDown}
            className={`w-full rounded-3xl border-2 border-dashed cursor-pointer relative overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 transition-colors duration-200 ${
              dragActive
                ? 'border-[#2563EB] bg-[#DBEAFE]'
                : 'border-[#2563EB]/40 bg-gradient-to-br from-[#F5F8FF] via-white to-[#EFF6FF] hover:bg-[#EFF6FF] hover:border-[#2563EB]/70'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={handleChange}
              accept="image/*,application/pdf"
            />
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              onChange={handleChange}
              accept="image/*"
              capture="environment"
            />

            {/* Soft depth glow behind the whole card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full blur-3xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.14), transparent 70%)' }}
            />

            {/* Soft glow bloom that blooms in on drag-over — springy, transform/opacity only */}
            <AnimatePresence>
              {dragActive && (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                >
                  <div
                    className="w-[140%] h-[140%] rounded-full blur-3xl"
                    style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.22), transparent 65%)' }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Brief confirming pulse right after a file is accepted, before the scan state takes over */}
            <AnimatePresence>
              {confirming && (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/70 motion-reduce:bg-white/90"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
                    transition={{ duration: prefersReducedMotion ? 0.001 : 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="w-16 h-16 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-[0_20px_40px_-14px_rgba(37,99,235,0.55)]"
                  >
                    <ShieldCheck className="w-8 h-8" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animated marching-ants border on drag-over — reduced-motion gets the static CSS dashed border only */}
            <AnimatePresence>
              {dragActive && (
                <motion.svg
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full motion-reduce:hidden pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.rect
                    x="3"
                    y="3"
                    width="calc(100% - 6px)"
                    height="calc(100% - 6px)"
                    rx="22"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="2"
                    strokeDasharray="10 8"
                    animate={{ strokeDashoffset: [0, -36] }}
                    transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
                  />
                </motion.svg>
              )}
            </AnimatePresence>

            <div className="relative z-10 flex flex-col items-center text-center px-6 py-12 sm:py-14">
              <div className="relative w-20 h-20 mb-6">
                {/* Stacked-paper depth behind the mark */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl bg-white border border-[#E2E8F0] rotate-6 translate-x-1.5 translate-y-1 opacity-50"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl bg-white border border-[#E2E8F0] -rotate-3 translate-x-0.5 opacity-75"
                />
                <motion.div
                  animate={dragActive ? { scale: 1.08, rotate: 3 } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={`relative w-20 h-20 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-center shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] transition-colors duration-300 ${
                    dragActive ? 'text-[#2563EB]' : 'text-[#2563EB]/60 group-hover:text-[#2563EB]'
                  }`}
                >
                  <DocScan className="w-10 h-10" />
                </motion.div>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-2">
                {dragActive ? 'Drop to scan' : 'Drag & drop your document'}
              </h3>
              <p className="text-[#475569] text-sm mb-8 max-w-sm leading-relaxed">
                PNG, JPG or PDF · certificates, invoices, IDs, statements
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 mb-8">
                <motion.button
                  whileHover={{ y: -2, boxShadow: '0 20px 40px -16px rgba(37,99,235,0.45)' }}
                  whileTap={{ y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onButtonClick();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold px-6 py-3 shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  Browse file <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </motion.button>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCameraClick();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#DBEAFE] text-[#1E40AF] text-sm font-semibold px-6 py-3 hover:border-[#2563EB] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  <Camera className="w-4 h-4" /> Scan with camera
                </motion.button>
              </div>

              {/* What the engine checks */}
              <p className="text-[#94A3B8] text-[10px] uppercase tracking-widest font-semibold mb-3">
                This scan checks
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-6 max-w-md">
                {ENGINE_CHECKS.map(({ label, icon: Icon }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-medium px-3 py-1 border border-[#DBEAFE]"
                  >
                    <Icon className="w-3 h-3" aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>

              <p className="text-[#94A3B8] text-xs">Accepted formats: JPG, PNG or PDF</p>
            </div>

            <CornerTicks className="text-[#2563EB]/25" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
};

export default FileUpload;
