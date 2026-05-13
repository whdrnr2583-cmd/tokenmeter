# Token Meter as an MCP server

Token Meter can run as an MCP server so Claude Code, Cursor, or Claude Desktop
can query your usage and — handy when you accidentally close a terminal — list
sessions you might want to resume.

It reads the same local SQLite database (`~/.tokenpulse/usage.db`) and never
touches vendor APIs. (Folder name will become `~/.tokenmeter/` in a future
release with an automatic migration.)

## Run it

```sh
token-meter mcp        # stdio transport
```

The CLI binary is `token-meter`. The npm package is published under a scope
(`@whdrnr2583/token-meter`) because the bare name collides with an existing
similar package on npm.

## Register with Claude Code

Add to your Claude Code MCP config (`~/.claude.json` or via `claude mcp add`):

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

Or:

```sh
claude mcp add token-meter -- npx -y @whdrnr2583/token-meter mcp
```

## Register with Cursor / Claude Desktop

Same idea — add an MCP server entry pointing at `npx -y @whdrnr2583/token-meter mcp`
(or the absolute path to a local checkout's `dist/cli.js mcp`).

## Tools exposed

| Tool | Purpose |
|---|---|
| `usage_summary` | Spend + token summary for `today` / `week` / `month`, by model and project |
| `recent_sessions` | Sessions with activity in the last N hours, newest first, with a ready-to-paste `claude --resume` / `codex resume` command |
| `session_tools` | For a given `session_id`: which MCP servers / built-in tools it used, call counts, response sizes, average latency |
| `refresh_data` | Re-scan `~/.claude/projects` and `~/.codex/sessions` for new activity |

### Example: "I closed my terminal — what was I working on?"

Ask the agent: *"Use token-meter to show my recent sessions."* You get
something like:

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

Then `cd` into the project and run the resume command — your conversation
history is intact (Claude Code and Codex persist it to disk).

### Example: "Why was that session so expensive?"

*"Use token-meter session_tools for session 1f4f193b-…"* →

```
Tools used in session 1f4f193b-…:

  mcp__notion__notion_search             mcp:notion        calls=  12  resp=  148.0k  avg_latency=4200ms
  Bash                                   built-in          calls=  45  resp=   38.0k  avg_latency=2100ms
  Read                                   built-in          calls=  88  resp=  120.0k  avg_latency=180ms
```

→ Notion MCP responses are large; consider trimming the fields you request.

## Notes

- The MCP server runs an incremental ingest on startup, and `refresh_data`
  re-scans on demand.
- It is read-only: it never modifies your JSONL files or kills/spawns any CLI.
- "Resume" hints are best-effort — Claude Code's resume picker may still ask you
  to pick the session; the `session_id` is provided so you can identify it.
