// After tsc: ensure dist/cli.js has executable bit on POSIX (npm uses this
// when symlinking the bin). Shebang already comes from src/cli.ts.
const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'dist', 'cli.js');
if (!fs.existsSync(target)) {
  console.error('postbuild: dist/cli.js not found — did tsc run?');
  process.exit(1);
}

// Verify the shebang made it through.
const head = fs.readFileSync(target, 'utf-8').slice(0, 40);
if (!head.startsWith('#!/usr/bin/env node')) {
  console.error('postbuild: shebang missing in dist/cli.js. First 40 chars:', JSON.stringify(head));
  process.exit(1);
}

if (process.platform !== 'win32') {
  fs.chmodSync(target, 0o755);
}
console.log('postbuild: dist/cli.js shebang ok, exec bit set (POSIX).');
