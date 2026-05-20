#!/usr/bin/env node
/**
 * Standalone verification that v0.1.16 ingest picks up sub-agent JSONL files
 * under <project>/<sessionId>/subagents/. Runs against dist/ingest.js so it
 * works in environments where tsx/esbuild is unavailable (e.g. WSL on
 * /mnt/c/, where the native esbuild binary EIOs against the Windows FS).
 *
 * Usage:  node scripts/verify-subagent-scan.mjs
 * Exits 0 on PASS, non-zero on FAIL.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const distDir = resolve(here, '..', 'dist');

const { openDb, migrate } = await import(join(distDir, 'db.js'));
const { ingestClaudeCode } = await import(join(distDir, 'ingest.js'));

const fakeHome = mkdtempSync(join(tmpdir(), 'tm-subagent-verify-'));
// `os.homedir()` reads HOME on POSIX and USERPROFILE on Windows — override
// both so the staged fixture is picked up regardless of host OS.
const prevHome = process.env.HOME;
const prevUserProfile = process.env.USERPROFILE;
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

let exitCode = 0;
try {
  const projectsRoot = join(fakeHome, '.claude', 'projects');
  const projectDir = join(projectsRoot, '-tmp-fake-project');
  const sessionDir = join(projectDir, 'session-abc');
  const subagentDir = join(sessionDir, 'subagents');
  mkdirSync(subagentDir, { recursive: true });

  // Use distinctive model names so we can assert presence even when the
  // ingest also picks up unrelated real JSONL on the same machine (WSL scans
  // both HOME and /mnt/c/Users/*/.claude — that's intentional and we don't
  // want to mock it away).
  const ROOT_MODEL = 'test-fixture-root-v0_1_16';
  const SUBAGENT_MODEL = 'test-fixture-subagent-v0_1_16';

  const rootLine = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-20T01:00:00.000Z',
    message: {
      id: 'msg_root_fixture',
      model: ROOT_MODEL,
      usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
  writeFileSync(join(projectDir, 'root-session.jsonl'), rootLine + '\n');

  const subagentLine = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-20T01:05:00.000Z',
    message: {
      id: 'msg_subagent_fixture',
      model: SUBAGENT_MODEL,
      usage: { input_tokens: 5, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
  writeFileSync(join(subagentDir, 'agent-haiku.jsonl'), subagentLine + '\n');

  const db = openDb(':memory:');
  migrate(db);
  const summary = ingestClaudeCode(db);

  function check(label, cond, detail) {
    const status = cond ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!cond) exitCode = 1;
  }

  check('summary.files_scanned >= 2 (includes our 2 fixtures)', summary.files_scanned >= 2, `got ${summary.files_scanned}`);

  const fixtureRows = db
    .prepare('SELECT model, COUNT(*) AS c FROM token_events WHERE model LIKE ? GROUP BY model')
    .all('test-fixture-%');
  const byModel = Object.fromEntries(fixtureRows.map((r) => [r.model, r.c]));
  check('root fixture row inserted', (byModel[ROOT_MODEL] ?? 0) >= 1, `count=${byModel[ROOT_MODEL] ?? 0}`);
  check('subagent fixture row inserted (regression)', (byModel[SUBAGENT_MODEL] ?? 0) >= 1, `count=${byModel[SUBAGENT_MODEL] ?? 0}`);
} finally {
  if (prevHome !== undefined) process.env.HOME = prevHome;
  else delete process.env.HOME;
  if (prevUserProfile !== undefined) process.env.USERPROFILE = prevUserProfile;
  else delete process.env.USERPROFILE;
  rmSync(fakeHome, { recursive: true, force: true });
}

if (exitCode === 0) console.log('\n✓ subagent scan regression verified');
else console.log('\n✗ subagent scan regression FAILED');
process.exit(exitCode);
