# Changelog

All notable changes to Token Meter.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] — 2026-05-15

### Added
- **`token-meter install-mcp <client>`** — one-command MCP registration.
  Supported clients: `claude-code`, `cursor`, `claude-desktop`, `all`.
  Add `--dry-run` to preview without writing.
  - **Claude Code**: shells out to `claude mcp add ...` (auto-detected,
    skipped with a clear message if the `claude` CLI isn't on PATH).
  - **Cursor / Claude Desktop**: read/merge the platform-specific JSON
    config (`~/.cursor/mcp.json`, macOS `~/Library/Application Support/Claude/`,
    Windows `%APPDATA%\Claude\`, Linux `~/.config/Claude/`). Preserves
    any existing `mcpServers` entries; writes a `<path>.bak` backup
    before overwriting an existing file.
  - Idempotent — re-running prints `already-present` instead of writing.
  - `install-mcp.ts` and 7 unit tests covering create / idempotent /
    preserve-others / update-stale / dry-run / invalid-JSON / empty-file.

### Changed
- **MCP setup docs rewritten for self-service**. `docs/mcp-server.md`
  now leads with the one-command installer and falls back to per-client
  copy-paste blocks (Claude Code, Cursor, Claude Desktop, ChatGPT,
  generic stdio) with verification and a troubleshooting section.
- **README "Connect to your AI tool"** points at `install-mcp all` first;
  also keeps the LLM-driven "ask the agent to set it up" prompt and the
  per-client manual table for users who prefer to do it themselves.
- **Landing page** (`token-meter.dev`) `#connect` section: one-command box
  on top, LLM-prompt box second, manual cards below.
- `token-meter setup <key>` now points users at `install-mcp` for the
  MCP-registration step (instead of printing raw commands inline).

### Why
First-time users on Cursor / Claude Desktop / ChatGPT had no concrete
path before — `install-mcp` collapses the four-step manual flow
(locate config → open with the right path per OS → merge JSON →
restart the app) into one command, and gives LLM-driven setup
something deterministic to call.

---

## [0.1.4] — 2026-05-15

### Added
- **`token-meter setup <key>`** — one-shot subcommand bundling
  `activate <key>` + appending `export TOKEN_METER_GATING=1` to the user's
  shell rc (`~/.zshrc` → `~/.bashrc` → `~/.profile`, first existing) +
  printing the MCP-registration commands for Claude Code / Cursor.
  Idempotent: detects existing `TOKEN_METER_GATING` line in the rc and
  skips appending. Windows skips the rc append and tells the user to
  run `setx TOKEN_METER_GATING 1` instead.
- `appendShellRc()` helper in `src/license.ts` (exported, reusable).

### Why
Setup used to be 4 manual commands (install, activate, edit shell rc,
register MCP). `setup` collapses the first three into one, and the
license email template (v0.1.3 worker change) now points at this
command for the LLM-assisted install path.

---

## [0.1.3] — 2026-05-15

### Added
- **License-tier gating scaffold** (`src/license.ts`). Three tiers: `free`,
  `pro`, `pro_plus`. Resolves entitlement from `TOKEN_METER_LICENSE` env or
  `~/.tokenmeter/license.json`. **Disabled by default during the beta** —
  set `TOKEN_METER_GATING=1` to test gating locally.
- Free vs Pro caps:
  - **History**: 7 days (Free) / 30 days (Pro) / unbounded (Pro+).
  - **Smart alert rules**: 1 (Free) / unlimited (Pro+).
  - **Alert action types**: `notify.desktop` (Free) / desktop + webhook +
    email (Pro+).
  - **Session drill-down API** (`/api/sessions*`): Pro+ only (HTTP 402 to
    Free callers).
- CLI emits a one-line warning when `stats <days>` is clamped by the
  active tier.
- **`token-meter activate <key>`** CLI command. Verifies the key against
  the worker API and writes `~/.tokenmeter/license.json` with permission
  `0600`.
- **Remote license verify** in `src/license.ts` (`verifyLicenseRemote`,
  `activateLicense`). Default API base `https://api.token-meter.dev`,
  override via `TOKEN_METER_API_BASE`.
- **7-day offline grace period**: after a successful `activate`, the
  local config keeps the Pro/Pro+ tier active for 7 days without
  re-verification. After that, the tier falls back to Free until the
  user runs `activate` again.
- **`infra/api` worker hardening**:
  - Polar webhook signature verify (HMAC-SHA256, ±5 min replay window
    via `webhook-id` / `webhook-timestamp` / `webhook-signature`
    headers). **Polar diverges from the Standard Webhooks reference**
    in two places (D-032): HMAC key is the **full secret as raw UTF-8
    bytes** (no base64 decode, `polar_whs_` prefix included); event id
    comes from the `webhook-id` HTTP header (not the body). Verified
    e2e on 2026-05-15.
  - License-issuance email shipped through **Resend** (`RESEND_API_KEY`
    + `RESEND_FROM` env). Email contains the key, the `activate`
    command, and the env-var fallback.
- **`docs/billing-setup.md`** — step-by-step runbook for the
  Polar / Cloudflare D1 / Resend / custom-domain wiring, including the
  end-to-end live-test checklist.

### Notes
- Gating is dormant in this release. With `TOKEN_METER_GATING` unset (the
  default), every caller resolves to Pro+ and existing behaviour is
  preserved. The flag flips to default-on once Polar checkout +
  webhook-driven license issuance lands (D-031 γ).

---

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
