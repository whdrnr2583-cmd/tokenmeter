import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Static analysis regression: ensure user-controlled JSONL fields (model,
// project, tool_name, mcp_server, session_id, rule name) are never
// interpolated raw into innerHTML in public/app.js. They must go through esc().
test('app.js innerHTML interpolations escape user-controlled string fields', () => {
  const src = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  const userFields = [
    'r.model',
    'r.project',
    'r.tool_name',
    'r.mcp_server',
    'r.top_model',
    'r.name',         // rule.name
    'r.session_id',
    'overview.session_id',
    'overview.project',
    'err.message',
  ];
  const offenders: string[] = [];
  for (const f of userFields) {
    // Look for `${field}` not wrapped in esc(...) — i.e. `${r.model}` without `esc(`
    const re = new RegExp(String.raw`\$\{${f.replace(/\./g, '\\.')}(?:\s*\?\?\s*[^}]+)?\}`, 'g');
    let m;
    while ((m = re.exec(src))) {
      // Check 5 chars before for `esc(` — if absent, it's a raw interpolation.
      const before = src.slice(Math.max(0, m.index - 5), m.index);
      if (!before.includes('esc(')) {
        offenders.push(`raw \`${m[0]}\` at offset ${m.index} (context: …${src.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20)}…)`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Found ${offenders.length} unescaped user-field interpolation(s):\n${offenders.join('\n')}`);
});

test('app.js exports an esc() helper that handles HTML metacharacters', () => {
  const src = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  assert.match(src, /const esc = /, 'esc() function should exist');
  assert.match(src, /&amp;/, 'esc should map &');
  assert.match(src, /&lt;/, 'esc should map <');
  assert.match(src, /&gt;/, 'esc should map >');
  assert.match(src, /&quot;/, 'esc should map "');
  assert.match(src, /&#39;/, "esc should map '");
});
