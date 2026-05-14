# Pro+ features — Token Meter

> **Status (2026-05-14)**: Pro+ is a **deferred tier**. None of the
> features below are implemented. The original gate (Pro 100 active +
> 30 local-LLM requests + Ollama proxy PoC, D-020) was relaxed by
> [D-031](../05-decisions.md) which removes the PMF-counting condition
> but **keeps the technical complexity gate**. Pro+ ships when the user
> decides the proxy / GPU work is worth the time investment, not before.

## Pro vs Pro+ — one-line difference

| | Pro ($5/month) | **Pro+ ($24/month)** |
|---|---|---|
| Sources (cloud) | Claude Code + Codex | same |
| Sources (local LLM) | ❌ | **Ollama / LM Studio / llama.cpp / vLLM** (proxy mode) |
| History window | 30 days | **unlimited** |
| TPS measurement | average (estimated from logs) | **TTFT / ITL millisecond-accurate** (proxy intercept) |
| GPU / VRAM tracking | ❌ | ✅ |
| Behavior-changing automations | ❌ (suggestions only) | ✅ (MCP auto-trim, model auto-switch) |
| Multi-machine sync | ❌ | ✅ |
| PDF auto-report | ❌ | ✅ (weekly + on-demand) |
| Cloud ↔ local cost translation | ❌ | ✅ ("this MCP cost = $X on cloud / N hours on your 4090") |
| Model benchmark lab | ❌ | ✅ (controlled comparison runs) |
| Weekly recommendation report | shared text | richer + per-machine |

Pricing rationale: Pro+ targets users running a $1k+ GPU who'd pay 0.3-2.4% of their hardware cost monthly for full observability. The $24 anchor is "Cursor Pro $20 + a bit" — psychologically defensible for hybrid cloud+local power users. See [STRATEGY.md](../STRATEGY.md) and [05-decisions.md D-016/D-017](../05-decisions.md) (rejected) → [D-020](../05-decisions.md) (relaxed to "deferred until justified").

---

## Pro+ feature specs

### 1. Local LLM proxy mode (Ollama / LM Studio / llama.cpp / vLLM)

**Status**: ❌ deferred. The single largest engineering item in Pro+.

A user runs Ollama (or LM Studio / llama.cpp server / vLLM) locally. Their AI tool — say a Cursor extension or a script — calls `http://localhost:11434/v1/chat/completions`. Today Token Meter sees nothing about that traffic.

Pro+ adds a **transparent HTTP proxy** that:
1. Listens on a Token Meter-controlled port (default 11435, configurable).
2. Forwards every request to the real Ollama endpoint.
3. **Captures the SSE stream** end-to-end — first-byte timestamp, every token's arrival timestamp, total duration, prompt tokens, completion tokens, model name, OpenAI-compatible parameters.
4. Writes a `local_token_events` row per request that joins the existing dashboard with the same shape as cloud events.

Why proxy and not log scraping: log files for Ollama / llama.cpp don't carry millisecond timestamps for each token. The proxy is the **only way** to measure TTFT and ITL accurately. That accuracy is the entire Pro+ value prop for performance-conscious users.

**Coverage matrix**:
| Backend | Activation | TTFT | ITL | Token count | Cost equiv |
|---|---|---|---|---|---|
| Ollama (OpenAI-compat /v1 endpoint) | proxy 11435 | ✅ | ✅ | ✅ | ✅ via GPU-hour rate |
| LM Studio (OpenAI-compat server) | proxy 11435 | ✅ | ✅ | ✅ | ✅ |
| llama.cpp `--server` mode | proxy 11435 | ✅ | ✅ | ✅ | ✅ |
| vLLM | proxy + Prometheus scrape | ✅ | ✅ | ✅ | ✅ + queue depth |

Single proxy adapter for all four (they all speak OpenAI-compatible). vLLM gets a bonus Prometheus scrape for queue/batching metrics.

**Implementation sketch** (~12-15h):
- `src/proxy.ts` — HTTP proxy with SSE pass-through and timing capture. Critical: must not buffer the stream (would defeat the purpose of streaming). Capture timestamps as bytes flow.
- `src/local-events.ts` — adapter that turns proxy capture into rows joining `token_events`.
- New columns in `token_events`: `source = 'ollama' | 'lm-studio' | 'llamacpp' | 'vllm'`, `backend_endpoint`, `ttft_ms`, `itl_p50_ms`, `itl_p95_ms`.
- CLI: `token-meter proxy <port> --upstream <url>` + config file for multiple backends.
- Setup wizard for each backend (config file paths, common ports, "is your tool calling this proxy?").

