import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Quote, Landmark, AlertTriangle, ArrowRight, Layers } from 'lucide-react';

/**
 * The "About" page — the founders' own account of why DocsGuard exists, plus
 * the four hand-authored diagrams (also embedded in the README) that show how
 * the analysis actually works. No invented statistics, quotes, testimonials,
 * or company names anywhere on this page.
 */

type Diagram = {
  src: string;
  title: string;
  alt: string;
  caption: string;
};

const DIAGRAMS: Diagram[] = [
  {
    src: '/diagrams/diagram-pipeline.svg',
    title: 'The analysis pipeline',
    alt: 'DocsGuard analysis pipeline: an upload flows through a deterministic signal layer and Pass A, fans out into three concurrent passes, merges into a dossier, and passes through a binding checksum override before the verdict.',
    caption:
      'A document goes through a deterministic layer first — hashes, EXIF, cross-field checks — then three passes run concurrently, including the adversarial court below. Everything merges into one dossier. A binding, code-computed override is applied last: it can only push the verdict toward more risk, never less.',
  },
  {
    src: '/diagrams/diagram-layers.svg',
    title: 'What is proven, reasoned, and not verified',
    alt: 'Trust-layer stack: PROVEN facts computed in code, REASONED inference by the model, and NOT VERIFIED items that require a live external source, with a rule that NOT VERIFIED items never move the verdict.',
    caption:
      'Every finding is labelled by how sure we actually are. PROVEN is code-computed — a SHA-256 hash, EXIF editor tags. REASONED is the model reading the document the way a person would. NOT VERIFIED covers anything that needs a live external source — a registry, a bank, DigiLocker — and it is never allowed to raise or lower the verdict on its own.',
  },
  {
    src: '/diagrams/diagram-court.svg',
    title: 'Prosecution, defence, adjudicator',
    alt: 'Adversarial court: prosecution and defence are fed identical evidence, a judge weighs both cases against the binding facts, and rules on a verdict and a confidence level.',
    caption:
      'Two model passes see the exact same evidence and argue opposite sides — one building the strongest honest case that the document is forged, the other the strongest honest innocent explanation. A third pass acts as judge, weighs both against the binding facts, and rules.',
  },
  {
    src: '/diagrams/diagram-anatomy.svg',
    title: 'Anatomy of a caught forgery',
    alt: 'Anatomy of a caught forgery on a stylised specimen certificate: a re-typed income figure in a mismatched font, an altered reference number that fails its check digit, a JPEG recompression seam visible under error-level analysis, and a binding checksum failure that overrides everything above it.',
    caption:
      'A worked example on a specimen certificate: an income figure re-typed in a font that does not quite match its neighbours, a reference number that fails its own check digit, a recompression seam that error-level analysis picks up, and — underneath all of it — a checksum failure, which is the one signal that overrides everything else.',
  },
];

const CANNOT_DO_YET: { title: string; body: string }[] = [
  {
    title: 'No issuer source-of-truth, yet',
    body:
      'We cannot call the issuing authority and ask "did you issue this?" until DigiLocker integration is in place. Until then, registry and issuer checks are reasoned about, not confirmed.',
  },
  {
    title: 'Error-level analysis is weak on flat, vector-rendered documents',
    body:
      'ELA relies on how JPEG recompression behaves on photographed or scanned pages. A document rendered straight from a flat vector source — no scan, no photograph — gives it much less to work with.',
  },
  {
    title: 'Confidence is self-reported, not calibrated',
    body:
      'The confidence figure in a report is the model stating how sure it is. It has not been validated against a labelled dataset, so it should be read as a signal, not a statistic.',
  },
  {
    title: 'Signature and seal verification needs a separate service',
    body:
      'We can flag that a signature or seal looks inconsistent with the rest of the page. We cannot confirm whose signature it is — that requires a dedicated verification service we do not run.',
  },
];

