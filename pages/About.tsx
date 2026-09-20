import React from 'react';
import { ShieldCheck, ScanLine, FileWarning } from 'lucide-react';

/**
 * Simple, honest "About" page — no invented statistics, no fake testimonials,
 * no fake customer logos. Describes what DocsGuard does and how it works.
 */
const About: React.FC = () => {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB] mb-2">
        About
      </p>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0F172A] mb-4">
        What DocsGuard does
      </h1>
      <p className="text-sm sm:text-base text-[#475569] leading-relaxed mb-8">
        DocsGuard is a document authenticity and fraud-detection tool. Upload a certificate, ID,
        invoice, or statement, and it checks the file for tampering signals, internal
        inconsistencies, and known forgery patterns — then explains what it found in plain
        language, with the evidence behind each finding.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <ScanLine className="w-5 h-5 text-[#2563EB] mb-3" aria-hidden="true" />
          <h2 className="font-display font-bold text-sm text-[#0F172A] mb-1.5">Technical checks</h2>
          <p className="text-xs text-[#475569] leading-relaxed">
            Code-computed signals — file metadata, checksums, and structural consistency —
            that don't depend on a model's judgment.
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <FileWarning className="w-5 h-5 text-[#2563EB] mb-3" aria-hidden="true" />
          <h2 className="font-display font-bold text-sm text-[#0F172A] mb-1.5">Content review</h2>
          <p className="text-xs text-[#475569] leading-relaxed">
            An AI reading pass over the document's content and layout, looking for
            inconsistencies a human reviewer would also flag.
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <ShieldCheck className="w-5 h-5 text-[#2563EB] mb-3" aria-hidden="true" />
          <h2 className="font-display font-bold text-sm text-[#0F172A] mb-1.5">Clear verdict</h2>
          <p className="text-xs text-[#475569] leading-relaxed">
            A single verdict — Authentic, Suspicious, or Likely Fake — backed by a
            full, readable report you can share or print.
          </p>
        </div>
      </div>

      <h2 className="font-display font-bold text-lg text-[#0F172A] mb-2">Honesty, by design</h2>
      <p className="text-sm text-[#475569] leading-relaxed mb-4">
        Findings that a model cannot verify on its own — things that require checking against a
        live external source, like a government registry — are surfaced as "external checks
        needed" rather than presented as confirmed facts. Code-computed facts (checksums, file
        metadata) always take precedence over the model's own reasoning.
      </p>
      <p className="text-sm text-[#475569] leading-relaxed">
        Your document is analyzed for the duration of the request and is not stored on our
        servers. Scan history is kept only in your own browser.
      </p>
    </div>
  );
};

export default About;
