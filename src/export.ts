/**
 * CSV / JSON export (Pro feature).
 *
 * Spec: docs/pro-features.md §5 "CSV / JSON export"
 *
 * Columns / fields: token_events minus internal id, plus usd_cents integer
 * (avoids Excel float-mangling). Cap at 30 days (Pro window); Pro+ uncapped.
 *
 * Both functions are pure: they take an open db handle + days window and
 * return a string — no file I/O. Callers (server route, CLI command) handle
 * writing to stdout or a file.
 */

import type Database from 'better-sqlite3';

/** Single row as exported — matches token_events public columns. */
export interface ExportRow {
  ts: number;
  source: string;
  source_kind: string;
  model: string;
  project: string;
  session_id: string;
  request_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_duration_ms: number | null;
  tps: number | null;
  usd_estimate: number;
  /** Integer cents (usd_estimate × 10000), avoids Excel float issues. */
  usd_cents: number;
}

const EXPORT_COLUMNS: (keyof ExportRow)[] = [
  'ts',
  'source',
  'source_kind',
  'model',
  'project',
  'session_id',
  'request_id',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'total_duration_ms',
  'tps',
  'usd_estimate',
  'usd_cents',
];

function queryRows(db: Database.Database, days: number): ExportRow[] {
  const since = Date.now() - days * 86_400_000;
  const raw = db
    .prepare(
      `SELECT ts, source, source_kind, model, project, session_id, request_id,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              total_duration_ms, tps, usd_estimate
       FROM token_events
       WHERE ts >= ?
       ORDER BY ts ASC`,
    )
    .all(since) as Omit<ExportRow, 'usd_cents'>[];
  return raw.map((r) => ({
    ...r,
    usd_cents: Math.round(r.usd_estimate * 10_000),
  }));
}

// ---------- CSV ----------

/** Escape a value for RFC 4180 CSV (quote if contains comma/quote/newline). */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export `days` worth of token_events as CSV.
 * Returns a UTF-8 string ready for `Content-Type: text/csv`.
 */
export function exportCsv(db: Database.Database, days: number): string {
  const rows = queryRows(db, days);
  const header = EXPORT_COLUMNS.join(',');
  const lines = rows.map((r) =>
    EXPORT_COLUMNS.map((col) => csvCell(r[col])).join(','),
  );
  return [header, ...lines].join('\n');
}

// ---------- JSON ----------

/**
 * Export `days` worth of token_events as JSON.
 * Returns a JSON string: `{ "days": N, "rows": [...] }`.
 */
export function exportJson(db: Database.Database, days: number): string {
  const rows = queryRows(db, days);
  return JSON.stringify({ days, count: rows.length, rows }, null, 2);
}