const About: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();

  const fadeUp = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-80px' },
          transition: { duration: 0.5, delay, ease: 'easeOut' },
        };

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── The founder story ───────────────────────────────────────── */}
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB] mb-3">
        Why we built this
      </p>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0F172A] mb-8 leading-tight">
        We were scammed on our own documents.
        <br className="hidden sm:block" /> So we built the check we needed.
      </h1>

      <div className="max-w-2xl space-y-5 text-[15px] sm:text-base text-[#475569] leading-[1.8]">
        <p>
          We ran an import/export business. Every deal begins the same way: the counterparty sends
          their documents — company registration, bank details, certificates, guarantees. We
          received them. We had no real way to verify any of it.
        </p>
        <p>
          A single export deal takes eight to twelve months to complete. For that entire period we
          hold stock reserved for that buyer — capital tied up, inventory committed, other buyers
          turned away.
        </p>
      </div>

      <motion.figure {...fadeUp(0.05)} className="max-w-2xl my-10 border-l-4 border-[#2563EB] pl-6 sm:pl-8">
        <Quote className="w-7 h-7 text-[#2563EB]/30 mb-3" aria-hidden="true" />
        <blockquote className="font-display font-bold text-xl sm:text-2xl text-[#0F172A] leading-snug">
          We were scammed more than once. And the loss was never just the money on that deal. It
          was eight to twelve months of time, and the stock we had held for someone who was never
          real.
        </blockquote>
      </motion.figure>

      <div className="max-w-2xl space-y-5 text-[15px] sm:text-base text-[#475569] leading-[1.8] mb-14">
        <p>By the time the fraud surfaced, the year was gone.</p>
        <p>
          The check we needed did not exist. A clerk, a trader, a bank officer — anyone receiving a
          document — is expected to judge it by eye. So we built DocsGuard: the verification step
          we kept wishing we had before we shook hands.
        </p>
      </div>

      {/* ── The same gap, elsewhere ─────────────────────────────────── */}
      <motion.section {...fadeUp()} className="max-w-2xl mb-16">
        <div className="flex items-start gap-3 mb-3">
          <Landmark className="w-5 h-5 text-[#2563EB] mt-0.5 shrink-0" aria-hidden="true" />
          <h2 className="font-display font-bold text-lg text-[#0F172A]">
            The same gap shows up well beyond one trade desk
          </h2>
        </div>
        <p className="text-sm sm:text-[15px] text-[#475569] leading-[1.75]">
          Welfare schemes verify eligibility certificates by eye. Government tenders accept
          registration and compliance documents on trust, at scale, under deadline. Banks onboard
          borrowers on paperwork nobody has time to independently confirm. It is the same
          unverifiable-document problem we hit as traders — just with a different name on the
          letterhead.
        </p>
      </motion.section>

      {/* ── How it works, visually ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-[#2563EB]" aria-hidden="true" />
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
            How it works
          </p>
        </div>
        <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-[#0F172A] mb-3">
          Four diagrams, no hand-waving
        </h2>
        <p className="text-sm sm:text-[15px] text-[#475569] leading-relaxed max-w-2xl">
          These are the same diagrams we keep in the project's own documentation — how a document
          moves through the pipeline, what counts as proof versus a guess, how the adversarial
          check argues both sides, and a worked example of a forgery it actually caught.
        </p>
      </div>

      <div className="space-y-8 mb-16">
        {DIAGRAMS.map((d, i) => (
          <motion.figure
            key={d.src}
            {...fadeUp(i * 0.05)}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-6"
          >
            <img src={d.src} alt={d.alt} className="w-full h-auto" aria-label={d.title} loading="lazy" />
            <figcaption className="mt-4 pt-4 border-t border-[#E2E8F0]">
              <p className="font-display font-bold text-sm text-[#0F172A] mb-1.5">{d.title}</p>
              <p className="text-xs sm:text-[13px] text-[#475569] leading-relaxed">{d.caption}</p>
            </figcaption>
          </motion.figure>
        ))}
      </div>

      {/* ── Honest limitations ──────────────────────────────────────── */}
      <motion.section {...fadeUp()} className="mb-16">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-[#F59E0B] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display font-bold text-lg text-[#0F172A]">What it cannot do yet</h2>
            <p className="text-sm text-[#475569] mt-1">
              Said plainly, because a verification tool that overstates itself defeats its own
              purpose.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CANNOT_DO_YET.map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <h3 className="font-display font-bold text-sm text-[#0F172A] mb-1.5">{item.title}</h3>
              <p className="text-xs sm:text-[13px] text-[#475569] leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <motion.section
        {...fadeUp()}
        className="rounded-2xl border border-[#E2E8F0] bg-[#F5F8FF] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
      >
        <div>
          <h2 className="font-display font-bold text-lg text-[#0F172A] mb-1">See it on a real document</h2>
          <p className="text-sm text-[#475569]">
            Upload a certificate, ID, invoice, or statement — or try one of the sample reports.
          </p>
        </div>
        <Link
          to="/workspace"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold text-sm px-6 py-3 shrink-0 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          Go to the workspace
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </motion.section>
    </div>
  );
};

export default About;
