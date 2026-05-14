#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { migrate, openDb } from './db.js';
import { ingestAll } from './ingest.js';
import { byMcp, byModel, byProject, daily, overview } from './stats.js';
import { clampDaysToEntitlement, getEntitlement } from './license.js';

const USAGE = `Usage:
  token-meter ingest [--force]    Scan JSONL → SQLite
  token-meter stats [days=30]     Print summary
  token-meter serve               Run the dashboard at http://localhost:8765
  token-meter mcp                 Run as an MCP server (stdio) for Claude Code / Cursor
  token-meter activate <key>      Activate a Pro / Pro+ license

Flags:
  -v, --version                   Print version
  -h, --help                      Print this message`;

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function printOverview(db: ReturnType<typeof openDb>, days: number): void {
  const o = overview(db, days);
  console.log(`\n=== Last ${days} days ===`);
  console.log(`Events:        ${o.events}`);
  console.log(`Input tokens:  ${fmtTokens(o.total_input)}`);
  console.log(`Output tokens: ${fmtTokens(o.total_output)}`);
  console.log(`Cache read:    ${fmtTokens(o.total_cache_read)}`);
  console.log(`Cache write:   ${fmtTokens(o.total_cache_write)}`);
  console.log(`Estimated USD: ${fmtUsd(o.total_usd)}`);
}

function printDaily(db: ReturnType<typeof openDb>, days: number): void {
  const rows = daily(db, days);
  console.log(`\n=== Daily (${days}d) ===`);
  console.log('day         usd        input    output   cache_r  events');
  for (const r of rows) {
    console.log(
      `${r.day}  ${fmtUsd(r.usd).padStart(9)}  ` +
        `${fmtTokens(r.input).padStart(7)}  ${fmtTokens(r.output).padStart(7)}  ` +
        `${fmtTokens(r.cache_read).padStart(7)}  ${String(r.events).padStart(5)}`,
    );
  }
}

function printByModel(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byModel(db, days);
  console.log(`\n=== By model (${days}d) ===`);
  for (const r of rows) {
    console.log(
      `${r.model.padEnd(28)} ${fmtUsd(r.usd).padStart(9)}  ` +
        `out=${fmtTokens(r.output).padStart(7)}  events=${r.events}`,
    );
  }
}

function printByProject(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byProject(db, days);
  console.log(`\n=== By project (${days}d, top ${rows.length}) ===`);
  for (const r of rows) {
    const name = r.project.length > 45 ? '…' + r.project.slice(-44) : r.project;
    console.log(
      `${name.padEnd(46)} ${fmtUsd(r.usd).padStart(9)}  events=${r.events}`,
    );
  }
}

function printByMcp(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byMcp(db, days);
  console.log(`\n=== MCP & tools (${days}d, top ${rows.length}) ===`);
  console.log('mcp           tool                                  calls  resp_tok  avg_latency');
  for (const r of rows) {
    const mcp = (r.mcp_server ?? '-').padEnd(13);
    const tool = r.tool_name.length > 36 ? r.tool_name.slice(0, 36) : r.tool_name;
    console.log(
      `${mcp} ${tool.padEnd(38)} ${String(r.calls).padStart(5)}  ` +
        `${fmtTokens(r.total_response_tokens).padStart(8)}  ` +
        `${Math.round(r.avg_latency_ms)}ms`,
    );
  }
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  if (cmd === '--version' || cmd === '-v') {
    console.log(getVersion());
    return;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(USAGE);
    return;
  }

  if (cmd === 'serve') {
    const { startDashboard } = await import('./server.js');
    await startDashboard();
    // startDashboard keeps the process alive via app.listen + setInterval.
    return;
  }

  if (cmd === 'activate') {
    const key = rest[0]?.trim() ?? '';
    if (!key) {
      console.error('Usage: token-meter activate <license_key>');
      process.exit(1);
    }
    const { activateLicense } = await import('./license.js');
    const result = await activateLicense(key);
    if (result.ok) {
      console.log(result.message);
    } else {
      console.error(result.message);
      process.exit(1);
    }
    return;
  }

  const db = openDb();
  migrate(db);

  if (cmd === 'ingest') {
    const force = rest.includes('--force');
    const result = ingestAll(db, { force });
    console.log(
      `Claude Code: scanned ${result.claude_code.files_scanned}, processed ${result.claude_code.files_processed}, ` +
        `+${result.claude_code.token_rows_inserted} tokens, +${result.claude_code.tool_rows_inserted} tools ` +
        `in ${result.claude_code.duration_ms}ms`,
    );
    console.log(
      `Codex:       scanned ${result.codex.files_scanned}, processed ${result.codex.files_processed}, ` +
        `+${result.codex.token_rows_inserted} tokens in ${result.codex.duration_ms}ms`,
    );
    return;
  }

  if (cmd === 'mcp') {
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer();
    // startMcpServer keeps the process alive over stdio.
    return;
  }

  if (cmd === 'stats' || cmd === undefined) {
    const daysArg = rest.find((s) => /^\d+$/.test(s));
    const requested = daysArg ? Number.parseInt(daysArg, 10) : 30;
    const ent = getEntitlement();
    const days = clampDaysToEntitlement(requested, ent.tier);
    if (days < requested) {
      const tierLabel = ent.tier === 'free' ? 'Free' : 'Pro';
      const nextTip =
        ent.tier === 'free'
          ? 'Pro shows 30 days, Pro+ shows everything.'
          : 'Pro+ shows everything.';
      console.error(
        `[${tierLabel} tier] history clamped to ${days} days (requested ${requested}). ` +
          `${nextTip} See https://token-meter.dev#pricing`,
      );
    }
    printOverview(db, days);
    printDaily(db, days);
    printByModel(db, days);
    printByProject(db, days);
    printByMcp(db, days);
    return;
  }

  console.error(USAGE);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
