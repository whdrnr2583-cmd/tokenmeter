import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { migrate, openDb } from '../src/db.js';
import { cacheStats, wasteSignals } from '../src/stats.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'tm-stats-test-'));
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
        // Windows may briefly lock WAL files — non-fatal for tests.
      }
    },
  };
}

let tokenSeq = 0;
function insertToken(
  db: ReturnType<typeof openDb>,
  o: {
    model?: string;
    input?: number;
    cacheRead?: number;
    cacheWrite?: number;
    ts?: number;
  },
): void {
  tokenSeq += 1;
  db.prepare(
    `INSERT INTO token_events
      (ts, source, source_kind, model, project, session_id, request_id,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       total_duration_ms, tps, usd_estimate)
     VALUES (?, 'claude_code', 'jsonl', ?, 'p', 's', ?, ?, 0, ?, ?, NULL, NULL, 0)`,
  ).run(
    o.ts ?? Date.now() - 1000,
    o.model ?? 'claude-opus-4-7',
    `req-${tokenSeq}`,
    o.input ?? 0,
    o.cacheRead ?? 0,
    o.cacheWrite ?? 0,
  );
}

let toolSeq = 0;
function insertTool(
  db: ReturnType<typeof openDb>,
  o: { tool?: string; mcp?: string | null; respTokens?: number; ts?: number },
): void {
  toolSeq += 1;
  db.prepare(
    `INSERT INTO tool_events
      (ts, source, project, session_id, tool_name, mcp_server,
       tool_use_id, response_chars, response_tokens_est, latency_ms)
     VALUES (?, 'claude_code', 'p', 's', ?, ?, ?, 0, ?, 0)`,
  ).run(
    o.ts ?? Date.now() - 1000,
    o.tool ?? 'Read',
    o.mcp ?? null,
    `tu-${toolSeq}`,
    o.respTokens ?? 0,
  );
}

test('cacheStats computes hit ratio + savings from the pricing table', () => {
  const { db, cleanup } = freshDb();
  try {
    // opus-4.7 rates per 1M: input 15, cacheRead 1.5, cacheWrite5m 18.75.
    insertToken(db, {
      model: 'claude-opus-4-7',
      input: 1_000_000,
      cacheRead: 2_000_000,
      cacheWrite: 1_000_000,
    });
    const c = cacheStats(db, 7);
    assert.equal(c.total_input, 1_000_000);
    assert.equal(c.total_cache_read, 2_000_000);
    assert.equal(c.total_cache_write, 1_000_000);
    // 2M × (15 − 1.5) / 1M = 27.0
    assert.equal(c.savings_usd, 27);
    // 1M × 18.75 / 1M = 18.75
    assert.equal(c.write_cost_usd, 18.75);
    assert.equal(c.net_usd, 8.25);
    // 2M / (1M + 2M)
    assert.ok(Math.abs(c.hit_ratio - 2 / 3) < 1e-9);
  } finally {
    cleanup();
  }
});

test('cacheStats returns zeroes for an empty window', () => {
  const { db, cleanup } = freshDb();
  try {
    const c = cacheStats(db, 7);
    assert.equal(c.hit_ratio, 0);
    assert.equal(c.savings_usd, 0);
    assert.equal(c.net_usd, 0);
  } finally {
    cleanup();
  }
});

test('wasteSignals flags a tool whose max response dwarfs its average', () => {
  const { db, cleanup } = freshDb();
  try {
    // Read: 9 small calls + 1 huge → max ≫ 5× avg and > 10k.
    for (let i = 0; i < 9; i++) {
      insertTool(db, { tool: 'Read', respTokens: 1_000 });
    }
    insertTool(db, { tool: 'Read', respTokens: 80_000 });
    // Edit: 5 uniform small calls → not an outlier.
    for (let i = 0; i < 5; i++) {
      insertTool(db, { tool: 'Edit', respTokens: 500 });
    }
    const w = wasteSignals(db, 7);
    const tools = w.tool_outliers.map((t) => t.tool_name);
    assert.ok(tools.includes('Read'));
    assert.ok(!tools.includes('Edit'));
    const read = w.tool_outliers.find((t) => t.tool_name === 'Read');
    assert.ok(read);
    assert.equal(read.calls, 10);
    assert.equal(read.max_tokens, 80_000);
  } finally {
    cleanup();
  }
});

test('wasteSignals lists days that wrote more cache than they read', () => {
  const { db, cleanup } = freshDb();
  try {
    insertToken(db, { cacheWrite: 5_000_000, cacheRead: 1_000_000 });
    const w = wasteSignals(db, 7);
    assert.equal(w.cache_waste_days.length, 1);
    assert.equal(w.cache_waste_days[0]?.cache_write, 5_000_000);
    assert.equal(w.cache_waste_days[0]?.cache_read, 1_000_000);
  } finally {
    cleanup();
  }
});

test('wasteSignals stays quiet when nothing is off', () => {
  const { db, cleanup } = freshDb();
  try {
    for (let i = 0; i < 5; i++) {
      insertTool(db, { tool: 'Edit', respTokens: 500 });
    }
    insertToken(db, { cacheWrite: 1_000_000, cacheRead: 4_000_000 });
    const w = wasteSignals(db, 7);
    assert.equal(w.tool_outliers.length, 0);
    assert.equal(w.cache_waste_days.length, 0);
  } finally {
    cleanup();
  }
});
