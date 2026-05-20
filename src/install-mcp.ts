import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

export const MCP_SERVER_NAME = 'token-meter';
export const MCP_PACKAGE = '@whdrnr2583/token-meter';
export const MCP_ENTRY = Object.freeze({
  command: 'npx',
  args: Object.freeze(['-y', MCP_PACKAGE, 'mcp']),
});

export type InstallClient = 'claude-code' | 'cursor' | 'claude-desktop';

export type InstallAction =
  | 'added'
  | 'already-present'
  | 'updated'
  | 'skipped'
  | 'failed';

export type InstallResult = {
  client: InstallClient;
  ok: boolean;
  action: InstallAction;
  configPath?: string;
  message: string;
};

export type InstallOptions = {
  dryRun?: boolean;
};

export function cursorConfigPath(): string {
  return join(homedir(), '.cursor', 'mcp.json');
}

export function claudeDesktopConfigPath(): string {
  if (platform() === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error(
        'APPDATA env var is missing — cannot locate Claude Desktop config on Windows',
      );
    }
    return join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return join(
    homedir(),
    '.config',
    'Claude',
    'claude_desktop_config.json',
  );
}

type JsonConfig = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

function entryMatches(existing: unknown): boolean {
  if (!existing || typeof existing !== 'object') return false;
  const e = existing as { command?: unknown; args?: unknown };
  if (e.command !== MCP_ENTRY.command) return false;
  if (!Array.isArray(e.args)) return false;
  if (e.args.length !== MCP_ENTRY.args.length) return false;
  for (let i = 0; i < MCP_ENTRY.args.length; i++) {
    if (e.args[i] !== MCP_ENTRY.args[i]) return false;
  }
  return true;
}

/**
 * Read an MCP-style JSON config, merge `mcpServers["token-meter"]`, and write
 * it back. Idempotent: if the entry is already correct, nothing is written.
 * If the file exists but the entry differs (or other servers are present),
 * the file is backed up to `<path>.bak` before being rewritten.
 */
export function mergeMcpJsonConfig(
  configPath: string,
  opts: InstallOptions = {},
): {
  action: InstallAction;
  message: string;
} {
  const dryRun = opts.dryRun === true;

  let existing: JsonConfig = {};
  let fileExisted = false;
  if (existsSync(configPath)) {
    fileExisted = true;
    const raw = readFileSync(configPath, 'utf8').trim();
    if (raw.length > 0) {
      try {
        existing = JSON.parse(raw) as JsonConfig;
      } catch (err) {
        return {
          action: 'failed',
          message:
            `Config at ${configPath} is not valid JSON ` +
            `(${(err as Error).message}). ` +
            `Fix the file manually or move it aside, then retry.`,
        };
      }
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        return {
          action: 'failed',
          message: `Config at ${configPath} is not a JSON object — refusing to overwrite.`,
        };
      }
    }
  }

  const servers =
    (existing.mcpServers && typeof existing.mcpServers === 'object'
      ? existing.mcpServers
      : {}) as Record<string, unknown>;

  if (entryMatches(servers[MCP_SERVER_NAME])) {
    return {
      action: 'already-present',
      message: `${MCP_SERVER_NAME} already registered in ${configPath} — no change.`,
    };
  }

  if (dryRun) {
    return {
      action: servers[MCP_SERVER_NAME] ? 'updated' : 'added',
      message:
        `[dry-run] Would write ${MCP_SERVER_NAME} entry to ${configPath}` +
        (fileExisted ? ` (existing file would be backed up to ${configPath}.bak).` : '.'),
    };
  }

  const merged: JsonConfig = {
    ...existing,
    mcpServers: {
      ...servers,
      [MCP_SERVER_NAME]: {
        command: MCP_ENTRY.command,
        args: [...MCP_ENTRY.args],
      },
    },
  };

  mkdirSync(dirname(configPath), { recursive: true });

  if (fileExisted) {
    try {
      copyFileSync(configPath, `${configPath}.bak`);
    } catch (err) {
      return {
        action: 'failed',
        message: `Could not back up ${configPath}: ${(err as Error).message}`,
      };
    }
  }

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  const action: InstallAction = servers[MCP_SERVER_NAME] ? 'updated' : 'added';
  return {
    action,
    message:
      action === 'updated'
        ? `Updated ${MCP_SERVER_NAME} entry in ${configPath} (backup: ${configPath}.bak).`
        : fileExisted
          ? `Added ${MCP_SERVER_NAME} to existing ${configPath} (backup: ${configPath}.bak).`
          : `Created ${configPath} with ${MCP_SERVER_NAME} entry.`,
  };
}