**Setup friction**: high. The user has to point their tool at our proxy port. We mitigate with:
- Optional `--auto-detect` that scans common ports (11434, 1234, 8000, 8080) and offers a one-command rewrite of their `~/.config/X` files (with a backup and a clear undo).
- Honest README about which integrations need manual setup.

**Pro vs Pro+ on the same axis**: Pro shows average TPS estimated from cloud log timestamps (already shipped). Pro+ shows TTFT / ITL p50/p95/p99 from direct stream capture. Pro's number is labelled "estimate"; Pro+'s is the source of truth.

---

### 2. GPU / VRAM tracking

**Status**: ❌ deferred. Per-OS adapters.

When a local-LLM request is in flight, sample GPU + VRAM:
- **NVIDIA**: `nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv` every N seconds, or the NVML library if available.
- **Apple Silicon**: `powermetrics` for GPU power + `vm_stat` plus the Metal performance counters available via `ioreg`.
- **AMD**: `rocm-smi` (Linux only, deferred behind the NVIDIA path).

Time-align with the proxy capture from §1. Result: each `local_token_events` row joins to a `gpu_samples` rollup so the dashboard can answer "this prompt used the GPU at 87% for 4.2s, peak VRAM 14.3GB".

Why Pro+ only: the OS-specific code is substantial. Free + Pro stay 100% portable (just JSONL parsing + SQLite); GPU sampling adds OS-specific dependencies that we don't want in the free tier.

**Implementation sketch** (~8-10h, dominated by per-OS testing):
- `src/gpu/nvidia.ts`, `src/gpu/apple.ts`, `src/gpu/amd.ts` — one adapter each, all behind a single `sampleGpu(intervalMs)` interface.
- Sampling thread runs only while a proxy request is in flight (idle is wasted samples + IO).
- Dashboard panel: "GPU/VRAM during run" small-multiples chart.

**OS priority order** (TBD-4 → resolved): NVIDIA first (largest pool), Apple Silicon second (popular for local LLM dev), AMD third.

---

### 3. Unlimited history

**Status**: ✅ schema already keeps everything. Gating change only.

- Free: 7 days, Pro: 30 days, Pro+: unbounded. No archive / cold-storage step — local SQLite handles years of single-user data without effort (~1GB per year of heavy use).
- Dashboard period selector exposes "all time" + custom ranges.
- Export (Pro $5 feature §5) automatically expands its cap when the license is Pro+.

**Implementation**: remove the entitlement clamp at the query layer (one line per route).

---

### 4. Behavior-changing automations

**Status**: ❌ deferred. Built on top of the Pro $5 "suggestions" feature.

What Pro $5 only suggests, Pro+ can execute (with explicit user opt-in per rule):

**`action.mcp.trim`**: when a rule fires (e.g. "MCP `notion.search_pages` returned >5kB on >50 calls this week"), Token Meter writes a patched MCP server config that adds a `fields` whitelist. The user reviews a diff before the patch is applied. Backup file always created. One-click rollback.

**`action.model.switch`**: when a rule fires (e.g. "Opus 4.7 used >$50 in 24h on tasks that succeeded with Sonnet 4.6 last month"), Token Meter offers to set a project-level model override (Claude Code supports per-project `~/.claude.json`).

**`action.local.route`**: when a rule fires (e.g. "GPT-5 on prompt class X averaged $0.30/req when Ollama llama3.1 succeeded on the same class for $0.01-equivalent"), Token Meter offers to add a per-pattern route in the user's tool config to send those prompts to the local proxy from §1.

**Why Pro+ only (D-007 [[D-007]])**: every one of these touches the user's config files. "Token Meter broke my MCP server" or "Token Meter quietly switched my model" claims are real support load. $5 unit economics can't absorb that; $24 + a slower, more careful Pro+ user base can.

**Safety guarantees**:
- All automations: **default OFF**, opt-in per rule, dry-run preview mandatory before first activation.
- All automations: **always create a backup** of the target file before patching.
- All automations: **rollback command** (`token-meter rollback <action_id>`) restores the backup.
- All automations: **audit log** of every patch in `automation_log` table — what fired, what changed, when, rollback path.
- Cooldown per automation: 24h minimum (no rapid flapping).
- Never patch outside the well-known config locations the user opted in to.

