const fs = require('fs');
const path = require('path');
const os = require('os');

const codexDir = path.join(os.homedir(), '.codex');

// 1) history.jsonl
const historyPath = path.join(codexDir, 'history.jsonl');
if (fs.existsSync(historyPath)) {
  const lines = fs.readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean);
  console.log('history.jsonl lines:', lines.length);
  const types = {};
  for (const l of lines.slice(0, 200)) {
    try {
      const o = JSON.parse(l);
      const t = o.type ?? o.event ?? Object.keys(o)[0];
      types[t] = (types[t] || 0) + 1;
    } catch {}
  }
  console.log('first 200 types:', JSON.stringify(types, null, 2));
  console.log('\nSample first line:');
  console.log(lines[0]?.slice(0, 600));
}

// 2) sessions/<year>/<month>/<day>/rollout-*.jsonl
const sessionsDir = path.join(codexDir, 'sessions');
function findSampleSession() {
  const years = fs.readdirSync(sessionsDir);
  for (const y of years.sort().reverse()) {
    const yp = path.join(sessionsDir, y);
    if (!fs.statSync(yp).isDirectory()) continue;
    const months = fs.readdirSync(yp).sort().reverse();
    for (const m of months) {
      const mp = path.join(yp, m);
      if (!fs.statSync(mp).isDirectory()) continue;
      const days = fs.readdirSync(mp).sort().reverse();
      for (const d of days) {
        const dp = path.join(mp, d);
        if (!fs.statSync(dp).isDirectory()) continue;
        const files = fs.readdirSync(dp).filter((f) => f.endsWith('.jsonl'));
        if (files.length) return path.join(dp, files[files.length - 1]);
      }
    }
  }
  return null;
}
const sample = findSampleSession();
if (sample) {
  console.log('\nSample session:', sample);
  const lines = fs.readFileSync(sample, 'utf-8').split('\n').filter(Boolean);
  console.log('Session lines:', lines.length);
  const types = {};
  const events = {};
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      const t = o.type ?? 'unknown';
      types[t] = (types[t] || 0) + 1;
      if (o.payload && o.payload.type) {
        events[o.payload.type] = (events[o.payload.type] || 0) + 1;
      }
    } catch {}
  }
  console.log('Session types:', JSON.stringify(types, null, 2));
  console.log('Session payload types:', JSON.stringify(events, null, 2));
  // Find a turn.completed
  const turnCompleted = lines.find((l) => l.includes('turn_context') || l.includes('turn.completed') || l.includes('token_count'));
  if (turnCompleted) {
    console.log('\nSample with token info (first 1500 chars):');
    console.log(turnCompleted.slice(0, 1500));
  }
  // Show last 3 lines
  console.log('\nLast 3 lines (first 500 chars each):');
  for (const l of lines.slice(-3)) {
    console.log('---');
    console.log(l.slice(0, 500));
  }
}
