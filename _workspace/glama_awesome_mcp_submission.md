# Glama 등재 통과 + awesome-mcp-servers 재등재 가이드

> 목적: LLM 웹검색·에이전트가 Token Meter MCP를 찾도록 awesome-mcp-servers
> (LLM이 가장 많이 인용하는 MCP 리스트)에 등재. 2026-05-16 작성.
> 이 파일은 `_workspace/` 라서 npm 패키지에 포함 안 됨 (작업용 메모).

---

## 배경 (왜 이 작업)

- awesome-mcp-servers PR **#6297**은 메인테이너 거부가 아니라 **본인이 8분 만에 self-close**
  (2026-05-13 14:26 생성 → 14:34 닫음). 봇이 `glama-check` 요구사항을 단 직후.
- 봇 요구: ① **Glama에 등재 + 모든 체크 통과** → ② **PR에 Glama score 배지 추가**.
- Token Meter는 **이미 Glama에 자동 등재됨**: `glama.ai/mcp/servers/whdrnr2583-cmd/token-meter`
  (License A / Maintenance B). 단 **"This server cannot be installed" / Quality: Not tested**.
- MCP 서버 자체는 정상 (로컬 smoke test `initialize`/`tools/list` 전부 통과).
  → 실제 버그가 아니라 **Glama 샌드박스가 실행 방법을 모르는 것** = 설정만 하면 됨.

작업 순서: **Part A (Glama 통과) → Part B (PR 재제출)**. B는 A가 끝난 뒤에.

---

## Part A — Glama 체크 통과시키기

Glama 사이트는 영어입니다. 아래 한국어 단계대로 클릭하세요.

### A-1. Glama 로그인
1. `https://glama.ai` 접속 → 우상단 **Sign in**.
2. **Sign in with GitHub** 선택 → `whdrnr2583-cmd` 계정으로 인증.
   (GitHub 계정이 곧 서버 소유권 증명이 됨.)

### A-2. 소유권 자동 연결 (claim)
`whdrnr2583-cmd`는 **개인 계정(User)** 으로 확인됨 (GitHub API `type: User`).
→ Glama 규칙상 **개인 계정 소유 서버는 GitHub 로그인만 하면 자동 연결**.
별도 "Claim" 버튼 클릭도, `glama.json` 파일 추가도 불필요.
(조직 계정이었으면 repo 루트에 `glama.json` 추가가 필요했음 — 해당 없음.)

1. A-1에서 `whdrnr2583-cmd` 계정으로 로그인 완료 상태인지 확인.
   - claim/관리 옵션은 **로그인 후에만** 보임. 로그아웃 상태면 상단에 `Sign Up`만 뜸.
2. 로그인 상태로 서버 페이지 다시 열기:
   `https://glama.ai/mcp/servers/whdrnr2583-cmd/token-meter`
3. 소유자로 인식되면 페이지에 **관리/편집 옵션**(설정 아이콘 · Edit · 체크 재실행 등)이
   나타남. 이걸로 A-3 진행.
4. 그래도 관리 옵션이 안 보이면 페이지의 **Need Help? (Discord)** 링크로 문의.

### A-3. Dockerfile 설정 (체크 통과의 핵심)
**확인됨**: Glama `Dockerfile` 탭은 자유 입력이 아니라 **항목 폼**. 항목을 채우면
Glama가 Dockerfile을 자동 생성하고, repo를 git clone → build → 실행 → introspection 검사.
GitHub repo 커밋 불필요 — Glama UI 폼에만 입력 (npm 패키지·버전 영향 0).

상단 탭 **`Dockerfile`** → 폼에서 **아래 3개만** 기본값에서 변경, 나머지는 기본값 유지:

| 폼 항목 | 기본값 | 입력할 값 | 이유 |
|---|---|---|---|
| Node.js version | `24` | `22` | better-sqlite3가 Node 22 prebuilt 보유 → 컴파일 불필요. Node 24는 prebuilt 없어 빌드 실패 위험 (이미지에 C++ 컴파일러 없음). 22 = 프로젝트 검증 버전 |
| Build steps | `["pnpm install","pnpm run build"]` | `["npm install", "npm run build"]` | npm 프로젝트 (pnpm 락파일 없음) |
| CMD arguments | `["mcp-proxy","--","node","dist/cli.js"]` | `["mcp-proxy", "--", "node", "dist/cli.js", "mcp"]` | **필수** — `mcp` 인자 빼면 MCP 서버 대신 CLI 도움말만 뜨고 종료 → introspection 실패 |

기본값 유지: Base image (`debian:trixie-slim`) · Python version · Environment variables
schema · Placeholder parameters (`{}`) · Pinned commit SHA.

→ **Save** → 새 Test 자동 실행. 빌드 로그·결과는 Recent Tests 에서 확인.

### A-4. 릴리스 생성 + 통과 확인
1. Save 후 Build test가 자동 실행. **Status: success** 로 끝나야 함
   (서버가 `initialize` / `tools/list` / `prompts/list` 에 응답하면 성공).
   - 2026-05-16 17:30 test `019e2fe8…` = ✅ success 20s 확인됨.
2. Glama는 성공한 test에서 **릴리스를 생성해야** 리스팅이 "설치 가능"으로 전환됨.
   성공 test 항목 또는 **Recent Releases** 섹션의 **`Create release`** 버튼 클릭.
3. 릴리스 후 페이지 새로고침 → **"cannot be installed" 사라지고** Score 부여 확인.
4. 배지 렌더 확인: `https://glama.ai/mcp/servers/whdrnr2583-cmd/token-meter/badges/score.svg`

