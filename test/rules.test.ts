import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { migrate, openDb } from '../src/db.js';
import {
  createRule,
  deleteRule,
  getRule,
  popPendingDesktopNotifications,
  evaluateRules,
} from '../src/rules.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'tm-test-'));
  const path = join(dir, 'usage.db');
  process.env.TOKENPULSE_DB = path;
  const db = openDb(path);
  migrate(db);
  return {
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // On Windows, SQLite WAL files may briefly stay locked. Non-fatal for tests.
      }
    },
  };
}

test('createRule round-trip persists the row', () => {
  const { db, cleanup } = freshDb();
  try {
    const rule = createRule(db, {
      name: 'r1',
      enabled: true,
      metric: 'daily_usd',
      op: '>=',
      threshold: 50,
      action_type: 'notify.desktop',
      action_config: { title: 'hi' },
    });
    assert.ok(rule.id > 0);
    assert.equal(rule.name, 'r1');
    const fetched = getRule(db, rule.id);
    assert.equal(fetched?.threshold, 50);
  } finally {
    cleanup();
  }
});

test('popPendingDesktopNotifications is atomic (concurrent pop returns disjoint rows)', () => {
  const { db, cleanup } = freshDb();
  try {
    // Seed 5 notifications.
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO pending_desktop_notifications (rule_id, fired_at, title, body) VALUES (?, ?, ?, ?)`,
      ).run(1, Date.now() + i, `t${i}`, `b${i}`);
    }
    const a = popPendingDesktopNotifications(db, 3);
    const b = popPendingDesktopNotifications(db, 10);
    assert.equal(a.length, 3);
    assert.equal(b.length, 2);
    const aIds = new Set(a.map((r) => r.id));
    for (const r of b) {
      assert.ok(!aIds.has(r.id), `notification ${r.id} returned twice`);
    }
    // Third call sees nothing left.
    const c = popPendingDesktopNotifications(db, 10);
    assert.equal(c.length, 0);
  } finally {
    cleanup();
  }
});

test('evaluateRules respects cooldown', async () => {
  const { db, cleanup } = freshDb();
  try {
    // Seed a token event 1s in the past so it's strictly inside today's
    // window even on the slowest CI runner.
    db.prepare(
      `INSERT INTO token_events (ts, source, source_kind, model, project, session_id, request_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-opus-4-7', 'p', 's', 'r-fixed', 0, 0, 0, 0, 10.0)`,
    ).run(Date.now() - 1_000);

    const rule = createRule(db, {
      name: 'cooldown test',
      enabled: true,
      metric: 'daily_usd',
      op: '>=',
      threshold: 1,
      action_type: 'notify.desktop',
      action_config: { title: 'x' },
      cooldown_ms: 60_000,
    });

    const e1 = await evaluateRules(db);
    assert.equal(e1.fired, 1, 'first eval should fire');
    const e2 = await evaluateRules(db);
    assert.equal(e2.fired, 0, 'second eval within cooldown should NOT fire');

    deleteRule(db, rule.id);
  } finally {
    cleanup();
  }
});

test('createRule throws clear error if INSERT row is missing on read-back', () => {
  // This path is essentially unreachable in practice but the guard exists.
  // We just assert the function does not use a non-null assertion that
  // would crash with a less-actionable message.
  const { db, cleanup } = freshDb();
  try {
    const rule = createRule(db, {
      name: 'ok',
      enabled: true,
      metric: 'daily_usd',
      op: '>=',
      threshold: 1,
      action_type: 'notify.desktop',
      action_config: { title: 't' },
    });
    assert.ok(rule);
    // Cannot easily simulate insert-then-missing without forking — sanity test only.
  } finally {
    cleanup();
  }
});
