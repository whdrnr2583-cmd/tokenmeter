// Smoke test: spawn `token-meter mcp`, do the MCP handshake, list tools, call one.
const { spawn } = require('node:child_process');
const path = require('node:path');

const cwd = path.join(__dirname, '..');
const child = spawn('npx', ['tsx', 'src/cli.ts', 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'inherit'], shell: true });

let buf = '';
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  child.stdin.write(msg);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15000);
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
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});

(async () => {
  try {
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0.0.0' },
    });
    console.log('✅ initialize:', init.serverInfo);
    notify('notifications/initialized', {});

    const tools = await send('tools/list', {});
    console.log('✅ tools/list:', tools.tools.map((t) => t.name).join(', '));
    if (tools.tools.length < 4) throw new Error('expected >=4 tools');

    const summary = await send('tools/call', { name: 'usage_summary', arguments: { period: 'week' } });
    const text = summary.content?.[0]?.text ?? '';
    console.log('✅ usage_summary (first line):', text.split('\n')[0]);
    if (!text.includes('Token Meter')) throw new Error('unexpected summary output');

    const recent = await send('tools/call', { name: 'recent_sessions', arguments: { within_hours: 168 } });
    console.log('✅ recent_sessions (first line):', (recent.content?.[0]?.text ?? '').split('\n')[0]);

    const prompts = await send('prompts/list', {});
    const names = (prompts.prompts ?? []).map((p) => p.name);
    console.log('✅ prompts/list:', names.join(', '));
    const expected = ['usage_summary', 'recent_sessions', 'session_tools', 'refresh_data'];
    for (const want of expected) {
      if (!names.includes(want)) throw new Error(`missing prompt: ${want}`);
    }

    const usagePrompt = await send('prompts/get', { name: 'usage_summary', arguments: { period: 'week' } });
    const usageText = usagePrompt.messages?.[0]?.content?.text ?? '';
    if (!usageText.includes('period="week"')) throw new Error('usage_summary prompt did not echo period');
    console.log('✅ prompts/get usage_summary (period=week): ok');

    const recentPrompt = await send('prompts/get', { name: 'recent_sessions', arguments: {} });
    const recentText = recentPrompt.messages?.[0]?.content?.text ?? '';
    if (!recentText.includes('within_hours=24')) throw new Error('recent_sessions prompt did not default to 24h');
    console.log('✅ prompts/get recent_sessions (default 24h): ok');

    const refreshPrompt = await send('prompts/get', { name: 'refresh_data', arguments: {} });
    const refreshText = refreshPrompt.messages?.[0]?.content?.text ?? '';
    if (!refreshText.includes('refresh_data')) throw new Error('refresh_data prompt missing tool name');
    console.log('✅ prompts/get refresh_data: ok');

    console.log('\nAll MCP smoke checks passed.');
    child.kill();
    process.exit(0);
  } catch (err) {
    console.error('❌ MCP smoke failed:', err.message);
    child.kill();
    process.exit(1);
  }
})();
