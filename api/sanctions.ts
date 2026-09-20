/**
 * Pramaan — free, no-API-key watchlist screening against the US Treasury
 * OFAC Specially Designated Nationals (SDN) list.
 *
 * HONESTY CONTRACT (non-negotiable):
 *   - We NEVER report a clean/PASS result unless we actually fetched and
 *     parsed the live list and actually checked the name against it.
 *   - If the list can't be fetched or parsed, `available` is false and we
 *     emit a WARN check saying screening could not be performed — we never
 *     imply "not sanctioned" when we simply couldn't check.
 *   - A match is ALWAYS reported as a name match requiring human
 *     confirmation, never as a confirmed identification. Common names
 *     produce false positives; we do not pretend otherwise.
 *   - Matching is conservative: exact normalized-name match, or (for names
 *     with 2+ tokens) an all-tokens-present match. No fuzzy/edit-distance
 *     matching — that would manufacture false accusations.
 *
 * Data source: the public OFAC SDN CSV export. The historic short URL
 * (https://www.treasury.gov/ofac/downloads/sdn.csv) still works and is used
 * here — Treasury 302-redirects it through sanctionslistservice.ofac.treas.gov
 * to a presigned S3 export URL. Node's global fetch follows redirects by
 * default, so no extra logic is needed for that hop. Verified working via a
 * live request on 2026-09-20 (HTTP 200, ~19,000+ SDN records, well-formed
 * quoted CSV).
 *
 * No npm dependencies: CSV parsing and name normalization are hand-rolled.
 */

import type { ConsistencyCheck, TechnicalSignal } from '../types';

const SDN_CSV_URL = 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const LIST_LABEL = 'US Treasury OFAC Specially Designated Nationals (SDN) List';
const DEFAULT_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** One row of the SDN list, reduced to what screening needs. */
interface SdnEntry {
  /** Primary listed name, e.g. "AEROCARIBBEAN AIRLINES". */
  name: string;
  /** Normalized (uppercased, punctuation-stripped) primary name. */
  normName: string;
  /** Deduped normalized tokens of the primary name. */
  tokens: string[];
  /** SDN_Type column, e.g. "individual" (often blank for entities/vessels). */
  sdnType: string;
  /** Program column, e.g. "SDGT", "CUBA". */
  program: string;
  /** a.k.a. / f.k.a. / n.k.a. names pulled out of the Remarks column. */
  akas: string[];
}

interface SdnCache {
  entries: SdnEntry[];
  recordCount: number;
  fetchedAt: number;
}

/** Module-scope cache so repeated calls within the TTL are free. */
let cache: SdnCache | null = null;
/** In-flight fetch, so concurrent callers share one request instead of racing. */
let inflight: Promise<SdnCache> | null = null;

export interface ScreenNamesResult {
  checks: ConsistencyCheck[];
  signals: TechnicalSignal[];
  available: boolean;
}

export interface ScreenNamesOptions {
  /** Fetch timeout in ms for the SDN list download. Default 6000. */
  timeoutMs?: number;
}

/**
 * Screen a list of names against the live OFAC SDN list.
 * Pure with respect to its inputs modulo the module-scope cache/TTL and the
 * network — given the same cached list, output is deterministic.
 */
