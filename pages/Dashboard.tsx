import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard,
  ScanLine,
  Gauge,
  KeyRound,
  Flag,
  ArrowUpRight,
  ArrowRight,
  Clock,
  FileText,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from 'lucide-react';
import type { ScanRecord, Verdict } from '../types';
import { HistoryService } from '../services/historyService';
import { DocScan } from '../components/motifs/Motifs';

/**
 * /dashboard — portfolio-wide analytics over every scan stored in this
 * browser's history (HistoryService.getAll()). Every figure here is derived
 * directly from stored ScanRecord[]; nothing is invented or hard-coded.
 */

// ---------- Style maps (mirrors components/ResultView.tsx's VERDICT_STYLES) ----------

const VERDICT_ORDER: Verdict[] = ['AUTHENTIC', 'SUSPICIOUS', 'LIKELY_FAKE'];

const VERDICT_STYLES: Record<
  Verdict,
  { label: string; solid: string; tint: string; text: string; badge: string; Icon: React.ElementType }
> = {
  AUTHENTIC: {
    label: 'Authentic',
    solid: '#10B981',
    tint: '#ECFDF5',
    text: 'text-[#047857]',
    badge: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
    Icon: ShieldCheck,
  },
  SUSPICIOUS: {
    label: 'Suspicious',
    solid: '#F59E0B',
    tint: '#FFFBEB',
    text: 'text-[#B45309]',
    badge: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    Icon: ShieldAlert,
  },
  LIKELY_FAKE: {
    label: 'Likely Fake',
    solid: '#EF4444',
    tint: '#FEF2F2',
    text: 'text-[#B91C1C]',
    badge: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    Icon: ShieldX,
  },
};

// The exact check names api/verification.ts's CHECK_NAMES produces for
// deterministic, code-computed identifier validation (Aadhaar Verhoeff, PAN
// structure, GSTIN mod-36, IFSC format, IBAN mod-97, UPI/mobile/PIN format).
// A ConsistencyCheck with one of these names and status FAIL means an ID
// number on the document could not have been issued by the real authority —
// this is code-computed, binding fact, not a model opinion.
const IDENTIFIER_CHECK_NAMES = new Set([
  'Aadhaar number checksum',
  'PAN format & entity code',
  'GSTIN checksum',
  'IFSC format',
  'IBAN checksum',
  'UPI VPA format',
  'Mobile number format',
  'PIN code format',
]);

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

interface DashboardStats {
  total: number;
  verdictCounts: Record<Verdict, number>;
  averageRisk: number;
  failedChecksumCount: number;
  topRedFlags: Array<{ title: string; count: number }>;
}

/** Derives every dashboard figure from stored records. Never invents numbers. */
function computeStats(records: ScanRecord[]): DashboardStats {
  const verdictCounts: Record<Verdict, number> = { AUTHENTIC: 0, SUSPICIOUS: 0, LIKELY_FAKE: 0 };
  let riskSum = 0;
  let failedChecksumCount = 0;
  const redFlagCounts = new Map<string, number>();

  for (const rec of records) {
    const report = rec.report;
    if (report?.verdict && verdictCounts[report.verdict] !== undefined) {
      verdictCounts[report.verdict] += 1;
    }
    riskSum += Number.isFinite(report?.riskScore) ? report.riskScore : 0;

    const hasFailedIdentifier = (report?.consistencyChecks ?? []).some(
      (c) => c.status === 'FAIL' && IDENTIFIER_CHECK_NAMES.has(c.check),
    );
    if (hasFailedIdentifier) failedChecksumCount += 1;

    for (const flag of report?.redFlags ?? []) {
      const title = flag.title?.trim();
      if (!title) continue;
      redFlagCounts.set(title, (redFlagCounts.get(title) ?? 0) + 1);
    }
  }

  const topRedFlags = Array.from(redFlagCounts.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 5);

  return {
    total: records.length,
    verdictCounts,
    averageRisk: records.length ? Math.round(riskSum / records.length) : 0,
    failedChecksumCount,
    topRedFlags,
  };
}

