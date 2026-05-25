/**
 * Weekly digest / recommendation email (Pro feature).
 *
 * Spec: docs/pro-features.md §7 "Weekly recommendation report"
 *       (digest is the delivery surface described in §2 "Smart alerts"
 *        `digest.weekly` action type)
 *
 * Two phases:
 *  1. gatherDigestFacts() — pure heuristic, no LLM, no network.
 *     Gathers: top 3 sessions by USD, top 3 models by USD, MCP breakdown,
 *     day-of-week distribution, cache hit ratio, week-over-week delta.
 *
 *  2. sendWeeklyDigest() — assembles the plain-text email body, calls the
 *     CF Workers endpoint `/v1/action/email` if a license key is available.
 *     In this build the HTTP call is **stubbed** — the function returns
 *     'skipped:email_not_wired_until_deploy' so the heuristic path can be
 *     tested fully without live infra.
 *
 * DEPLOY-TIME WIRING NOTE (see bottom of file):
 *   Replace the stub in sendEmailViaWorker() with a real fetch() once the
 *   CF Workers /v1/action/email endpoint is deployed.
 */

import type Database from 'better-sqlite3';
import { modelRates } from './pricing.js';

// ---------- Facts shape ----------

export interface DigestTopSession {
  session_id: string;
  project: string;
  usd: number;
  events: number;
}

export interface DigestTopModel {
  model: string;
  usd: number;
  events: number;
}

export interface DigestMcpEntry {
  tool_name: string;
  mcp_server: string | null;
  calls: number;
}

export interface DigestFacts {
  week_label: string;
  week_start_ts: number;
  week_end_ts: number;
  total_usd: number;
  prev_week_usd: number;
  wow_delta_usd: number;
  wow_delta_pct: number | null;
  top_sessions: DigestTopSession[];
  top_models: DigestTopModel[];
  top_mcp: DigestMcpEntry[];
  /** Spend distribution across weekdays 0-6 (Sun=0). */
  spend_by_dow: Record<number, number>;
  cache_hit_ratio: number;
  cache_savings_usd: number;
  events: number;
}

// ---------- Heuristics ----------

