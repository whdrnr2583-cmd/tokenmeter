const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const db = new Database(path.join(os.homedir(), '.tokenpulse', 'usage.db'));

console.log('=== 전체 중복 패턴 분석 ===');
const dupGroups = db.prepare(`
  SELECT session_id, request_id, COUNT(*) AS dups, COUNT(DISTINCT output_tokens || '|' || cache_read_tokens || '|' || cache_write_tokens || '|' || input_tokens) AS distinct_usages,
         SUM(usd_estimate) AS sum_usd, MIN(usd_estimate) AS single_usd
  FROM token_events
  WHERE source = 'claude-code' AND request_id IS NOT NULL
  GROUP BY session_id, request_id
  ORDER BY dups DESC LIMIT 10
`).all();
console.log('Top duplicate request_ids (Claude Code):');
for (const r of dupGroups) {
  console.log(`  ${r.request_id} session=${r.session_id.slice(0,8)} dups=${r.dups} distinct_usage_combos=${r.distinct_usages} sum=$${r.sum_usd.toFixed(2)} single=$${r.single_usd.toFixed(2)}`);
}

const totals = db.prepare(`
  SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT session_id || '|' || COALESCE(request_id, '')) AS distinct_requests,
    SUM(usd_estimate) AS total_usd
  FROM token_events WHERE source = 'claude-code'
`).get();
console.log('\nClaude Code totals:');
console.log(`  rows: ${totals.total_rows}`);
console.log(`  distinct (session, request_id): ${totals.distinct_requests}`);
console.log(`  if dedup: ratio = ${(totals.distinct_requests / totals.total_rows * 100).toFixed(1)}%`);
console.log(`  current USD: $${totals.total_usd.toFixed(2)}`);

// What if we kept only one row per (session, request_id, usage tuple)?
const dedupCandidate = db.prepare(`
  WITH dedup AS (
    SELECT session_id, request_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, MAX(usd_estimate) AS usd
    FROM token_events WHERE source = 'claude-code' AND request_id IS NOT NULL
    GROUP BY session_id, request_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
  )
  SELECT COUNT(*) AS rows, SUM(usd) AS usd FROM dedup
`).get();
console.log(`\nIf dedup by (session, requestId, full usage tuple):`);
console.log(`  rows: ${dedupCandidate.rows}`);
console.log(`  USD: $${dedupCandidate.usd.toFixed(2)}`);

const dedupByReq = db.prepare(`
  WITH dedup AS (
    SELECT session_id, request_id, MAX(usd_estimate) AS usd
    FROM token_events WHERE source = 'claude-code' AND request_id IS NOT NULL
    GROUP BY session_id, request_id
  )
  SELECT COUNT(*) AS rows, SUM(usd) AS usd FROM dedup
`).get();
console.log(`\nIf dedup by (session, requestId) only (keep max usd):`);
console.log(`  rows: ${dedupByReq.rows}`);
console.log(`  USD: $${dedupByReq.usd.toFixed(2)}`);

console.log('\n=== 단일 JSONL 직접 분석 ===');
const sampleDir = path.join(os.homedir(), '.claude', 'projects', 'C--Users-whdrn-Desktop-money');
const files = fs.readdirSync(sampleDir).filter((f) => f.endsWith('.jsonl'));
const target = '1f4f193b-16fb-4afa-ad0f-3e35483d81a7.jsonl';
const sampleFile = files.includes(target) ? target : files[0];
const filePath = path.join(sampleDir, sampleFile);
const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

const reqGroups = new Map();
for (const line of lines) {
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  if (obj.type !== 'assistant' || !obj.message?.usage || !obj.requestId) continue;
  const u = obj.message.usage;
  if (!reqGroups.has(obj.requestId)) reqGroups.set(obj.requestId, []);
  reqGroups.get(obj.requestId).push({
    ts: obj.timestamp,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_creation_input_tokens ?? 0,
    has_iterations: Array.isArray(u.iterations) && u.iterations.length > 0,
    content_types: Array.isArray(obj.message.content) ? obj.message.content.map((c) => c.type) : [],
  });
}

let multiCount = 0;
let totalRequests = reqGroups.size;
let firstShown = false;
for (const [reqId, entries] of reqGroups.entries()) {
  if (entries.length === 1) continue;
  multiCount++;
  if (!firstShown && entries.length >= 2) {
    firstShown = true;
    console.log(`\nSample multi-entry request: ${reqId}`);
    for (const e of entries) {
      console.log(`  ts=${e.ts} input=${e.input} output=${e.output} cache_r=${e.cache_read} cache_w=${e.cache_write} content=[${e.content_types.join(',')}]`);
    }
    // Are all usage tuples identical?
    const allSame = entries.every(
      (e) =>
        e.input === entries[0].input &&
        e.output === entries[0].output &&
        e.cache_read === entries[0].cache_read &&
        e.cache_write === entries[0].cache_write,
    );
    console.log(`  All usage tuples identical: ${allSame}`);
  }
}
console.log(`\nFile ${sampleFile}:`);
console.log(`  distinct request_ids: ${totalRequests}`);
console.log(`  requests with >1 assistant entry: ${multiCount}`);
console.log(`  multi ratio: ${(multiCount / totalRequests * 100).toFixed(1)}%`);

// Now check: for multi-entry requests, are tuples always identical?
let identicalCount = 0;
let differingCount = 0;
let differExamples = [];
for (const [reqId, entries] of reqGroups.entries()) {
  if (entries.length === 1) continue;
  const allSame = entries.every(
    (e) =>
      e.input === entries[0].input &&
      e.output === entries[0].output &&
      e.cache_read === entries[0].cache_read &&
      e.cache_write === entries[0].cache_write,
  );
  if (allSame) identicalCount++;
  else {
    differingCount++;
    if (differExamples.length < 2) {
      differExamples.push({ reqId, entries });
    }
  }
}
console.log(`  multi-entry with IDENTICAL usage: ${identicalCount}`);
console.log(`  multi-entry with DIFFERING usage: ${differingCount}`);
if (differExamples.length) {
  console.log('  Differing examples:');
  for (const ex of differExamples) {
    console.log(`    ${ex.reqId}`);
    for (const e of ex.entries) {
      console.log(`      input=${e.input} output=${e.output} cache_r=${e.cache_read} cache_w=${e.cache_write}`);
    }
  }
}