export async function screenNames(names: string[], opts?: ScreenNamesOptions): Promise<ScreenNamesResult> {
  const cleanNames = (names || []).map((n) => String(n || '').trim()).filter(Boolean);

  if (cleanNames.length === 0) {
    return {
      checks: [
        {
          check: 'OFAC SDN Watchlist Screening',
          status: 'WARN',
          detail: 'No names were supplied to screen — sanctions screening was not performed.',
        },
      ],
      signals: [],
      available: true, // nothing wrong with the list/network; there was simply nothing to check
    };
  }

  let list: SdnCache;
  try {
    list = await getSdnList(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (err: any) {
    // CRITICAL HONESTY: could not fetch/parse — say so plainly, never imply "clean".
    const reason = err?.name === 'AbortError' ? 'the request timed out' : (err?.message || 'an unknown error occurred');
    return {
      checks: [
        {
          check: 'OFAC SDN Watchlist Screening',
          status: 'WARN',
          detail: `Screening could NOT be performed — the live ${LIST_LABEL} could not be fetched/parsed (${reason}). This is not a clean result; sanctions status for ${cleanNames.length === 1 ? '"' + cleanNames[0] + '"' : cleanNames.length + ' name(s)'} is unverified.`,
        },
      ],
      signals: [
        { label: 'OFAC SDN list', value: 'Unavailable — fetch or parse failed', concern: true },
      ],
      available: false,
    };
  }

  const checks: ConsistencyCheck[] = [];
  const signals: TechnicalSignal[] = [
    {
      label: 'OFAC SDN list',
      value: `${list.recordCount.toLocaleString()} records, cached ${minutesAgo(list.fetchedAt)} ago`,
      concern: false,
    },
  ];

  for (const rawName of cleanNames) {
    const match = matchAgainstList(rawName, list.entries);
    if (!match) {
      checks.push({
        check: `OFAC SDN Watchlist Screening: "${rawName}"`,
        status: 'PASS',
        detail: `No match found for "${rawName}" against ${list.recordCount.toLocaleString()} records in the ${LIST_LABEL}.`,
      });
    } else {
      const { entry, kind, matchedOn } = match;
      const strength = kind === 'exact' ? 'FAIL' : 'WARN';
      const basis = matchedOn === 'aka' ? `a listed alias ("${entry.name}" a.k.a. "${match.matchedName}")` : `the listed name "${entry.name}"`;
      checks.push({
        check: `OFAC SDN Watchlist Screening: "${rawName}"`,
        status: strength,
        detail:
          `NAME MATCH ONLY, NOT a confirmed identification — human confirmation required. ` +
          `"${rawName}" ${kind === 'exact' ? 'exactly matches' : 'matches all name-tokens of'} ${basis}` +
          `${entry.program ? ` (program: ${entry.program})` : ''}${entry.sdnType ? `, type: ${entry.sdnType}` : ''}. ` +
          `Common names can produce false positives — verify identity (DOB, nationality, ID number) before taking any action.`,
      });
      signals.push({
        label: `Sanctions name match: "${rawName}"`,
        value: `${entry.name}${entry.program ? ` (${entry.program})` : ''} — ${kind === 'exact' ? 'exact' : 'all-tokens'} match, unconfirmed`,
        concern: true,
      });
    }
  }

  return { checks, signals, available: true };
}

// ---------------------------------------------------------------------------
// List fetch + cache
// ---------------------------------------------------------------------------

async function getSdnList(timeoutMs: number): Promise<SdnCache> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(SDN_CSV_URL, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`SDN list fetch failed with HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error('SDN list fetch returned no rows');

      const entries: SdnEntry[] = [];
      for (const row of rows) {
        // Columns: ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign,
        // Vess_type, Tonnage, GRT, Vess_flag, Vess_owner, Remarks
        const name = cleanField(row[1]);
        if (!name) continue;
        const sdnType = cleanField(row[2]);
        const program = cleanField(row[3]);
        const remarks = cleanField(row[11]);
        const akas = extractAkas(remarks);
        const normName = normalizeName(name);
        entries.push({ name, normName, tokens: tokenize(normName), sdnType, program, akas });
      }

      if (entries.length < 1000) {
        // Sanity floor: the real SDN list has ~15k+ entries. A tiny/empty
        // parse means something upstream changed shape — treat as unavailable
        // rather than silently screening against a broken subset.
        throw new Error(`Parsed suspiciously few SDN records (${entries.length}) — refusing to treat as a valid list`);
      }

      const next: SdnCache = { entries, recordCount: entries.length, fetchedAt: Date.now() };
      cache = next;
      return next;
    } finally {
      clearTimeout(timer);
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface MatchResult {
  entry: SdnEntry;
  kind: 'exact' | 'tokens';
  matchedOn: 'primary' | 'aka';
  matchedName: string; // the specific list name (primary or aka) that matched
}

function matchAgainstList(rawName: string, entries: SdnEntry[]): MatchResult | null {
  const normInput = normalizeName(rawName);
  if (!normInput) return null;
  const inputTokens = tokenize(normInput);

  for (const entry of entries) {
    const candidates: Array<{ name: string; norm: string; tokens: string[]; on: 'primary' | 'aka' }> = [
      { name: entry.name, norm: entry.normName, tokens: entry.tokens, on: 'primary' },
      ...entry.akas.map((a) => ({ name: a, norm: normalizeName(a), tokens: tokenize(normalizeName(a)), on: 'aka' as const })),
    ];
    for (const c of candidates) {
      if (!c.norm) continue;
      if (c.norm === normInput) {
        return { entry, kind: 'exact', matchedOn: c.on, matchedName: c.name };
      }
      if (inputTokens.length >= 2 && c.tokens.length >= 2 && allTokensPresent(inputTokens, c.tokens)) {
        return { entry, kind: 'tokens', matchedOn: c.on, matchedName: c.name };
      }
    }
  }
  return null;
}

function allTokensPresent(needleTokens: string[], haystackTokens: string[]): boolean {
  const hay = new Set(haystackTokens);
  return needleTokens.every((t) => hay.has(t));
}

const TITLES = new Set([
  'MR', 'MRS', 'MS', 'MISS', 'MX', 'DR', 'PROF', 'SIR', 'MADAM', 'MADAME',
  'SHRI', 'SMT', 'KUM', 'HAJI', 'HAJJI', 'SHEIKH', 'SHAYKH', 'SAYYID',
  'CAPT', 'COL', 'GEN', 'LT', 'MAJ', 'REV', 'HON',
]);

/** Uppercase, strip punctuation, collapse whitespace, drop common titles. */
function normalizeName(name: string): string {
  if (!name) return '';
  const upper = name.toUpperCase();
  // Replace anything that isn't a letter/digit/whitespace with a space, so
  // "AL-RAHMAN" and "O'BRIEN" split into separate tokens rather than fusing.
  const stripped = upper.replace(/[^A-Z0-9\s]/g, ' ');
  const tokens = stripped.split(/\s+/).filter(Boolean).filter((t) => !TITLES.has(t));
  return tokens.join(' ');
}

function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(' ').filter(Boolean)));
}

/** Pull "a.k.a. 'X'" / "f.k.a. 'X'" / "n.k.a. 'X'" names out of a Remarks field. */
function extractAkas(remarks: string): string[] {
  if (!remarks) return [];
  const pattern = /(?:a\.k\.a\.|f\.k\.a\.|n\.k\.a\.)\s*'([^']+)'/gi;
  const out: string[] = [];
  for (const match of remarks.matchAll(pattern)) {
    const v = (match[1] || '').trim();
    if (v) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV parsing (hand-rolled, no dependency) — handles quoted fields, doubled
// "" escapes inside quotes, and embedded newlines inside quoted fields.
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // Skip fully blank trailing rows (common at EOF).
    if (row.some((f) => f.length > 0)) rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\r') {
      // Handle \r\n and lone \r as a single row break.
      if (text[i + 1] === '\n') i++;
      endRow();
      i++;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

/** SDN fields commonly hold "-0-" as a null placeholder; normalize that away. */
function cleanField(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (!s || s === '-0-') return '';
  return s;
}

function minutesAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? '1 hr' : `${hrs} hrs`;
}