function claudeCliPresent(): boolean {
  try {
    execSync('claude --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function claudeMcpAlreadyRegistered(): boolean {
  try {
    const out = execSync('claude mcp list', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.includes(MCP_SERVER_NAME);
  } catch {
    return false;
  }
}

export function installClaudeCode(opts: InstallOptions = {}): InstallResult {
  const dryRun = opts.dryRun === true;

  if (!claudeCliPresent()) {
    return {
      client: 'claude-code',
      ok: false,
      action: 'skipped',
      message:
        '`claude` CLI not found in PATH. Install Claude Code first ' +
        '(https://docs.claude.com/claude-code), then retry.',
    };
  }

  if (claudeMcpAlreadyRegistered()) {
    return {
      client: 'claude-code',
      ok: true,
      action: 'already-present',
      message: `${MCP_SERVER_NAME} is already registered with Claude Code — no change.`,
    };
  }

  if (dryRun) {
    return {
      client: 'claude-code',
      ok: true,
      action: 'added',
      message:
        `[dry-run] Would run: claude mcp add ${MCP_SERVER_NAME} -- npx -y ${MCP_PACKAGE} mcp`,
    };
  }

  try {
    execSync(
      `claude mcp add ${MCP_SERVER_NAME} -- npx -y ${MCP_PACKAGE} mcp`,
      { stdio: 'pipe', encoding: 'utf8' },
    );
    return {
      client: 'claude-code',
      ok: true,
      action: 'added',
      message:
        `Registered ${MCP_SERVER_NAME} with Claude Code. Verify with: claude mcp list`,
    };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof e.stderr === 'string'
        ? e.stderr
        : e.stderr
          ? e.stderr.toString()
          : '';
    return {
      client: 'claude-code',
      ok: false,
      action: 'failed',
      message:
        `\`claude mcp add\` failed: ${stderr.trim() || e.message || 'unknown error'}`,
    };
  }
}

export function installCursor(opts: InstallOptions = {}): InstallResult {
  const path = cursorConfigPath();
  const r = mergeMcpJsonConfig(path, opts);
  return {
    client: 'cursor',
    ok: r.action !== 'failed',
    action: r.action,
    configPath: path,
    message:
      r.action === 'added' || r.action === 'updated'
        ? `${r.message} Restart Cursor for the change to take effect.`
        : r.message,
  };
}

export function installClaudeDesktop(opts: InstallOptions = {}): InstallResult {
  let path: string;
  try {
    path = claudeDesktopConfigPath();
  } catch (err) {
    return {
      client: 'claude-desktop',
      ok: false,
      action: 'failed',
      message: (err as Error).message,
    };
  }
  const r = mergeMcpJsonConfig(path, opts);
  return {
    client: 'claude-desktop',
    ok: r.action !== 'failed',
    action: r.action,
    configPath: path,
    message:
      r.action === 'added' || r.action === 'updated'
        ? `${r.message} Fully quit and reopen Claude Desktop for the change to take effect.`
        : r.message,
  };
}

export function installMcp(
  client: InstallClient | 'all',
  opts: InstallOptions = {},
): InstallResult[] {
  if (client === 'claude-code') return [installClaudeCode(opts)];
  if (client === 'cursor') return [installCursor(opts)];
  if (client === 'claude-desktop') return [installClaudeDesktop(opts)];
  if (client === 'all') {
    return [
      installClaudeCode(opts),
      installCursor(opts),
      installClaudeDesktop(opts),
    ];
  }
  throw new Error(`Unknown client: ${client as string}`);
}
