import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { countTokenEvents, migrate, openDb } from './db.js';
import { ingestAll, ensureFirstRunData } from './ingest.js';
import { byMcp, byModel, byProject, overview } from './stats.js';
import { recentSessions, sessionToolSummary } from './sessions.js';
import { readFileSync } from 'node:fs';

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function ageStr(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${minutes - h * 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h - d * 24}h ago`;
}

/** This package's version, read from package.json — keeps the MCP server's
 *  advertised version in sync with the real release instead of hardcoding. */
function serverVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Window length in days for a usage period. `today` is the current *local
 * calendar day* (local midnight → now), returned as a fractional day count so
 * the day-window helper in stats.ts resolves to local midnight — this matches
 * the per-day rows in the CLI breakdown. `week` / `month` stay rolling 7 / 30.
 */
export function periodWindowDays(p: 'today' | 'week' | 'month'): number {
  if (p !== 'today') return p === 'week' ? 7 : 30;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (Date.now() - midnight) / 86_400_000;
}

export async function startMcpServer(): Promise<void> {
  const db = openDb();
  migrate(db);
  // Fresh data at startup (incremental, cheap), then the first-run guard:
  // `firstRunGuidance` is non-empty only when no Claude Code / Codex logs could
  // be found — tools surface it so the agent tells the user what to do instead
  // of reporting an empty period as if it were a real $0.00 month.
  let firstRunGuidance = '';
  try {
    ingestAll(db);
    firstRunGuidance = ensureFirstRunData(db).guidance;
  } catch {
    /* non-fatal */
  }

  const server = new McpServer(
    {
      name: 'token-meter',
      version: serverVersion(),
    },
    {
      // Surfaced to the client at connect — lets the agent answer
      // "what can Token Meter do?" without a tool call.
      instructions:
        'Token Meter shows where your Claude Code + Codex tokens and money ' +
        'go — parsed from local logs, 100% offline. Tools: `usage_summary` ' +
        '(spend + token totals by model/project/tool for today|week|month), ' +
        '`recent_sessions` (find a session to resume), `session_tools` ' +
        '(debug which tools made one session slow or costly), `refresh_data` ' +
        '(re-scan logs for the latest numbers). A CLI ' +
        '(`npx @whdrnr2583/token-meter stats`) and a local dashboard ' +
        '(`token-meter serve`) also exist. When the user asks what Token ' +
        'Meter can do, summarize these four tools.',
    },
  );

  server.registerTool(
    'usage_summary',
    {
      title: 'usage summary (Token Meter)',
      description:
        'What you spent, where it went, and what was slow — Claude Code + Codex. API-equivalent estimate, local data only. insights=true adds heuristic tips.',
      inputSchema: {
        period: z.enum(['today', 'week', 'month']).default('today'),
        insights: z.boolean().default(false),
      },
      annotations: {
        title: 'usage summary (Token Meter)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ period, insights }) => {
      // First-run / empty-DB short-circuit: do not report "$0.00 spent" as if
      // it were a real period — the agent should tell the user how to get data.
      if (countTokenEvents(db) === 0) {
        const guide =
          firstRunGuidance ||
          'No Claude Code or Codex usage found yet. Use Claude Code or Codex, ' +
            'then run `token-meter ingest` (or the refresh_data tool).';
        return {
          content: [
            {
              type: 'text',
              text: `Token Meter has no usage data yet.\n${guide}`,
            },
          ],
        };
      }
      const days = periodWindowDays(period);
      const o = overview(db, days);
      const models = byModel(db, days);
      const projects = byProject(db, days, 1);
      const tools = byMcp(db, days, 100);
      const periodLabel =
        period === 'today' ? 'today' : period === 'week' ? 'last 7d' : 'last 30d';

      const totalTok =
        o.total_input + o.total_output + o.total_cache_read + o.total_cache_write;
      const cacheShare =
        totalTok > 0 ? Math.round((o.total_cache_read / totalTok) * 100) : 0;
      const topModel = models[0];
      const modelStr = topModel
        ? `${topModel.model} ${Math.round((topModel.usd / (o.total_usd || 1)) * 100)}%`
        : '—';
      const topProject = projects[0]
        ? (projects[0].project.split(/[\\/]/).filter(Boolean).pop() ?? projects[0].project)
        : '—';

      // Latency sink: slowest tool among those called at least 3x.
      const slow = [...tools]
        .filter((t) => t.calls >= 3)
        .sort((a, b) => b.avg_latency_ms - a.avg_latency_ms)[0];
      const heavy = tools.slice(0, 3);

      const lines = [
        `Token Meter · ${periodLabel}`,
        `${fmtUsd(o.total_usd)} spent (API-equiv) · ${fmtTok(totalTok)} tokens (${cacheShare}% cache reuse) · ${o.events.toLocaleString()} API calls`,
        `Where: ${modelStr} · project ${topProject}`,
        slow
          ? `Slowest: ${slow.mcp_server ? slow.mcp_server + '/' : ''}${slow.tool_name} ${(slow.avg_latency_ms / 1000).toFixed(1)}s avg (${slow.calls}x)`
          : 'Slowest: — (no tool calls in window)',
      ];
      if (heavy.length > 0) {
        lines.push(
          `Heaviest: ${heavy.map((t) => `${t.tool_name} ${fmtTok(t.total_response_tokens)}`).join(' · ')} (response tokens, est.)`,
        );
      }

      if (insights) {
        const tips: string[] = [];
        if (period === 'today') {
          const wk = overview(db, 7);
          const dailyAvg = wk.total_usd / 7;
          if (dailyAvg > 0) {
            const r = o.total_usd / dailyAvg;
            tips.push(
              `today ${fmtUsd(o.total_usd)} vs 7-day daily avg ${fmtUsd(dailyAvg)} — ${r >= 1.3 ? 'a heavy day' : r <= 0.7 ? 'a light day' : 'about typical'}`,
            );
          }
        }
        if (slow && slow.avg_latency_ms > 10_000) {
          tips.push(
            `${slow.tool_name} averages ${Math.round(slow.avg_latency_ms / 1000)}s — your latency sink; scope or batch these calls`,
          );
        }
        if (cacheShare >= 80) {
          tips.push(
            `cache reuse is ${cacheShare}% of tokens — heavy context replay; on a flat-fee plan this is not billed per token`,
          );
        }
        if (tips.length > 0) {
          lines.push('Insights:');
          for (const t of tips) lines.push(`• ${t}`);
        }
      }

      lines.push(
        'ⓘ API-equivalent estimate, not your vendor invoice · 100% local · this summary computed with 0 LLM calls',
      );
      lines.push(
        'Pro: 30-day history · per-session drill-down · cache-efficiency $ saved · waste signals — token-meter.dev',
      );

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'recent_sessions',
    {
      title: 'recent sessions (Token Meter)',
      description:
        'List recently-active Claude Code / Codex sessions with ready-to-paste resume commands.',
      inputSchema: {
        within_hours: z.number().int().min(1).max(720).default(24),
        limit: z.number().int().min(1).max(50).default(5),
      },
      annotations: {
        title: 'recent sessions (Token Meter)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ within_hours, limit }) => {
      const rows = recentSessions(db, within_hours, limit);
      if (rows.length === 0) {
        // Distinguish a first run (no data at all) from a genuine quiet window.
        if (countTokenEvents(db) === 0) {
          const guide =
            firstRunGuidance ||
            'No Claude Code or Codex usage found yet. Use Claude Code or Codex, ' +
              'then run `token-meter ingest` (or the refresh_data tool).';
          return {
            content: [
              { type: 'text', text: `Token Meter has no usage data yet.\n${guide}` },
            ],
          };
        }
        return {
          content: [
            { type: 'text', text: `No sessions with activity in the last ${within_hours}h.` },
          ],
        };
      }
      const lines = [
        `Recent sessions (last ${within_hours}h) — newest first:`,
        ...rows.map((r) => {
          const tool = r.source === 'claude-code' ? 'claude --resume' : 'codex resume';
          const shortId = r.session_id.slice(0, 8);
          return [
            `• ${ageStr(r.age_minutes)} | ${r.source} | ${fmtUsd(r.total_usd)} | ${r.events} ev`,
            `  session: ${shortId}… (full id for session_tools: ${r.session_id})`,
            `  resume: cd "${r.project}" && ${tool} ${r.session_id}`,
          ].join('\n');
        }),
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'session_tools',
    {
      title: 'session tools (Token Meter)',
      description:
        'Per-session MCP / built-in tool breakdown: call counts, response sizes, average latency. Debug a slow/expensive session.',
      inputSchema: {
        session_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: {
        title: 'session tools (Token Meter)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session_id, limit }) => {
      const summary = sessionToolSummary(db, session_id);
      if (summary.length === 0) {
        return { content: [{ type: 'text', text: `No tool calls recorded for session ${session_id}.` }] };
      }
      const shown = summary.slice(0, limit);
      const lines = [
        `Tools used in session ${session_id} (by response tokens):`,
        ...shown.map((s) => {
          const mcp = s.mcp_server ? `mcp:${s.mcp_server}` : 'built-in';
          return `  ${s.tool_name} (${mcp}) calls=${s.calls} resp=${fmtTok(s.total_response_tokens)} avg=${Math.round(s.avg_latency_ms)}ms`;
        }),
        ...(summary.length > shown.length
          ? [`  …+${summary.length - shown.length} more (raise limit to see all)`]
          : []),
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'refresh_data',
    {
      title: 'refresh data (Token Meter)',
      description:
        'Re-scan local Claude Code / Codex JSONL for new activity. Run before other tools for up-to-the-minute numbers.',
      inputSchema: {},
      // Not read-only: writes newly-discovered token/tool rows into the local
      // SQLite DB. Insert-only (INSERT OR IGNORE, D-027 dedup) so it is
      // non-destructive and idempotent on re-run. Local files only — no vendor APIs.
      annotations: {
        title: 'refresh data (Token Meter)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const r = ingestAll(db);
      return {
        content: [
          {
            type: 'text',
            text: `Refreshed. Claude Code: +${r.claude_code.token_rows_inserted} token rows; Codex: +${r.codex.token_rows_inserted} token rows.`,
          },
        ],
      };
    },
  );

  // Prompts — slash-command entry points that pair 1:1 with the tools above.
  // Clients (Claude Code / Cursor / Claude Desktop) surface these as
  // `/mcp__token-meter__<name>` so users can invoke without typing natural language.
  // Each prompt returns a user-role message that instructs the agent to call the matching tool.

  server.registerPrompt(
    'usage_summary',
    {
      title: 'usage summary (Token Meter)',
      description: 'Summarize Claude Code + Codex usage for today / week / month.',
      argsSchema: {
        period: z.string().optional().describe('today | week | month (default: today)'),
      },
    },
    ({ period }) => {
      const p = period === 'week' || period === 'month' ? period : 'today';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Call the token-meter usage_summary tool with period="${p}" and present the result. Note the cost is an API-equivalent estimate, not vendor invoice.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'recent_sessions',
    {
      title: 'recent sessions (Token Meter)',
      description: 'List recent Claude Code / Codex sessions with ready-to-paste resume commands.',
      argsSchema: {
        within_hours: z.string().optional().describe('hours to look back, 1-720 (default: 24)'),
      },
    },
    ({ within_hours }) => {
      const parsed = within_hours ? parseInt(within_hours, 10) : 24;
      const hours = Number.isFinite(parsed) && parsed >= 1 && parsed <= 720 ? parsed : 24;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Call the token-meter recent_sessions tool with within_hours=${hours}. Show me which sessions I could resume; surface the cd + resume command verbatim for each.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'session_tools',
    {
      title: 'session tools (Token Meter)',
      description: 'Show MCP / built-in tool breakdown for a specific session_id.',
      argsSchema: {
        session_id: z.string().describe('the session_id to inspect'),
        limit: z.string().optional().describe('max tools to list, 1-100 (default: 20)'),
      },
    },
    ({ session_id, limit }) => {
      const parsed = limit ? parseInt(limit, 10) : 20;
      const n = Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 20;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Call the token-meter session_tools tool with session_id="${session_id}" and limit=${n}. Highlight which tools dominated by call count, response size, or average latency.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'refresh_data',
    {
      title: 'refresh data (Token Meter)',
      description: 'Re-scan local JSONL files to pick up new Claude Code / Codex activity.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Call the token-meter refresh_data tool and tell me how many new token rows were ingested for each source.',
          },
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
