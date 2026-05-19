# Changelog

All notable changes to Token Meter.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.15] — 2026-05-19

### Added
- **First-run guard.** A brand-new install has an empty database, so
  `stats`, the MCP tools and the dashboard would show a wall of zeros with
  no explanation. `ensureFirstRunData()` auto-ingests once on first run; if
  no Claude Code / Codex logs exist anywhere it returns plain-text guidance
  instead, and the dashboard shows an empty-state banner.
- **`usage_summary` `insights` option** — `insights=true` appends up to
  three concise heuristic tips (today vs the 7-day daily average, the
  latency-sink tool, a cache-reuse note), computed server-side with no LLM
  call. Off by default.

### Changed
- **`usage_summary` is answer-shaped.** It leads with what you spent, the
  token volume (with cache-reuse share), where it went and the slowest
  tool — instead of per-model / per-project / per-tool lists. A Pro line
  surfaces the existing Pro features.
- **CLI `stats` is more compact** — the overview block and cache-waste list
  are now border-free aligned tables (fewer lines / tokens), with a
  one-line footer noting the report is formatted lean on purpose.
- **The MCP server reports its real version** (read from `package.json`)
  instead of a hardcoded `0.1.0`.

### Fixed
- **Codex usage on the Windows side was missed under WSL.** Codex ingest
  scanned only `~/.codex/sessions`; it now also scans the Windows-side
  `/mnt/c/Users/*/.codex/sessions`.
- **Windows-profile detection was unreliable.** The WSL dual-environment
  scan guessed the Windows username, but `USERPROFILE` is often unset under
  WSL and the first `/mnt/c/Users` entry can be a sandbox/system account
  (e.g. `CodexSandboxOffline`). It now scans every profile and uses the
  directories that actually exist.
- **The MCP server lost its every-startup incremental ingest** while the
  first-run guard was wired in — restored, so `usage_summary` reflects
  current data rather than the last manual refresh.

---

## [0.1.14] — 2026-05-19

### Added
- **WSL dual-environment scan** — running inside WSL, Token Meter now also
  scans the Windows-side Claude Code logs, so sessions from a Windows
  install are not silently skipped. (Profile detection refined in 0.1.15.)

### Changed
- Six UX quick-win fixes plus landing-page corrections (stale label, copy).

---

## [0.1.13] — 2026-05-19

