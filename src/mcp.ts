import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { migrate, openDb } from './db.js';
import { ingestAll } from './ingest.js';
import { byModel, byProject, overview } from './stats.js';
import { recentSessions, sessionToolSummary } from './sessions.js';

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
function periodDays(p: 'today' | 'week' | 'month'): number {
  return p === 'today' ? 1 : p === 'week' ? 7 : 30;
}

export async function startMcpServer(): Promise<void> {
  const db = openDb();
  migrate(db);
  // Fresh data at startup; cheap (incremental).
  try {
    ingestAll(db);
  } catch {
    /* non-fatal */
  }

  const server = new McpServer({
    name: 'token-meter',
    version: '0.1.0',
  });

  server.tool(
    'usage_summary',
    'Quick spend + token summary for Claude Code and Codex over a period. Reads local Token Meter data; never touches vendor APIs.',
    { period: z.enum(['today', 'week', 'month']).default('today') },
    async ({ period }) => {
      const days = periodDays(period);
      const o = overview(db, days);
      const models = byModel(db, days).slice(0, 5);
      const projects = byProject(db, days, 5);
      const lines = [
        `Token Meter — last ${period === 'today' ? '24h' : period === 'week' ? '7d' : '30d'}`,
        `Estimated API-equivalent cost: ${fmtUsd(o.total_usd)}`,
        `Events: ${o.events.toLocaleString()} | output ${fmtTok(o.total_output)} | cache read ${fmtTok(o.total_cache_read)}`,
        '',
        'By model:',
        ...models.map((m) => `  ${m.model.padEnd(24)} ${fmtUsd(m.usd).padStart(10)}  (${m.events} events)`),
        '',
        'Top projects:',
        ...projects.map((p) => {
          const name = p.project.length > 50 ? '…' + p.project.slice(-50) : p.project;
          return `  ${name}  ${fmtUsd(p.usd)}`;
        }),
        '',
        'Note: cost is API-equivalent; if you are on a Max/Pro flat plan you pay your subscription, not this.',
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'recent_sessions',
    'List Claude Code / Codex sessions with activity in the recent window — useful when you accidentally closed a terminal and want to resume. To resume: cd into the project dir and run `claude --resume` (or `codex resume`).',
    {
      within_hours: z.number().int().min(1).max(720).default(24),
      limit: z.number().int().min(1).max(50).default(15),
    },
    async ({ within_hours, limit }) => {
      const rows = recentSessions(db, within_hours, limit);
      if (rows.length === 0) {
        return {
          content: [
            { type: 'text', text: `No sessions with activity in the last ${within_hours}h.` },
          ],
        };
      }
      const lines = [
        `Recent sessions (last ${within_hours}h) — newest first:`,
        '',
        ...rows.map((r) => {
          const tool = r.source === 'claude-code' ? 'claude --resume' : 'codex resume';
          return [
            `• ${ageStr(r.age_minutes)} — ${r.source} — ${fmtUsd(r.total_usd)} — ${r.events} events`,
            `  project: ${r.project}`,
            `  session: ${r.session_id}`,
            `  resume:  cd "${r.project}" && ${tool}`,
          ].join('\n');
        }),
      ];
      return { content: [{ type: 'text', text: lines.join('\n\n') }] };
    },
  );

  server.tool(
    'session_tools',
    'Show which MCP servers / built-in tools a given session used, with call counts, response sizes, and average latency. Helps debug "why was this session expensive/slow".',
    { session_id: z.string().min(1) },
    async ({ session_id }) => {
      const summary = sessionToolSummary(db, session_id);
      if (summary.length === 0) {
        return { content: [{ type: 'text', text: `No tool calls recorded for session ${session_id}.` }] };
      }
      const lines = [
        `Tools used in session ${session_id}:`,
        '',
        ...summary.map((s) => {
          const mcp = s.mcp_server ? `mcp:${s.mcp_server}` : 'built-in';
          return `  ${s.tool_name.padEnd(40)} ${mcp.padEnd(16)} calls=${String(s.calls).padStart(4)}  resp=${fmtTok(s.total_response_tokens).padStart(8)}  avg_latency=${Math.round(s.avg_latency_ms)}ms`;
        }),
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'refresh_data',
    'Re-scan ~/.claude/projects and ~/.codex/sessions to pick up new activity. Run this before other tools if you need up-to-the-minute numbers.',
    {},
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
