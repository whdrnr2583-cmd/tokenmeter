import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { migrate, openDb } from '../src/db.js';
import { exportCsv, exportJson } from '../src/export.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'tm-export-'));
  const path = join(dir, 'usage.db');
  const db = openDb(path);
  migrate(db);
  return {
    db,
    cleanup: () => {
      try { db.close(); } catch { /* ignore */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

function seedEvents(db: ReturnType<typeof openDb>, count: number): void {
  for (let i = 0; i < count; i++) {
    const ts = Date.now() - i * 3_600_000;
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', '/proj', 'sess1',
               ?, 100, 50, 10, 5, 0.0025)`,
    ).run(ts, `req-${i}`);
  }
}

test('exportCsv returns correct header and row count', () => {
  const { db, cleanup } = freshDb();
  try {
    seedEvents(db, 3);
    const csv = exportCsv(db, 30);
    const lines = csv.split('\n').filter(Boolean);
    // header + 3 data rows
    assert.equal(lines.length, 4, 'header + 3 data rows');
    // Check header contains expected columns
    const header = lines[0];
    assert.ok(header.includes('ts'), 'header has ts');
    assert.ok(header.includes('usd_cents'), 'header has usd_cents');
    assert.ok(header.includes('usd_estimate'), 'header has usd_estimate');
    assert.ok(header.includes('model'), 'header has model');
  } finally {
    cleanup();
  }
});

test('exportCsv usd_cents is integer cents of usd_estimate', () => {
  const { db, cleanup } = freshDb();
  try {
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', '/p', 's', 'r1',
               100, 50, 0, 0, 0.1234)`,
    ).run(Date.now());
    const csv = exportCsv(db, 7);
    const lines = csv.split('\n').filter(Boolean);
    const header = lines[0].split(',');
    const dataRow = lines[1].split(',');
    const usdIdx = header.indexOf('usd_estimate');
    const centsIdx = header.indexOf('usd_cents');
    assert.ok(usdIdx >= 0, 'usd_estimate column found');
    assert.ok(centsIdx >= 0, 'usd_cents column found');
    // usd_estimate = 0.1234 → usd_cents = round(0.1234 × 10000) = 1234
    assert.equal(dataRow[centsIdx], '1234');
  } finally {
    cleanup();
  }
});

test('exportCsv escapes values with commas correctly', () => {
  const { db, cleanup } = freshDb();
  try {
    // project name with a comma
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5',
               'proj,with,commas', 's', 'r2', 0, 0, 0, 0, 0.01)`,
    ).run(Date.now());
    const csv = exportCsv(db, 7);
    // The project cell should be quoted
    assert.ok(csv.includes('"proj,with,commas"'), 'comma value is quoted');
  } finally {
    cleanup();
  }
});

test('exportJson returns valid JSON with correct structure', () => {
  const { db, cleanup } = freshDb();
  try {
    seedEvents(db, 5);
    const json = exportJson(db, 30);
    const parsed = JSON.parse(json) as { days: number; count: number; rows: unknown[] };
    assert.equal(parsed.days, 30);
    assert.equal(parsed.count, 5);
    assert.equal(parsed.rows.length, 5);
    // Each row should have usd_cents
    const firstRow = parsed.rows[0] as Record<string, unknown>;
    assert.ok('usd_cents' in firstRow, 'row has usd_cents');
    assert.ok('ts' in firstRow, 'row has ts');
  } finally {
    cleanup();
  }
});

test('exportCsv / exportJson respect days window', () => {
  const { db, cleanup } = freshDb();
  try {
    // 1 event yesterday, 1 event 10 days ago
    const yesterday = Date.now() - 86_400_000;
    const tenDaysAgo = Date.now() - 10 * 86_400_000;
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', '/p', 's1', 'r1',
               0, 0, 0, 0, 1.0)`,
    ).run(yesterday);
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', '/p', 's2', 'r2',
               0, 0, 0, 0, 2.0)`,
    ).run(tenDaysAgo);

    const csv7 = exportCsv(db, 7);
    const lines7 = csv7.split('\n').filter(Boolean);
    // Only the yesterday event falls within 7 days
    assert.equal(lines7.length, 2, '7d: header + 1 row');

    const csv30 = exportCsv(db, 30);
    const lines30 = csv30.split('\n').filter(Boolean);
    assert.equal(lines30.length, 3, '30d: header + 2 rows');
  } finally {
    cleanup();
  }
});

test('exportCsv empty DB returns only header', () => {
  const { db, cleanup } = freshDb();
  try {
    const csv = exportCsv(db, 7);
    const lines = csv.split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'only header line when empty');
  } finally {
    cleanup();
  }
});
