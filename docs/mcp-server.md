# Token Meter — MCP server setup

> **Just ask your LLM to do this.** Open Claude Code, Cursor, Claude Desktop,
> or any MCP-capable agent and paste:
>
> > *"Read https://raw.githubusercontent.com/whdrnr2583-cmd/tokenmeter/main/docs/mcp-server.md
> > and set up Token Meter as my MCP server for **\<this client\>**."*
>
> Every command below is copy-paste runnable. The LLM picks the right block
> for your OS and client and executes it.

Token Meter exposes four read-only tools over stdio MCP:

| Tool | What it does |
|---|---|
| `usage_summary` | Cost + token summary (today / week / month), by model and project |
| `recent_sessions` | Sessions active in the last N hours + ready-to-paste `claude --resume` / `codex resume` commands |
| `session_tools` | Per-session breakdown: which MCP servers and built-in tools the session used, call counts, response sizes, average latency |
| `refresh_data` | Re-scan local JSONL for new activity |

Each tool is also exposed as a **slash-command prompt** for clients that surface
MCP prompts (Claude Code, Cursor, Claude Desktop):

| Slash command | Arg | What it does |
|---|---|---|
| `/mcp__token-meter__usage_summary` | `period` = `today` \| `week` \| `month` (default `today`) | Same as the `usage_summary` tool |
| `/mcp__token-meter__recent_sessions` | `within_hours` = 1-720 (default 24) | Same as the `recent_sessions` tool |
| `/mcp__token-meter__session_tools` | `session_id` (required) | Same as the `session_tools` tool |
| `/mcp__token-meter__refresh_data` | — | Same as the `refresh_data` tool |

Slash commands and natural-language calls both work — pick whichever is faster
for the moment.

It reads the same local SQLite database the CLI writes (`~/.tokenpulse/usage.db`,
renamed to `~/.tokenmeter/` in a future release with an automatic migration).
Token Meter never talks to vendor APIs.

---

## Prerequisites (all clients)

- **Node.js ≥ 18** — `node --version` to check. `npx` ships with Node.
- One quick sanity check before registering anywhere:

  ```sh
  npx -y @whdrnr2583/token-meter --version
  # → 0.1.5 (or later)
  ```

  If this prints a version, you're ready. If it fails, fix Node first.

## One-command setup

```sh
npx -y @whdrnr2583/token-meter install-mcp all
```

This registers Token Meter as an MCP server with **every supported client present on your machine** in one go:

- **Claude Code** → runs `claude mcp add token-meter -- npx -y @whdrnr2583/token-meter mcp` for you (skipped if the `claude` CLI isn't installed).
- **Cursor** → writes/merges `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`).
- **Claude Desktop** → writes/merges the platform-specific `claude_desktop_config.json`.

Idempotent (safe to re-run), backs up any existing config to `<path>.bak`, and preserves other MCP servers you already had registered. Add `--dry-run` to preview without writing.

Single-client variants:

```sh
npx -y @whdrnr2583/token-meter install-mcp claude-code
npx -y @whdrnr2583/token-meter install-mcp cursor
npx -y @whdrnr2583/token-meter install-mcp claude-desktop
```

For ChatGPT, generic stdio clients, or to do it manually, see the per-client sections below.

---

## Claude Code

**Register:**

```sh
claude mcp add token-meter -- npx -y @whdrnr2583/token-meter mcp
```

**Verify:**

```sh
claude mcp list
# token-meter should appear with a ✔ Connected status
```

**Use it** — open Claude Code and ask:

- *"Use token-meter `usage_summary` for this week."*
- *"Use token-meter `recent_sessions` for the last 24 hours."*
- *"Use token-meter `session_tools` for session `<session_id>`."*

**Remove:**

```sh
claude mcp remove token-meter
```

---

## Cursor

**1. Open (or create) the MCP config file:**

| OS | Path |
|---|---|
| macOS / Linux | `~/.cursor/mcp.json` |
| Windows | `%USERPROFILE%\.cursor\mcp.json` |

**2. Merge this entry** into `mcpServers` (preserve any servers you already have):

```json
{
  "mcpServers": {
    "token-meter": {
      "command": "npx",
      "args": ["-y", "@whdrnr2583/token-meter", "mcp"]
    }
  }
}
```

**3. Fully quit and reopen Cursor.**

**4. Verify:** Cursor Settings → MCP → `token-meter` should show as connected (green dot).

**5. Use it** — in Cursor chat:

- *"Use token-meter to show this week's spend."*

---

## Claude Desktop

**1. Open (or create) the config file:**

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**2. Merge** into `mcpServers`:

```json
{
  "mcpServers": {
    "token-meter": {
      "command": "npx",
      "args": ["-y", "@whdrnr2583/token-meter", "mcp"]
    }
  }
}
```

**3. Fully quit Claude Desktop** (Cmd-Q / right-click tray icon → Quit) and reopen it. Closing the window is not enough.

**4. Verify:** click the 🔌 connectors icon in the chat input — `token-meter` should be listed.

---

## ChatGPT (Custom Connector / Apps)

ChatGPT's Custom Connector and Apps Directory require **HTTP transport**.
Token Meter currently ships **stdio only** — direct ChatGPT integration is on the M4+ roadmap.

**Workaround** (community recipe, untested by us) — wrap stdio with an HTTP proxy on your machine:

```sh
# in one terminal
npx -y @open-webui/mcpo --port 8080 -- npx -y @whdrnr2583/token-meter mcp
```

Then point ChatGPT's Custom Connector at `http://localhost:8080`. Note: only works while that terminal is running on your local machine, and only on the desktop ChatGPT app that can reach `localhost`.

---

## Any other MCP-compatible client (direct stdio)

```sh
npx -y @whdrnr2583/token-meter mcp
```

Speaks MCP over stdin/stdout per the [Model Context Protocol spec](https://modelcontextprotocol.io). Any client that supports stdio transport (e.g. Continue, Zed, custom agents) can register the same command.

---

## Troubleshooting

**`command not found: npx`**
Install Node.js ≥ 18 from [nodejs.org](https://nodejs.org). `npx` ships with Node.

**`npx -y @whdrnr2583/token-meter --version` fails / hangs**
Your npm cache may be stale. `npm cache clean --force` and retry.

**Windows + Claude Code: `claude mcp add` hangs or "command not found" after registering**
Use the absolute path to `npx.cmd`:

```sh
where npx
# e.g. C:\Program Files\nodejs\npx.cmd

claude mcp add token-meter -- "C:\Program Files\nodejs\npx.cmd" -y @whdrnr2583/token-meter mcp
```

**Tools return "no data" on first call**
Run a one-time ingest so the local database has something to read:

```sh
npx -y @whdrnr2583/token-meter ingest
```

Then retry. The MCP server auto-ingests on startup after that.

**Cursor / Claude Desktop don't show the server after editing the config**
You probably didn't fully restart the app. Closing the window keeps it running in the tray on macOS/Windows — Cmd-Q (mac) / right-click tray → Quit (Windows) / `pkill` (Linux), then relaunch.

**MCP shows as registered but tool calls error**
Run the server directly in a terminal to see the error:

```sh
npx -y @whdrnr2583/token-meter mcp
# leave it running, then try the tool call again from your client
# any errors will print to this terminal
```

---

## Example: *"I closed my terminal — what was I working on?"*

Ask your agent: *"Use token-meter to show my recent sessions."*

```
Recent sessions (last 24h) — newest first:

• 12m ago — claude-code — $1.42 — 86 events
  project: C:\Users\you\projects\app
  session: 1f4f193b-16fb-4afa-ad0f-3e35483d81a7
  resume:  cd "C:\Users\you\projects\app" && claude --resume

• 3h 5m ago — codex — $0.18 — 19 events
  project: C:\Users\you\projects\api
  session: 019e1194-a487-7b03-bffc-16a3cf332708
  resume:  cd "C:\Users\you\projects\api" && codex resume
```

Then `cd` into the project and run the resume command — your conversation history is intact (Claude Code and Codex persist it to disk).

## Example: *"Why was that session so expensive?"*

*"Use token-meter `session_tools` for session 1f4f193b-…"* →

```
Tools used in session 1f4f193b-…:

  mcp__notion__notion_search       mcp:notion    calls= 12  resp= 148.0k  avg_latency=4200ms
  Bash                             built-in      calls= 45  resp=  38.0k  avg_latency=2100ms
  Read                             built-in      calls= 88  resp= 120.0k  avg_latency= 180ms
```

→ Notion MCP responses are large; consider trimming the fields you request.

---

## Notes

- The MCP server runs an **incremental ingest** on startup, and `refresh_data` re-scans on demand.
- **Read-only**: it never modifies your JSONL files, never spawns or kills any CLI process.
- Resume commands are **best-effort** — Claude Code's resume picker may still ask you to pick the session; the `session_id` is provided so you can identify it.
- The npm package is published under a scope (`@whdrnr2583/token-meter`) because the bare `token-meter` name collides with an existing similar package on npm. The CLI binary is still called `token-meter` after a global install.