/** A single portfolio-level number with an icon, used across the top stat row. */
const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
  accent?: string;
}> = ({ icon: Icon, label, value, hint, accent = '#2563EB' }) => (
  <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-14px_rgba(15,23,42,0.10)] p-5 hover:shadow-[0_16px_36px_-14px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 transition-all duration-200">
    <div className="flex items-center gap-2 mb-3">
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{label}</span>
    </div>
    <p className="font-display font-extrabold text-3xl text-[#0F172A] tabular-nums leading-none">{value}</p>
    <p className="text-xs text-[#475569] mt-2 leading-relaxed">{hint}</p>
  </div>
);

/** Proportional verdict distribution: a single segmented bar plus a counted legend. No chart library. */
const VerdictDistribution: React.FC<{ counts: Record<Verdict, number>; total: number }> = ({ counts, total }) => (
  <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-14px_rgba(15,23,42,0.10)] p-5 sm:p-6">
    <h2 className="font-display font-bold text-base text-[#0F172A] mb-4">Verdict distribution</h2>

    <div
      className="flex w-full h-4 rounded-full overflow-hidden bg-[#F5F8FF] border border-[#E2E8F0]"
      role="img"
      aria-label={VERDICT_ORDER.map((v) => `${VERDICT_STYLES[v].label}: ${counts[v]}`).join(', ')}
    >
      {VERDICT_ORDER.map((v) => {
        const pct = total ? (counts[v] / total) * 100 : 0;
        if (pct <= 0) return null;
        return (
          <div
            key={v}
            style={{ width: `${pct}%`, backgroundColor: VERDICT_STYLES[v].solid }}
            className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
            title={`${VERDICT_STYLES[v].label}: ${counts[v]} (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>

    <ul className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {VERDICT_ORDER.map((v) => {
        const { label, solid, tint, Icon } = VERDICT_STYLES[v];
        const count = counts[v];
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <li
            key={v}
            className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
            style={{ backgroundColor: tint, borderColor: `${solid}55` }}
          >
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0"
              style={{ backgroundColor: `${solid}22`, color: solid }}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#0F172A]">{label}</span>
              <span className="block text-xs text-[#475569] tabular-nums">
                {count} scan{count === 1 ? '' : 's'} &middot; {pct}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);

/** Most frequently recorded red-flag titles across all scans, as proportional bars. */
const TopRedFlags: React.FC<{ items: Array<{ title: string; count: number }> }> = ({ items }) => {
  const max = items.length ? items[0].count : 0;
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-14px_rgba(15,23,42,0.10)] p-5 sm:p-6">
      <h2 className="font-display font-bold text-base text-[#0F172A] mb-1">Most common red flags</h2>
      <p className="text-xs text-[#475569] mb-4">Ranked by how often each finding title appears across all scans.</p>

      {items.length === 0 ? (
        <p className="text-sm text-[#94A3B8] py-6 text-center">No red flags recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const pct = max ? Math.max(6, Math.round((item.count / max) * 100)) : 0;
            return (
              <li key={item.title}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-sm text-[#0F172A] truncate">{item.title}</span>
                  <span className="text-xs font-semibold text-[#475569] tabular-nums shrink-0">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-[#F5F8FF] border border-[#E2E8F0] overflow-hidden">
                  <div className="h-full rounded-full bg-[#2563EB] transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** Recent-scans table — every row deep-links to its saved report at /scan/:id. */
const RecentScansTable: React.FC<{ records: ScanRecord[] }> = ({ records }) => {
  const RECENT_LIMIT = 15;
  const shown = records.slice(0, RECENT_LIMIT);

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_10px_30px_-14px_rgba(15,23,42,0.10)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#E2E8F0]">
        <h2 className="font-display font-bold text-base text-[#0F172A]">Recent scans</h2>
        <span className="text-xs text-[#475569] tabular-nums">
          Showing {shown.length} of {records.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-left">
              <th scope="col" className="px-5 sm:px-6 py-3 font-semibold text-xs uppercase tracking-[0.06em] text-[#94A3B8]">
                Document
              </th>
              <th scope="col" className="px-3 py-3 font-semibold text-xs uppercase tracking-[0.06em] text-[#94A3B8]">
                Verdict
              </th>
              <th scope="col" className="px-3 py-3 font-semibold text-xs uppercase tracking-[0.06em] text-[#94A3B8] text-right">
                Risk
              </th>
              <th scope="col" className="px-3 py-3 font-semibold text-xs uppercase tracking-[0.06em] text-[#94A3B8]">
                Scanned
              </th>
              <th scope="col" className="px-5 sm:px-6 py-3 font-semibold text-xs uppercase tracking-[0.06em] text-[#94A3B8]">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {shown.map((rec) => {
              const style = VERDICT_STYLES[rec.report?.verdict] ?? VERDICT_STYLES.SUSPICIOUS;
              return (
                <tr key={rec.id} className="hover:bg-[#F5F8FF] transition-colors duration-150">
                  <td className="px-5 sm:px-6 py-3.5 max-w-[220px] sm:max-w-xs">
                    <Link
                      to={`/scan/${rec.id}`}
                      className="flex items-center gap-2 min-w-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded"
                    >
                      <FileText className="w-4 h-4 text-[#94A3B8] shrink-0" aria-hidden="true" />
                      <span className="truncate text-[#0F172A] group-hover:text-[#2563EB] group-hover:underline underline-offset-2">
                        {rec.fileName || 'Untitled document'}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-[#0F172A] font-medium">
                    {Number.isFinite(rec.report?.riskScore) ? rec.report.riskScore : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-[#475569] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {formatRelativeTime(rec.createdAt)}
                    </span>
                  </td>
                  <td className="px-5 sm:px-6 py-3.5 text-right">
                    <Link
                      to={`/scan/${rec.id}`}
                      aria-label={`Open report for ${rec.fileName || 'this scan'}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EFF6FF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Clean empty state shown when this browser has no scan history yet. */
const EmptyState: React.FC = () => (
  <div className="max-w-md mx-auto text-center py-20">
    <div className="mx-auto w-16 h-16 rounded-2xl bg-[#F5F8FF] border border-[#E2E8F0] flex items-center justify-center mb-6">
      <DocScan className="w-8 h-8 text-[#2563EB]" />
    </div>
    <h1 className="font-display font-extrabold text-2xl text-[#0F172A] mb-2">No scans yet</h1>
    <p className="text-sm text-[#475569] leading-relaxed mb-8">
      This dashboard fills in automatically once you analyze a document — verdict distribution, average
      risk score, identifier checksum failures, and recurring red flags, all computed from your scan
      history.
    </p>
    <Link
      to="/workspace"
      className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-5 py-2.5 min-h-[44px] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] hover:bg-[#1E40AF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
    >
      <ScanLine className="w-4 h-4" aria-hidden="true" />
      Analyze a document
      <ArrowRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  </div>
);

const Dashboard: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [records, setRecords] = useState<ScanRecord[]>([]);

  // HistoryService reads localStorage synchronously; resolve once on mount so
  // the dashboard reflects whatever this browser's history holds right now.
  useEffect(() => {
    setRecords(HistoryService.getAll());
  }, []);

  const stats = useMemo(() => computeStats(records), [records]);

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold px-3 py-1.5 mb-4">
        <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
        Dashboard
      </div>
      <h1 className="font-display font-extrabold text-3xl text-[#0F172A] mb-2">Dashboard</h1>
      <p className="text-sm text-[#475569] leading-relaxed max-w-xl mb-8">
        A portfolio-wide view across every scan stored in this browser — verdict trends, risk-score
        distribution, and the checks and red flags showing up most often. Every figure below is computed
        from your scan history, not estimated.
      </p>

      {stats.total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={ScanLine}
              label="Total scans"
              value={String(stats.total)}
              hint="Documents analyzed and saved to history in this browser."
            />
            <StatCard
              icon={Gauge}
              label="Average risk score"
              value={`${stats.averageRisk}`}
              hint="Mean risk score (0–100) across all saved scans."
              accent={stats.averageRisk >= 65 ? '#EF4444' : stats.averageRisk >= 35 ? '#F59E0B' : '#10B981'}
            />
            <StatCard
              icon={KeyRound}
              label="Failed ID checksums"
              value={String(stats.failedChecksumCount)}
              hint="Scans with at least one identifier that failed its official checksum/format rule."
              accent="#EF4444"
            />
            <StatCard
              icon={Flag}
              label="Red flags raised"
              value={String(stats.topRedFlags.reduce((sum, f) => sum + f.count, 0))}
              hint="Total findings across the most frequent red-flag titles below."
              accent="#F59E0B"
            />
          </div>

          <VerdictDistribution counts={stats.verdictCounts} total={stats.total} />

          <TopRedFlags items={stats.topRedFlags} />

          <RecentScansTable records={records} />
        </div>
      )}
    </motion.div>
  );
};

export default Dashboard;