**Implementation sketch** (~10-12h for the three named automations + safety harness).

---

### 5. Multi-machine sync (opt-in)

**Status**: ❌ deferred. Cloudflare Workers + R2 ([D-023](../05-decisions.md)).

Pro+ user has a desktop + laptop + remote dev box. They want a single Token Meter dashboard that merges all three.

Architecture:
- Each machine still keeps its full local SQLite (offline-first, [D-005](../05-decisions.md)).
- Sync daemon (`token-meter sync`) batches local-only events nightly and ships them to a CF Worker (`/v1/sync/upload`), which writes to R2 keyed by `user_id/machine_id/YYYY-MM-DD.jsonl.zst`.
- A second worker route (`/v1/sync/fetch`) returns the merged event stream for any combination of machines.
- The local dashboard renders the union when sync is configured.

**Privacy**:
- Worker auth = per-user license key only. No user accounts beyond the Polar email.
- Events encrypted client-side with a key derived from the license + a user-chosen passphrase. Worker stores ciphertext.
- Worker logs request metadata only — IP not retained beyond 24h.

**Cost**:
- CF Workers + R2 = ~$0.05/user/month even at heavy use. Folds into the $24 margin comfortably.
- Throttle: 10K events/day/user soft cap (above this we ask the user to investigate why their volume is so high — usually a runaway script).

**Why Pro+**: only users who actually run multiple machines need this, and they correlate strongly with the "$1k GPU + multi-tool" power user persona.

**Implementation sketch** (~10-12h split between client daemon and worker routes).

---

### 6. Cloud ↔ local cost translation

**Status**: ❌ deferred.

A panel that for each cloud event computes "if you'd routed this to your local Ollama llama3.1 70B, the cost would have been $X (rate $/GPU-hour × estimated time on your GPU)". Inverted version: "your local llama3.1 used 4 GPU-hours this week, equivalent to $X on Sonnet 4.6".

Why it lands: hybrid users (cloud + local) constantly question whether the trade-off is worth it. This panel makes the answer concrete with their own data — not generic benchmarks.

**Implementation sketch** (~4-5h):
- User configures their `$/GPU-hour` rate (often electricity + amortized hardware cost, calculator provided).
- Each prompt class (by approx token count) gets a cloud cost and a local-equivalent cost from the proxy capture data.
- Dashboard panel renders both columns.

Free + Pro see a stub of this — Pro+ has the real per-event accuracy because only proxy mode supplies the local timing data.

---

### 7. Model benchmark lab

**Status**: ❌ deferred.

The user clicks "benchmark" on the dashboard. Token Meter:
1. Pulls a small fixed corpus (~30 prompts across categories: code, summarize, classification, long-context).
2. Runs them through every configured backend (cloud + local).
3. Captures TTFT / ITL / total time / token count / output sample.
4. Shows a comparison table: model × prompt category × {speed, cost, output sample}.

Why a lab: external benchmarks (Aider, etc.) measure correctness on a fixed harness. The user wants "how does my Opus billing compare to my local 70B on **my** kind of prompts". Pro+ runs that comparison on the user's machine without sending corpus output anywhere.

**Implementation sketch** (~6-8h):
- Built-in benchmark corpus (versioned, downloaded once).
- `token-meter benchmark` CLI orchestrator (uses the existing proxy + cloud paths).
- Dashboard results page with sortable table + sample output viewer.

Corpus updates ship in package releases. User can supply their own corpus file too.

---

### 8. Multi-machine PDF auto-report

**Status**: ❌ deferred.

Weekly PDF generated locally (no LLM call needed for the structure) and:
- Saved to a user-configured directory.
- Optionally attached to the weekly digest email (Pro $5 feature §7 reuse).

Content:
- Cover page: total spend, top 3 deltas vs last week, total tokens by source.
- Page 2: per-machine breakdown (multi-machine sync §5 required for this).
- Page 3: top 5 sessions deep-dive.
- Page 4: MCP / tool breakdown.
- Page 5: forecast vs budget chart.
- Page 6: recommendation list (reuses the weekly LLM call from Pro $5 §7).

**Implementation sketch** (~4-5h):
- Use `pdfkit` or similar pure-Node library — no headless browser dependency.
- Reuse the heuristic rollup from Pro $5 weekly report.

