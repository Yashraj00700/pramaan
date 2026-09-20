import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from 'framer-motion';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Sparkles,
  PlayCircle,
  ImageOff,
  Type,
  AlertTriangle,
  Stamp,
  FileWarning,
  KeySquare,
  Landmark,
  Building2,
  Gavel,
  GraduationCap,
  Home,
  Check,
  X,
  ShieldCheck,
  Hash,
  FileClock,
  ScanEye,
  ScanLine,
  QrCode,
  ListChecks,
  Database,
  ShieldAlert,
  ShieldQuestion,
  Scale,
  Baseline,
  Layers,
  ShieldX,
  UserCheck,
  Lock,
  ChevronDown,
} from 'lucide-react';
import InteractiveBackground from './InteractiveBackground';
import { DocsGuardLogo, DocsGuardMark } from './Logo';
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

/** Shared hover treatment for primary/secondary controls: a transform lift (framer, GPU-cheap)
 *  plus a CSS shadow bloom (paint-only, never affects layout). Disabled under reduced motion. */
const HOVER_LIFT = { y: -2 } as const;
const HOVER_TAP = { y: 0, scale: 0.98 } as const;
const HOVER_TRANSITION = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

/* ---------------------------------------------------------------------- */
/* Instrument-grade micro components: eyebrow labels, hairline rules,      */
/* scroll progress, and a count-up primitive for the credibility figures.  */
/* ---------------------------------------------------------------------- */

/** Small tracked uppercase eyebrow — the section-label / data-caption pattern used throughout. */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-[#2563EB] ${className}`}>
    {children}
  </span>
);

/** A hairline with three short measurement ticks — instrument detailing between sections. */
const MeasureRule: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative h-px w-full bg-[#E2E8F0] ${className}`} aria-hidden="true">
    <span className="absolute left-0 -top-[3px] w-px h-[7px] bg-[#CBD5E1]" />
    <span className="absolute left-1/2 -translate-x-1/2 -top-[3px] w-px h-[7px] bg-[#CBD5E1]" />
    <span className="absolute right-0 -top-[3px] w-px h-[7px] bg-[#CBD5E1]" />
  </div>
);

/** Thin scroll-progress bar pinned to the very top of the viewport. Tied 1:1 to scroll position —
 *  under reduced motion the spring smoothing is skipped so it tracks the scrollbar exactly. */
const ScrollProgressBar: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const reducedMotion = useReducedMotion();
  const smoothed = useSpring(scrollYProgress, { stiffness: 300, damping: 42, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] bg-[#2563EB] origin-left z-[60] pointer-events-none"
      style={{ scaleX: reducedMotion ? scrollYProgress : smoothed }}
    />
  );
};

/** Counts a number up from 0 the first time it scrolls into view, then holds. Jumps straight to
 *  the target under reduced motion. Always renders with tabular-nums. */
const CountUp: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ value, decimals = 0, prefix = '', suffix = '', className = '' }) => {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [display, setDisplay] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reducedMotion]);

  const formatted =
    decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString('en-IN');

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

/* ---------------------------------------------------------------------- */
/* Hero product mock — a looping verdict card driven by the two real       */
/* outcomes the engine produces.                                          */
/* ---------------------------------------------------------------------- */

type FlagTone = 'ok' | 'bad';

interface VerdictState {
  verdict: string;
  ring: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  risk: number;
  confidence: number;
  flag: {
    tone: FlagTone;
    title: string;
    detail: string;
    code: string;
  };
  rows: { label: string; status: 'pass' | 'fail' }[];
}

