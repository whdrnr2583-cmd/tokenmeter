import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { migrate, openDb } from './db.js';
import { ingestAll } from './ingest.js';
import { byMcp, byModel, byProject, overview } from './stats.js';
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

  server.registerTool(
    'usage_summary',
    {
      title: 'Token Meter — usage summary',
      description:
        'API-equivalent spend + token summary for Claude Code and Codex, by model/project/tool. Local data only.',
      inputSchema: { period: z.enum(['today', 'week', 'month']).default('today') },
      annotations: {
        title: 'Token Meter — usage summary',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ period }) => {
      const days = periodDays(period);
      const o = overview(db, days);
      const models = byModel(db, days).slice(0, 5);
      const projects = byProject(db, days, 5);
      const mcps = byMcp(db, days, 5);
      const lines = [
        `Token Meter — last ${period === 'today' ? '24h' : period === 'week' ? '7d' : '30d'}`,
        `cost ${fmtUsd(o.total_usd)} (API-equiv) | events ${o.events.toLocaleString()} | output ${fmtTok(o.total_output)} | cache-read ${fmtTok(o.total_cache_read)}`,
        'By model:',
        ...models.map((m) => `  ${m.model} ${fmtUsd(m.usd)} (${m.events} ev)`),
        'Top projects:',
        ...projects.map((p) => {
          const name = p.project.length > 50 ? '…' + p.project.slice(-50) : p.project;
          return `  ${name} ${fmtUsd(p.usd)}`;
        }),
        'Top MCP / tools (by response tokens):',
        ...(mcps.length > 0
          ? mcps.map((m) => {
              const where = m.mcp_server ? `mcp:${m.mcp_server}` : 'built-in';
              return `  ${where} ${m.tool_name} calls=${m.calls} resp=${fmtTok(m.total_response_tokens)} avg=${Math.round(m.avg_latency_ms)}ms`;
            })
          : ['  (none in window)']),
        'Note: API-equivalent cost; on a Max/Pro flat plan you pay your subscription, not this.',
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'recent_sessions',
    {
      title: 'Token Meter — recent sessions',
      description:
        'List recently-active Claude Code / Codex sessions with ready-to-paste resume commands.',
      inputSchema: {
        within_hours: z.number().int().min(1).max(720).default(24),
        limit: z.number().int().min(1).max(50).default(15),
      },
      annotations: {
        title: 'Token Meter — recent sessions',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
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
        ...rows.map((r) => {
          const tool = r.source === 'claude-code' ? 'claude --resume' : 'codex resume';
          return [
            `• ${ageStr(r.age_minutes)} | ${r.source} | ${fmtUsd(r.total_usd)} | ${r.events} ev`,
            `  session: ${r.session_id}`,
            `  resume: cd "${r.project}" && ${tool}`,
          ].join('\n');
        }),
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'session_tools',
    {
      title: 'Token Meter — session tools',
      description:
        'Per-session MCP / built-in tool breakdown: call counts, response sizes, average latency. Debug a slow/expensive session.',
      inputSchema: {
        session_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: {
        title: 'Token Meter — session tools',
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
      title: 'Token Meter — refresh data',
      description:
        'Re-scan local Claude Code / Codex JSONL for new activity. Run before other tools for up-to-the-minute numbers.',
      inputSchema: {},
      // Not read-only: writes newly-discovered token/tool rows into the local
      // SQLite DB. Insert-only (INSERT OR IGNORE, D-027 dedup) so it is
      // non-destructive and idempotent on re-run. Local files only — no vendor APIs.
      annotations: {
        title: 'Token Meter — refresh data',
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
      title: 'Token Meter — usage summary',
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
      title: 'Token Meter — recent sessions',
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
      title: 'Token Meter — session tools',
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
      title: 'Token Meter — refresh data',
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
