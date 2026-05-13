import { readdirSync, statSync, existsSync } from 'node:fs';
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

export function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

// Project name from Claude Code's URL-encoded directory naming.
// e.g. "C--Users-whdrn-Desktop-money" → "C:\Users\whdrn\Desktop\money"
function prettyProjectName(dirName: string): string {
  return dirName.replace(/^C--/, 'C:\\').replace(/-/g, '\\').replace(/\\\\/g, '\\');
}

export function ingestClaudeCode(
  db: Database.Database,
  options: { force?: boolean } = {},
): IngestSummary {
  const start = Date.now();
  const baseDir = claudeProjectsDir();
  const summary: IngestSummary = {
    files_scanned: 0,
    files_processed: 0,
    token_rows_inserted: 0,
    tool_rows_inserted: 0,
    duration_ms: 0,
  };

  if (!existsSync(baseDir)) {
    summary.duration_ms = Date.now() - start;
    return summary;
  }

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
