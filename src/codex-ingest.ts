import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getIngestState, insertTokenEvents, recordIngest } from './db.js';
import { parseCodexSession } from './codex-parser.js';

export interface CodexIngestSummary {
  files_scanned: number;
  files_processed: number;
  token_rows_inserted: number;
  duration_ms: number;
}

export function codexSessionsDir(): string {
  return join(homedir(), '.codex', 'sessions');
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

  const base = codexSessionsDir();
  if (!existsSync(base)) {
    summary.duration_ms = Date.now() - start;
    return summary;
  }

  const files: string[] = [];
  walkJsonl(base, files);

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