const VERDICT_STATES: VerdictState[] = [
  {
    verdict: 'AUTHENTIC',
    ring: '#10B981',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#047857',
    risk: 2,
    confidence: 93,
    flag: {
      tone: 'ok',
      title: 'No binding checks failed',
      detail: 'Every deterministic identifier and metadata fact on this document passed.',
      code: 'Aadhaar checksum: PASS (Verhoeff)  ·  PDF ModDate = CreationDate',
    },
    rows: [
      { label: 'Stamp purchase date precedes execution date', status: 'pass' },
      { label: 'Declared totals reconcile with line items', status: 'pass' },
      { label: 'PDF producer matches the issuer’s known template', status: 'pass' },
    ],
  },
  {
    verdict: 'LIKELY FAKE',
    ring: '#EF4444',
    badgeBg: '#FEF2F2',
    badgeBorder: '#FECACA',
    badgeText: '#B91C1C',
    risk: 73,
    confidence: 96,
    flag: {
      tone: 'bad',
      title: 'GSTIN fails its official checksum',
      detail: 'A genuine issuer cannot produce this number — this is mathematical proof, not a stylistic judgement.',
      code: 'GSTIN 22AAAAA0000A1Z5 → mod-36 check digit invalid',
    },
    rows: [
      { label: 'Stamp purchase date precedes execution date', status: 'pass' },
      { label: 'Declared totals reconcile with line items', status: 'fail' },
      { label: 'GSTIN checksum validates', status: 'fail' },
    ],
  },
];

/** Animated donut score ring that re-animates whenever `score` changes (not just on first view). */
const LiveScoreRing: React.FC<{ score: number; stroke: string; reducedMotion: boolean }> = ({
  score,
  stroke,
  reducedMotion,
}) => {
  const [display, setDisplay] = useState(score);
  const prevScore = useRef(score);

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(score);
      prevScore.current = score;
      return;
    }
    const from = prevScore.current;
    const to = score;
    const duration = 800;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevScore.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reducedMotion]);

  const r = 30;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative w-[72px] h-[72px] shrink-0">
      <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#E2E8F0" strokeWidth="6" />
        <motion.circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference - (circumference * display) / 100 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-lg font-extrabold text-[#0F172A] leading-none tabular-nums">{display}</span>
      </div>
    </div>
  );
};