### Fixed
- **`usage_summary` "today" now means the local calendar day**, not a
  rolling 24-hour window. Asking an agent for "today's usage" used to
  return the last 24 h — which folds in part of yesterday (e.g. $294
  reported when the calendar day's actual total was $73); it now covers
  local midnight → now, matching the per-day rows in the CLI breakdown.
  `week` / `month` stay rolling and are labelled `last 7d` / `last 30d`
  so the distinction is explicit.

---

## [0.1.12] — 2026-05-19

### Fixed
- **Project paths on WSL / Linux / macOS were mangled with Windows-style
  backslashes.** Ingest decoded Claude Code's project-directory name by
  replacing every `-` with `\`, which assumes a Windows path — so a WSL
  session at `/mnt/c/Users/you/app` was stored and shown as
  `\mnt\c\Users\you\app`. That broke the `recent_sessions` resume command
  (`cd "\mnt\c\..."` is not a valid target in a POSIX shell) for every
  non-Windows user. The Claude Code parser now reads the real working
  directory from the JSONL `cwd` field; the directory-name decode is kept
  only as a fallback and is now path-style-aware (POSIX → `/`,
  Windows → `\`).
- **Existing rows migrate on next run.** `migrate()` normalizes
  already-stored `claude-code` project paths that start with a backslash
  and contain no drive-letter colon (mangled POSIX paths) back to `/`.
  Idempotent; real Windows paths (`C:\...`) are untouched.

### Note
No new dependency, no schema change. Open the dashboard / MCP server (or
run `ingest`) once on 0.1.12 to apply the migration.

---

## [0.1.11] — 2026-05-19

### Added
- **MCP server `instructions`** — the server now ships a short capability
  overview (what Token Meter is, what each of the four tools is for, that a
  CLI and dashboard also exist). Surfaced to the client at connect, so an
  agent can answer "what can Token Meter do?" accurately without a tool call.

### Changed
- **`/token-meter` slash command slimmed** — the installed command file
  (`~/.claude/commands/token-meter.md`) dropped its verbose step list and the
  multi-line "other commands" block, keeping the `usage_summary` call and a
  one-line Pro hint. Roughly halves the prompt the command injects on every
  `/token-meter` invocation. `allowed-tools` is narrowed to the one tool the
  command actually calls.
- **`usage_summary` MCP output micro-trim** — built-in tools no longer carry a
  repeated `built-in` label (MCP tools keep a `server/` prefix) and the
  trailing note is shorter. Same information, fewer tokens.

### Fixed
- **`$5` in the slash-command file was silently eaten.** Claude Code treats
  `$` + digit in a `~/.claude/commands/*.md` file as a positional argument, so
  the Pro hint `Pro $5/월` rendered as `Pro /월` when `/token-meter` ran with
  no args. The price is now written without a `$`-digit sequence (`월 5달러`),
  and a test guards against the pattern returning.

### Note
Re-run `npx -y @whdrnr2583/token-meter install-command claude-code` to pick up
the slimmed `/token-meter` command (the installer updates the managed file and
backs up the old one).

---

## [0.1.10] — 2026-05-18

### Added
- **Cache efficiency (Pro)** — `stats` now reports cache hit ratio
  (cache reads ÷ read-side tokens), gross USD saved by cache reads (each
  cache-read token billed at the cache rate instead of the input rate),
  USD spent creating caches, and the net. LLM-free — pure aggregation
  over `token_events` plus the pricing table.
- **Waste signals (Pro)** — heuristic flags worth a look, not verdicts:
  tools (≥3 calls) whose largest response dwarfs their average
  (max > 5× avg and > 10k tokens — oversized context dumps), and days
  that wrote more cache than they read back. LLM-free.
- `stats.cacheStats()` / `stats.wasteSignals()` + 5 unit tests.

### Changed
- **Tier gating is now enabled by default.** With no license every
  caller resolves to Free; an activated Pro / Pro+ license upgrades the
  tier. `TOKEN_METER_GATING=0` (or `false`) is now a developer escape
  hatch that forces gating off (resolves to Pro+). Previously gating was
  dormant and every caller saw Pro+ — the Polar checkout + webhook →
  license issuance path is live, so the beta default has been flipped.
- **`stats` output is column-aligned and more compact** — header and
  rows are built from shared fixed widths, USD shows 2 decimals (was 4),
  the overview header names the active tier (`Last 7 days · Free tier`),
  and the per-model / per-project rows dropped redundant `out=` /
  `events=` inline labels now that there are headers.
- Cache efficiency + waste signals are Pro-gated in `stats`; Free callers
  see a one-line pointer instead.

### Removed
- **Custom pricing matrix** and **anonymous usage benchmark** dropped
  from the Pro scope after a structured design review (`/4haiku`): the
  pricing matrix does not fit the individual-builder ICP (who uses list
  prices), and the benchmark cannot work with a near-zero user base
  (cold-start) and conflicts with the local-first trust story.

### Fixed
- **Pro / landing / slash-command copy now matches what is built.** The
  pricing card, README table, `/token-meter` slash command, and
  `docs/pro-features.md` advertised features that were never implemented
  (cost forecast, CSV/JSON export, weekly recommendations, benchmark,
  auto-trim, custom pricing). Pro now lists only what ships today; cost
  forecast and CSV/JSON export are labelled planned.
- `cli.ts` tier label no longer collapses Pro+ into "Pro" via a new
  `tierLabel()` helper (latent — the clamp path that used it was
  unreachable for Pro+, but the helper is now correct for all tiers).

---

## [0.1.9] — 2026-05-16

### Changed
- **MCP tool annotations** — all four MCP tools (`usage_summary`,
  `recent_sessions`, `session_tools`, `refresh_data`) now register via
  `registerTool` with explicit `annotations` (`readOnlyHint`,
  `destructiveHint`, `idempotentHint`, `openWorldHint`) and a `title`.
  The three query tools are `readOnlyHint: true`; `refresh_data` is
  `readOnlyHint: false` (it writes newly-discovered rows) but
  `destructiveHint: false` + `idempotentHint: true` since it is
  insert-only (`INSERT OR IGNORE`, D-027 dedup) and never touches vendor
  APIs (`openWorldHint: false`). This lets MCP clients show accurate
  safety labels and skip needless confirmations for read-only calls.
- **Token-efficient MCP output** — tool responses are now compact:
  removed padding/blank-line scaffolding, collapsed multi-line rows into
  single lines, and shortened the standing notes. Same information,
  fewer tokens per call — so an LLM querying Token Meter spends less of
  its own context window on the result. `session_tools` also gained a
  `limit` param (default 20) with a `…+N more` overflow hint so a
  session with many tools no longer returns an unbounded wall of text.

### Why
H3 (annotations) makes Token Meter a well-behaved MCP citizen — clients
can present read-only tools without scary confirmation prompts. H2
(output audit) keeps the tool useful inside an agent loop: a verbose
tool response is a hidden tax on the caller's token budget, which is
exactly the cost Token Meter exists to surface. No behavior change to
parsing, pricing, or the dashboard.

---

## [0.1.8] — 2026-05-15

### Changed
- **GitHub repository renamed** `whdrnr2583-cmd/tokenmeter` →
  `whdrnr2583-cmd/token-meter` for naming consistency with the npm
  package (`@whdrnr2583/token-meter`) and the domain
  (`token-meter.dev`). GitHub auto-redirects the old URL, so existing
  links keep working; all in-repo references and the embedded raw URLs
  used by the "ask your LLM to set it up" path have been updated to the
  new URL.
- README now includes a one-line lookup row near the top:
  npm · GitHub · site links in canonical form, so anyone copy-pasting
  from the npm page can find the repo without guessing.

### Why
A reader reported the GitHub URL guessed from the npm scope
(`whdrnr2583/token-meter`) returns 404 — the actual owner is
`whdrnr2583-cmd` and the repo was `tokenmeter` (no hyphen). Trust
hit at the discovery step. Fix is a one-time rename plus an explicit
lookup row; no behavior change. D-035.

---

## [0.1.7] — 2026-05-15

### Added
- **`/token-meter` slash command for Claude Code**. Run
  `npx -y @whdrnr2583/token-meter install-command claude-code` to install
  a short markdown file at `~/.claude/commands/token-meter.md`; after a
  Claude Code restart, typing `/token-meter` triggers a single summary
  view that calls the `usage_summary` MCP tool and appends a one-block
  hint about the other slash commands, the CLI, and the Pro tier.

  This is in addition to the existing MCP prompts. MCP clients always
  prefix prompts as `/mcp__token-meter__<name>` (spec-mandated); the new
  custom slash command is the way to get a short `/token-meter` entry
  point. Currently `install-command claude-code` is the only supported
  client — Cursor / Claude Desktop use different slash-command systems
  and are out of scope for this release.

  Idempotent (re-run is `already-present`). Backs up an existing managed
  file to `<path>.bak` before overwriting. Refuses to overwrite an
  unmanaged file (no `@whdrnr2583/token-meter` marker) and exits 1.

### Changed
- **`usage_summary` MCP tool now includes an MCP / tools breakdown**
  (top 5 by response tokens) so the new `/token-meter` slash command can
  show "today + MCP / tools" in a single call. Existing callers see one
  extra section appended to the same text response; the tool signature
  is unchanged.

### Why
Follow-up to v0.1.6 dogfood UX work (D-033). MCP-prefixed slash commands
work but are visually long; the new custom slash command is the short
`/token-meter` entry point that surfaces today's usage plus a small,
honest hint about the Pro tier. Still a dogfood UX bet (D-034), not a
direct payment trigger.

---

## [0.1.6] — 2026-05-15

### Added
- **MCP prompts (slash commands)** — the four read-only tools are now also
  exposed as prompts, so clients that surface MCP prompts (Claude Code,
  Cursor, Claude Desktop) show them as slash commands:
  - `/mcp__token-meter__usage_summary` (arg: `period` = `today` | `week` |
    `month`, default `today`)
  - `/mcp__token-meter__recent_sessions` (arg: `within_hours` = 1-720,
    default 24)
  - `/mcp__token-meter__session_tools` (arg: `session_id`, required)
  - `/mcp__token-meter__refresh_data` (no args)

  Each prompt returns a one-line user-role message that asks the agent to
  call the matching tool. Natural-language invocation ("show me my usage
  this week") still works exactly as before — the prompts are an additive
  shortcut for users who prefer typing `/`.

### Why
Dogfood UX shortcut, not a feature-value bet. The four tools were already
reachable by asking the agent in natural language; adding prompts is a ~50
LOC additive change that lets the author and other slash-command-leaning
users skip the typing. Marketing weight and pricing position are
unchanged.

---

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
