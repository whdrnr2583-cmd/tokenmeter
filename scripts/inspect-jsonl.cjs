const fs = require('fs');
const path = require('path');
const os = require('os');

const projectDir = path.join(os.homedir(), '.claude', 'projects', 'C--Users-whdrn-Desktop-money');
const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
console.log('Project files:', files.length);

const sample = path.join(projectDir, files[0]);
const lines = fs.readFileSync(sample, 'utf-8').split('\n').filter(l => l.length > 0);
console.log('Sample file:', files[0]);
console.log('Total lines:', lines.length);

const types = {};
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    types[obj.type] = (types[obj.type] || 0) + 1;
  } catch {}
}
console.log('Types:', JSON.stringify(types, null, 2));

const assistantLine = lines.find(l => l.includes('"type":"assistant"') && l.includes('usage'));
if (assistantLine) {
  const obj = JSON.parse(assistantLine);
  console.log('\n=== Sample assistant message ===');
  console.log('Top keys:', Object.keys(obj));
  if (obj.message) {
    console.log('Message keys:', Object.keys(obj.message));
    console.log('Model:', obj.message.model);
    console.log('Usage:', JSON.stringify(obj.message.usage, null, 2));
  }
  console.log('Timestamp:', obj.timestamp);
  console.log('SessionId:', obj.sessionId);
}

const toolUseLine = lines.find(l => l.includes('"tool_use"'));
if (toolUseLine) {
  const obj = JSON.parse(toolUseLine);
  console.log('\n=== Sample tool_use container ===');
  if (obj.message && obj.message.content) {
    const tu = obj.message.content.find(c => c.type === 'tool_use');
    if (tu) {
      console.log('Tool name:', tu.name);
      console.log('Tool id:', tu.id);
    }
  }
}

const toolResultLine = lines.find(l => l.includes('"tool_result"'));
if (toolResultLine) {
  const obj = JSON.parse(toolResultLine);
  console.log('\n=== Sample tool_result ===');
  if (obj.message && obj.message.content) {
    const tr = Array.isArray(obj.message.content) ? obj.message.content.find(c => c.type === 'tool_result') : null;
    if (tr) {
      console.log('Tool use id:', tr.tool_use_id);
      console.log('Content type:', typeof tr.content);
      const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
      console.log('Content length:', contentStr.length);
    }
  }
}
