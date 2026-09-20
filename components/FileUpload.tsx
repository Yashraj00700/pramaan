
import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Camera, ArrowUpRight, Fingerprint, ScanLine, Gavel, ShieldCheck } from 'lucide-react';
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

const FileUpload: React.FC<Props> = ({ onFileSelect, isAnalyzing }) => {
  const [dragActive, setDragActive] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Advance through the stepper while a scan is running. Presentational only —
  // the real analysis promise in App.tsx is what actually gates isAnalyzing.
  useEffect(() => {
    if (isAnalyzing) {
      setScanStep(0);
      const timers = [1200, 3000, 5200, 7200].map((time, index) =>
        setTimeout(() => setScanStep(index + 1), time)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [isAnalyzing]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <AnimatePresence mode="wait" initial={false}>
        {isAnalyzing ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative h-[420px] rounded-3xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col items-center justify-center"
          >
            <CornerTicks className="text-[#2563EB]/25" />

            {/* Cobalt scan-line sweeping top-to-bottom */}
            <motion.div
              aria-hidden="true"
              className="absolute left-0 right-0 h-0.5 motion-reduce:hidden"
              style={{
                background: 'linear-gradient(90deg, transparent, #2563EB 20%, #3B82F6 50%, #2563EB 80%, transparent)',
                boxShadow: '0 0 14px 2px rgba(37,99,235,0.55)',
              }}
              initial={{ top: '0%', opacity: 0 }}
              animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity, times: [0, 0.08, 0.92, 1] }}
            />

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">
              <div className="w-20 h-20 rounded-2xl bg-[#EFF6FF] border border-[#2563EB]/15 flex items-center justify-center mb-7">
                <ScanLine className="w-9 h-9 text-[#2563EB] animate-pulse" strokeWidth={1.75} />
              </div>

              <h3 className="font-display text-2xl font-bold text-[#0F172A] mb-1 tracking-tight text-center">
                Scanning your document
              </h3>
              <p className="text-[#475569] text-xs mb-8 text-center">This usually takes a few seconds</p>

              <div className="w-full space-y-4">
                {SCAN_STEPS.map((step, i) => {
                  const isDone = scanStep > i;
                  const isActive = scanStep === i;
                  return (
                    <motion.div
                      key={step.label}
                      initial={false}
                      animate={{
                        opacity: scanStep >= i ? 1 : 0.4,
                        x: scanStep >= i ? 0 : -8,
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center gap-4"
                    >
                      <div
                        className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors duration-300 ${
                          isDone
                            ? 'bg-[#2563EB] text-white'
                            : isActive
                            ? 'bg-[#2563EB] text-white animate-pulse'
                            : 'bg-[#EFF6FF] text-[#475569] border border-[#E2E8F0]'
                        }`}
                      >
                        {isDone ? <ShieldCheck className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
                      </div>
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
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            role="button"
            tabIndex={0}
            aria-label="Upload a document to scan"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -2 }}
            onClick={onButtonClick}
            onKeyDown={onCardKeyDown}
            className={`w-full rounded-3xl border-2 border-dashed cursor-pointer relative overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 transition-colors duration-200 ${
              dragActive ? 'border-[#2563EB] bg-[#DBEAFE]' : 'border-[#2563EB]/40 bg-[#F5F8FF] hover:bg-[#EFF6FF] hover:border-[#2563EB]/70'
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

            <div className="flex flex-col items-center text-center px-6 py-14 sm:py-16">
              <motion.div
                animate={dragActive ? { scale: 1.1, rotate: 3 } : { scale: 1, rotate: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`w-20 h-20 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-center mb-6 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] transition-colors duration-300 ${
                  dragActive ? 'text-[#2563EB]' : 'text-[#2563EB]/60 group-hover:text-[#2563EB]'
                }`}
              >
                <DocScan className="w-10 h-10" />
              </motion.div>

              <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-2">
                {dragActive ? 'Drop to scan' : 'Drag & drop your document'}
              </h3>
              <p className="text-[#475569] text-sm mb-9 max-w-sm leading-relaxed">
                PNG, JPG or PDF · certificates, invoices, IDs, statements
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <motion.button
                  whileHover={{ y: -2, boxShadow: '0 20px 40px -16px rgba(37,99,235,0.45)' }}
                  whileTap={{ y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onButtonClick();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold px-6 py-3 shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)]"
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#DBEAFE] text-[#1E40AF] text-sm font-semibold px-6 py-3 hover:border-[#2563EB]"
                >
                  <Camera className="w-4 h-4" /> Scan with camera
                </motion.button>
              </div>

              <p className="text-[#94A3B8] text-xs mt-8">Accepted formats: JPG, PNG or PDF</p>
            </div>

            <CornerTicks className="text-[#2563EB]/25" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileUpload;
