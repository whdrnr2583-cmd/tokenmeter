# Token Meter MCP server - Glama crawler introspection image
# Local-first usage observability for Claude Code + Codex.
# Runs the stdio MCP server published as @whdrnr2583/token-meter.
FROM node:22-alpine

# better-sqlite3 native build deps (kept minimal; pruned after install)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install -g --omit=dev @whdrnr2583/token-meter@latest \
    && apk del .build-deps

# Glama crawler invokes the MCP stdio server here.
# Read-only: parses ~/.claude/projects and ~/.codex/sessions if mounted.
ENTRYPOINT ["token-meter"]
CMD ["mcp"]
