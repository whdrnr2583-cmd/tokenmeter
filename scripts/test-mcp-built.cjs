// Like test-mcp.cjs but runs the BUILT dist/cli.js (not via tsx).
// This is what `npm install -g token-meter` users will execute.
const { spawn } = require('node:child_process');
const path = require('node:path');

const cwd = path.join(__dirname, '..');
const child = spawn('node', ['dist/cli.js', 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'inherit'] });

let buf = '';
const pending = new Map();
let nextId = 1;
function send(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); } }, 15000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  }
});
(async () => {
  try {
    const init = await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'built-smoke', version: '0' } });
    console.log('✅ built initialize:', init.serverInfo);
    notify('notifications/initialized', {});
    const tools = await send('tools/list', {});
    console.log('✅ built tools/list:', tools.tools.map((t) => t.name).join(', '));
    const r = await send('tools/call', { name: 'usage_summary', arguments: { period: 'week' } });
    if (!r.content?.[0]?.text?.includes('Token Meter')) throw new Error('unexpected output');
    console.log('✅ built usage_summary returned text');

    const prompts = await send('prompts/list', {});
    const names = (prompts.prompts ?? []).map((p) => p.name);
    console.log('✅ built prompts/list:', names.join(', '));
    for (const want of ['usage_summary', 'recent_sessions', 'session_tools', 'refresh_data']) {
      if (!names.includes(want)) throw new Error('missing prompt: ' + want);
    }
    const p = await send('prompts/get', { name: 'usage_summary', arguments: { period: 'month' } });
    if (!p.messages?.[0]?.content?.text?.includes('period="month"')) throw new Error('prompt arg not echoed');
    console.log('✅ built prompts/get usage_summary returned messages');

    child.kill();
    process.exit(0);
  } catch (e) { console.error('❌', e.message); child.kill(); process.exit(1); }
})();
