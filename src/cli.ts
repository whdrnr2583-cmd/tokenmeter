#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { migrate, openDb } from './db.js';
import { ingestAll } from './ingest.js';
import {
  byMcp,
  byModel,
  byProject,
  cacheStats,
  daily,
  overview,
  wasteSignals,
} from './stats.js';
import {
  clampDaysToEntitlement,
  getEntitlement,
  isProTier,
  tierLabel,
  type Tier,
} from './license.js';

const USAGE = `Usage:
  token-meter ingest [--force]              Scan JSONL → SQLite
  token-meter stats [days=30]               Print summary
  token-meter serve                         Run the dashboard at http://localhost:8765
  token-meter mcp                           Run as an MCP server (stdio) for Claude Code / Cursor
  token-meter install-mcp <client>          Register the MCP server (one of:
                                            claude-code | cursor | claude-desktop | all)
  token-meter install-command <client>      Install the /token-meter slash command
                                            (currently: claude-code only)
  token-meter activate <key>                Activate a Pro / Pro+ license
  token-meter setup <key>                   activate + add gating export to ~/.zshrc / ~/.bashrc

Flags:
  -v, --version                             Print version
  -h, --help                                Print this message
  --dry-run                                 (install-mcp / install-command) preview changes`;

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
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/** Build a fixed-width row; negative width = left-align, positive = right-align. */
function row(cells: Array<[string, number]>): string {
  return cells
    .map(([v, w]) => (w < 0 ? v.padEnd(-w) : v.padStart(w)))
    .join('  ');
}

function printOverview(
  db: ReturnType<typeof openDb>,
  days: number,
  tier: Tier,
): void {
  const o = overview(db, days);
  console.log(`\n=== Last ${days} days · ${tierLabel(tier)} tier ===`);
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
  console.log(
    row([
      ['day', -10],
      ['usd', 9],
      ['input', 8],
      ['output', 8],
      ['cache_r', 8],
      ['events', 6],
    ]),
  );
  for (const r of rows) {
    console.log(
      row([
        [r.day, -10],
        [fmtUsd(r.usd), 9],
        [fmtTokens(r.input), 8],
        [fmtTokens(r.output), 8],
        [fmtTokens(r.cache_read), 8],
        [String(r.events), 6],
      ]),
    );
  }
}

function printByModel(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byModel(db, days);
  console.log(`\n=== By model (${days}d) ===`);
  console.log(
    row([
      ['model', -28],
      ['usd', 10],
      ['output', 8],
      ['events', 7],
    ]),
  );
  for (const r of rows) {
    console.log(
      row([
        [r.model, -28],
        [fmtUsd(r.usd), 10],
        [fmtTokens(r.output), 8],
        [String(r.events), 7],
      ]),
    );
  }
}

function printByProject(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byProject(db, days);
  console.log(`\n=== By project (${days}d, top ${rows.length}) ===`);
  console.log(
    row([
      ['project', -38],
      ['usd', 10],
      ['events', 7],
    ]),
  );
  for (const r of rows) {
    const name =
      r.project.length > 38 ? '…' + r.project.slice(-37) : r.project;
    console.log(
      row([
        [name, -38],
        [fmtUsd(r.usd), 10],
        [String(r.events), 7],
      ]),
    );
  }
}

function printByMcp(db: ReturnType<typeof openDb>, days: number): void {
  const rows = byMcp(db, days);
  console.log(`\n=== MCP & tools (${days}d, top ${rows.length}) ===`);
  console.log(
    row([
      ['mcp', -13],
      ['tool', -38],
      ['calls', 6],
      ['resp_tok', 9],
      ['latency', 9],
    ]),
  );
  for (const r of rows) {
    const tool =
      r.tool_name.length > 38
        ? r.tool_name.slice(0, 37) + '…'
        : r.tool_name;
    console.log(
      row([
        [r.mcp_server ?? '-', -13],
        [tool, -38],
        [String(r.calls), 6],
        [fmtTokens(r.total_response_tokens), 9],
        [`${Math.round(r.avg_latency_ms)}ms`, 9],
      ]),
    );
  }
}

function printCacheEfficiency(
  db: ReturnType<typeof openDb>,
  days: number,
): void {
  const c = cacheStats(db, days);
  console.log(`\n=== Cache efficiency (${days}d) ===`);
  console.log(
    `Hit ratio:     ${(c.hit_ratio * 100).toFixed(1)}%  (cache reads / read-side tokens)`,
  );
  console.log(
    `Cache savings: ${fmtUsd(c.savings_usd)}  (gross — reads billed at cache rate, not input)`,
  );
  console.log(
    `Write cost:    ${fmtUsd(c.write_cost_usd)}  (spent creating caches)`,
  );
  const sign = c.net_usd >= 0 ? '+' : '-';
  console.log(`Net:           ${sign}$${Math.abs(c.net_usd).toFixed(2)}`);
}

