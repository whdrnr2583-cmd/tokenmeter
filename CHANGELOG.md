# Changelog

All notable changes to Token Meter.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-05-14

### Fixed
- **`token-meter serve` subcommand was missing from the CLI**, even though the
  README and v0.1.0 changelog promised a dashboard at `http://localhost:8765`.
  The dashboard module existed (`src/server.ts`) but was only reachable via
  `npm run serve` from a checkout — npx / global-install users hit
  `Usage: ...` and exit 1. Now `token-meter serve` works end-to-end.

### Added
- `token-meter --version` / `-v` prints the installed version.
- `token-meter --help` / `-h` / `help` prints usage and exits 0
  (previously any unknown argument was treated as an error).

## [0.1.1] — 2026-05-13

### Added
- `mcpName: io.github.whdrnr2583-cmd/token-meter` in `package.json` so the
  package can be registered on the official MCP Registry
  (https://registry.modelcontextprotocol.io). No runtime behavior change.

## [0.1.0] — 2026-05-13

First public release.

### Added

**Core**
- Local-first CLI + dashboard for Claude Code and Codex token usage.
- JSONL parsers for `~/.claude/projects/**/*.jsonl` (Claude Code) and
  `~/.codex/sessions/**/*.jsonl` (Codex).
- SQLite storage at `~/.tokenpulse/usage.db` (legacy folder name carried
  through v0.1; renamed to `~/.tokenmeter/` with auto-migration in a future
  release) with WAL mode and incremental ingest (mtime + size).
- Dashboard at `http://localhost:8765` with day / model / project / source
  breakdowns, hourly distribution, and Chart.js visualizations.

**MCP server (`token-meter mcp`)**
- `usage_summary` — spend + token summary per period (today / week / month).
- `recent_sessions` — sessions with activity in the last N hours, with
  ready-to-paste `claude --resume` / `codex resume` commands. Useful when a
  terminal was closed by accident.
- `session_tools` — per-session breakdown of MCP / built-in tool calls,
  response sizes, and average latency.
- `refresh_data` — re-scan source JSONL files on demand.

**MCP / tool breakdown**
- Per-MCP-server and per-tool grouping (`mcp__<server>__<tool>` pattern).
- Latency, response size (chars + estimated tokens), and call count.

**Session drill-down**
- Top sessions by USD cost in the selected window.
- Per-message breakdown (input / output / cache read / cache write / USD).
- Per-session tool breakdown.

**Smart alerts (rules engine)**
- Threshold rules on daily / weekly / monthly USD, daily output tokens, or
  daily cache write tokens.
- Built-in actions: desktop notification, webhook POST, email (Pro, wired in
  M3), weekly digest (planned).
- Per-rule cooldown (24h default) and dry-run preview against historical data.
- Pending desktop notifications surfaced via the dashboard's browser
  `Notification` API.

**Pricing & cost estimates**
- USD-equivalent calculation for Anthropic (Opus 4.x / Sonnet 4.x / Haiku 4.x)
  and OpenAI (GPT-5 / GPT-5-Codex / GPT-5-mini / GPT-4o / GPT-4o-mini).
- Treated as **estimates**; not validated against vendor invoices. Disclaimer
  surfaced on the dashboard and README.

**Quality / safety**
- 14 unit tests (parser dedup, pricing reproducibility, XSS escape regression).
- 8-section data invariant audit script (`npm run audit`): USD conservation
  across views, dedup uniqueness, pricing reproducibility, temporal sanity,
  tool integrity, source-specific checks, rules engine, ingest state.
- CI matrix: typecheck (Ubuntu) + test (Ubuntu / macOS / Windows) + build +
  MCP smoke against built `dist/`.
- HTML escape (`esc()`) applied to all user-controlled string interpolations
  in the dashboard.

### Fixed
- **Critical**: deduplicate per-`request_id` token events. Claude Code splits
  a single API response into multiple JSONL entries (e.g. one `thinking`
  block + one `text` block) that all carry the same final `usage`. Before the
  fix, this triple-counted. Cost figures on the user's local data dropped
  ~60% to match the actual per-call billing.

### Security
- Dashboard server binds to `127.0.0.1` only.
- All SQL queries use parameter binding.
- Webhook actions: 5-second timeout per fire; no retry. **Webhook URL is
  user-supplied — see `docs/customization.md` for the SSRF caveat.**

### Notes
- Pro / Pro+ feature gating is currently inactive; all features are open
  during the free beta. License-gated tiers activate with the M3 paid launch.
- Pro+ (local LLM proxy, GPU tracking, behavior-changing automations) is on
  the M4+ conditional roadmap, not in this release.
