import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodWindowDays } from '../src/mcp.js';

test('periodWindowDays: week and month are rolling 7 / 30 days', () => {
  assert.equal(periodWindowDays('week'), 7);
  assert.equal(periodWindowDays('month'), 30);
});

test('periodWindowDays: today is the local calendar day, not a rolling 24h', () => {
  const d = periodWindowDays('today');
  // Always within the current day: 0 ≤ today < 1.
  assert.ok(d >= 0 && d < 1, `today window should be <1 day, got ${d}`);
  // The resolved start must be local midnight today, not now − 24h.
  const since = Date.now() - d * 86_400_000;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  assert.ok(Math.abs(since - midnight) < 1000, 'today window must start at local midnight');
});
