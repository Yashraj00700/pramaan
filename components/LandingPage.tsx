import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  PlayCircle,
  ImageOff,
  Type,
  AlertTriangle,
  Stamp,
  FileWarning,
  Calculator,
  Landmark,
  Building2,
  Receipt,
  GraduationCap,
  Home,
  Check,
  X,
} from 'lucide-react';
import { DocScan, ShieldMark, ChecklistMark, SoftGlow, CornerTicks } from './motifs/Motifs';

interface LandingPageProps {
  onEnter: () => void;
}

/* ---------------------------------------------------------------------- */
/* Motion presets — restrained, 60fps-safe (transform/opacity only).       */
/* ---------------------------------------------------------------------- */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const stagger = (staggerChildren = 0.09, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren, delayChildren } },
});

const viewportOnce = { once: true, margin: '-80px' } as const;

/* ---------------------------------------------------------------------- */
/* Small building blocks                                                  */
/* ---------------------------------------------------------------------- */

/** Animated donut score ring with a count-up number — used in the hero product mock. */
const MiniScoreRing: React.FC<{ score: number; label: string; stroke: string }> = ({ score, label, stroke }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);
  const r = 26;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(score);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, score]);

  return (
    <div ref={ref} className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 shrink-0">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#E2E8F0" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: inView ? circumference - (circumference * score) / 100 : circumference }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div>
        <p className="font-display text-xl font-extrabold text-[#0F172A] leading-none">{display}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8] mt-1">{label}</p>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------- */

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const scrollToHowItWorks = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const steps = [
    {
      Motif: DocScan,
      title: 'Upload',
      description:
        'Drop in a certificate, marksheet, bank statement, invoice, or ID. Any image or PDF works — no setup required.',
    },
    {
      Motif: ChecklistMark,
      title: 'AI forensic analysis',
      description:
        'Our engine inspects visual artifacts, layout and typography, and cross-checks every field against itself for contradictions.',
    },
    {
      Motif: ShieldMark,
      title: 'Verdict with evidence',
      description:
        'Get a clear Authentic / Suspicious / Likely Fake verdict, a risk score, and every red flag highlighted on the document.',
    },
  ];

  const inspects = ['Tampering', 'Metadata', 'Cross-field logic', 'QR codes', 'Error level analysis'];

  const catches = [
    {
      icon: ImageOff,
      title: 'Digital tampering & photoshop',
      description: 'Cloned regions, inconsistent compression, and pixel-level edits invisible to the naked eye.',
      big: true,
    },
    {
      icon: Type,
      title: 'Template & font mismatches',
      description: 'Wrong fonts, spacing, or layouts that break from the official issuing template.',
    },
    {
      icon: AlertTriangle,
      title: 'Impossible or contradictory values',
      description: 'Dates that don’t add up, ages that don’t match, or figures that contradict each other.',
    },
    {
      icon: Stamp,
      title: 'Forged stamps & signatures',
      description: 'Seals, stamps, and signatures that don’t match known issuing patterns.',
    },
    {
      icon: FileWarning,
      title: 'Metadata anomalies',
      description: 'Editing software traces, timestamp mismatches, and other hidden file-level evidence.',
    },
    {
      icon: Calculator,
      title: 'Mismatched totals',
      description: 'Line items, taxes, and totals that don’t reconcile on invoices and financial statements.',
    },
  ];

  const useCases = [
    {
      icon: Landmark,
      title: 'Government schemes & certificates',
      description:
        'MP welfare schemes like Ladli Behna and scholarships, plus caste, income & domicile certificates — verify eligibility documents and protect public money from fraud.',
      hero: true,
    },
    {
      icon: Building2,
      title: 'Banking & KYC',
      description: 'Catch forged ID proofs, tampered statements, and manipulated income documents before onboarding.',
    },
    {
      icon: Receipt,
      title: 'Trade & invoices',
      description: 'Spot inflated or forged invoices, mismatched totals, and inconsistent trade documentation.',
    },
    {
      icon: GraduationCap,
      title: 'HR & education',
      description: 'Verify degrees, marksheets, and experience letters before they reach your payroll or admissions office.',
    },
    {
      icon: Home,
      title: 'Rentals & marketplaces',
      description: 'Check ID proofs, ownership papers, and agreements before handing over keys or closing a listing.',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-white text-[#0F172A] overflow-x-hidden">
      {/* ============================== NAV ============================== */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-[#E2E8F0]">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(37,99,235,0.55)]">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-display font-extrabold text-lg tracking-tight text-[#0F172A]">DocsGuard</span>
          </div>
          <motion.button
            onClick={onEnter}
            whileHover={{ y: -2 }}
            whileTap={{ y: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-4 sm:px-5 py-2.5 shadow-[0_10px_24px_-10px_rgba(37,99,235,0.6)] hover:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Check a document
            <ArrowUpRight className="w-4 h-4" />
          </motion.button>
        </nav>
      </header>

      {/* ============================== HERO ============================== */}
      <section className="dotgrid relative border-b border-[#E2E8F0]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: 'radial-gradient(60% 50% at 78% 12%, rgba(37,99,235,0.10) 0%, rgba(255,255,255,0) 70%)',
          }}
        />

        <div className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-20 sm:pb-28 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-10 items-center">
          {/* LEFT — copy */}
          <motion.div initial="hidden" animate="visible" variants={stagger(0.1, 0.05)} className="max-w-xl">
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] border border-[#DBEAFE] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2563EB]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Document Forensics
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-6 font-display font-extrabold leading-[1.04] text-[clamp(2.5rem,3.2vw+1.6rem,4.25rem)] text-[#0F172A]"
            >
              Spot fake documents
              <br />
              in seconds.
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-6 text-base sm:text-lg text-[#475569] leading-relaxed max-w-lg">
              Upload any certificate, invoice, ID, or bank statement. DocsGuard runs AI forensic
              verification and cross-field analysis to tell you if it's real — with every red flag
              highlighted as evidence.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-3">
              <motion.button
                onClick={onEnter}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="group inline-flex items-center gap-2 rounded-xl bg-[#2563EB] text-white text-base font-semibold px-7 py-3.5 shadow-[0_14px_30px_-10px_rgba(37,99,235,0.55)] hover:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                Check a document
                <ArrowUpRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </motion.button>
              <motion.a
                href="#how-it-works"
                onClick={scrollToHowItWorks}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white text-[#1E40AF] border border-[#DBEAFE] text-base font-semibold px-6 py-3.5 hover:border-[#2563EB] transition-colors"
              >
                <PlayCircle className="w-5 h-5" />
                See how it works
              </motion.a>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-8 flex items-center gap-2 text-sm text-[#475569]">
              <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
              Powered by Claude · documents are never stored
            </motion.p>
          </motion.div>

          {/* RIGHT — crystal + product mock */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative mx-auto w-full max-w-sm lg:max-w-none"
          >
            <SoftGlow className="-top-16 -right-10 w-72 h-72 z-0" />

            <div className="relative z-10 mt-4 bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.18)] p-6 sm:p-7">
              <CornerTicks color="rgba(37,99,235,.3)" />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Scan result</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] px-2.5 py-1 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  SUSPICIOUS
                </span>
              </div>

              <div className="mt-5 pt-5 border-t border-[#E2E8F0]">
                <MiniScoreRing score={64} label="Risk score" stroke="#F59E0B" />
              </div>

              <div className="mt-5 pt-5 border-t border-[#E2E8F0]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-7 h-7 rounded-lg bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center shrink-0">
                    <Type className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#0F172A]">Font mismatch on ID field</p>
                      <span className="shrink-0 rounded-full bg-[#FEF2F2] text-[#B91C1C] text-[10px] font-bold uppercase tracking-wide px-2 py-1">
                        High
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-0.5">Issuer template uses a different typeface here.</p>
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5">
                      <code className="text-[11px] text-[#334155] font-mono leading-relaxed break-words">
                        "Name" field: Arial Bold — template spec: Calibri
                      </code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-[#E2E8F0] space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#ECFDF5] text-[#10B981] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <p className="text-xs text-[#475569]">
                    Date of birth <span className="text-[#0F172A] font-medium">matches</span> across all fields
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center shrink-0">
                    <X className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <p className="text-xs text-[#475569]">
                    Issuing authority seal <span className="text-[#0F172A] font-medium">inconsistent</span> with region
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ========================= CREDIBILITY STRIP ========================= */}
      <section className="border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.06)}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
          >
            <motion.span variants={fadeUp} className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">
              What we inspect
            </motion.span>
            {inspects.map((item) => (
              <motion.span
                key={item}
                variants={fadeUp}
                className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#475569]"
              >
                {item}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ========================= HOW IT WORKS ========================= */}
      <section id="how-it-works" className="bg-[#F5F8FF]">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <motion.h2 variants={fadeUp} className="font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
              How it works
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
              Three steps between an uploaded file and a defensible verdict.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="grid grid-cols-1 sm:grid-cols-3 gap-5"
          >
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative bg-white rounded-2xl border border-[#E2E8F0] p-8 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.28)] transition-shadow"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Step {i + 1}
                </span>
                <div className="mt-4 w-16 h-16 rounded-xl bg-[#2563EB] flex items-center justify-center">
                  <step.Motif className="animate-floaty w-10 h-10 text-white" />
                </div>
                <h3 className="mt-6 font-display font-bold text-lg text-[#0F172A]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#475569] leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ========================= WHAT IT CATCHES ========================= */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.08)}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <motion.h2 variants={fadeUp} className="font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
            What it catches
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
            The forensic signals fraudsters rarely get all the way right.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.07)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 lg:grid-flow-row-dense gap-5"
        >
          {catches.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.28)] transition-shadow ${
                item.big ? 'lg:col-span-4 lg:row-span-2 flex flex-col' : 'lg:col-span-2'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center">
                <item.icon className="w-5 h-5 text-[#2563EB]" strokeWidth={2} />
              </div>
              <h3 className="mt-4 font-display font-bold text-base sm:text-lg text-[#0F172A]">{item.title}</h3>
              <p className="mt-2 text-sm text-[#475569] leading-relaxed max-w-sm">{item.description}</p>

              {item.big && (
                <div className="relative mt-6 flex-1 min-h-[160px] rounded-xl border border-[#E2E8F0] bg-[#F5F8FF] p-5 overflow-hidden">
                  <div className="space-y-2 max-w-[70%]">
                    <div className="h-2.5 w-2/3 rounded-full bg-[#DBEAFE]" />
                    <div className="h-2 w-full rounded-full bg-[#E2E8F0]" />
                    <div className="h-2 w-5/6 rounded-full bg-[#E2E8F0]" />
                    <div className="h-2 w-4/6 rounded-full bg-[#E2E8F0]" />
                  </div>
                  <div className="absolute right-6 bottom-5 w-24 h-16 rounded-md border-2 border-[#EF4444] bg-[#EF4444]/5">
                    <span className="absolute -top-3 left-1 rounded-full bg-[#EF4444] text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 whitespace-nowrap">
                      Cloned region
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ============================ USE CASES ============================ */}
      <section className="bg-[#F5F8FF]">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <motion.h2 variants={fadeUp} className="font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
              Built for every document
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
              Dead-simple to use anywhere a document needs to be trusted.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            {/* Hero card: government schemes */}
            <motion.div
              variants={fadeUp}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-8 sm:p-10 shadow-[0_16px_44px_-20px_rgba(15,23,42,0.14)] hover:shadow-[0_20px_50px_-16px_rgba(37,99,235,0.25)] transition-shadow"
            >
              <CornerTicks color="rgba(37,99,235,.3)" />
              <div className="relative flex flex-col sm:flex-row sm:items-start gap-6">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-[#2563EB] flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)]">
                  <Landmark className="w-7 h-7 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <span className="inline-block rounded-full bg-[#EFF6FF] border border-[#DBEAFE] px-3 py-1 text-xs font-semibold text-[#2563EB] mb-3">
                    Hero use case
                  </span>
                  <h3 className="font-display font-bold text-xl sm:text-2xl text-[#0F172A]">{useCases[0].title}</h3>
                  <p className="mt-3 text-sm sm:text-base text-[#475569] leading-relaxed max-w-2xl">
                    {useCases[0].description}
                  </p>
                </div>
              </div>
            </motion.div>

            {useCases.slice(1).map((item) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.25)] transition-shadow"
              >
                <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-[#2563EB]" strokeWidth={2} />
                </div>
                <h3 className="mt-4 font-display font-bold text-base text-[#0F172A]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#475569] leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================ CTA BAND ============================ */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="relative overflow-hidden rounded-2xl bg-[#2563EB] px-8 py-14 sm:px-16 sm:py-16 text-center shadow-[0_30px_70px_-24px_rgba(37,99,235,0.55)]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.16) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <ShieldMark className="hidden sm:block absolute -right-2 -top-4 w-24 opacity-90" />
          <div className="relative">
            <h2 className="font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-white">
              Upload any document. Know in seconds if it's real.
            </h2>
            <motion.button
              onClick={onEnter}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-white text-[#1E40AF] text-base font-semibold px-8 py-4 hover:bg-[#F5F8FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563EB]"
            >
              Check a document
              <ArrowRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1" />
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* ============================= FOOTER ============================= */}
      <footer className="border-t border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-display font-bold text-sm text-[#0F172A]">DocsGuard</span>
          </div>
          <p className="text-xs text-[#94A3B8] text-center sm:text-right">
            DocsGuard is an AI-assisted verification signal, not a substitute for official document authentication.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
