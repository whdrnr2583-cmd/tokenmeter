/**
 * Tests for WSL dual-environment path detection.
 *
 * isWsl() and scanWindowsUserDirs() read the real filesystem, so these tests
 * verify the contract on the current OS rather than mocking.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWsl,
  scanWindowsUserDirs,
  claudeProjectsDirs,
  claudeProjectsDir,
} from '../src/ingest.js';

test('claudeProjectsDir returns the homedir-based path', () => {
  const dir = claudeProjectsDir();
  assert.ok(
    dir.endsWith('/.claude/projects') || dir.endsWith('\\.claude\\projects'),
    `expected a .claude/projects path, got: ${dir}`,
  );
});

test('claudeProjectsDirs always includes the primary dir first', () => {
  const dirs = claudeProjectsDirs();
  assert.ok(dirs.length >= 1, 'should return at least one directory');
  assert.equal(dirs[0], claudeProjectsDir(), 'first entry must be the primary dir');
});

test('claudeProjectsDirs returns unique paths (no duplicates)', () => {
  const dirs = claudeProjectsDirs();
  assert.equal(new Set(dirs).size, dirs.length, 'dirs must not contain duplicates');
});

test('isWsl returns a boolean', () => {
  assert.equal(typeof isWsl(), 'boolean');
});

test('scanWindowsUserDirs returns an array of existing paths under the subpath', () => {
  const dirs = scanWindowsUserDirs('.claude/projects');
  assert.ok(Array.isArray(dirs), 'must return an array');
  for (const d of dirs) {
    assert.ok(d.startsWith('/mnt/c/Users/'), `entry should be under /mnt/c/Users/: ${d}`);
    assert.ok(d.endsWith('/.claude/projects'), `entry should end with the subpath: ${d}`);
  }
  if (!isWsl()) {
    assert.equal(dirs.length, 0, 'off WSL, scanWindowsUserDirs returns []');
  }
});

test('claudeProjectsDirs: extra dirs come from scanWindowsUserDirs, primary stays first', () => {
  const dirs = claudeProjectsDirs();
  assert.equal(dirs[0], claudeProjectsDir(), 'first entry is the primary dir');
  const scanned = scanWindowsUserDirs('.claude/projects');
  for (const d of dirs.slice(1)) {
    assert.ok(scanned.includes(d), `extra dir ${d} should come from scanWindowsUserDirs`);
  }
  if (!isWsl()) {
    assert.equal(dirs.length, 1, 'non-WSL host has exactly one dir');
  }
});
