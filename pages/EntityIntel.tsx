import React, { useCallback, useId, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  ShieldAlert,
  ShieldQuestion,
  User,
  XCircle,
} from 'lucide-react';

type EntityKind = 'company' | 'person';
type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

interface ConsistencyCheck {
  check: string;
  status: CheckStatus;
  detail: string;
}
interface TechnicalSignal {
  label: string;
  value: string;
  concern: boolean;
}
interface EntityAssessment {
  plausibility: 'PLAUSIBLE' | 'UNCERTAIN' | 'IMPLAUSIBLE';
  confidence: number;
  summary: string;
  observations: string[];
}
interface RequiredLiveCheck {
  item: string;
  authority: string;
  reason: string;
}
interface EntityIntelResponse {
  name: string;
  kind: EntityKind;
  screening: { checks: ConsistencyCheck[]; signals: TechnicalSignal[]; available: boolean };
  assessment: EntityAssessment;
  requiresLiveVerification: RequiredLiveCheck[];
}

const statusStyle: Record<CheckStatus, { icon: React.ElementType; className: string }> = {
  PASS: { icon: CheckCircle2, className: 'text-[#10B981]' },
  WARN: { icon: AlertTriangle, className: 'text-[#F59E0B]' },
  FAIL: { icon: XCircle, className: 'text-[#EF4444]' },
};

const plausibilityStyle: Record<EntityAssessment['plausibility'], { label: string; className: string; icon: React.ElementType }> = {
  PLAUSIBLE: { label: 'Plausible name', className: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]', icon: CheckCircle2 },
  UNCERTAIN: { label: 'Uncertain', className: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]', icon: ShieldQuestion },
  IMPLAUSIBLE: { label: 'Implausible name', className: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]', icon: AlertTriangle },
};

async function lookupEntity(name: string, kind: EntityKind): Promise<EntityIntelResponse> {
  const response = await fetch('/api/entity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || 'Lookup failed');
  }
  return json as EntityIntelResponse;
}

