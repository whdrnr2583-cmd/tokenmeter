import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { migrate, openDb } from '../src/db.js';
import {
  gatherDigestFacts,
  renderDigestText,
  sendWeeklyDigest,
} from '../src/digest.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'tm-digest-'));
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

/** Return epoch ms for a Monday — 2026-05-18 is a Monday. */
const MONDAY = new Date('2026-05-18T00:00:00').getTime();

test('gatherDigestFacts returns zeroes on empty DB', () => {
  const { db, cleanup } = freshDb();
  try {
    const facts = gatherDigestFacts(db, MONDAY + 3_600_000);
    assert.equal(facts.total_usd, 0);
    assert.equal(Number(facts.events), 0);
    assert.equal(facts.top_sessions.length, 0);
    assert.equal(facts.top_models.length, 0);
    // week_label is YYYY-MM-DD in local time; just verify format not specific date
    // since the exact date depends on the test runner's timezone.
    assert.match(facts.week_label, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    cleanup();
  }
});

test('gatherDigestFacts aggregates events in the current week', () => {
  const { db, cleanup } = freshDb();
  try {
    // 3 events on Mon/Tue/Wed of the week
    for (let d = 0; d < 3; d++) {
      const ts = MONDAY + d * 86_400_000 + 3_600_000; // +1h each day
      db.prepare(
        `INSERT INTO token_events
          (ts, source, source_kind, model, project, session_id, request_id,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           usd_estimate)
         VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5',
                 '/proj', 'sess-a', ?, 100, 50, 0, 0, 2.0)`,
      ).run(ts, `r-${d}`);
    }

    const asOf = MONDAY + 3 * 86_400_000; // Wednesday
    const facts = gatherDigestFacts(db, asOf);
    assert.equal(facts.events, 3);
    assert.ok(Math.abs(facts.total_usd - 6.0) < 0.001, `total_usd=${facts.total_usd}`);
    assert.equal(facts.top_models.length, 1);
    assert.equal(facts.top_models[0].model, 'claude-sonnet-4-5');
  } finally {
    cleanup();
  }
});

test('gatherDigestFacts wow_delta_usd is this week minus last week', () => {
  const { db, cleanup } = freshDb();
  try {
    const prevMonday = MONDAY - 7 * 86_400_000;
    // Last week: $5, This week: $8
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5',
               '/p', 'sl', 'rl', 0, 0, 0, 0, 5.0)`,
    ).run(prevMonday + 3_600_000);
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5',
               '/p', 'sc', 'rc', 0, 0, 0, 0, 8.0)`,
    ).run(MONDAY + 3_600_000);

    const facts = gatherDigestFacts(db, MONDAY + 3_600_000 + 1000);
    assert.ok(Math.abs(facts.total_usd - 8.0) < 0.001);
    assert.ok(Math.abs(facts.prev_week_usd - 5.0) < 0.001);
    assert.ok(Math.abs(facts.wow_delta_usd - 3.0) < 0.001);
    assert.ok(facts.wow_delta_pct !== null);
    // 3 / 5 = 0.6
    assert.ok(Math.abs(facts.wow_delta_pct! - 0.6) < 0.01);
  } finally {
    cleanup();
  }
});

test('renderDigestText contains key sections', () => {
  const { db, cleanup } = freshDb();
  try {
    const facts = gatherDigestFacts(db, MONDAY + 3_600_000);
    const text = renderDigestText(facts);
    assert.ok(text.includes('Weekly Digest'), 'has Weekly Digest header');
    assert.ok(text.includes('Total spend'), 'has Total spend');
    assert.ok(text.includes('token-meter.dev'), 'has footer link');
  } finally {
    cleanup();
  }
});

test('renderDigestText includes model and session sections when data present', () => {
  const { db, cleanup } = freshDb();
  try {
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-opus-4-7',
               '/proj', 'sess-x', 'rx', 100, 100, 0, 0, 5.0)`,
    ).run(MONDAY + 3_600_000);
    const facts = gatherDigestFacts(db, MONDAY + 3_600_000 + 1000);
    const text = renderDigestText(facts);
    assert.ok(text.includes('Top models'), 'has Top models section');
    assert.ok(text.includes('claude-opus-4-7'), 'mentions the model');
    assert.ok(text.includes('Top sessions'), 'has Top sessions section');
  } finally {
    cleanup();
  }
});

test('sendWeeklyDigest returns skipped stub result (no live infra)', async () => {
  const { db, cleanup } = freshDb();
  try {
    const result = await sendWeeklyDigest(
      db,
      'test@example.com',
      'tm_test_key',
      MONDAY + 3_600_000,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 'skipped');
    assert.ok(result.message.includes('not_wired_until_deploy'));
  } finally {
    cleanup();
  }
});

test('gatherDigestFacts cache_hit_ratio is 0 when no cache reads', () => {
  const { db, cleanup } = freshDb();
  try {
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5',
               '/p', 's1', 'r1', 500, 100, 0, 0, 0.5)`,
    ).run(MONDAY + 3_600_000);
    const facts = gatherDigestFacts(db, MONDAY + 3_600_000 + 1000);
    assert.equal(facts.cache_hit_ratio, 0);
    assert.ok(facts.cache_savings_usd >= 0);
  } finally {
    cleanup();
  }
});
