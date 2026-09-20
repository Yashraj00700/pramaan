/**
 * HistoryService — localStorage-backed store for scan history (ScanRecord[]).
 *
 * Currently persists to the browser's localStorage under STORAGE_KEY, capped at
 * MAX_RECORDS newest-first entries. All access is wrapped in try/catch so a full
 * quota, disabled storage, or private-browsing mode degrades gracefully (reads
 * return [] / no-ops instead of throwing).
 *
 * --- Swapping to Supabase later ---
 * When ready to move history to a shared backend instead of the local browser:
 *   1. Add a `scans` table (see /supabase/schema.sql for a starter migration).
 *   2. Gate on `import.meta.env.VITE_SUPABASE_URL` — if it's set, dynamically
 *      import the client instead of touching localStorage:
 *        const { createClient } = await import("@supabase/supabase-js");
 *        const supabase = createClient(
 *          import.meta.env.VITE_SUPABASE_URL,
 *          import.meta.env.VITE_SUPABASE_ANON_KEY
 *        );
 *   3. Reimplement getAll/save/remove/clear as `supabase.from("scans")` queries
 *      (select ordered by created_at desc limit 30 / upsert / delete / delete-all),
 *      keeping the same HistoryService interface so callers don't change.
 *   4. Keep the localStorage path as an offline/no-env fallback.
 */

import type { ScanRecord } from "../types";

const STORAGE_KEY = "docsguard_scans";
const LEGACY_STORAGE_KEY = "pramaan_scans";
const MAX_RECORDS = 30;

function readAll(): ScanRecord[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    // Backward compatibility: this app was previously named "Pramaan" and
    // stored scan history under LEGACY_STORAGE_KEY. If the new key has no
    // data yet, fall back to the legacy key so existing saved scans aren't
    // lost, then migrate them forward to the new key.
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
        } catch {
          // Ignore — migration is best-effort.
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScanRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: ScanRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // Quota exceeded, private mode, or storage disabled — degrade gracefully.
  }
}

export const HistoryService = {
  getAll(): ScanRecord[] {
    return readAll().sort((a, b) => b.createdAt - a.createdAt);
  },

  save(rec: ScanRecord): void {
    try {
      const existing = readAll().filter((r) => r.id !== rec.id);
      const next = [rec, ...existing]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_RECORDS);
      writeAll(next);
    } catch {
      // Ignore — history is best-effort.
    }
  },

  remove(id: string): void {
    try {
      const next = readAll().filter((r) => r.id !== id);
      writeAll(next);
    } catch {
      // Ignore
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  },
};