---

### 9. Pro+ MCP server interface

**Status**: ❌ deferred. Extends the Free MCP tools (D-028 [[D-028]]) with behavior-changing tools.

Pro+ MCP tools that an agent (Claude Code / Cursor) can call:

| Tool | Behavior |
|---|---|
| `get_savings_recommendations` | Returns the same suggestions humans see in §4, agent-readable JSON |
| `enable_trim(server, fields)` | Applies an MCP-trim automation (§4) on the user's behalf, returns the diff for confirmation |
| `enable_local_routing(pattern, backend)` | Adds a local-LLM route (§4) |
| `forecast(scope, asOfDate)` | Returns the forecast card data |
| `benchmark_run(corpus_id)` | Triggers a benchmark run (§7), returns the report when complete |

Why MCP: agents using Token Meter inside Claude Code can already see usage via the Free 4-tool surface. Pro+ adds the **acting** side — agents that can suggest and (with the user's standing permission) apply remediation.

**Safety**: all action-taking tools require the user's standing per-tool consent (defaults to OFF). Without consent the tool returns a "consent_required: <consent_url>" payload that links to the dashboard where the user reviews and grants the permission.

**Implementation sketch** (~5-6h) extending `src/mcp.ts`.

---

## What's **not** in Pro+ either

- **Team features** (shared DB across users, RBAC, per-seat dashboards) — Team tier, separately deferred (STRATEGY.md, TBD-1).
- **Anonymous benchmark contribution** — that's a Pro $5 feature (free-tier alignment with data contribution).
- **Hosted dashboard** — Token Meter is local-first ([D-005](../05-decisions.md)). Sync to R2 is the closest thing; nothing renders Pro+ data on a remote URL.
- **Vendor invoice reconciliation** (parse the real Anthropic/OpenAI bill, diff against local estimates) — interesting, deferred beyond Pro+ (likely TBD-12 + needs vendor API access).

---

## Why Pro+ is deferred (gating)

D-031 removed the PMF-count gate. What remains as the gate for **entering** Pro+ work:

1. **Pro $5 must be shippable first**. We can't ask users to pay $24 for a tier we haven't even billed $5 for. Pro+ work starts after the Pro $5 wiring is live.
2. **Local LLM proxy needs ~12-15h alone**. That blows the weekly 10h cap unless explicitly scheduled.
3. **Per-OS GPU adapters need a Mac + a Linux + a Windows machine to test**. Without that hardware coverage the OS-specific bugs eat support time later.
4. **Behavior-changing automations carry support cost**. We want the suggestion-only Pro version to settle before adding the execute version.

Pro+ ships as a unit (proxy + GPU + automations + sync). Partial Pro+ would create the worst tier shape: a "Pro+ that doesn't justify $24" while still claiming $24.

---

## Implementation rollout order (when the user authorizes Pro+ work)

1. **Local proxy core (§1)** — the foundation everything else builds on.
2. **GPU NVIDIA path (§2)** — fastest validation on NVIDIA-heavy beta cohort.
3. **Unlimited history gating (§3)** — trivial.
4. **Behavior automations (§4) — `mcp.trim` first** (smallest blast radius).
5. **Cloud ↔ local cost translation (§6)** — falls out cheap once §1 lands.
6. **PDF auto-report (§8)** — reuses the existing weekly heuristic rollup.
7. **Apple Silicon GPU path (§2 cont.)**.
8. **Multi-machine sync (§5)** — needs the worker + R2 stand-up.
9. **Model benchmark lab (§7)** — finalize once enough backends are stable.
10. **Pro+ MCP interface (§9)** — wraps everything above.
11. **AMD GPU path (§2 cont.)** — lowest priority.

Total Pro+ shipping budget: **~60-75h** beyond Pro $5 work, spread over many weeks.

---

## See also

- [05-decisions.md](../05-decisions.md) — D-014 (local LLM gate) / D-015 (TPS measurement) / D-007 (trust avoidance) / D-020 (Pro+ deferred) / D-031 (PMF-count gate removed, complexity gate kept).
- [STRATEGY.md](../STRATEGY.md) — pricing table, persona B (local LLM users), TPS measurement matrix.
- [docs/pro-features.md](pro-features.md) — Pro $5 spec.
- [docs/mcp-server.md](mcp-server.md) — Free MCP tools (4-tool surface that Pro+ §9 extends).
