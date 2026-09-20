import React from 'react';
import {
  Printer,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  Scale,
  Gavel,
  FileText,
  ClipboardList,
  ListChecks,
  Fingerprint,
  Gauge,
  Layers,
  ExternalLink,
  ClipboardCheck,
  Hash,
  CalendarClock,
} from 'lucide-react';
import type { ScanRecord, Verdict, Severity, ReportModule } from '../types';

export interface ExportDossierProps {
  record: ScanRecord;
}

/* ---------------------------------------------------------------------------
 * DocsGuard — printable forensic dossier.
 *
 * This component owns its own print stylesheet and does not assume it is the
 * only thing on the page: printing hides everything outside `#docsguard-dossier-root`
 * so it is safe to drop this component anywhere (a route, a modal, a panel)
 * without another agent's chrome leaking into the PDF.
 *
 * Design constraint: a browser's "print backgrounds" option is OFF by default
 * in most browsers, and when it is off, `background-color`, `background-image`
 * and `box-shadow` are silently dropped from the printed page — but text
 * color, borders and <img> elements always render. So nothing meaningful here
 * depends on a background fill: severity/status are conveyed with bold
 * uppercase labels, icons (stroke = currentColor, forced black in print) and
 * border weight, never color alone. Screen view keeps the full white+cobalt
 * design-system palette; print forces true black-on-white.
 * ------------------------------------------------------------------------- */

