import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown, Scale, Gavel, ShieldAlert, ShieldCheck, AlertTriangle,
  CheckCircle2, XCircle, Info, Clock, Layers, Target, FileQuestion, Flame,
} from 'lucide-react';
import type { AnalysisReport, ReportModule, ForensicCheck } from '../types';

/**
 * The deep forensic dossier: the 12 analysis modules, the adversarial court
 * proceedings, risk breakdown, timeline, ELA heatmap and outstanding items.
 * Rendered below the summary panels. Every section degrades to null when the
 * report does not carry that data (older records, demo fixtures, partial runs).
 */

const CARD = 'bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)]';

const statusTone = (s: string) => {
  switch (s) {
    case 'PASS': return { fg: '#047857', bg: '#ECFDF5', bd: '#A7F3D0', Icon: CheckCircle2 };
    case 'FAIL': return { fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA', Icon: XCircle };
    case 'WARN': return { fg: '#B45309', bg: '#FFFBEB', bd: '#FDE68A', Icon: AlertTriangle };
    default: return { fg: '#1E40AF', bg: '#EFF6FF', bd: '#DBEAFE', Icon: Info };
  }
};

const SectionTitle: React.FC<{ icon: React.ElementType; children: React.ReactNode; hint?: string }> = ({ icon: Icon, children, hint }) => (
  <div className="mb-4">
    <h3 className="font-display flex items-center gap-2 text-lg font-bold tracking-tight text-[#0F172A]">
      <Icon className="w-5 h-5 text-[#2563EB]" aria-hidden />
      {children}
    </h3>
    {hint && <p className="mt-1 text-sm text-[#475569]">{hint}</p>}
  </div>
);

const CheckRows: React.FC<{ checks: ForensicCheck[] }> = ({ checks }) => {
  if (!checks?.length) return null;
  return (
    <ul className="mt-4 space-y-2">
      {checks.map((c, i) => {
        const t = statusTone(c.status);
        return (
          <li key={i} className="flex gap-3 rounded-xl border p-3" style={{ background: t.bg, borderColor: t.bd }}>
            <t.Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: t.fg }} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0F172A]">{c.category}</p>
              <p className="text-sm text-[#475569] break-words">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** One collapsible dossier module. */
const ModuleCard: React.FC<{ mod: ReportModule; defaultOpen?: boolean }> = ({ mod, defaultOpen }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const t = statusTone(mod.status);
  return (
    <div className={`${CARD} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer min-h-11 hover:bg-[#F8FAFC] transition-colors"
      >
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.bg }}>
          <t.Icon className="w-4 h-4" style={{ color: t.fg }} aria-hidden />
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-display block font-bold text-[#0F172A] truncate">{mod.title}</span>
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: t.fg }}>{mod.status}</span>
        </span>
        {typeof mod.score === 'number' && (
          <span className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="w-20 h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, mod.score))}%`, background: t.fg }} />
            </span>
            <span className="text-xs font-mono text-[#475569] w-8 text-right">{mod.score}</span>
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="px-4 pb-5 pt-1 border-t border-[#E2E8F0]">
          {mod.narrative && (
            <div className="space-y-3 pt-4">
              {String(mod.narrative).split('\n').filter(Boolean).map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-[#475569]">{p}</p>
              ))}
            </div>
          )}
          <CheckRows checks={mod.checks} />
          {!!mod.findings?.length && (
            <ul className="mt-4 space-y-1.5">
              {mod.findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-[#475569]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const ModulesSection: React.FC<{ modules: ReportModule[] }> = ({ modules }) => {
  if (!modules?.length) return null;
  return (
    <section>
      <SectionTitle icon={Layers} hint={`${modules.length} analysis modules. Each is expandable — open one to read the examiner's reasoning, its checks and findings.`}>
        Forensic dossier
      </SectionTitle>
      <div className="space-y-3">
        {modules.map((m, i) => <ModuleCard key={m.id || i} mod={m} defaultOpen={i === 0} />)}
      </div>
    </section>
  );
};

/** The adversarial review: prosecution vs defense, then the ruling. */
const CourtSection: React.FC<{ court: NonNullable<AnalysisReport['court']> }> = ({ court }) => {
  const { prosecution, defense, ruling } = court;
  const side = (arg: typeof prosecution, tone: 'red' | 'green') => {
    const c = tone === 'red'
      ? { bg: '#FEF2F2', bd: '#FECACA', fg: '#B91C1C', Icon: ShieldAlert }
      : { bg: '#ECFDF5', bd: '#A7F3D0', fg: '#047857', Icon: ShieldCheck };
    if (!arg) return null;
    return (
      <div className="rounded-2xl border p-4" style={{ background: c.bg, borderColor: c.bd }}>
        <div className="flex items-center gap-2 mb-2">
          <c.Icon className="w-4 h-4" style={{ color: c.fg }} aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c.fg }}>{arg.position}</span>
        </div>
        <p className="font-display font-bold text-[#0F172A] mb-3">{arg.headline}</p>
        <ul className="space-y-3">
          {(arg.points || []).map((p, i) => (
            <li key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[#0F172A]">{p.claim}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-white/70" style={{ color: c.fg }}>{p.weight}</span>
              </div>
              {p.evidence && (
                <p className="mt-1 font-mono text-xs text-[#475569] bg-white/70 rounded-lg px-2 py-1.5 break-words">{p.evidence}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section>
      <SectionTitle icon={Scale} hint="Two independent reviews argued this document from identical evidence, then an adjudicator weighed them. Code-computed facts were binding and could not be argued away.">
        Adversarial review
      </SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {side(prosecution, 'red')}
        {side(defense, 'green')}
      </div>
      {ruling && (
        <div className={`${CARD} mt-4 p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Gavel className="w-5 h-5 text-[#1E40AF]" aria-hidden />
            <span className="font-display font-bold text-[#0F172A]">Ruling</span>
            <span className="ml-auto text-xs font-mono text-[#475569]">
              risk {ruling.riskScore} · confidence {ruling.confidence}
            </span>
          </div>
          {ruling.reasoning && (
            <div className="space-y-3">
              {String(ruling.reasoning).split('\n').filter(Boolean).map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-[#475569]">{p}</p>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {!!ruling.decisive?.length && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#B91C1C] mb-2">Decisive</p>
                <ul className="space-y-1.5">
                  {ruling.decisive.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#475569]">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#B91C1C]" aria-hidden /><span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!ruling.dismissed?.length && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#475569] mb-2">Dismissed</p>
                <ul className="space-y-1.5">
                  {ruling.dismissed.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#475569]">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#94A3B8]" aria-hidden /><span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

const RiskBreakdown: React.FC<{ items: AnalysisReport['riskBreakdown'] }> = ({ items }) => {
  if (!items?.length) return null;
  return (
    <section className={`${CARD} p-5`}>
      <SectionTitle icon={Target}>Risk breakdown</SectionTitle>
      <ul className="space-y-3">
        {items.map((r, i) => {
          const v = Math.max(0, Math.min(100, r.score));
          const col = v >= 67 ? '#EF4444' : v >= 34 ? '#F59E0B' : '#10B981';
          return (
            <li key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[#0F172A] font-medium">{r.label}</span>
                <span className="font-mono text-[#475569]">{v}</span>
              </div>
              <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: col }}
                  initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const TimelineSection: React.FC<{ events: AnalysisReport['timeline'] }> = ({ events }) => {
  if (!events?.length) return null;
  const tone = (c: string) => c === 'Inconsistent' ? '#EF4444' : c === 'Consistent' ? '#10B981' : '#94A3B8';
  return (
    <section className={`${CARD} p-5`}>
      <SectionTitle icon={Clock} hint="Every date found on the document, checked for internal consistency.">Timeline</SectionTitle>
      <ol className="relative border-l border-[#E2E8F0] ml-2 space-y-4">
        {events.map((e, i) => (
          <li key={i} className="ml-4">
            <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full" style={{ background: tone(e.consistency) }} />
            <p className="font-mono text-xs text-[#475569]">{e.date}</p>
            <p className="text-sm font-medium text-[#0F172A]">{e.event}</p>
            <p className="text-xs text-[#475569]">{e.entity} · {e.consistency}</p>
          </li>
        ))}
      </ol>
    </section>
  );
};

const TypologySection: React.FC<{ t: AnalysisReport['fraudTypology'] }> = ({ t }) => {
  if (!t) return null;
  return (
    <section className={`${CARD} p-5`}>
      <SectionTitle icon={Flame}>Fraud typology</SectionTitle>
      <div className="flex items-baseline gap-3">
        <p className="font-display text-xl font-extrabold text-[#0F172A]">{t.name}</p>
        <span className="font-mono text-sm text-[#B91C1C]">{t.probability}%</span>
      </div>
      {t.rationale && <p className="mt-2 text-sm leading-relaxed text-[#475569]">{t.rationale}</p>}
      {!!t.nextSteps?.length && (
        <ul className="mt-3 space-y-1.5">
          {t.nextSteps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-[#475569]">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" /><span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const ElaSection: React.FC<{ ela?: string; original?: string }> = ({ ela, original }) => {
  if (!ela) return null;
  return (
    <section className={`${CARD} p-5`}>
      <SectionTitle icon={Layers} hint="Error-Level Analysis re-compresses the image and maps where the result differs. Bright localised patches over meaningful fields can indicate re-saved or spliced regions. On flat, vector-rendered documents ordinary text also shows error, so this is an indicative signal — never a verdict on its own.">
        Error-Level Analysis
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {original && (
          <figure>
            <img src={original} alt="Original document" className="w-full rounded-xl border border-[#E2E8F0]" />
            <figcaption className="mt-1 text-xs text-[#475569]">Original</figcaption>
          </figure>
        )}
        <figure>
          <img src={ela} alt="Error-level analysis heatmap" className="w-full rounded-xl border border-[#E2E8F0] bg-black" />
          <figcaption className="mt-1 text-xs text-[#475569]">ELA heatmap</figcaption>
        </figure>
      </div>
    </section>
  );
};

const ListCard: React.FC<{ icon: React.ElementType; title: string; items?: string[]; hint?: string }> = ({ icon, title, items, hint }) => {
  if (!items?.length) return null;
  return (
    <section className={`${CARD} p-5`}>
      <SectionTitle icon={icon} hint={hint}>{title}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm text-[#475569]">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#94A3B8] shrink-0" /><span>{s}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const DossierSections: React.FC<{ report: AnalysisReport; originalImage?: string }> = ({ report, originalImage }) => {
  const hasAnything =
    report?.modules?.length || report?.court || report?.riskBreakdown?.length ||
    report?.timeline?.length || report?.fraudTypology || report?.elaImage || report?.missingDocuments?.length;
  if (!hasAnything) return null;

  return (
    <div className="space-y-8 mt-8">
      <div className="grid gap-4 md:grid-cols-2">
        <RiskBreakdown items={report.riskBreakdown} />
        <TypologySection t={report.fraudTypology} />
      </div>
      {report.court && <CourtSection court={report.court} />}
      <ModulesSection modules={report.modules} />
      <ElaSection ela={report.elaImage} original={originalImage} />
      <div className="grid gap-4 md:grid-cols-2">
        <TimelineSection events={report.timeline} />
        <ListCard icon={FileQuestion} title="Documents to request" items={report.missingDocuments}
          hint="Supporting records a reviewer should demand to settle any remaining doubt." />
      </div>
      {report.issuerIntel && (
        <section className={`${CARD} p-5`}>
          <SectionTitle icon={Info}>Issuer intelligence</SectionTitle>
          <p className="text-sm leading-relaxed text-[#475569]">{report.issuerIntel}</p>
        </section>
      )}
    </div>
  );
};

export default DossierSections;