function printWasteSignals(
  db: ReturnType<typeof openDb>,
  days: number,
): void {
  const w = wasteSignals(db, days);
  console.log(`\n=== Waste signals (${days}d) ===`);
  if (w.tool_outliers.length === 0 && w.cache_waste_days.length === 0) {
    console.log(
      'Nothing stands out — no oversized tool responses or unused cache writes.',
    );
    return;
  }
  if (w.tool_outliers.length > 0) {
    console.log("Oversized tool responses (one call ≫ the tool's average):");
    console.log(
      row([
        ['  tool', -30],
        ['calls', 7],
        ['avg_tok', 9],
        ['max_tok', 9],
      ]),
    );
    for (const t of w.tool_outliers) {
      const full = (t.mcp_server ? `${t.mcp_server}/` : '') + t.tool_name;
      const name = full.length > 28 ? `${full.slice(0, 27)}…` : full;
      console.log(
        row([
          [`  ${name}`, -30],
          [String(t.calls), 7],
          [fmtTokens(t.avg_tokens), 9],
          [fmtTokens(t.max_tokens), 9],
        ]),
      );
    }
  }
  if (w.cache_waste_days.length > 0) {
    console.log('Cache-write-without-payoff days (wrote more than read back):');
    for (const d of w.cache_waste_days) {
      console.log(
        `  ${d.day}   write ${fmtTokens(d.cache_write)}  >  read ${fmtTokens(d.cache_read)}`,
      );
    }
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

  if (cmd === 'install-mcp') {
    const arg = rest.find((s) => !s.startsWith('--'))?.trim() ?? '';
    const dryRun = rest.includes('--dry-run');
    const validClients = new Set([
      'claude-code',
      'cursor',
      'claude-desktop',
      'all',
    ]);
    if (!validClients.has(arg)) {
      console.error(
        'Usage: token-meter install-mcp <claude-code|cursor|claude-desktop|all> [--dry-run]',
      );
      process.exit(1);
    }
    const { installMcp } = await import('./install-mcp.js');
    const results = installMcp(
      arg as 'claude-code' | 'cursor' | 'claude-desktop' | 'all',
      { dryRun },
    );
    let failed = false;
    for (const r of results) {
      const icon =
        r.action === 'added' || r.action === 'updated'
          ? '✓'
          : r.action === 'already-present'
            ? '='
            : r.action === 'skipped'
              ? '–'
              : '✗';
      console.log(`${icon} [${r.client}] ${r.message}`);
      if (!r.ok) failed = true;
    }
    if (failed) process.exit(1);
    return;
  }

  if (cmd === 'install-command') {
    const arg = rest.find((s) => !s.startsWith('--'))?.trim() ?? '';
    const dryRun = rest.includes('--dry-run');
    if (arg !== 'claude-code') {
      console.error('Usage: token-meter install-command claude-code [--dry-run]');
      process.exit(1);
    }
    const { installCommand } = await import('./install-command.js');
    const results = installCommand(arg, { dryRun });
    let failed = false;
    for (const r of results) {
      const icon =
        r.action === 'added' || r.action === 'updated'
          ? '✓'
          : r.action === 'already-present'
            ? '='
            : r.action === 'skipped'
              ? '–'
              : '✗';
      console.log(`${icon} [${r.client}] ${r.message}`);
      if (!r.ok) failed = true;
    }
    if (failed) process.exit(1);
    return;
  }

  if (cmd === 'setup') {
    const key = rest.find((s) => s.startsWith('tm_')) ?? rest[0]?.trim() ?? '';
    if (!key) {
      console.error('Usage: token-meter setup <license_key>');
      process.exit(1);
    }
    const { activateLicense, appendShellRc } = await import('./license.js');
    const act = await activateLicense(key);
    if (!act.ok) {
      console.error(act.message);
      process.exit(1);
    }
    console.log(act.message);

    const rc = appendShellRc();
    if (rc.modified) {
      console.log(
        `Added \`export TOKEN_METER_GATING=1\` to ${rc.path}. ` +
          `Restart your shell or run \`source ${rc.path}\` to apply.`,
      );
    } else if (rc.alreadyPresent) {
      console.log(`Gating env already present in ${rc.path} — nothing to add.`);
    } else {
      console.log(`Skipped shell rc edit: ${rc.reason ?? 'unknown reason'}`);
    }

    console.log('');
    console.log('Optional — register Token Meter as an MCP server:');
    console.log('  Auto:  token-meter install-mcp all   (claude-code + cursor + claude-desktop)');
    console.log('  Or:    token-meter install-mcp <claude-code|cursor|claude-desktop>');
    console.log('  Docs:  https://github.com/whdrnr2583-cmd/token-meter/blob/main/docs/mcp-server.md');
    console.log('');
    console.log('Verify: TOKEN_METER_GATING=1 token-meter stats 30  (no "Free tier" warning = success)');
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
      const nextTip =
        ent.tier === 'free'
          ? 'Pro shows 30 days, Pro+ shows everything.'
          : 'Pro+ shows everything.';
      console.error(
        `[${tierLabel(ent.tier)} tier] history clamped to ${days} days (requested ${requested}). ` +
          `${nextTip} See https://token-meter.dev#pricing`,
      );
    }
    printOverview(db, days, ent.tier);
    printDaily(db, days);
    printByModel(db, days);
    printByProject(db, days);
    printByMcp(db, days);
    if (isProTier(ent.tier)) {
      printCacheEfficiency(db, days);
      printWasteSignals(db, days);
    } else {
      console.log(
        '\n[Free tier] Cache efficiency + waste signals are Pro — ' +
          'see https://token-meter.dev#pricing',
      );
    }
    return;
  }

  console.error(USAGE);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
