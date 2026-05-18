import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  commandTemplate,
  installClaudeCodeCommand,
} from '../src/install-command.js';

function freshTarget(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tm-install-cmd-'));
  return { dir, path: join(dir, '.claude', 'commands', 'token-meter.md') };
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test('installClaudeCodeCommand creates the file when missing', () => {
  const { dir, path } = freshTarget();
  try {
    const r = installClaudeCodeCommand({ targetPath: path });
    assert.equal(r.action, 'added');
    assert.ok(existsSync(path));
    assert.equal(readFileSync(path, 'utf8'), commandTemplate());
  } finally {
    cleanup(dir);
  }
});

test('installClaudeCodeCommand is idempotent — re-run is already-present', () => {
  const { dir, path } = freshTarget();
  try {
    installClaudeCodeCommand({ targetPath: path });
    const r = installClaudeCodeCommand({ targetPath: path });
    assert.equal(r.action, 'already-present');
    // No backup file should be written on idempotent runs
    assert.equal(existsSync(`${path}.bak`), false);
  } finally {
    cleanup(dir);
  }
});

test('installClaudeCodeCommand updates a stale managed file and writes .bak', () => {
  const { dir, path } = freshTarget();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      '# old token-meter command\n\nthis is from @whdrnr2583/token-meter v0.0.0\n',
    );
    const r = installClaudeCodeCommand({ targetPath: path });
    assert.equal(r.action, 'updated');
    assert.equal(readFileSync(path, 'utf8'), commandTemplate());
    assert.ok(existsSync(`${path}.bak`));
  } finally {
    cleanup(dir);
  }
});

test('installClaudeCodeCommand refuses to overwrite an unmanaged file', () => {
  const { dir, path } = freshTarget();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const handRolled = '# my custom command\n\nhello world\n';
    writeFileSync(path, handRolled);
    const r = installClaudeCodeCommand({ targetPath: path });
    assert.equal(r.action, 'skipped');
    assert.equal(r.ok, false);
    // Original content untouched, no .bak created
    assert.equal(readFileSync(path, 'utf8'), handRolled);
    assert.equal(existsSync(`${path}.bak`), false);
  } finally {
    cleanup(dir);
  }
});

test('installClaudeCodeCommand dry-run does not write when missing', () => {
  const { dir, path } = freshTarget();
  try {
    const r = installClaudeCodeCommand({ targetPath: path, dryRun: true });
    assert.equal(r.action, 'added');
    assert.equal(existsSync(path), false);
  } finally {
    cleanup(dir);
  }
});

test('installClaudeCodeCommand dry-run does not write when stale', () => {
  const { dir, path } = freshTarget();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '# old @whdrnr2583/token-meter file\n');
    const r = installClaudeCodeCommand({ targetPath: path, dryRun: true });
    assert.equal(r.action, 'updated');
    // File content unchanged, no backup
    assert.equal(readFileSync(path, 'utf8'), '# old @whdrnr2583/token-meter file\n');
    assert.equal(existsSync(`${path}.bak`), false);
  } finally {
    cleanup(dir);
  }
});

test('commandTemplate has the usage_summary call + Pro hint, no $-digit arg trap', () => {
  const t = commandTemplate();
  assert.ok(t.includes('usage_summary'));
  assert.ok(t.includes('Pro'));
  assert.ok(t.includes('https://token-meter.dev'));
  // A `$` followed by a digit in a slash-command file is treated as a
  // positional argument and substituted away (e.g. `$5` → ``). The price
  // must not contain a $-digit sequence.
  assert.ok(!/\$\d/.test(t));
});