const VERDICT_META: Record<Verdict, { label: string; Icon: React.ElementType; tint: string; fg: string; border: string }> = {
  AUTHENTIC: { label: 'Authentic', Icon: ShieldCheck, tint: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  SUSPICIOUS: { label: 'Suspicious', Icon: ShieldAlert, tint: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  LIKELY_FAKE: { label: 'Likely Fake', Icon: ShieldX, tint: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
};

const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const STATUS_META: Record<string, { label: string; Icon: React.ElementType }> = {
  PASS: { label: 'PASS', Icon: CheckCircle2 },
  FAIL: { label: 'FAIL', Icon: XCircle },
  WARN: { label: 'WARN', Icon: AlertTriangle },
  INFO: { label: 'INFO', Icon: Info },
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const CARD = 'bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] print-card';

/* ---------------------------------------------------------------------------
 * Small shared pieces
 * ------------------------------------------------------------------------- */

const SectionHeading: React.FC<{ icon: React.ElementType; index: string; children: React.ReactNode; hint?: string }> = ({
  icon: Icon, index, children, hint,
}) => (
  <div className="mb-5 flex items-start gap-3">
    <span className="print-eyebrow font-mono text-xs font-bold text-[#94A3B8] pt-1 w-8 shrink-0">{index}</span>
    <div className="min-w-0">
      <h2 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#0F172A]">
        <Icon className="w-5 h-5 text-[#2563EB] print-icon shrink-0" aria-hidden />
        {children}
      </h2>
      {hint && <p className="mt-1 text-sm text-[#475569] print-muted max-w-2xl">{hint}</p>}
    </div>
  </div>
);

/** A page of the dossier. Forces a page break after itself in print, except the last one. */
const DossierPage: React.FC<{ children: React.ReactNode; last?: boolean; className?: string }> = ({
  children, last, className = '',
}) => (
  <section className={`page-section ${last ? 'page-section-last' : ''} py-10 px-6 md:px-10 ${className}`}>
    <div className="max-w-3xl mx-auto">{children}</div>
  </section>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.INFO;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#0F172A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0F172A] print-badge">
      <m.Icon className="w-3 h-3 print-icon" aria-hidden />
      {m.label}
    </span>
  );
};

const SeverityPill: React.FC<{ severity: Severity }> = ({ severity }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-[#0F172A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0F172A] print-badge">
    {(severity === 'Critical' || severity === 'High') && <AlertOctagon className="w-3 h-3 print-icon" aria-hidden />}
    {severity}
  </span>
);

/* ---------------------------------------------------------------------------
 * Repeating header / footer — position:fixed elements repeat on every printed
 * page in Chromium's print pipeline (what window.print() → "Save as PDF"
 * uses). They live inside the @page margin box reserved for them below.
 * ------------------------------------------------------------------------- */

const RunningHeader: React.FC<{ record: ScanRecord }> = ({ record }) => {
  const v = VERDICT_META[record.report.verdict];
  return (
    <div className="dossier-print-header hidden print:flex">
      <span className="font-display font-extrabold tracking-tight">DOCSGUARD</span>
      <span className="print-muted truncate mx-3 flex-1 text-center">
        Forensic Dossier · {record.fileName}
      </span>
      <span className="font-semibold">{v.label} · Risk {record.report.riskScore}/100</span>
    </div>
  );
};

const RunningFooter: React.FC<{ record: ScanRecord }> = ({ record }) => (
  <div className="dossier-print-footer hidden print:flex">
    <span>Confidential — generated by DocsGuard for internal review</span>
    <span className="print-muted">Case ref {record.id.slice(0, 12)}</span>
  </div>
);

/* ---------------------------------------------------------------------------
 * 1. Cover
 * ------------------------------------------------------------------------- */

const CoverPage: React.FC<{ record: ScanRecord; generatedAt: number; toc: string[] }> = ({ record, generatedAt, toc }) => {
  const { report } = record;
  const v = VERDICT_META[report.verdict];

  return (
    <DossierPage className="print-cover">
      <div className="flex items-center gap-2 mb-16 print:mb-10">
        <span className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center print-card">
          <ShieldCheck className="w-5 h-5 print-icon" aria-hidden />
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight text-[#0F172A]">DocsGuard</span>
        <span className="ml-auto text-xs uppercase tracking-widest text-[#2563EB] print-muted font-semibold">
          AI Document Authenticity &amp; Fraud Detection
        </span>
      </div>

      <p className="text-xs uppercase tracking-[0.3em] text-[#94A3B8] print-muted font-semibold mb-3">Forensic Dossier</p>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight text-[#0F172A] leading-[1.05] mb-8">
        {report.documentType || 'Document'} examination
      </h1>

      <div
        className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 mb-10 print-badge"
        style={{ background: v.tint, borderColor: v.border, color: v.fg }}
      >
        <v.Icon className="w-5 h-5 print-icon" aria-hidden />
        <span className="font-display font-extrabold tracking-tight">{v.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10 no-break">
        <div className={`${CARD} p-4`}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] print-muted mb-1">Risk score</p>
          <p className="font-display text-3xl font-black text-[#0F172A]">{report.riskScore}<span className="text-base font-semibold text-[#94A3B8] print-muted">/100</span></p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] print-muted mb-1">Confidence</p>
          <p className="font-display text-3xl font-black text-[#0F172A]">{report.confidence}<span className="text-base font-semibold text-[#94A3B8] print-muted">%</span></p>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] print-muted mb-1">Modules run</p>
          <p className="font-display text-3xl font-black text-[#0F172A]">{report.modules?.length ?? 0}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-10 border-t border-b border-[#E2E8F0] py-6 no-break">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#94A3B8] print-icon shrink-0" aria-hidden />
          <dt className="text-[#94A3B8] print-muted w-28 shrink-0">File name</dt>
          <dd className="font-medium text-[#0F172A] break-all">{record.fileName}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-[#94A3B8] print-icon shrink-0" aria-hidden />
          <dt className="text-[#94A3B8] print-muted w-28 shrink-0">Case reference</dt>
          <dd className="font-mono text-[#0F172A] break-all">{record.id}</dd>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#94A3B8] print-icon shrink-0" aria-hidden />
          <dt className="text-[#94A3B8] print-muted w-28 shrink-0">Scanned</dt>
          <dd className="font-medium text-[#0F172A]">{fmtDate(record.createdAt)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#94A3B8] print-icon shrink-0" aria-hidden />
          <dt className="text-[#94A3B8] print-muted w-28 shrink-0">Dossier generated</dt>
          <dd className="font-medium text-[#0F172A]">{fmtDate(generatedAt)}</dd>
        </div>
      </dl>

      {toc.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] print-muted mb-3">Contents</p>
          <ol className="space-y-1.5 text-sm">
            {toc.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-[#2563EB] print-muted w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[#0F172A]">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * 2. Executive summary
 * ------------------------------------------------------------------------- */

const ExecutiveSummaryPage: React.FC<{ record: ScanRecord }> = ({ record }) => {
  const { report } = record;
  return (
    <DossierPage>
      <SectionHeading icon={ClipboardList} index="01" hint="The adjudicated finding in plain language — read this first.">
        Executive summary
      </SectionHeading>
      <div className={`${CARD} p-6 no-break`}>
        <div className="space-y-4">
          {(report.summary || 'No summary was recorded for this analysis.')
            .split('\n')
            .filter(Boolean)
            .map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-[#334155] print-body">{p}</p>
            ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-4 no-break">
        {[
          { label: 'Verdict', value: VERDICT_META[report.verdict].label },
          { label: 'Risk', value: `${report.riskScore}/100` },
          { label: 'Confidence', value: `${report.confidence}%` },
          { label: 'Red flags', value: String(report.redFlags?.length ?? 0) },
        ].map((s, i) => (
          <div key={i} className="rounded-xl border border-[#E2E8F0] p-3 text-center print-card">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] print-muted">{s.label}</p>
            <p className="font-display text-lg font-extrabold text-[#0F172A]">{s.value}</p>
          </div>
        ))}
      </div>
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * 3. Modules — every entry in report.modules, in order.
 * ------------------------------------------------------------------------- */

const ModulePage: React.FC<{ mod: ReportModule; index: number; total: number; sectionIndex: string }> = ({
  mod, index, total, sectionIndex,
}) => {
  const s = STATUS_META[mod.status] || STATUS_META.INFO;
  return (
    <DossierPage>
      <SectionHeading
        icon={Layers}
        index={sectionIndex}
        hint={`Module ${index + 1} of ${total} in the forensic dossier.`}
      >
        {mod.title}
      </SectionHeading>

      <div className="flex items-center gap-3 mb-5 no-break">
        <StatusPill status={mod.status} />
        {typeof mod.score === 'number' && (
          <span className="text-xs font-mono text-[#475569] print-muted">score {mod.score}/100</span>
        )}
      </div>

      {mod.narrative && (
        <div className={`${CARD} p-5 mb-5 no-break`}>
          <div className="space-y-3">
            {String(mod.narrative).split('\n').filter(Boolean).map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-[#334155] print-body">{p}</p>
            ))}
          </div>
        </div>
      )}

      {!!mod.checks?.length && (
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted mb-2">Checks performed</p>
          <ul className="space-y-2">
            {mod.checks.map((c, i) => {
              const cs = STATUS_META[c.status] || STATUS_META.INFO;
              return (
                <li key={i} className="flex gap-3 rounded-xl border border-[#E2E8F0] p-3 no-break print-card">
                  <cs.Icon className="w-4 h-4 mt-0.5 shrink-0 text-[#0F172A] print-icon" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {c.category} <span className="font-mono text-[10px] text-[#94A3B8] print-muted">[{cs.label}]</span>
                    </p>
                    <p className="text-sm text-[#475569] print-body break-words">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!!mod.findings?.length && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted mb-2">Findings</p>
          <ul className="space-y-1.5">
            {mod.findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#334155] print-body">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2563EB] print-dot shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * 4. Adversarial court
 * ------------------------------------------------------------------------- */

const CourtPage: React.FC<{ court: NonNullable<ScanRecord['report']['court']>; sectionIndex: string }> = ({ court, sectionIndex }) => {
  const { prosecution, defense, ruling } = court;
  const side = (arg: typeof prosecution) => {
    if (!arg) return null;
    return (
      <div className="rounded-2xl border border-[#0F172A] p-4 no-break print-card">
        <p className="text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-2">{arg.position}</p>
        <p className="font-display font-bold text-[#0F172A] mb-3">{arg.headline}</p>
        <ul className="space-y-3">
          {(arg.points || []).map((p, i) => (
            <li key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[#0F172A]">{p.claim}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider border border-[#0F172A] rounded-full px-2 py-0.5 print-badge">
                  {p.weight}
                </span>
              </div>
              {p.evidence && (
                <p className="mt-1 font-mono text-xs text-[#475569] print-muted border border-[#E2E8F0] rounded-lg px-2 py-1.5 break-words">
                  {p.evidence}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <DossierPage>
      <SectionHeading icon={Scale} index={sectionIndex} hint="Two independent reviews argued this document from identical evidence; an adjudicator then weighed them. Code-computed facts were binding and could not be argued away.">
        Adversarial review
      </SectionHeading>
      <div className="grid gap-4 md:grid-cols-2 mb-5">
        {side(prosecution)}
        {side(defense)}
      </div>
      {ruling && (
        <div className={`${CARD} p-5 no-break`}>
          <div className="flex items-center gap-2 mb-3">
            <Gavel className="w-5 h-5 text-[#0F172A] print-icon" aria-hidden />
            <span className="font-display font-bold text-[#0F172A]">Ruling</span>
            <span className="ml-auto text-xs font-mono text-[#475569] print-muted">
              risk {ruling.riskScore} · confidence {ruling.confidence}
            </span>
          </div>
          {ruling.reasoning && (
            <div className="space-y-3">
              {String(ruling.reasoning).split('\n').filter(Boolean).map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-[#334155] print-body">{p}</p>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {!!ruling.decisive?.length && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-2">Decisive</p>
                <ul className="space-y-1.5">
                  {ruling.decisive.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#334155] print-body">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#0F172A] print-icon" aria-hidden /><span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!ruling.dismissed?.length && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted mb-2">Dismissed</p>
                <ul className="space-y-1.5">
                  {ruling.dismissed.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#334155] print-body">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#94A3B8] print-icon" aria-hidden /><span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * 5–8. Extracted fields · red flags · consistency checks · technical signals
 * ------------------------------------------------------------------------- */

const EvidencePage: React.FC<{ record: ScanRecord; sectionIndex: string }> = ({ record, sectionIndex }) => {
  const { report } = record;
  const sortedFlags = [...(report.redFlags || [])].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <DossierPage>
      <SectionHeading icon={Fingerprint} index={sectionIndex} hint="Field-level extraction, integrity findings and machine-read signals gathered during analysis.">
        Evidence
      </SectionHeading>

      {/* Extracted fields */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted mb-2">Extracted fields</p>
        {report.extractedFields?.length ? (
          <dl className={`${CARD} divide-y divide-[#E2E8F0] print-divide`}>
            {report.extractedFields.map((f, i) => (
              <div key={i} className="flex items-start gap-4 px-4 py-2.5 no-break">
                <dt className="w-40 shrink-0 text-sm text-[#94A3B8] print-muted">{f.label}</dt>
                <dd className="text-sm font-medium text-[#0F172A] break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-[#94A3B8] print-muted italic">No structured fields were extracted from this document.</p>
        )}
      </div>

      {/* Red flags */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <AlertOctagon className="w-4 h-4 text-[#0F172A] print-icon" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted">
            Red flags {sortedFlags.length ? `(${sortedFlags.length})` : ''}
          </p>
        </div>
        {sortedFlags.length ? (
          <ul className="space-y-2">
            {sortedFlags.map((r, i) => (
              <li key={i} className="rounded-xl border border-[#0F172A] p-3 no-break print-card">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm font-semibold text-[#0F172A]">{r.title}</p>
                  <SeverityPill severity={r.severity} />
                </div>
                <p className="text-sm text-[#475569] print-body">{r.detail}</p>
                {r.evidence && (
                  <p className="mt-1.5 font-mono text-xs text-[#475569] print-muted border border-[#E2E8F0] rounded-lg px-2 py-1.5 break-words">
                    {r.evidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#475569] print-body">No red flags were identified on this document.</p>
        )}
      </div>

      {/* Consistency checks */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="w-4 h-4 text-[#0F172A] print-icon" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted">Consistency checks</p>
        </div>
        {report.consistencyChecks?.length ? (
          <ul className="space-y-2">
            {report.consistencyChecks.map((c, i) => {
              const s = STATUS_META[c.status] || STATUS_META.INFO;
              return (
                <li key={i} className="flex gap-3 rounded-xl border border-[#E2E8F0] p-3 no-break print-card">
                  <s.Icon className="w-4 h-4 mt-0.5 shrink-0 text-[#0F172A] print-icon" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {c.check} <span className="font-mono text-[10px] text-[#94A3B8] print-muted">[{s.label}]</span>
                    </p>
                    <p className="text-sm text-[#475569] print-body break-words">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-[#94A3B8] print-muted italic">No consistency checks were recorded.</p>
        )}
      </div>

      {/* Technical signals */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-[#0F172A] print-icon" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted">Technical signals</p>
        </div>
        {report.technicalSignals?.length ? (
          <dl className={`${CARD} divide-y divide-[#E2E8F0] print-divide`}>
            {report.technicalSignals.map((t, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5 no-break">
                <dt className="w-44 shrink-0 text-sm text-[#94A3B8] print-muted">{t.label}</dt>
                <dd className="text-sm font-medium text-[#0F172A] break-words flex-1">{t.value}</dd>
                {t.concern && <SeverityPill severity="High" />}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-[#94A3B8] print-muted italic">No technical signals were recorded.</p>
        )}
      </div>
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * 9. Recommended action + outstanding external checks
 * ------------------------------------------------------------------------- */

const ActionPage: React.FC<{ record: ScanRecord; sectionIndex: string }> = ({ record, sectionIndex }) => {
  const { report } = record;
  return (
    <DossierPage last>
      <SectionHeading icon={ClipboardCheck} index={sectionIndex} hint="What a reviewer should do next, and what this system could not verify on its own.">
        Recommended action
      </SectionHeading>

      <div className="rounded-2xl border-2 border-[#0F172A] p-5 mb-8 no-break print-card">
        <p className="text-[15px] leading-relaxed font-medium text-[#0F172A] print-body">
          {report.recommendedAction || 'No recommended action was recorded.'}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <ExternalLink className="w-4 h-4 text-[#0F172A] print-icon" aria-hidden />
        <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] print-muted">
          Outstanding external checks
        </p>
      </div>
      <p className="text-xs text-[#94A3B8] print-muted mb-3 max-w-xl">
        These require a live external source (registries, issuers, OFAC/sanctions lists, etc.) this
        system does not call — they were not verified and must be confirmed independently before
        this dossier is relied on.
      </p>
      {report.externalChecksNeeded?.length ? (
        <ul className="space-y-2">
          {report.externalChecksNeeded.map((e, i) => (
            <li key={i} className="flex gap-2 rounded-xl border border-dashed border-[#94A3B8] p-3 text-sm text-[#334155] print-body no-break">
              <span className="font-mono text-xs text-[#94A3B8] print-muted shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#475569] print-body">No outstanding external verification was required.</p>
      )}

      <p className="mt-12 text-[11px] leading-relaxed text-[#94A3B8] print-muted border-t border-[#E2E8F0] pt-4">
        This dossier was produced by DocsGuard's automated forensic pipeline. Code-computed facts
        (checksums, structural and metadata analysis) are binding; anything requiring a live
        external source is listed above as unverified. It is a decision-support artifact, not a
        legal or regulatory determination.
      </p>
    </DossierPage>
  );
};

/* ---------------------------------------------------------------------------
 * Print stylesheet
 * ------------------------------------------------------------------------- */

const PRINT_CSS = `
  #docsguard-dossier-root { background: #fff; }

  @media print {
    @page { size: A4; margin: 22mm 14mm 16mm 14mm; }

    html, body { background: #fff !important; }
    body * { visibility: hidden; }
    #docsguard-dossier-root, #docsguard-dossier-root * { visibility: visible; }
    #docsguard-dossier-root {
      position: absolute; inset: 0; width: 100%; margin: 0 !important; box-shadow: none !important;
    }

    .no-print { display: none !important; }

    /* Force true black-on-white: text/border color always survives printing
       even when "print backgrounds" is off, so nothing meaningful here relies
       on a fill. */
    #docsguard-dossier-root, #docsguard-dossier-root * {
      color: #000 !important;
      box-shadow: none !important;
      text-shadow: none !important;
      background-image: none !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #docsguard-dossier-root .print-card { background: #fff !important; border-color: #000 !important; }
    #docsguard-dossier-root .print-muted { color: #444 !important; }
    #docsguard-dossier-root .print-body { color: #111 !important; }
    #docsguard-dossier-root .print-dot { background: #000 !important; }
    #docsguard-dossier-root .print-divide > * + * { border-color: #000 !important; }
    #docsguard-dossier-root .print-icon { color: #000 !important; }
    #docsguard-dossier-root .print-badge { border-color: #000 !important; background: transparent !important; }

    .page-section { break-after: page; page-break-after: always; }
    .page-section-last, .page-section:last-of-type { break-after: auto; page-break-after: auto; }
    .no-break { break-inside: avoid; page-break-inside: avoid; }

    .print-cover { padding-top: 4mm; }

    .dossier-print-header, .dossier-print-footer {
      display: flex !important;
      position: fixed;
      left: 0; right: 0;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5px;
      letter-spacing: 0.03em;
    }
    .dossier-print-header {
      top: 0; height: 12mm;
      border-bottom: 0.75pt solid #000;
      padding-bottom: 2mm;
    }
    .dossier-print-footer {
      bottom: 0; height: 9mm;
      border-top: 0.75pt solid #000;
      padding-top: 2mm;
    }
    .dossier-body { padding-top: 12mm; padding-bottom: 9mm; }
  }
`;

/* ---------------------------------------------------------------------------
 * Root
 * ------------------------------------------------------------------------- */

const ExportDossier: React.FC<ExportDossierProps> = ({ record }) => {
  const generatedAt = React.useMemo(() => Date.now(), []);
  const { report } = record;
  const modules = report.modules || [];

  const toc = [
    'Executive summary',
    ...modules.map((m) => m.title),
    ...(report.court ? ['Adversarial review'] : []),
    'Evidence — fields, red flags, consistency, technical signals',
    'Recommended action',
  ];

  let sectionCounter = 1;
  const nextIndex = () => String(sectionCounter++).padStart(2, '0');

  return (
    <div id="docsguard-dossier-root" className="dossier-export bg-white">
      <style>{PRINT_CSS}</style>

      {/* Toolbar — screen only */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white/90 backdrop-blur px-6 py-4">
        <div>
          <p className="font-display text-sm font-bold text-[#0F172A]">Forensic dossier preview</p>
          <p className="text-xs text-[#94A3B8]">{record.fileName} · print-accurate, paginated for export</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] transition hover:bg-[#1E40AF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          <Printer className="w-4 h-4" aria-hidden />
          Download / Print dossier
        </button>
      </div>

      <RunningHeader record={record} />
      <RunningFooter record={record} />

      <div className="dossier-body">
        <CoverPage record={record} generatedAt={generatedAt} toc={toc} />
        <ExecutiveSummaryPage record={record} />
        {modules.map((m, i) => (
          <ModulePage key={m.id || i} mod={m} index={i} total={modules.length} sectionIndex={nextIndex()} />
        ))}
        {report.court && <CourtPage court={report.court} sectionIndex={nextIndex()} />}
        <EvidencePage record={record} sectionIndex={nextIndex()} />
        <ActionPage record={record} sectionIndex={nextIndex()} />
      </div>
    </div>
  );
};

export default ExportDossier;
