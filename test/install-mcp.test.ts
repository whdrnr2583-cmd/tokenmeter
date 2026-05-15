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
  MCP_PACKAGE,
  MCP_SERVER_NAME,
  mergeMcpJsonConfig,
} from '../src/install-mcp.js';

function freshConfigPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tm-install-mcp-'));
  return { dir, path: join(dir, 'sub', 'config.json') };
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test('mergeMcpJsonConfig creates file when missing', () => {
  const { dir, path } = freshConfigPath();
  try {
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'added');
    assert.ok(existsSync(path));
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    assert.equal(parsed.mcpServers[MCP_SERVER_NAME].command, 'npx');
    assert.deepEqual(parsed.mcpServers[MCP_SERVER_NAME].args, [
      '-y',
      MCP_PACKAGE,
      'mcp',
    ]);
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig is idempotent — second run is already-present', () => {
  const { dir, path } = freshConfigPath();
  try {
    mergeMcpJsonConfig(path);
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'already-present');
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig preserves existing servers (no clobber)', () => {
  const { dir, path } = freshConfigPath();
  try {
    // pre-seed with another MCP server entry
    mkdirSync(dirname(path), {
      recursive: true,
    });
    writeFileSync(
      path,
      JSON.stringify(
        {
          mcpServers: {
            'other-thing': { command: 'foo', args: ['bar'] },
          },
        },
        null,
        2,
      ),
    );
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'added');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    assert.ok(parsed.mcpServers['other-thing']);
    assert.ok(parsed.mcpServers[MCP_SERVER_NAME]);
    // backup file exists since file existed before
    assert.ok(existsSync(`${path}.bak`));
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig updates a stale entry (different args)', () => {
  const { dir, path } = freshConfigPath();
  try {
    mkdirSync(dirname(path), {
      recursive: true,
    });
    writeFileSync(
      path,
      JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_NAME]: { command: 'npx', args: ['old-package'] },
          },
        },
        null,
        2,
      ),
    );
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'updated');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    assert.deepEqual(parsed.mcpServers[MCP_SERVER_NAME].args, [
      '-y',
      MCP_PACKAGE,
      'mcp',
    ]);
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig dry-run does not write', () => {
  const { dir, path } = freshConfigPath();
  try {
    const r = mergeMcpJsonConfig(path, { dryRun: true });
    assert.equal(r.action, 'added');
    assert.equal(existsSync(path), false);
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig fails gracefully on invalid JSON', () => {
  const { dir, path } = freshConfigPath();
  try {
    mkdirSync(dirname(path), {
      recursive: true,
    });
    writeFileSync(path, '{ this is not valid json');
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'failed');
    assert.match(r.message, /not valid JSON/);
  } finally {
    cleanup(dir);
  }
});

test('mergeMcpJsonConfig handles empty config file', () => {
  const { dir, path } = freshConfigPath();
  try {
    mkdirSync(dirname(path), {
      recursive: true,
    });
    writeFileSync(path, '   \n');
    const r = mergeMcpJsonConfig(path);
    assert.equal(r.action, 'added');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    assert.ok(parsed.mcpServers[MCP_SERVER_NAME]);
  } finally {
    cleanup(dir);
  }
});