/** The looping "verdict card" hero mock — cross-fades between the two real DocsGuard outcomes. */
const VerdictMock: React.FC = () => {
  const [index, setIndex] = useState(0);
  const reducedMotion = !!useReducedMotion();

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % VERDICT_STATES.length), 4800);
    return () => clearInterval(id);
  }, []);

  const state = VERDICT_STATES[index];
  const FlagIcon = state.flag.tone === 'ok' ? Check : AlertTriangle;

  return (
    <div className="relative z-10 bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.18)] p-6 sm:p-7 overflow-hidden">
      <CornerTicks color="rgba(37,99,235,.35)" />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Verification result</span>
        <span className="text-[11px] font-mono text-[#94A3B8]">sample_report.pdf</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mt-4 flex items-center gap-4">
            <LiveScoreRing score={state.risk} stroke={state.ring} reducedMotion={reducedMotion} />
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
                style={{ background: state.badgeBg, color: state.badgeText, borderColor: state.badgeBorder }}
              >
                <FlagIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                {state.verdict}
              </span>
              <p className="mt-2 text-xs text-[#475569]">
                Risk <span className="font-semibold text-[#0F172A] tabular-nums">{state.risk}</span>/100 &middot; Confidence{' '}
                <span className="font-semibold text-[#0F172A] tabular-nums">{state.confidence}%</span>
              </p>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-[#E2E8F0]">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: state.flag.tone === 'ok' ? '#ECFDF5' : '#FEF2F2',
                  color: state.flag.tone === 'ok' ? '#10B981' : '#B91C1C',
                }}
              >
                <FlagIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0F172A]">{state.flag.title}</p>
                <p className="text-xs text-[#475569] mt-0.5">{state.flag.detail}</p>
                <div className="mt-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5">
                  <code className="text-[11px] text-[#334155] font-mono leading-relaxed break-words">{state.flag.code}</code>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-[#E2E8F0] space-y-2.5">
            {state.rows.map((row) => (
              <div key={row.label} className="flex items-center gap-2.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    row.status === 'pass' ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#FEF2F2] text-[#EF4444]'
                  }`}
                >
                  {row.status === 'pass' ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : (
                    <X className="w-3 h-3" strokeWidth={3} />
                  )}
                </span>
                <p className="text-xs text-[#475569]">
                  {row.label}
                  <span
                    className={`ml-1.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
                      row.status === 'pass' ? 'text-[#10B981]' : 'text-[#EF4444]'
                    }`}
                  >
                    {row.status}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* progress dots for the loop */}
      <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
        {VERDICT_STATES.map((s, i) => (
          <span
            key={s.verdict}
            className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
              i === index ? 'w-5 bg-[#2563EB]' : 'w-1.5 bg-[#DBEAFE]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------- */
/* "How a forgery gets caught" — a worked walkthrough of one tampered      */
/* income certificate, one binding signal at a time.                      */
/* ---------------------------------------------------------------------- */

interface ForgeryStep {
  n: string;
  microLabel: string;
  icon: React.ElementType;
  title: string;
  description: string;
  evidence: string;
}

const FORGERY_STEPS: ForgeryStep[] = [
  {
    n: '01',
    microLabel: 'TEXT LAYER',
    icon: Baseline,
    title: 'Re-typed figure',
    description: 'The income amount was deleted and retyped over the original text layer.',
    evidence: 'Font: Arial 10.2pt vs. document base Times New Roman — baseline drift +0.6px',
  },
  {
    n: '02',
    microLabel: 'SERIAL NO.',
    icon: Hash,
    title: 'Altered serial',
    description: 'The certificate serial number was hand-edited to a value the issuing office never assigned.',
    evidence: 'Serial IC/24/0041832 → issuing-district check-digit invalid',
  },
  {
    n: '03',
    microLabel: 'ELA DELTA',
    icon: Layers,
    title: 'Compression seam',
    description: 'Error-level analysis exposes a rectangular region compressed at a different quality than the rest of the page.',
    evidence: 'ELA delta +340% inside a 118×34px region around the amount field',
  },
  {
    n: '04',
    microLabel: 'CHECKSUM',
    icon: ShieldX,
    title: 'Failed checksum',
    description: 'The binding fact that ends the argument — a printed identifier that cannot pass its own official formula.',
    evidence: 'Verhoeff check digit: computed 4 ≠ printed 7 — FAIL',
  },
];

/* ---------------------------------------------------------------------- */
/* Honest FAQ — native <details> accordions, no framework state needed.    */
/* ---------------------------------------------------------------------- */

interface FaqItem {
  icon: React.ElementType;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    icon: UserCheck,
    question: 'Does this replace an officer or verifier?',
    answer:
      'No. DocsGuard produces a verdict, a risk score, and the exact evidence behind it — a human still makes the call. Nothing here is designed to auto-approve or auto-reject a document.',
  },
  {
    icon: Lock,
    question: 'What happens to my document after I upload it?',
    answer:
      'It is analysed in flight — hashed, checked, and reasoned over for the duration of the request. DocsGuard does not store uploaded documents on its servers.',
  },
  {
    icon: Database,
    question: 'What can it not verify yet?',
    answer:
      'Whether the issuer actually issued it. That needs a live source-of-truth lookup — DigiLocker, UIDAI, GSTN, a registry — which DocsGuard lists rather than fakes. Until that integration exists, a document can pass every check here and still be issued from nowhere.',
  },
  {
    icon: Scale,
    question: 'How are false positives avoided?',
    answer:
      'The adjudicator pass is bound to weigh the defence’s argument against the prosecution’s, and dismiss any flag that doesn’t survive scrutiny — a stylistic quirk isn’t treated the same as a failed checksum.',
  },
];

/* ---------------------------------------------------------------------- */

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const scrollToId = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navLinks = [
    { id: 'how-it-works', label: 'How it works' },
    { id: 'what-it-catches', label: 'What it catches' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'forgery-walkthrough', label: 'Anatomy of a fake' },
    { id: 'impact', label: 'Impact' },
    { id: 'faq', label: 'FAQ' },
  ];

  const steps = [
    {
      Motif: DocScan,
      title: 'Upload',
      description:
        'Drop in a certificate, marksheet, bank statement, invoice, or ID. Any image or PDF works — no setup, no account required.',
    },
    {
      Motif: ChecklistMark,
      title: 'Deterministic checks + AI forensics',
      description:
        'Code computes hashes, metadata, tamper heatmaps and identifier checksums first. Claude then reasons over the pixels, layout, and every cross-field claim.',
    },
    {
      Motif: ShieldMark,
      title: 'Verdict with evidence',
      description:
        'A clear Authentic / Suspicious / Likely Fake verdict, a risk score, and every red flag pinned to the exact evidence that produced it.',
    },
  ];

  const catches = [
    {
      icon: ImageOff,
      title: 'Digital tampering & splicing',
      description: 'Cloned regions, inconsistent compression, and pixel-level edits invisible to the naked eye.',
      big: true,
    },
    {
      icon: Type,
      title: 'Typography & baseline mismatch',
      description: 'Fonts, kerning, or baseline shifts that break from the official issuing template.',
    },
    {
      icon: AlertTriangle,
      title: 'Contradictory values',
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
      description: 'Editing-software traces, timestamp mismatches, and other hidden file-level evidence.',
    },
    {
      icon: KeySquare,
      title: 'Failed identifier checksums',
      description: 'Aadhaar, PAN, GSTIN, IFSC, IBAN and MRZ numbers checked against their official check-digit math — not just their look.',
      wide: true,
    },
  ];

  const bindingFacts = [
    { icon: Hash, label: 'SHA-256 file fingerprint' },
    { icon: FileClock, label: 'PDF producer + creation-vs-modification dates' },
    { icon: ScanEye, label: 'Image EXIF & editor tags — Photoshop, GIMP, Canva…' },
    { icon: ScanLine, label: 'Error-Level Analysis (ELA) tamper heatmap' },
    { icon: QrCode, label: 'QR / barcode decode, cross-checked against printed fields' },
    { icon: ListChecks, label: 'Identifier checksums — Aadhaar, PAN, GSTIN, IFSC, IBAN, MRZ' },
  ];

  const listedChecks = [
    'DigiLocker / e-District document lookups',
    'UIDAI Aadhaar verification API',
    'GSTN GSTIN-search API',
    'Bank / sanctions (OFAC-style) screening',
    'Company registry (MCA) lookups',
  ];

  const courtRoles = [
    {
      icon: ShieldAlert,
      title: 'Prosecution',
      description: 'Argues forgery and tampering as rigorously as the real evidence allows.',
      tint: '#FEF2F2',
      color: '#B91C1C',
    },
    {
      icon: ShieldQuestion,
      title: 'Defence',
      description: 'Argues the innocent explanation for every indicator, and flags where prosecution overreaches.',
      tint: '#EFF6FF',
      color: '#1E40AF',
    },
    {
      icon: Scale,
      title: 'Adjudicator',
      description: 'Issues the final verdict — bound by the binding facts, weighing what’s decisive against what’s dismissed.',
      tint: '#F5F8FF',
      color: '#0F172A',
    },
  ];

  const useCases = [
    {
      icon: Landmark,
      title: 'Government schemes & certificates',
      description:
        'MP welfare schemes, scholarships, and caste, income & domicile certificates — verify eligibility documents and protect public money from fraud.',
      hero: true,
    },
    {
      icon: Building2,
      title: 'Banking & KYC',
      description: 'Catch forged ID proofs, tampered statements, and manipulated income documents before onboarding.',
    },
    {
      icon: Gavel,
      title: 'Tenders & procurement',
      description: 'Screen turnover certificates, bank guarantees, and experience letters — the exact document types behind India’s largest tender-fraud cases.',
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
      <ScrollProgressBar />

      {/* ============================== NAV ============================== */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#E2E8F0]">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#top" className="cursor-pointer" onClick={scrollToId('top')} aria-label="DocsGuard home">
            <DocsGuardLogo markClassName="w-8 h-8" />
          </a>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={scrollToId(link.id)}
                className="cursor-pointer text-sm font-semibold text-[#475569] hover:text-[#2563EB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 rounded"
              >
                {link.label}
              </a>
            ))}
          </div>

          <motion.button
            onClick={onEnter}
            whileHover={HOVER_LIFT}
            whileTap={HOVER_TAP}
            transition={HOVER_TRANSITION}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-4 sm:px-5 py-2.5 min-h-[44px] shadow-[0_10px_24px_-10px_rgba(37,99,235,0.6)] hover:shadow-[0_16px_34px_-10px_rgba(37,99,235,0.65)] hover:bg-[#1E40AF] transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Check a document
            <ArrowUpRight className="w-4 h-4" />
          </motion.button>
        </nav>
      </header>

      <div id="top" />

      {/* ============================== HERO ============================== */}
      <section className="relative border-b border-[#E2E8F0] overflow-hidden">
        <InteractiveBackground variant="hero" />

        <div className="relative max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-20 sm:pb-28 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-10 items-center">
          {/* LEFT — copy */}
          <motion.div initial="hidden" animate="visible" variants={stagger(0.1, 0.05)} className="max-w-xl">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" aria-hidden="true" />
              <Eyebrow>AI Document Forensics</Eyebrow>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-5 font-display font-extrabold leading-[1.02] text-[clamp(2.75rem,3.6vw+1.6rem,4.75rem)] text-[#0F172A]"
            >
              Fake documents
              <br />
              don&rsquo;t survive scrutiny.
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-5 text-base sm:text-lg text-[#475569] leading-relaxed max-w-md">
              Deterministic forensic checks plus adversarial AI review. Every verdict ships with
              the exact evidence behind it — in seconds.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-3">
              <motion.button
                onClick={onEnter}
                whileHover={HOVER_LIFT}
                whileTap={HOVER_TAP}
                transition={HOVER_TRANSITION}
                className="cursor-pointer group inline-flex items-center gap-2 rounded-xl bg-[#2563EB] text-white text-base font-semibold px-7 py-3.5 min-h-[44px] shadow-[0_14px_30px_-10px_rgba(37,99,235,0.55)] hover:shadow-[0_20px_42px_-10px_rgba(37,99,235,0.6)] hover:bg-[#1E40AF] transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                Check a document
                <ArrowUpRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none" />
              </motion.button>
              <motion.a
                href="#how-it-works"
                onClick={scrollToId('how-it-works')}
                whileHover={HOVER_LIFT}
                whileTap={HOVER_TAP}
                transition={HOVER_TRANSITION}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-white text-[#1E40AF] border border-[#DBEAFE] text-base font-semibold px-6 py-3.5 min-h-[44px] hover:border-[#2563EB] hover:shadow-[0_12px_28px_-14px_rgba(37,99,235,0.4)] transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none"
              >
                <PlayCircle className="w-5 h-5" />
                See how it works
              </motion.a>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-8 flex items-center gap-2 text-sm text-[#475569]">
              <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
              Powered by Claude &middot; documents are never stored
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-6 flex items-center gap-3 text-[11px] font-mono text-[#94A3B8]"
            >
              <span className="tabular-nums text-[#2563EB] font-bold">06</span>
              <span className="uppercase tracking-[0.1em]">binding checks</span>
              <span className="w-px h-3 bg-[#E2E8F0]" aria-hidden="true" />
              <span className="tabular-nums text-[#2563EB] font-bold">03</span>
              <span className="uppercase tracking-[0.1em]">adversarial passes</span>
            </motion.div>
          </motion.div>

          {/* RIGHT — animated product mock */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative mx-auto w-full max-w-sm lg:max-w-none"
          >
            <SoftGlow className="-top-16 -right-10 w-72 h-72 z-0" />
            <div className="relative mt-4">
              <VerdictMock />
            </div>
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
            className="text-center max-w-2xl mx-auto mb-16"
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
            variants={stagger(0.1)}
            className="relative"
          >
            {/* connecting line, centered on the numbered circles */}
            <div
              aria-hidden="true"
              className="hidden sm:block absolute top-7 left-[16.6%] right-[16.6%] h-px bg-gradient-to-r from-[#DBEAFE] via-[#2563EB]/50 to-[#DBEAFE]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
              {steps.map((step, i) => (
                <motion.div key={step.title} variants={fadeUp} className="relative flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="relative z-10 w-14 h-14 rounded-full ring-8 ring-[#F5F8FF] bg-[#2563EB] text-white font-display font-extrabold text-lg flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] tabular-nums">
                    {i + 1}
                  </div>
                  <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-6 w-full bg-white rounded-2xl border border-[#E2E8F0] p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.28)] transition-shadow motion-reduce:transition-none"
                  >
                    <step.Motif className="animate-floaty w-10 h-10 text-[#2563EB] mx-auto sm:mx-0" />
                    <h3 className="mt-5 font-display font-bold text-lg text-[#0F172A]">{step.title}</h3>
                    <p className="mt-2 text-sm text-[#475569] leading-relaxed">{step.description}</p>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ========================= WHAT IT CATCHES ========================= */}
      <section id="what-it-catches" className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.08)}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>The threat surface</Eyebrow>
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
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
              className={`relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.28)] transition-shadow motion-reduce:transition-none ${
                item.big ? 'lg:col-span-4 lg:row-span-2 flex flex-col' : item.wide ? 'lg:col-span-4' : 'lg:col-span-2'
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

              {item.wide && (
                <div className="mt-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#334155]">Aadhaar &middot; Verhoeff</span>
                    <span className="font-bold text-[#EF4444]">FAIL</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#334155]">GSTIN &middot; mod-36</span>
                    <span className="font-bold text-[#EF4444]">FAIL</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#334155]">IFSC &middot; format</span>
                    <span className="font-bold text-[#10B981]">PASS</span>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ========================= DIFFERENTIATOR / ARCHITECTURE ========================= */}
      <section id="architecture" className="bg-[#F5F8FF]">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <motion.div variants={fadeUp}>
              <Eyebrow>The architecture</Eyebrow>
            </motion.div>
            <motion.h2 variants={fadeUp} className="mt-3 font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
              Deterministic facts outrank AI opinion.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
              DocsGuard doesn&rsquo;t ask a model to eyeball a document and hope. Every identifier and
              metadata fact is computed in code first &mdash; and it&rsquo;s binding: no amount of
              clever reasoning can argue away a failed checksum.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.1)}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          >
            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-7 sm:p-8 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center shrink-0">
                  <Hash className="w-5 h-5 text-[#2563EB]" strokeWidth={2} />
                </div>
                <h3 className="font-display font-bold text-lg text-[#0F172A]">Binding &mdash; computed in code</h3>
              </div>
              <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                These are mathematics and file structure, not opinion. A FAIL here overrides any
                softer read elsewhere in the report.
              </p>
              <ul className="mt-5 space-y-3">
                {bindingFacts.map((fact) => (
                  <li key={fact.label} className="flex items-start gap-3">
                    <span className="mt-0.5 w-7 h-7 rounded-lg bg-[#F5F8FF] text-[#1E40AF] flex items-center justify-center shrink-0">
                      <fact.icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span className="text-sm text-[#334155] leading-relaxed">{fact.label}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-7 sm:p-8 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-[#2563EB]" strokeWidth={2} />
                </div>
                <h3 className="font-display font-bold text-lg text-[#0F172A]">Listed &mdash; never invented</h3>
              </div>
              <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                Anything that needs a live registry DocsGuard doesn&rsquo;t query today is named
                explicitly &mdash; never guessed, never silently skipped.
              </p>
              <ul className="mt-5 space-y-3">
                {listedChecks.map((label) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="mt-0.5 w-7 h-7 rounded-lg bg-[#F5F8FF] text-[#1E40AF] flex items-center justify-center shrink-0">
                      <Database className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span className="text-sm text-[#334155] leading-relaxed">{label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3">
                <p className="text-xs text-[#92400E] leading-relaxed">
                  This list is the credibility feature, not a weakness to hide: a tool that silently
                  pretends to have checked a live registry is more dangerous than one that says
                  &ldquo;go verify this at the source.&rdquo;
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* Adversarial review */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger(0.08)}
            className="mt-14 rounded-2xl border border-[#E2E8F0] bg-white p-7 sm:p-10 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)]"
          >
            <motion.div variants={fadeUp} className="max-w-2xl">
              <Eyebrow>Accuracy mechanism</Eyebrow>
              <h3 className="mt-2 font-display font-bold text-xl sm:text-2xl text-[#0F172A]">
                Every verdict survives a courtroom first.
              </h3>
              <p className="mt-3 text-sm sm:text-base text-[#475569] leading-relaxed">
                Three separate Claude passes argue the same document from opposing sides. A neutral
                fourth pass adjudicates &mdash; bound by the deterministic facts above, which can
                never be argued away.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row items-stretch gap-3 sm:gap-2">
              {courtRoles.map((role, i) => (
                <React.Fragment key={role.title}>
                  <div className="flex-1 rounded-xl border border-[#E2E8F0] p-5 bg-[#F5F8FF]/60">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: role.tint, color: role.color }}
                    >
                      <role.icon className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <h4 className="mt-3 font-display font-bold text-sm text-[#0F172A]">{role.title}</h4>
                    <p className="mt-1.5 text-xs text-[#475569] leading-relaxed">{role.description}</p>
                  </div>
                  {i < courtRoles.length - 1 && (
                    <div className="flex items-center justify-center shrink-0 text-[#94A3B8]">
                      <ArrowRight className="hidden sm:block w-5 h-5" />
                      <ArrowDown className="sm:hidden w-5 h-5" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ==================== HOW A FORGERY GETS CAUGHT ==================== */}
      <section id="forgery-walkthrough" className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.08)}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>Worked example</Eyebrow>
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
            How a forgery gets caught
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
            One tampered income certificate, walked one binding signal at a time &mdash; the kind
            of evidence a human reviewer would need a microscope to see.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.09)}
          className="relative rounded-2xl border border-[#E2E8F0] bg-white p-2 sm:p-3 shadow-[0_16px_44px_-24px_rgba(15,23,42,0.16)]"
        >
          <CornerTicks color="rgba(37,99,235,.3)" />
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
            {FORGERY_STEPS.map((step) => (
              <motion.div key={step.n} variants={fadeUp} className="p-6 sm:p-7 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold tabular-nums text-[#2563EB]">
                    {step.n}
                  </span>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                    {step.microLabel}
                  </span>
                </div>

                <div className="mt-4 w-10 h-10 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
                  <step.icon className="w-5 h-5 text-[#B91C1C]" strokeWidth={2} />
                </div>

                <h3 className="mt-4 font-display font-bold text-base text-[#0F172A]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#475569] leading-relaxed flex-1">{step.description}</p>

                <div className="mt-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2.5">
                  <code className="text-[10.5px] text-[#334155] font-mono leading-relaxed break-words">
                    {step.evidence}
                  </code>
                </div>

                <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-[#FEF2F2] border border-[#FECACA] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-[#EF4444]">
                  Fail
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="mt-6 text-center text-sm text-[#94A3B8]"
        >
          Any one of these four is enough to raise a flag. Here, all four agree.
        </motion.p>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        <MeasureRule />
      </div>

      {/* ========================= CREDIBILITY / IMPACT ========================= */}
      <section id="impact" className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.08)}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>Why this matters</Eyebrow>
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
            Document fraud at this scale is already public record.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-[#475569]">
            Every figure below is a cited, government-reported or investigated number &mdash; not a
            claim about DocsGuard&rsquo;s own results.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger(0.1)} className="space-y-5">
          {/* headline stat */}
          <motion.div
            variants={fadeUp}
            className="relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-8 sm:p-10 shadow-[0_16px_44px_-20px_rgba(15,23,42,0.14)]"
          >
            <div className="grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-start">
              <p className="font-display font-extrabold text-4xl sm:text-5xl text-[#1E40AF] leading-none whitespace-nowrap">
                <CountUp value={3.48} decimals={2} prefix="₹" suffix="L Cr" />
              </p>
              <div>
                <p className="text-sm sm:text-base text-[#334155] leading-relaxed">
                  Cumulative savings from India&rsquo;s Direct Benefit Transfer programme (~US$42B),
                  from removing fake and duplicate welfare beneficiaries &mdash; per the Union IT
                  Minister.
                </p>
                <div className="mt-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3">
                  <p className="text-xs text-[#92400E] leading-relaxed">
                    <span className="font-semibold">Honest caveat:</span> this is identity-deduplication
                    savings, not document-forensics savings. DocsGuard targets a different,
                    complementary failure &mdash; the document itself being fabricated even when the
                    applicant is a real, unique person.
                  </p>
                </div>
                <a
                  href="https://dbtbharat.gov.in/static-page-content/spagecont?id=18"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
                >
                  Source: DBT Bharat <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Eyebrow className="text-[#94A3B8]">Forged bank guarantees &mdash; two separate proceedings</Eyebrow>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)]"
            >
              <p className="font-display font-extrabold text-3xl text-[#0F172A]">
                <CountUp value={202} prefix="₹" suffix=" Cr" />
              </p>
              <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                Forged PNB and Bank of Baroda guarantees submitted to <strong>Madhya Pradesh Jal Nigam
                Maryadit</strong> and Rajasthan Renewable Energy Corp to win public contracts &mdash;
                an Enforcement Directorate case. Exactly the document a counter cannot verify by eye.
              </p>
              <a
                href="https://the420.in/fake-guarantees-real-loss-rs202-crore-bank-guarantee-scam-ed-attaches-assets/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Source: ED case, via The420.in <ArrowUpRight className="w-3 h-3" />
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)]"
            >
              <p className="font-display font-extrabold text-3xl text-[#0F172A]">
                <CountUp value={183} prefix="₹" suffix=" Cr" />
              </p>
              <p className="mt-3 text-sm text-[#475569] leading-relaxed">
                A separate, Kolkata-based syndicate systematically issuing counterfeit bank
                guarantees to secure public infrastructure contracts &mdash; CBI arrests included a
                serving Punjab National Bank branch manager.
              </p>
              <a
                href="https://www.angelone.in/news/market-updates/fake-bank-guarantee-scam-cbi-arrests-2-in-183-crore-fraud-case"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Source: CBI arrests, via Angel One <ArrowUpRight className="w-3 h-3" />
              </a>
            </motion.div>
          </div>

          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8"
          >
            <p className="font-display font-extrabold text-3xl text-[#0F172A] whitespace-nowrap">
              <CountUp value={830} /> <span className="text-[#94A3B8] font-normal">/</span>{' '}
              <CountUp value={1572} />
            </p>
            <div className="flex-1">
              <p className="text-sm text-[#475569] leading-relaxed">
                Minority institutions found fake or inactive in a Ministry of Minority Affairs audit
                &mdash; <span className="tabular-nums">&#8377;144.83</span> crore in scholarship
                misuse over five years.
              </p>
              <a
                href="https://www.deccanherald.com/amp/story/india%2Fprobe-reveals-major-scam-in-minority-ministrys-scholarship-program-2654064"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Source: Deccan Herald <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ============================ USE CASES ============================ */}
      <section id="use-cases" className="bg-[#F5F8FF]">
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
              className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-8 sm:p-10 shadow-[0_16px_44px_-20px_rgba(15,23,42,0.14)] hover:shadow-[0_20px_50px_-16px_rgba(37,99,235,0.25)] transition-shadow motion-reduce:transition-none"
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
                className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.10)] hover:shadow-[0_20px_40px_-16px_rgba(37,99,235,0.25)] transition-shadow motion-reduce:transition-none"
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

      {/* ============================== FAQ ============================== */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.08)}
          className="text-center mb-12"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>Straight answers</Eyebrow>
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-display font-bold text-3xl sm:text-4xl leading-[1.1] text-[#0F172A]">
            Before you upload anything
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger(0.06)}
          className="border-t border-[#E2E8F0]"
        >
          {FAQ_ITEMS.map((item) => (
            <motion.details
              key={item.question}
              variants={fadeUp}
              className="group border-b border-[#E2E8F0] py-5 [&::-webkit-details-marker]:hidden marker:content-none"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 rounded-lg">
                <span className="flex items-center gap-3.5">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-[#2563EB]" strokeWidth={2} />
                  </span>
                  <span className="font-display font-bold text-base sm:text-lg text-[#0F172A]">
                    {item.question}
                  </span>
                </span>
                <ChevronDown className="w-5 h-5 shrink-0 text-[#94A3B8] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <p className="mt-3 pl-[46px] pr-2 text-sm text-[#475569] leading-relaxed">{item.answer}</p>
            </motion.details>
          ))}
        </motion.div>
      </section>

      {/* ============================ CTA BAND ============================ */}
      <section className="relative overflow-hidden">
        <InteractiveBackground variant="ambient" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 sm:py-28">
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
                Upload any document. Know in seconds if it&rsquo;s real.
              </h2>
              <motion.button
                onClick={onEnter}
                whileHover={HOVER_LIFT}
                whileTap={HOVER_TAP}
                transition={HOVER_TRANSITION}
                className="cursor-pointer group mt-8 inline-flex items-center gap-2 rounded-xl bg-white text-[#1E40AF] text-base font-semibold px-8 py-4 min-h-[44px] shadow-[0_10px_24px_-10px_rgba(15,23,42,0.35)] hover:shadow-[0_16px_36px_-10px_rgba(15,23,42,0.4)] hover:bg-[#F5F8FF] transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563EB]"
              >
                Check a document
                <ArrowRight className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:transform-none" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============================= FOOTER ============================= */}
      <footer className="border-t border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <DocsGuardMark className="w-7 h-7" />
          <p className="text-xs text-[#94A3B8] text-center sm:text-right">
            DocsGuard is an AI-assisted verification signal, not a substitute for official document authentication.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