const KindToggle: React.FC<{ value: EntityKind; onChange: (k: EntityKind) => void; disabled: boolean }> = ({ value, onChange, disabled }) => {
  const options: Array<{ key: EntityKind; label: string; icon: React.ElementType }> = [
    { key: 'company', label: 'Company', icon: Building2 },
    { key: 'person', label: 'Person', icon: User },
  ];
  return (
    <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-white p-1" role="radiogroup" aria-label="Entity kind">
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60 ${
            value === key ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F5F8FF]'
          }`}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
};

/**
 * Entity Intelligence: search a company or person name for a real OFAC
 * watchlist screen (name-match-only, requires human confirmation) plus a
 * name-plausibility read, and an explicit list of the checks that still
 * need a live authority to actually confirm this entity.
 */
const EntityIntel: React.FC = () => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<EntityKind>('company');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<EntityIntelResponse | null>(null);
  const inputId = useId();

  const runLookup = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await lookupEntity(trimmed, kind);
      setResult(res);
      setStatus('done');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Lookup failed. Please try again.');
      setStatus('error');
    }
  }, [name, kind, status]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup();
  };

  const failCount = result?.screening.checks.filter((c) => c.status === 'FAIL').length ?? 0;
  const warnCount = result?.screening.checks.filter((c) => c.status === 'WARN').length ?? 0;

  return (
    <div className="max-w-3xl">
      <div className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold px-3 py-1.5 mb-4">
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        Entity Intel
      </div>
      <h1 className="font-display font-extrabold text-3xl text-[#0F172A] mb-3">Entity Intelligence</h1>
      <p className="text-sm text-[#475569] leading-relaxed max-w-xl mb-8">
        Look up a company or person name to screen it against the live US Treasury OFAC sanctions
        list and get a plain-language read on the name itself. This is a starting point, not a
        verified identity check — see below for what a full verification would still require.
      </p>

      <form onSubmit={onSubmit} className="mb-8">
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-widest text-[#94A3B8] mb-2">
          Name to search
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" aria-hidden="true" />
            <input
              id={inputId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'company' ? 'e.g. Acme Trading Private Limited' : 'e.g. Full legal name'}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus:border-[#2563EB]"
              maxLength={200}
              autoComplete="off"
            />
          </div>
          <KindToggle value={kind} onChange={setKind} disabled={status === 'loading'} />
          <button
            type="submit"
            disabled={!name.trim() || status === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold px-6 py-3 shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Search className="w-4 h-4" aria-hidden="true" />}
            Search
          </button>
        </div>
      </form>

      {status === 'idle' && (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F5F8FF] px-6 py-12 text-center">
          <ShieldQuestion className="w-8 h-8 text-[#94A3B8] mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-[#475569]">Enter a name above to run a screening.</p>
        </div>
      )}

      {status === 'loading' && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 text-[#2563EB] mx-auto mb-3 animate-spin" aria-hidden="true" />
          <p className="text-sm text-[#475569]">Screening "{name.trim()}"…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-6 py-6 flex items-start gap-3" role="alert">
          <XCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#B91C1C] mb-1">Lookup failed</p>
            <p className="text-sm text-[#475569]">{errorMsg}</p>
            <button
              type="button"
              onClick={() => void runLookup()}
              className="mt-3 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {status === 'done' && result && (
        <div className="space-y-6">
          {/* OFAC screening */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E2E8F0]">
              <ShieldAlert className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                OFAC Watchlist Screening
              </span>
              {result.screening.available ? (
                <span className="ml-auto text-xs font-medium text-[#475569] tabular-nums">
                  {failCount} match{failCount === 1 ? '' : 'es'} · {warnCount} possible
                </span>
              ) : (
                <span className="ml-auto text-xs font-semibold text-[#B45309]">Unavailable</span>
              )}
            </div>
            <div className="px-5 py-4 bg-[#FFFBEB] border-b border-[#FDE68A]/60 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-[#92400E] leading-relaxed">
                Name-match only. A match here is <strong>not</strong> a confirmed identification — common
                names produce false positives. Any match requires human confirmation before acting on it.
              </p>
            </div>
            <ul className="divide-y divide-[#E2E8F0]">
              {result.screening.checks.map((c, i) => {
                const S = statusStyle[c.status] ?? statusStyle.WARN;
                const Icon = S.icon;
                return (
                  <li key={i} className="flex items-start gap-3 px-5 py-4">
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${S.className}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A]">{c.check}</p>
                      <p className="text-xs text-[#475569] mt-0.5 leading-relaxed">{c.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {result.screening.signals.length > 0 && (
              <div className="px-5 py-3 border-t border-[#E2E8F0] flex flex-wrap gap-2">
                {result.screening.signals.map((s, i) => (
                  <span
                    key={i}
                    className={`rounded-full text-xs px-3 py-1 ${s.concern ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#EFF6FF] text-[#1E40AF]'}`}
                  >
                    {s.label}: {s.value}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Assessment */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                Name Plausibility Assessment
              </span>
            </div>
            {(() => {
              const P = plausibilityStyle[result.assessment.plausibility] ?? plausibilityStyle.UNCERTAIN;
              const Icon = P.icon;
              return (
                <div className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold px-3 py-1.5 mb-3 ${P.className}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {P.label}
                  <span className="opacity-70 font-normal">· {result.assessment.confidence}% confidence</span>
                </div>
              );
            })()}
            <p className="text-sm text-[#475569] leading-relaxed mb-3">{result.assessment.summary}</p>
            {result.assessment.observations.length > 0 && (
              <ul className="space-y-1.5">
                {result.assessment.observations.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#475569]">
                    <span className="w-1 h-1 rounded-full bg-[#94A3B8] mt-1.5 shrink-0" aria-hidden="true" />
                    {o}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-[#94A3B8] mt-4 border-t border-[#E2E8F0] pt-3">
              This is a plausibility read of the name text only — it is not a registry, GST, PAN, MCA,
              or DigiLocker verification.
            </p>
          </section>

          {/* Requires live verification */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.12)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E2E8F0]">
              <ExternalLink className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                Still Needs Live Verification
              </span>
              <span className="ml-auto text-xs font-medium text-[#475569] tabular-nums">
                {result.requiresLiveVerification.length}
              </span>
            </div>
            <ul className="divide-y divide-[#E2E8F0]">
              {result.requiresLiveVerification.map((c, i) => (
                <li key={i} className="px-5 py-4">
                  <p className="text-sm font-medium text-[#0F172A]">{c.item}</p>
                  <p className="text-xs text-[#2563EB] font-semibold mt-1">{c.authority}</p>
                  <p className="text-xs text-[#475569] mt-1 leading-relaxed">{c.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

export default EntityIntel;
