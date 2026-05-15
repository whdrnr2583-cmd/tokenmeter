# Token Meter

> One local dashboard for your **Claude Code** and **Codex** token usage.
> Free, MCP-aware, MIT-licensed core.

Token Meter parses the JSONL files that Claude Code and Codex already write to
disk and turns them into a real dashboard: cost per project, per model, per MCP
tool, per hour. Your data never leaves your machine.

## Quick start

```sh
npx @whdrnr2583/token-meter ingest        # scan ~/.claude/projects + ~/.codex/sessions
npx @whdrnr2583/token-meter stats 30      # CLI summary for last 30 days
npx @whdrnr2583/token-meter serve         # http://localhost:8765 dashboard
npx @whdrnr2583/token-meter mcp           # run as an MCP server for Claude Code / Cursor
```

> The package is published under an npm scope (`@whdrnr2583/`) because the
> bare `token-meter` name collides with an existing similar name on npm. The
> CLI binary is still called `token-meter` after install.

### Connect Token Meter to your AI tool (MCP)

One command registers Token Meter with every supported client on your machine:

```sh
npx -y @whdrnr2583/token-meter install-mcp all
```

Handles Claude Code, Cursor, and Claude Desktop — idempotent, backs up existing
config, preserves other MCP servers. Single-client variants:
`install-mcp claude-code | cursor | claude-desktop`. Add `--dry-run` to preview.

> **Or have your LLM do it.** Open Claude Code / Cursor / Claude Desktop and ask:
> *"Read https://raw.githubusercontent.com/whdrnr2583-cmd/tokenmeter/main/docs/mcp-server.md
> and set up token-meter as my MCP server."*

Manual one-liners (if you'd rather not run our installer):

| Client | Command / config |
|---|---|
| **Claude Code** | `claude mcp add token-meter -- npx -y @whdrnr2583/token-meter mcp` then `claude mcp list` to verify |
| **Cursor** | Edit `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`) — see [docs/mcp-server.md](docs/mcp-server.md#cursor) |
| **Claude Desktop** | Edit `claude_desktop_config.json` — see [docs/mcp-server.md](docs/mcp-server.md#claude-desktop) |
| **ChatGPT** | Stdio-only for now; HTTP wrapper recipe in [docs/mcp-server.md](docs/mcp-server.md#chatgpt-custom-connector--apps) |
| **Other (Continue, Zed, custom)** | `npx -y @whdrnr2583/token-meter mcp` over stdio |

Then ask: *"Use token-meter to show my recent sessions"* or *"Use token-meter usage_summary for this week"*.

Full setup + verification + troubleshooting: **[docs/mcp-server.md](docs/mcp-server.md)**.

Storage: `~/.tokenpulse/usage.db` (SQLite). Remove the folder to start over.
The folder name will become `~/.tokenmeter/` in a future release with an
automatic migration; until then the v0.1 directory keeps its original name.

## What you see

- **USD-equivalent cost** per day, model, project. Useful if you're on a Max
  plan and want to know what the API would have cost.
- **MCP and tool breakdown**: which MCP server is eating tokens, how slow each
  tool is on average, response sizes per call.
- **Hourly distribution** of output tokens.
- **Claude Code + Codex side-by-side**, in one view.

### A note on the dollar figures

Costs are **estimates** computed locally from the token counts that Claude
Code and Codex already write to their JSONL files, multiplied by the model's
published per-million-token rate. They are **not** validated against your
actual Anthropic / OpenAI invoice and may diverge for several reasons:

- Vendors change pricing; the table in `src/pricing.ts` is a snapshot
- Subscription plans (Pro / Max) bill a flat fee — the on-screen $ is what
  the API would have cost, not what you pay
- Some token categories (server-side tool use, cache write variants) are
  approximated

Treat the numbers as **relative signal** for spotting waste, not as
billing-grade accounting. Token Meter ships a regression test that the
calculation is reproducible, and an audit script that checks invariants;
neither verifies the rates against vendor invoices.

## Why local-first

- Your JSONL contains source code, prompts, and tool results. Token Meter never
  uploads any of it. Heuristics, regex, and SQL aggregation only.
- No SDK to integrate, no proxy to configure for the free tier.
- The CLI and dashboard core are **MIT licensed**.

## Pricing

| Tier | Price | What you get |
|---|---|---|
| **Free** | $0 | Multi-vendor parsing, MCP breakdown, 30-day history, hourly/model/project breakdown |
| **Pro** | **$5/mo** | Unlimited history, weekly recommendations, anonymous benchmark comparison, auto-trim rule suggestions |
| Pro+ | _later_ | Local LLM proxy (Ollama / LM Studio / llama.cpp / vLLM), GPU/VRAM tracking, auto actions |

Pro+ ships once Pro sign-ups + community demand confirm the segment.

## Roadmap

- **M1** ✅ Claude Code parsing, MCP/tool breakdown, hourly stats
- **M2** ✅ Codex integration
- **M3** Pro tier ($5), Polar.sh billing, license activation
- **M4+** Pro+ (local LLM proxy, GPU tracking), conditional on demand

## Privacy & security

- Tokens are counted from the JSONL files Claude Code and Codex already write.
  Token Meter does not touch network APIs of either vendor.
- No prompt or response bodies are stored by default — only metadata
  (timestamps, token counts, tool names, response lengths).
- The database lives under `~/.tokenpulse/`; delete it to wipe. (Renamed to
  `~/.tokenmeter/` in a future release with an automatic migration.)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and breaking changes.

## License

MIT for the CLI, dashboard, and parsers. Pro-tier features ship in a separate
package under a closed source license.
