import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { migrate, openDb } from '../src/db.js';
import {
  forecastMonthly,
  getMonthlyBudget,
  setMonthlyBudget,
} from '../src/forecast.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'tm-forecast-'));
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

/** Epoch ms for a specific calendar date at midnight local time. */
function dateMs(isoDate: string): number {
  return new Date(isoDate + 'T00:00:00').getTime();
}

test('forecastMonthly returns zero projection when no events', () => {
  const { db, cleanup } = freshDb();
  try {
    // 15th of a month → 15 days elapsed
    const asOf = dateMs('2026-05-15');
    const result = forecastMonthly(db, asOf);
    assert.equal(result.actual_usd, 0);
    assert.equal(result.projected_eom_usd, 0);
    assert.equal(result.pace_usd_per_day, 0);
    assert.equal(result.monthly_budget_usd, null);
    assert.equal(result.budget_pct_today, null);
  } finally {
    cleanup();
  }
});

test('forecastMonthly linear extrapolation is correct', () => {
  const { db, cleanup } = freshDb();
  try {
    // Seed 10 days of spend: $1/day for the first 10 days of May 2026.
    // Use noon (43200 s) so events are safely inside the day window.
    for (let d = 1; d <= 10; d++) {
      const ts = dateMs(`2026-05-${String(d).padStart(2, '0')}`) + 43_200_000;
      db.prepare(
        `INSERT INTO token_events
          (ts, source, source_kind, model, project, session_id, request_id,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           usd_estimate)
         VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', 'p', 's',
                 ?, 100, 100, 0, 0, 1.0)`,
      ).run(ts, `req-${d}`);
    }

    // Evaluate at May 10 23:59:00 — all 10 events are in scope.
    const asOf = dateMs('2026-05-10') + 86_340_000; // 23:59
    const result = forecastMonthly(db, asOf);

    assert.equal(result.days_elapsed, 10, 'days_elapsed');
    assert.equal(result.days_in_month, 31, 'days_in_month');
    assert.ok(
      Math.abs(result.actual_usd - 10.0) < 0.01,
      `actual_usd expected ~10.0 got ${result.actual_usd}`,
    );
    // pace = 10 / 10 = 1.0 / day; projected = 1.0 × 31 = 31.0
    assert.ok(
      Math.abs(result.pace_usd_per_day - 1.0) < 0.001,
      `pace expected 1.0 got ${result.pace_usd_per_day}`,
    );
    assert.ok(
      Math.abs(result.projected_eom_usd - 31.0) < 0.1,
      `projected EOM expected ~31.0 got ${result.projected_eom_usd}`,
    );
  } finally {
    cleanup();
  }
});

test('forecastMonthly budget_pct fields when budget is set', () => {
  const { db, cleanup } = freshDb();
  try {
    setMonthlyBudget(db, 20.0);
    // Use noon so the event is safely inside the asOf window.
    const ts = dateMs('2026-05-05') + 43_200_000;
    db.prepare(
      `INSERT INTO token_events
        (ts, source, source_kind, model, project, session_id, request_id,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         usd_estimate)
       VALUES (?, 'claude-code', 'cloud', 'claude-sonnet-4-5', 'p', 's',
               'req-b', 0, 0, 0, 0, 10.0)`,
    ).run(ts);

    const asOf = dateMs('2026-05-05') + 86_340_000; // 23:59
    const result = forecastMonthly(db, asOf);

    assert.equal(result.monthly_budget_usd, 20.0);
    assert.ok(result.budget_pct_today !== null);
    // 10 / 20 = 0.5
    assert.ok(Math.abs(result.budget_pct_today! - 0.5) < 0.01, 'budget_pct_today');
    assert.ok(result.budget_pct_projected !== null);
  } finally {
    cleanup();
  }
});

test('setMonthlyBudget round-trips via getMonthlyBudget', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.equal(getMonthlyBudget(db), null);
    setMonthlyBudget(db, 50.0);
    assert.equal(getMonthlyBudget(db), 50.0);
    setMonthlyBudget(db, null);
    assert.equal(getMonthlyBudget(db), null);
  } finally {
    cleanup();
  }
});

test('setMonthlyBudget rejects non-positive values', () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(() => setMonthlyBudget(db, 0), RangeError);
    assert.throws(() => setMonthlyBudget(db, -1), RangeError);
  } finally {
    cleanup();
  }
});