> A가 끝나기 전엔 B로 넘어가지 마세요. PR을 먼저 올리면 봇이 또
> `missing-glama` 라벨을 붙이고 막힙니다.

---

## Part B — awesome-mcp-servers PR 재제출

Glama 체크가 통과한 뒤 진행. GitHub 웹 UI만으로 됩니다 (git CLI 불필요).

### B-1. README 편집 화면 열기 (자동 fork)
1. `https://github.com/punkpeye/awesome-mcp-servers/blob/main/README.md` 접속.
2. 우상단 **연필(✏️) 아이콘** 클릭 → GitHub가 자동으로 본인 계정에 fork 생성.

### B-2. Monitoring 섹션에 한 줄 추가
1. 편집기에서 `Ctrl+F` → `## <a name="monitoring"></a>` 또는 `### 📊` 검색.
2. Monitoring 섹션 목록 중 알파벳 순으로 **`t`** 근처
   (`TANTIOPE/datadog-mcp-server` ~ `ThinkneoAI` ~ `tumf` 사이)에 아래 줄을 **그대로** 붙여넣기:

```
- [whdrnr2583-cmd/token-meter](https://github.com/whdrnr2583-cmd/token-meter) [![whdrnr2583-cmd/token-meter MCP server](https://glama.ai/mcp/servers/whdrnr2583-cmd/token-meter/badges/score.svg)](https://glama.ai/mcp/servers/whdrnr2583-cmd/token-meter) 📇 🏠 🍎 🪟 🐧 - Local-first dashboard + MCP server for Claude Code and Codex token usage. Cost, per-MCP/per-tool breakdown, hourly distribution, and session drill-down — your data never leaves your machine.
```

이모지 의미 (리스트 Legend 기준 — 정확함):
`📇` TypeScript · `🏠` 로컬 서비스 · `🍎`mac `🪟`Windows `🐧`Linux (CI 3-OS 검증됨).

### B-3. PR 생성
1. 편집기 우상단 **Commit changes** → 다음 값 입력:
   - Commit message: `Add whdrnr2583-cmd/token-meter to Monitoring`
   - **Create a new branch ... and start a pull request** 선택 → **Propose changes**.
2. PR 작성 화면에서:

**PR Title (영어, 그대로 복사):**
```
Add whdrnr2583-cmd/token-meter (Monitoring)
```

**PR Description (영어, 그대로 복사):**
```
Adds Token Meter to the Monitoring section.

- Repo: https://github.com/whdrnr2583-cmd/token-meter
- Glama: https://glama.ai/mcp/servers/whdrnr2583-cmd/token-meter
- npm: https://www.npmjs.com/package/@whdrnr2583/token-meter

A local-first dashboard + MCP server that parses the JSONL files Claude Code
and Codex already write to disk, and reports token cost, per-MCP/per-tool
breakdown, hourly distribution, and session drill-down. MIT-licensed, runs
fully offline, no API keys required.

Glama listing is live and the score badge is included in the entry.
```

3. **Create pull request** 클릭.

### B-4. PR 후속
- 봇이 다시 `glama-check` 코멘트를 달면 = Glama 체크가 아직 미통과 → Part A로 돌아가기.
- 봇이 통과 라벨만 달고 조용하면 = 메인테이너 머지 대기. 며칠~몇 주 걸릴 수 있음.
- **이번엔 PR을 닫지 말 것.** 닫은 게 #6297 실패의 원인이었음.

---

## 검증 체크리스트 (2026-05-16 갱신)

- [x] A: Glama 로그인 — `whdrnr2583-cmd` 개인 계정 자동 연결
- [x] A: Dockerfile 폼 설정 — Node 22 / `["npm install","npm run build"]` /
      CMD `["mcp-proxy","--","node","dist/cli.js","mcp"]`
- [x] A: Build test **success** (`019e2fe8…` 20s) → "cannot be installed" 사라짐 +
      install server / try in browser 버튼 노출
- [x] B: README Monitoring 섹션 엔트리 추가 — 배지 링크 `)](` 정상 (raw 검증)
- [x] B: **PR #6432** 생성 + 봇 통과 (`has-glama` / `valid-name` / `has-emoji`,
      check-submission Successful) — `mergeable_state: clean`
- [ ] B: 메인테이너(punkpeye) 머지 대기 — **PR 닫지 말 것**, 추가 작업 없음
- [ ] 머지 후 → LLM 검색 재probe ("Claude Code token usage MCP server"에 노출되나)

---

## 부록: Dockerfile 메모

- Dockerfile은 **A-3 참조** — 확인 결과 Glama는 run command 입력란이 없고
  Dockerfile 탭만 있으므로 **Dockerfile 등록은 선택이 아니라 필수**.
- Glama UI의 Dockerfile 탭에만 추가 — GitHub repo 커밋 불필요.
- stdio 트랜스포트라 EXPOSE/포트 불필요.
- 만약 Glama 빌드 로그에서 better-sqlite3 관련 에러가 나면, Dockerfile의
  apt-get 줄이 빌드 도구를 깔아주므로 대개 통과. 그래도 실패 시 빌드 로그 확보.

---

## 알려진 사소한 버그 (이 작업과 별개, 나중에 패치)

- MCP `initialize` 응답의 서버 version 이 `0.1.0` 으로 박혀 있음 (패키지는 0.1.8).
  표기 버그 — 기능 영향 없음. 차후 v0.1.x 패치 때 server 메타 version 동기화.
