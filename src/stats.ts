import type Database from 'better-sqlite3';

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