function mondayOfWeek(asOf: number): Date {
  const d = new Date(asOf);
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Gather digest facts for the calendar week that contains `asOf`.
 * Week = Monday 00:00 .. Sunday 23:59:59.
 *
 * @param asOf  Epoch ms to treat as "now". Injected in tests.
 */
export function gatherDigestFacts(
  db: Database.Database,
  asOf: number = Date.now(),
): DigestFacts {
  const weekStart = mondayOfWeek(asOf);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();

  // Current week totals.
  const totRow = db
    .prepare(
      `SELECT COALESCE(SUM(usd_estimate), 0) AS usd, COUNT(*) AS events
       FROM token_events WHERE ts >= ? AND ts < ?`,
    )
    .get(ws, we) as { usd: number; events: number };

  // Previous week.
  const prevStart = ws - 7 * 86_400_000;
  const prevRow = db
    .prepare(
      `SELECT COALESCE(SUM(usd_estimate), 0) AS usd
       FROM token_events WHERE ts >= ? AND ts < ?`,
    )
    .get(prevStart, ws) as { usd: number };

  const wowDelta = totRow.usd - prevRow.usd;
  const wowPct =
    prevRow.usd > 0 ? wowDelta / prevRow.usd : null;

  // Top 3 sessions.
  const topSessions = db
    .prepare(
      `SELECT session_id,
              MIN(project) AS project,
              COALESCE(SUM(usd_estimate), 0) AS usd,
              COUNT(*) AS events
       FROM token_events WHERE ts >= ? AND ts < ?
       GROUP BY session_id
       ORDER BY usd DESC
       LIMIT 3`,
    )
    .all(ws, we) as DigestTopSession[];

  // Top 3 models.
  const topModels = db
    .prepare(
      `SELECT model,
              COALESCE(SUM(usd_estimate), 0) AS usd,
              COUNT(*) AS events
       FROM token_events WHERE ts >= ? AND ts < ?
       GROUP BY model
       ORDER BY usd DESC
       LIMIT 3`,
    )
    .all(ws, we) as DigestTopModel[];

  // Top MCP tools by call count.
  const topMcp = db
    .prepare(
      `SELECT tool_name, mcp_server, COUNT(*) AS calls
       FROM tool_events WHERE ts >= ? AND ts < ?
       GROUP BY tool_name, mcp_server
       ORDER BY calls DESC
       LIMIT 5`,
    )
    .all(ws, we) as DigestMcpEntry[];

  // Spend by day-of-week.
  const dowRows = db
    .prepare(
      `SELECT CAST(strftime('%w', ts/1000, 'unixepoch', 'localtime') AS INTEGER) AS dow,
              COALESCE(SUM(usd_estimate), 0) AS usd
       FROM token_events WHERE ts >= ? AND ts < ?
       GROUP BY dow`,
    )
    .all(ws, we) as { dow: number; usd: number }[];
  const spendByDow: Record<number, number> = {};
  for (const r of dowRows) spendByDow[r.dow] = r.usd;

  // Cache efficiency.
  const cacheRows = db
    .prepare(
      `SELECT model,
              COALESCE(SUM(input_tokens), 0) AS input,
              COALESCE(SUM(cache_read_tokens), 0) AS cache_read,
              COALESCE(SUM(cache_write_tokens), 0) AS cache_write
       FROM token_events WHERE ts >= ? AND ts < ?
       GROUP BY model`,
    )
    .all(ws, we) as { model: string; input: number; cache_read: number; cache_write: number }[];

  let totalReadSide = 0;
  let totalCacheRead = 0;
  let savingsUsd = 0;
  for (const r of cacheRows) {
    const p = modelRates(r.model);
    totalReadSide += r.input + r.cache_read;
    totalCacheRead += r.cache_read;
    savingsUsd += (r.cache_read * (p.input - p.cacheRead)) / 1_000_000;
  }
  const cacheHitRatio = totalReadSide > 0 ? totalCacheRead / totalReadSide : 0;

  // Format as local date string (YYYY-MM-DD) to match the user's timezone.
  const pad = (n: number): string => String(n).padStart(2, '0');
  const weekLabelLocal = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;

  return {
    week_label: weekLabelLocal,
    week_start_ts: ws,
    week_end_ts: we,
    total_usd: totRow.usd,
    prev_week_usd: prevRow.usd,
    wow_delta_usd: wowDelta,
    wow_delta_pct: wowPct,
    top_sessions: topSessions,
    top_models: topModels,
    top_mcp: topMcp,
    spend_by_dow: spendByDow,
    cache_hit_ratio: cacheHitRatio,
    cache_savings_usd: savingsUsd,
    events: totRow.events,
  };
}

// ---------- Plain-text email formatter ----------

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

/**
 * Render a `DigestFacts` struct into a plain-text email body.
 * The LLM-augmented version (spec §7 step 2) calls `/v1/report/weekly` on
 * the CF Workers with these facts; that route is not yet deployed.
 * This plain-text fallback ships as the base digest format.
 */
export function renderDigestText(facts: DigestFacts): string {
  const lines: string[] = [];
  lines.push(`Token Meter — Weekly Digest (${facts.week_label})`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Total spend:  $${facts.total_usd.toFixed(4)}`);
  if (facts.prev_week_usd > 0) {
    const sign = facts.wow_delta_usd >= 0 ? '+' : '';
    const pctStr =
      facts.wow_delta_pct !== null
        ? ` (${sign}${pct(facts.wow_delta_pct)} vs last week)`
        : '';
    lines.push(
      `vs last week: $${facts.prev_week_usd.toFixed(4)}${pctStr}`,
    );
  }
  lines.push(`Events:       ${facts.events}`);
  lines.push(`Cache hit:    ${pct(facts.cache_hit_ratio)}  (saved $${facts.cache_savings_usd.toFixed(4)})`);
  lines.push('');

  if (facts.top_models.length > 0) {
    lines.push('Top models:');
    for (const m of facts.top_models) {
      lines.push(`  ${m.model.padEnd(30)} $${m.usd.toFixed(4)}  (${m.events} events)`);
    }
    lines.push('');
  }

  if (facts.top_sessions.length > 0) {
    lines.push('Top sessions by cost:');
    for (const s of facts.top_sessions) {
      const proj = s.project.length > 40 ? '…' + s.project.slice(-39) : s.project;
      lines.push(`  ${s.session_id.slice(0, 16)}  $${s.usd.toFixed(4)}  ${proj}`);
    }
    lines.push('');
  }

  if (facts.top_mcp.length > 0) {
    lines.push('Top tools (by call count):');
    for (const t of facts.top_mcp) {
      const mcp = t.mcp_server ? `[${t.mcp_server}] ` : '';
      lines.push(`  ${mcp}${t.tool_name.padEnd(35)} ${t.calls} calls`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Token Meter  https://token-meter.dev');
  return lines.join('\n');
}

// ---------- Email delivery (stub — wired at deploy time) ----------

export interface DigestSendResult {
  ok: boolean;
  status: 'sent' | 'skipped' | 'error';
  message: string;
}

/**
 * DEPLOY-TIME WIRING NOTE:
 *
 * Replace the stub body below with a real fetch() call once the CF Workers
 * route `/v1/action/email` is live.
 *
 * Expected request shape:
 *   POST https://api.token-meter.dev/v1/action/email
 *   Authorization: Bearer <license_key>
 *   Content-Type: application/json
 *   { "to": "<user_email>", "subject": "...", "text": "<body>",
 *     "facts": <DigestFacts> }
 *
 * The worker validates the license, calls Resend, and returns
 * { "ok": true, "message_id": "..." } or { "ok": false, "error": "..." }.
 *
 * Budget cap: the worker enforces max 4 LLM calls / user / month (~$0.20).
 */
async function sendEmailViaWorker(
  _to: string,
  _subject: string,
  _body: string,
  _facts: DigestFacts,
  _licenseKey: string,
): Promise<DigestSendResult> {
  // STUB — remove this return and uncomment the fetch below once deployed.
  return {
    ok: false,
    status: 'skipped',
    message: 'email_not_wired_until_deploy',
  };

  /*
  const apiBase = process.env.TOKEN_METER_API_BASE ?? 'https://api.token-meter.dev';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${apiBase}/v1/action/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${_licenseKey}`,
      },
      body: JSON.stringify({
        to: _to,
        subject: _subject,
        text: _body,
        facts: _facts,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: 'error', message: `status_${res.status}_${text.slice(0, 80)}` };
    }
    return { ok: true, status: 'sent', message: 'ok' };
  } catch (err) {
    return { ok: false, status: 'error', message: `network_${(err as Error).message ?? 'unknown'}` };
  } finally {
    clearTimeout(t);
  }
  */
}

/**
 * Build and (stub-)send a weekly digest for the week containing `asOf`.
 *
 * @param db          Open SQLite handle.
 * @param to          Recipient email address.
 * @param licenseKey  Active Pro license key (passed to the worker for auth).
 * @param asOf        Epoch ms for "now" (test injection).
 */
export async function sendWeeklyDigest(
  db: Database.Database,
  to: string,
  licenseKey: string,
  asOf: number = Date.now(),
): Promise<DigestSendResult> {
  const facts = gatherDigestFacts(db, asOf);
  const subject = `Token Meter digest — week of ${facts.week_label}`;
  const body = renderDigestText(facts);
  return sendEmailViaWorker(to, subject, body, facts, licenseKey);
}
