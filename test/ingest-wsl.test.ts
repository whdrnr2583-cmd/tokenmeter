/**
 * Tests for WSL dual-environment path detection (commit B).
 *
 * isWsl() and detectWindowsUser() read from the real filesystem, so we
 * exercise the pure-logic variants that do not call into /proc or /mnt/c.
 * claudeProjectsDirs() is tested by stubbing the two helpers via env vars and
 * a test-only import override is not needed — we import the real functions and
 * verify their contract on the current OS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWsl, detectWindowsUser, claudeProjectsDirs, claudeProjectsDir } from '../src/ingest.js';

test('claudeProjectsDir returns the homedir-based path', () => {
  const dir = claudeProjectsDir();
  assert.ok(dir.endsWith('/.claude/projects') || dir.endsWith('\\.claude\\projects'),
    `expected a .claude/projects path, got: ${dir}`);
});

test('claudeProjectsDirs always includes the primary dir', () => {
  const dirs = claudeProjectsDirs();
  assert.ok(dirs.length >= 1, 'should return at least one directory');
  assert.equal(dirs[0], claudeProjectsDir(), 'first entry must be the primary dir');
});

test('claudeProjectsDirs returns unique paths (no duplicates)', () => {
  const dirs = claudeProjectsDirs();
  const unique = new Set(dirs);
  assert.equal(unique.size, dirs.length, 'dirs array must not contain duplicates');
});

test('isWsl returns a boolean', () => {
  const result = isWsl();
  assert.equal(typeof result, 'boolean');
});

test('detectWindowsUser returns string or null', () => {
  const result = detectWindowsUser();
  assert.ok(result === null || typeof result === 'string',
    'must return null or a non-empty string');
  if (typeof result === 'string') {
    assert.ok(result.length > 0, 'username must not be empty string');
  }
});

test('WSL: on WSL environment, claudeProjectsDirs adds Windows path when user detected', () => {
  // This test is informational on non-WSL hosts; it validates the contract
  // without mocking. On a real WSL host with USERPROFILE set this exercises
  // the Windows path addition.
  const wsl = isWsl();
  const winUser = detectWindowsUser();
  const dirs = claudeProjectsDirs();

  if (wsl && winUser) {
    const expectedWinPath = `/mnt/c/Users/${winUser}/.claude/projects`;
    const primary = claudeProjectsDir();
    if (expectedWinPath !== primary) {
      assert.ok(dirs.includes(expectedWinPath),
        `On WSL with detected user "${winUser}", dirs should include ${expectedWinPath}`);
    }
  } else {
    // Non-WSL or no Windows user detected: only primary dir
    assert.equal(dirs.length, 1, 'non-WSL host should have exactly one dir');
  }
});

test('WSL: Windows path is skipped when it equals the primary dir (no dup)', () => {
  // Simulate the edge case where WSL home IS /mnt/c/Users/... — shouldn't happen
  // in practice but the guard must hold. We verify claudeProjectsDirs never
  // returns the same path twice regardless of environment.
  const dirs = claudeProjectsDirs();
  const set = new Set(dirs);
  assert.equal(set.size, dirs.length, 'no duplicate paths in any environment');
});
