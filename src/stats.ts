import type Database from 'better-sqlite3';
import { modelRates } from './pricing.js';

export interface OverviewRow {
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_write: number;
  total_usd: number;
  events: number;
  first_ts: number | null;
  last_ts: number | null;
}

export interface DailyRow {
  day: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  usd: number;
  events: number;
}

export interface ModelRow {
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  usd: number;
  events: number;
}

export interface ProjectRow {
  project: string;
  usd: number;
  events: number;
  total_tokens: number;
}

export interface McpRow {
  mcp_server: string | null;
  tool_name: string;
  calls: number;
  total_response_tokens: number;
  avg_latency_ms: number;
}

export interface HourlyRow {
  hour: number; // 0..23 local
  events: number;
  usd: number;
  output_tokens: number;
}

function dayWindow(days: number): number {
  return Date.now() - days * 86_400_000;
}

export function overview(db: Database.Database, days: number): OverviewRow {
  const since = dayWindow(days);
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0)        AS total_input,
        COALESCE(SUM(output_tokens), 0)       AS total_output,
        COALESCE(SUM(cache_read_tokens), 0)   AS total_cache_read,
        COALESCE(SUM(cache_write_tokens), 0)  AS total_cache_write,
        COALESCE(SUM(usd_estimate), 0)        AS total_usd,
        COUNT(*)                              AS events,
        MIN(ts)                               AS first_ts,
        MAX(ts)                               AS last_ts
       FROM token_events
       WHERE ts >= ?`,
    )
    .get(since) as OverviewRow;
  return row;
}

export function daily(db: Database.Database, days: number): DailyRow[] {
  const since = dayWindow(days);
  return db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS day,
        COALESCE(SUM(input_tokens), 0)        AS input,
        COALESCE(SUM(output_tokens), 0)       AS output,
        COALESCE(SUM(cache_read_tokens), 0)   AS cache_read,
        COALESCE(SUM(cache_write_tokens), 0)  AS cache_write,
        COALESCE(SUM(usd_estimate), 0)        AS usd,
        COUNT(*)                              AS events
       FROM token_events
       WHERE ts >= ?
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(since) as DailyRow[];
}

export function byModel(db: Database.Database, days: number): ModelRow[] {
  const since = dayWindow(days);
  return db
    .prepare(
      `SELECT
        model,
        COALESCE(SUM(input_tokens), 0)        AS input,
        COALESCE(SUM(output_tokens), 0)       AS output,
        COALESCE(SUM(cache_read_tokens), 0)   AS cache_read,
        COALESCE(SUM(cache_write_tokens), 0)  AS cache_write,
        COALESCE(SUM(usd_estimate), 0)        AS usd,
        COUNT(*)                              AS events
       FROM token_events
       WHERE ts >= ?
       GROUP BY model
       ORDER BY usd DESC`,
    )
    .all(since) as ModelRow[];
}

export function byProject(db: Database.Database, days: number, limit = 20): ProjectRow[] {
  const since = dayWindow(days);
  return db
    .prepare(
      `SELECT
        project,
        COALESCE(SUM(usd_estimate), 0)                                 AS usd,
        COUNT(*)                                                       AS events,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens), 0) AS total_tokens
       FROM token_events
       WHERE ts >= ?
       GROUP BY project
       ORDER BY usd DESC
       LIMIT ?`,
    )
    .all(since, limit) as ProjectRow[];
}

export function byMcp(db: Database.Database, days: number, limit = 30): McpRow[] {
  const since = dayWindow(days);
  return db
    .prepare(
      `SELECT
        mcp_server,
        tool_name,
        COUNT(*)                                AS calls,
        COALESCE(SUM(response_tokens_est), 0)   AS total_response_tokens,
        COALESCE(AVG(latency_ms), 0)            AS avg_latency_ms
       FROM tool_events
       WHERE ts >= ?
       GROUP BY mcp_server, tool_name
       ORDER BY total_response_tokens DESC
       LIMIT ?`,
    )
    .all(since, limit) as McpRow[];
}

export function byHour(db: Database.Database, days: number): HourlyRow[] {
  const since = dayWindow(days);
  return db
    .prepare(
      `SELECT
        CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
        COUNT(*)                          AS events,
        COALESCE(SUM(usd_estimate), 0)    AS usd,
        COALESCE(SUM(output_tokens), 0)   AS output_tokens
       FROM token_events
       WHERE ts >= ?
       GROUP BY hour
       ORDER BY hour ASC`,
    )
    .all(since) as HourlyRow[];
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export interface CacheStatsRow {
  total_input: number;
  total_cache_read: number;
  total_cache_write: number;
  /** cache_read / (input + cache_read), 0..1. 0 when there are no read-side tokens. */
  hit_ratio: number;
  /** Gross saving from cache reads: each cache-read token billed at cacheRead instead of input rate. */
  savings_usd: number;
  /** USD spent creating caches (cache-write tokens × cacheWrite rate). */
  write_cost_usd: number;
  /** savings_usd − write_cost_usd. Negative ⇒ writing more cache than the reads recover. */
  net_usd: number;
}

/**
 * Cache efficiency over the window. LLM-free — pure aggregation + the pricing
 * table. Grouped by model so per-model rates apply.
 */
export function cacheStats(db: Database.Database, days: number): CacheStatsRow {
  const since = dayWindow(days);
  const rows = db
    .prepare(
      `SELECT
        model,
        COALESCE(SUM(input_tokens), 0)        AS input,
        COALESCE(SUM(cache_read_tokens), 0)   AS cache_read,
        COALESCE(SUM(cache_write_tokens), 0)  AS cache_write
       FROM token_events
       WHERE ts >= ?
       GROUP BY model`,
    )
    .all(since) as Array<{
    model: string;
    input: number;
    cache_read: number;
    cache_write: number;
  }>;

  let total_input = 0;
  let total_cache_read = 0;
  let total_cache_write = 0;
  let savings_usd = 0;
  let write_cost_usd = 0;
  for (const r of rows) {
    const p = modelRates(r.model);
    total_input += r.input;
    total_cache_read += r.cache_read;
    total_cache_write += r.cache_write;
    savings_usd += (r.cache_read * (p.input - p.cacheRead)) / 1_000_000;
    write_cost_usd += (r.cache_write * p.cacheWrite5m) / 1_000_000;
  }
  const readSide = total_input + total_cache_read;
  return {
    total_input,
    total_cache_read,
    total_cache_write,
    hit_ratio: readSide > 0 ? total_cache_read / readSide : 0,
    savings_usd: round6(savings_usd),
    write_cost_usd: round6(write_cost_usd),
    net_usd: round6(savings_usd - write_cost_usd),
  };
}

export interface ToolOutlier {
  tool_name: string;
  mcp_server: string | null;
  calls: number;
  avg_tokens: number;
  max_tokens: number;
}

export interface CacheWasteDay {
  day: string;
  cache_read: number;
  cache_write: number;
}

export interface WasteReport {
  tool_outliers: ToolOutlier[];
  cache_waste_days: CacheWasteDay[];
}

/**
 * Heuristic waste signals — things worth a look, not verdicts. LLM-free.
 *  - tool_outliers: tools (≥3 calls) whose largest response dwarfs their
 *    average (max > 5× avg and > 10k tokens) — oversized context dumps.
 *  - cache_waste_days: days that wrote more cache than they read back —
 *    cache that did not pay off.
 */
export function wasteSignals(db: Database.Database, days: number): WasteReport {
  const since = dayWindow(days);

  const toolRows = db
    .prepare(
      `SELECT
        tool_name,
        mcp_server,
        COUNT(*)                                               AS calls,
        CAST(COALESCE(AVG(response_tokens_est), 0) AS INTEGER)  AS avg_tokens,
        COALESCE(MAX(response_tokens_est), 0)                   AS max_tokens
       FROM tool_events
       WHERE ts >= ?
       GROUP BY mcp_server, tool_name
       HAVING COUNT(*) >= 3`,
    )
    .all(since) as ToolOutlier[];

  const tool_outliers = toolRows
    .filter((r) => r.max_tokens > 10_000 && r.max_tokens > 5 * r.avg_tokens)
    .sort((a, b) => b.max_tokens - a.max_tokens)
    .slice(0, 8);

  const cache_waste_days = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS day,
        COALESCE(SUM(cache_read_tokens), 0)   AS cache_read,
        COALESCE(SUM(cache_write_tokens), 0)  AS cache_write
       FROM token_events
       WHERE ts >= ?
       GROUP BY day
       HAVING SUM(cache_write_tokens) > SUM(cache_read_tokens)
          AND SUM(cache_write_tokens) > 0
       ORDER BY day ASC`,
    )
    .all(since) as CacheWasteDay[];

  return { tool_outliers, cache_waste_days };
}
