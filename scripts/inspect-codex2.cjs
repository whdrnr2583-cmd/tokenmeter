const fs = require('fs');
const path = require('path');
const os = require('os');

const codexDir = path.join(os.homedir(), '.codex');
const sessionsDir = path.join(codexDir, 'sessions');

function findRecent() {
  const out = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  }
  walk(sessionsDir);
  return out.sort().slice(-3);
}

const recent = findRecent();
console.log('Recent sessions:', recent.length);

for (const f of recent) {
  console.log('\n========', path.basename(f));
  const lines = fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean);
  let meta;
  let tokenCounts = [];
  let firstResponseItem;
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      if (o.type === 'session_meta') meta = o;
      if (o.type === 'event_msg' && o.payload?.type === 'token_count') tokenCounts.push(o);
      if (!firstResponseItem && o.type === 'response_item' && o.payload?.role === 'assistant')
        firstResponseItem = o;
    } catch {}
  }
  if (meta) {
    console.log('session_meta keys:', Object.keys(meta));
    console.log('payload keys:', Object.keys(meta.payload ?? {}));
    console.log('payload:', JSON.stringify(meta.payload, null, 2).slice(0, 1500));
  }
  console.log('token_count events:', tokenCounts.length);
  if (tokenCounts[0]) {
    console.log('first token_count payload:', JSON.stringify(tokenCounts[0].payload, null, 2).slice(0, 1500));
  }
  if (firstResponseItem) {
    console.log('first assistant response_item keys:', Object.keys(firstResponseItem));
    console.log('payload keys:', Object.keys(firstResponseItem.payload ?? {}));
  }
}
