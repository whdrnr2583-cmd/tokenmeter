import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const COMMAND_NAME = 'token-meter';

export type CommandClient = 'claude-code';

export type CommandAction =
  | 'added'
  | 'already-present'
  | 'updated'
  | 'skipped'
  | 'failed';

export type CommandInstallResult = {
  client: CommandClient;
  ok: boolean;
  action: CommandAction;
  configPath?: string;
  message: string;
};

export type CommandInstallOptions = {
  dryRun?: boolean;
  /** Override the target file path. Test seam — production code uses `claudeCodeCommandPath()`. */
  targetPath?: string;
};

export function claudeCodeCommandPath(): string {
  return join(homedir(), '.claude', 'commands', `${COMMAND_NAME}.md`);
}

/**
 * The markdown body installed at ~/.claude/commands/token-meter.md.
 * Invoked by typing `/token-meter` in Claude Code. The body is a prompt
 * template that asks the agent to call the token-meter MCP `usage_summary`
 * tool and present the result, plus a one-block hint about other commands
 * and the Pro tier.
 *
 * Pure function so the test suite can compare byte-for-byte.
 */
export function commandTemplate(): string {
  return `---
description: Token Meter — 오늘 사용량 + MCP·도구별 분해 + 다른 명령 / Pro 안내
allowed-tools: mcp__token-meter__usage_summary, mcp__token-meter__recent_sessions, mcp__token-meter__session_tools, mcp__token-meter__refresh_data
---

# Token Meter — 한눈에 보기

다음 단계를 정확히 따르세요. 사용자에게 보여줄 출력 외 코멘트는 생략.

1. token-meter MCP 서버의 \`usage_summary\` 도구를 \`period="today"\`로 호출합니다.
2. 그 응답 텍스트를 그대로 보여주세요 (오늘 비용 + 이벤트 + 모델별 + 프로젝트 + MCP·도구별 top이 이미 포함됩니다).
3. 응답 아래에 다음 안내 블록을 한 글자도 바꾸지 말고 그대로 출력하세요:

\`\`\`
──────────────────────────────────
다른 슬래시·명령
  /mcp__token-meter__recent_sessions   최근 닫은 터미널 세션 + claude --resume 명령
  /mcp__token-meter__session_tools     특정 session_id의 도구·MCP 사용 분해
  /mcp__token-meter__refresh_data      JSONL 재스캔 후 최신 수치

  npx @whdrnr2583/token-meter stats 7  CLI 7일 요약
  npx @whdrnr2583/token-meter serve    대시보드 http://localhost:8765

Pro \$5/월 — 세션 드릴다운 · 비용 예측·페이스 · CSV/JSON export · 커스텀 가격 매트릭스
  → https://token-meter.dev
──────────────────────────────────
\`\`\`

도구 호출이 실패하면 (서버 미등록, 데이터 없음, 오류 메시지 등):
- 한 줄로 원인 + \`npx -y @whdrnr2583/token-meter install-mcp claude-code\` 안내.
- Pro 안내 블록은 출력하지 마세요.
`;
}

const SIGNATURE = '<!-- managed-by: @whdrnr2583/token-meter -->';

function isManagedFile(content: string): boolean {
  // Our template doesn't include the signature comment in v0.1.7;
  // we treat any existing token-meter command file that mentions our
  // package as "ours" so re-install upgrades cleanly. Users who want
  // a hand-rolled command should remove the file before running install.
  return (
    content.includes(SIGNATURE) ||
    content.includes('@whdrnr2583/token-meter')
  );
}

export function installClaudeCodeCommand(
  opts: CommandInstallOptions = {},
): CommandInstallResult {
  const dryRun = opts.dryRun === true;
  const target = opts.targetPath ?? claudeCodeCommandPath();
  const desired = commandTemplate();

  let existed = false;
  let existingContent = '';
  if (existsSync(target)) {
    existed = true;
    try {
      existingContent = readFileSync(target, 'utf8');
    } catch (err) {
      return {
        client: 'claude-code',
        ok: false,
        action: 'failed',
        configPath: target,
        message: `Could not read existing file at ${target}: ${(err as Error).message}`,
      };
    }
  }

  if (existed && existingContent === desired) {
    return {
      client: 'claude-code',
      ok: true,
      action: 'already-present',
      configPath: target,
      message: `${target} is already up to date — no change.`,
    };
  }

  if (existed && !isManagedFile(existingContent)) {
    return {
      client: 'claude-code',
      ok: false,
      action: 'skipped',
      configPath: target,
      message:
        `${target} already exists and does not look like a token-meter file. ` +
        `Refusing to overwrite. Move it aside (or delete) and re-run, or edit it by hand.`,
    };
  }

  if (dryRun) {
    return {
      client: 'claude-code',
      ok: true,
      action: existed ? 'updated' : 'added',
      configPath: target,
      message: existed
        ? `[dry-run] Would update ${target} (backup: ${target}.bak).`
        : `[dry-run] Would create ${target}.`,
    };
  }

  mkdirSync(dirname(target), { recursive: true });

  if (existed) {
    try {
      copyFileSync(target, `${target}.bak`);
    } catch (err) {
      return {
        client: 'claude-code',
        ok: false,
        action: 'failed',
        configPath: target,
        message: `Could not back up ${target}: ${(err as Error).message}`,
      };
    }
  }

  try {
    writeFileSync(target, desired, 'utf8');
  } catch (err) {
    return {
      client: 'claude-code',
      ok: false,
      action: 'failed',
      configPath: target,
      message: `Could not write ${target}: ${(err as Error).message}`,
    };
  }

  return {
    client: 'claude-code',
    ok: true,
    action: existed ? 'updated' : 'added',
    configPath: target,
    message: existed
      ? `Updated ${target} (backup: ${target}.bak). Restart Claude Code or open a new session to load the new /token-meter command.`
      : `Created ${target}. Restart Claude Code or open a new session, then type \`/token-meter\`.`,
  };
}

export function installCommand(
  client: CommandClient,
  opts: CommandInstallOptions = {},
): CommandInstallResult[] {
  if (client === 'claude-code') return [installClaudeCodeCommand(opts)];
  throw new Error(`Unknown client: ${client as string}`);
}
