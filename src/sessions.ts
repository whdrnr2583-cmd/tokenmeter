import type Database from 'better-sqlite3';

export interface SessionRow {
  session_id: string;
  project: string;
  source: string;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  events: number;
  total_usd: number;
  total_output: number;
  total_cache_read: number;
  top_model: string;
}

export interface SessionMessage {
  ts: number;
  model: string;
  source: string;
  request_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd_estimate: number;
}

export interface SessionTool {
  ts: number;
  tool_name: string;
  mcp_server: string | null;
  response_tokens_est: number;
  response_chars: number;
  latency_ms: number | null;
}

export interface SessionToolSummary {
  tool_name: string;
  mcp_server: string | null;
  calls: number;
  total_response_tokens: number;
  avg_latency_ms: number;
}

function dayWindow(days: number): number {
  return Date.now() - days * 86_400_000;
}

export function topSessions(
  db: Database.Database,
  days: number,
  limit = 20,
  project: string | null = null,
): SessionRow[] {
  const since = dayWindow(days);
  const projectFilter = project ? 'AND project = ?' : '';
  const args: (number | string)[] = project ? [since, project, limit] : [since, limit];

  // Aggregate per session.
  const sessions = db
    .prepare(
      `SELECT
         session_id,
         project,
         source,
         MIN(ts)                              AS start_ts,
         MAX(ts)                              AS end_ts,
         COUNT(*)                             AS events,
         COALESCE(SUM(usd_estimate), 0)       AS total_usd,
         COALESCE(SUM(output_tokens), 0)      AS total_output,
         COALESCE(SUM(cache_read_tokens), 0)  AS total_cache_read
       FROM token_events
       WHERE ts >= ? ${projectFilter}
       GROUP BY session_id
       ORDER BY total_usd DESC
       LIMIT ?`,
    )
    .all(...args) as Omit<SessionRow, 'duration_ms' | 'top_model'>[];

  if (sessions.length === 0) return [];

  // Look up the most expensive model per session.
  const placeholders = sessions.map(() => '?').join(',');
  const topModels = db
    .prepare(
      `SELECT session_id, model, COALESCE(SUM(usd_estimate), 0) AS usd
       FROM token_events
       WHERE session_id IN (${placeholders})
       GROUP BY session_id, model
       ORDER BY usd DESC`,
    )
    .all(...sessions.map((s) => s.session_id)) as {
    session_id: string;
    model: string;
    usd: number;
  }[];

  const topByModel = new Map<string, string>();
  for (const row of topModels) {
    if (!topByModel.has(row.session_id)) topByModel.set(row.session_id, row.model);
  }

  return sessions.map((s) => ({
    ...s,
    duration_ms: s.end_ts - s.start_ts,
    top_model: topByModel.get(s.session_id) ?? '',
  }));
}

export function sessionMessages(db: Database.Database, sessionId: string): SessionMessage[] {
  return db
    .prepare(
      `SELECT ts, model, source, request_id, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, usd_estimate
       FROM token_events
       WHERE session_id = ?
       ORDER BY ts ASC`,
    )
    .all(sessionId) as SessionMessage[];
}

export function sessionTools(db: Database.Database, sessionId: string): SessionTool[] {
  return db
    .prepare(
      `SELECT ts, tool_name, mcp_server, response_tokens_est, response_chars, latency_ms
       FROM tool_events
       WHERE session_id = ?
       ORDER BY ts ASC`,
    )
    .all(sessionId) as SessionTool[];
}

export function sessionToolSummary(
  db: Database.Database,
  sessionId: string,
): SessionToolSummary[] {
  return db
    .prepare(
      `SELECT
         tool_name,
         mcp_server,
         COUNT(*)                              AS calls,
         COALESCE(SUM(response_tokens_est), 0) AS total_response_tokens,
         COALESCE(AVG(latency_ms), 0)          AS avg_latency_ms
       FROM tool_events
       WHERE session_id = ?
       GROUP BY tool_name, mcp_server
       ORDER BY total_response_tokens DESC`,
    )
    .all(sessionId) as SessionToolSummary[];
}

export interface SessionOverview {
  session_id: string;
  project: string;
  source: string;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  total_usd: number;
  events: number;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_write: number;
}

export interface RecentSessionRow {
  session_id: string;
  project: string;
  source: string;
  last_activity_ms: number;
  age_minutes: number;
  events: number;
  total_usd: number;
}

// Sessions with activity within the last `withinHours`, most-recent first.
// These are the candidates a user might want to `claude --resume` / `codex resume`.
export function recentSessions(
  db: Database.Database,
  withinHours = 24,
  limit = 20,
): RecentSessionRow[] {
  const cutoff = Date.now() - withinHours * 3_600_000;
  const rows = db
    .prepare(
      `SELECT
         session_id,
         MIN(project)                    AS project,
         MIN(source)                     AS source,
         MAX(ts)                         AS last_activity_ms,
         COUNT(*)                        AS events,
         COALESCE(SUM(usd_estimate), 0)  AS total_usd
       FROM token_events
       WHERE ts >= ?
       GROUP BY session_id
       ORDER BY last_activity_ms DESC
       LIMIT ?`,
    )
    .all(cutoff, limit) as Omit<RecentSessionRow, 'age_minutes'>[];
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    age_minutes: Math.round((now - r.last_activity_ms) / 60_000),
  }));
}

export function sessionOverview(
  db: Database.Database,
  sessionId: string,
): SessionOverview | undefined {
  const row = db
    .prepare(
      `SELECT
         session_id,
         MIN(project)                          AS project,
         MIN(source)                           AS source,
         MIN(ts)                               AS start_ts,
         MAX(ts)                               AS end_ts,
         COALESCE(SUM(usd_estimate), 0)        AS total_usd,
         COUNT(*)                              AS events,
         COALESCE(SUM(input_tokens), 0)        AS total_input,
         COALESCE(SUM(output_tokens), 0)       AS total_output,
         COALESCE(SUM(cache_read_tokens), 0)   AS total_cache_read,
         COALESCE(SUM(cache_write_tokens), 0)  AS total_cache_write
       FROM token_events
       WHERE session_id = ?
       GROUP BY session_id`,
    )
    .get(sessionId) as Omit<SessionOverview, 'duration_ms'> | undefined;
  if (!row) return undefined;
  return { ...row, duration_ms: row.end_ts - row.start_ts };
}
