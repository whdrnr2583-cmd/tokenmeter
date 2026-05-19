import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import {
  insertTokenEvents,
  insertToolEvents,
  recordIngest,
  getIngestState,
} from './db.js';
import { parseJsonlFile } from './parser.js';
import { ingestCodex } from './codex-ingest.js';

export interface IngestSummary {
  files_scanned: number;
  files_processed: number;
  token_rows_inserted: number;
  tool_rows_inserted: number;
  duration_ms: number;
}

export interface CombinedIngestSummary {
  claude_code: IngestSummary;
  codex: { files_scanned: number; files_processed: number; token_rows_inserted: number; duration_ms: number };
}

/**
 * Returns true when the current process is running inside WSL (Windows
 * Subsystem for Linux). Checks /proc/version for the "microsoft" or "WSL"
 * string which is present in all WSL 1 and WSL 2 kernels.
 */
export function isWsl(): boolean {
  try {
    const version = readFileSync('/proc/version', 'utf8');
    return /microsoft|wsl/i.test(version);
  } catch {
    return false;
  }
}

/**
 * Tool-data directories on the Windows side, for use when running under WSL.
 * Scans every /mnt/c/Users/<profile>/<relPath> and returns the ones that
 * exist. It looks for the data directly rather than guessing the Windows
 * username — USERPROFILE is often unset under WSL, and the first
 * /mnt/c/Users entry can be a sandbox/system account (e.g.
 * "CodexSandboxOffline"), not the real user. Returns [] when off WSL.
 */
export function scanWindowsUserDirs(relPath: string): string[] {
  if (!isWsl()) return [];
  const usersRoot = '/mnt/c/Users';
  const out: string[] = [];
  try {
    for (const e of readdirSync(usersRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const candidate = `${usersRoot}/${e.name}/${relPath}`;
      if (existsSync(candidate)) out.push(candidate);
    }
  } catch {
    /* /mnt/c/Users absent — not a typical WSL-on-Windows setup */
  }
  return out;
}

/**
 * Primary Claude projects directory (always the home-dir one).
 * Kept for backward compatibility and for callers that just need a single path.
 */
export function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * All Claude projects directories to scan. On WSL this includes any
 * Windows-side /mnt/c/Users/<profile>/.claude/projects in addition to the
 * WSL home-dir path, so sessions from a Windows Claude Code install are not
 * silently skipped.
 *
 * Dedup note: Claude Code writes JSONL only to the host where it runs, and
 * the directories are distinct on-disk paths — the same session file cannot
 * appear in both, so there is no double-counting at the file level.
 */
export function claudeProjectsDirs(): string[] {
  const dirs = [claudeProjectsDir()];
  for (const d of scanWindowsUserDirs('.claude/projects')) {
    if (!dirs.includes(d)) dirs.push(d);
  }
  return dirs;
}

// Decode Claude Code's project-directory name back to a path. Lossy fallback
// only — the parser prefers the JSONL `cwd` field. Windows dirs look like
// "C--Users-whdrn-Desktop"; POSIX dirs like "-mnt-c-Users-whdrn-claudeCode".
function prettyProjectName(dirName: string): string {
  if (/^[A-Za-z]--/.test(dirName)) {
    // Windows: "C--Users-whdrn-Desktop" → "C:\Users\whdrn\Desktop"
    return dirName
      .replace(/^([A-Za-z])--/, '$1:\\')
      .replace(/-/g, '\\')
      .replace(/\\{2,}/g, '\\');
  }
  // POSIX: "-mnt-c-Users-whdrn-claudeCode" → "/mnt/c/Users/whdrn/claudeCode"
  return dirName.replace(/-/g, '/');
}

export function ingestClaudeCode(
  db: Database.Database,
  options: { force?: boolean } = {},
): IngestSummary {
  const start = Date.now();
  const baseDirs = claudeProjectsDirs();
  const summary: IngestSummary = {
    files_scanned: 0,
    files_processed: 0,
    token_rows_inserted: 0,
    tool_rows_inserted: 0,
    duration_ms: 0,
  };

  for (const baseDir of baseDirs) {
    if (!existsSync(baseDir)) continue;

    const projectDirs = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dirName of projectDirs) {
      const projectPath = join(baseDir, dirName);
      const prettyName = prettyProjectName(dirName);

      let files: string[];
      try {
        files = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const f of files) {
        const filePath = join(projectPath, f);
        summary.files_scanned++;
        let st;
        try {
          st = statSync(filePath);
        } catch {
          continue;
        }

        const prior = getIngestState(db, filePath);
        const unchanged =
          !options.force &&
          prior !== undefined &&
          prior.mtime_ms === Math.floor(st.mtimeMs) &&
          prior.size === st.size;
        if (unchanged) continue;

        const { tokens, tools } = parseJsonlFile(filePath, prettyName);
        const ti = insertTokenEvents(db, tokens);
        const tl = insertToolEvents(db, tools);
        recordIngest(db, filePath, Math.floor(st.mtimeMs), st.size);

        summary.files_processed++;
        summary.token_rows_inserted += ti;
        summary.tool_rows_inserted += tl;
      }
    }
  }

  summary.duration_ms = Date.now() - start;
  return summary;
}

export function ingestAll(
  db: Database.Database,
  options: { force?: boolean } = {},
): CombinedIngestSummary {
  return {
    claude_code: ingestClaudeCode(db, options),
    codex: ingestCodex(db, options),
  };
}
