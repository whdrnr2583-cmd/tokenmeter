import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getIngestState, insertTokenEvents, recordIngest } from './db.js';
import { parseCodexSession } from './codex-parser.js';
// isWsl lives in ingest.ts. This forms a benign import cycle — it is a
// hoisted function, called only at runtime.
import { isWsl } from './ingest.js';

export interface CodexIngestSummary {
  files_scanned: number;
  files_processed: number;
  token_rows_inserted: number;
  duration_ms: number;
}

export function codexSessionsDir(): string {
  return join(homedir(), '.codex', 'sessions');
}

/**
 * All Codex session directories to scan. On WSL this also scans every Windows
 * user profile that actually has a `.codex/sessions` directory, so a Codex
 * install on the Windows host is picked up. It looks for the data directly
 * instead of guessing the Windows username: USERPROFILE is often unset under
 * WSL, and the first /mnt/c/Users entry can be a sandbox/system account
 * (e.g. "CodexSandboxOffline"), not the real user.
 */
export function codexSessionsDirs(): string[] {
  const dirs: string[] = [codexSessionsDir()];
  if (isWsl()) {
    try {
      const usersRoot = '/mnt/c/Users';
      for (const e of readdirSync(usersRoot, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const candidate = `${usersRoot}/${e.name}/.codex/sessions`;
        if (existsSync(candidate) && !dirs.includes(candidate)) {
          dirs.push(candidate);
        }
      }
    } catch {
      /* /mnt/c/Users absent — not a typical WSL-on-Windows setup */
    }
  }
  return dirs;
}

function walkJsonl(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
}

export function ingestCodex(
  db: Database.Database,
  options: { force?: boolean } = {},
): CodexIngestSummary {
  const start = Date.now();
  const summary: CodexIngestSummary = {
    files_scanned: 0,
    files_processed: 0,
    token_rows_inserted: 0,
    duration_ms: 0,
  };

  const files: string[] = [];
  for (const base of codexSessionsDirs()) {
    if (existsSync(base)) walkJsonl(base, files);
  }

  for (const filePath of files) {
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

    const { tokens } = parseCodexSession(filePath);
    const ti = insertTokenEvents(db, tokens);
    recordIngest(db, filePath, Math.floor(st.mtimeMs), st.size);

    summary.files_processed++;
    summary.token_rows_inserted += ti;
  }

  summary.duration_ms = Date.now() - start;
  return summary;
}
