# Token Meter UX·성능 진단 (2026-05-19)

진단 범위: 엔드유저가 Token Meter 제품을 설치·사용하는 모든 표면.
메이커 개인용 `/tokenmeter` 슬래시 커맨드는 스코프 제외.
코드 수정 없음. 발견·측정·권고 only.

---

## 작업 B — 정량 측정: 토큰 footprint · 지연

### B-1. MCP 서버 세션당 고정 컨텍스트 overhead

매 대화 세션마다 MCP 클라이언트가 서버 metadata를 컨텍스트에 올린다.

| 항목 | 크기(자) | 토큰(rough ÷4) |
|---|---|---|
| instructions 블록 | 539 | ~134 |
| tool descriptions 4개 합산 | 419 | ~103 |
| title 중복 (tool title = annotation title) | ~200 | ~50 |
| prompt descriptions 4개 합산 | ~270 | ~66 |
| inputSchema JSON 표현 | ~400 | ~100 |
| **합계** | **~1,800** | **~450 tokens** |

판정: 허용 범위. Context7(~600), Notion MCP(~700+)와 비교하면 오히려 가볍다.
"토큰 측정 도구가 컨텍스트를 무겁게 한다"는 주관적 체감이나 실제로는 낮은 편.

### B-2. MCP 도구별 응답 크기

| 도구 | 일반 응답 | 최대 응답 | 비고 |
|---|---|---|---|
| usage_summary(today) | ~200 tokens | ~300 tokens | heavy user (5모델·5프로젝트·5MCP) |
| recent_sessions(24h, limit=15) | ~623 tokens | ~700 tokens | **문제: default limit=15 과다** |
| session_tools(limit=20) | ~250 tokens | ~500 tokens | 20개 도구는 드문 케이스 |
| refresh_data | ~15 tokens | ~15 tokens | 무해 |

**핵심 발견 B-2**: recent_sessions default limit=15가 실질적 문제.
- 세션 1개 = header(~10 tokens) + ageStr + source + usd + ev(~8 tokens) + session_id 36자(~9 tokens) + resume 명령(~15 tokens) = ~40 tokens/세션
- 15개 = 600 tokens. 사용자가 원하는 건 "최근 1-3개 세션"이 대부분.

### B-3. /token-meter 슬래시 커맨드 (install-command 후)

- 파일 크기: 452자, **~113 tokens** (호출 시 system prompt 삽입)
- allowed-tools로 usage_summary 1개만 허용 → 추가 tool 호출 없음 → 안전한 footprint
- 단, 이 커맨드는 `install-command claude-code` 별도 실행을 요구 (발견성 문제 → C절)

### B-4. CLI (token-meter stats / npx @whdrnr2583/token-meter stats)

| 상태 | 지연 | 원인 |
|---|---|---|
| 콜드 (npx cache miss) | 2-8초 | npm download (~87KB tarball) + better-sqlite3 native binary install |
| 웜 (npx cache hit) | 0.3-1초 | Node.js ESM 모듈 로딩 |

- 출력 크기: 터미널 텍스트, 토큰 소비 없음 (LLM context에 안 올라감)
- 콜드 스타트 2-8초는 `token-meter`가 전역 설치되어 있지 않은 npx 경로일 때. 전역 설치 사용자는 0.3-1초.

### B-5. 대시보드 (token-meter serve)

| 리소스 | 크기 | 비고 |
|---|---|---|
| HTML | 7.2KB | 적절 |
| CSS | 6.8KB | 적절 |
| app.js | 21.5KB | 적절 |
| **chart.js CDN** | **205KB** | **외부 의존성, 오프라인 불가** |
| 합계 | ~240KB | 첫 로드 기준 |

- API 호출: 9개 Promise.all 병렬 (설계 양호)
- Fastify 부팅: ~200ms
- **문제**: chart.js가 CDN(jsdelivr)에서만 오며 패키지에 포함되지 않음
  - 오프라인 환경(사내망, 비행기)에서 차트가 빈다
  - Token Meter의 "100% offline" 포지셔닝과 모순
- **문제**: `REPLACE_ME` 미치환 URL이 index.html line 109에 잔존
  - `https://github.com/REPLACE_ME/token-meter/...` → broken link

### B-6. npm 패키지 footprint

| 항목 | 크기 |
|---|---|
| tarball (엔드유저 다운로드) | 87.2KB |
| 압축 해제 후 | 320KB |
| .map 파일 (엔드유저 불필요) | ~80KB (16개) |

- `.map` 파일이 배포에 포함됨. `files` 배열에서 제외하면 tarball ~40KB 절감 가능.

---

## "토큰 아이러니" 실재 여부 판정

**판정: 체감은 실재, 규모는 과장.**

| 표면 | 실제 footprint | 판정 |
|---|---|---|
| MCP 서버 metadata | ~450 tokens/세션 | 경쟁 MCP 대비 낮음, 문제 아님 |
| usage_summary 1회 | ~200 tokens | 합리적 |
| recent_sessions 기본값(15개) | ~620 tokens | 실제 문제. default=5로 줄여야 함 |
| /token-meter 슬래시 커맨드 | ~113 tokens | 무해 |
| chart.js CDN 205KB | 네트워크 지연 | "offline-first" 모순, 신뢰성 문제 |
| CLI 콜드 스타트 | 2-8초 | 인식되는 "무거움"의 주된 원인 |

아이러니의 실제 원인은 두 가지:
1. `npx` 콜드 스타트 2-8초 → 터미널에서 처음 쓰는 사람이 "무겁다" 체감
2. `recent_sessions` default 15개 → LLM 응답에 session_id 15줄이 나열됨 → "많이 쓴다" 체감

---

## 작업 C — 발견성·힌트형태·바로바로 진단

### C-1. 설치 후 온보딩 경로

설치 직후(npm install / npx 최초 실행) 엔드유저에게 노출되는 안내:
- postinstall hook: **없음**
- first-run 메시지: **없음**
- README 퀵스타트는 존재하나 npm 페이지에서만 보임

엔드유저 입장의 실제 경로:
```
npm install -g @whdrnr2583/token-meter
token-meter --help       ← 처음 치는 명령
```
→ USAGE 문자열 출력 (7개 명령 나열). 어느 것을 먼저 실행해야 하는지 우선순위 없음.
`ingest` → `stats` 순서가 필수인데 이를 명시한 힌트가 없음.

**발견 C-1**: 첫 실행 시 "먼저 ingest를 실행하세요" 안내가 없다.
`stats` 바로 실행하면 빈 DB로 "0 events" 출력 → 제품이 안 되는 것처럼 보임.

### C-2. MCP 도구 힌트 가독성

엔드유저가 `/` 입력 시 보이는 MCP prompt 목록:

| 실제 표시되는 슬래시 명령 | 제목 |
|---|---|
| `/mcp__token-meter__usage_summary` | Token Meter — usage summary |
| `/mcp__token-meter__recent_sessions` | Token Meter — recent sessions |
| `/mcp__token-meter__session_tools` | Token Meter — session tools |
| `/mcp__token-meter__refresh_data` | Token Meter — refresh data |

**발견 C-2a**: `/mcp__token-meter__` 접두사가 32-34자. 자동완성 없으면 타이핑이 비현실적.
**발견 C-2b**: 4개 제목 모두 "Token Meter — " prefix로 시작 → 목록에서 구분이 어려움.
  - 좋은 예: `usage_summary: 오늘 비용`, `recent_sessions: 최근 세션`, ...
  - 현재: "Token Meter — usage summary" / "Token Meter — recent sessions" → 차이가 뒤에만 있음
**발견 C-2c**: `session_tools`는 `session_id` 필수 파라미터가 있는데, `/` 입력 시 이를 먼저 알 수 없다. 실행하면 파라미터 입력 창이 뜨지만 "어떤 세션 ID를 넣어야 하는가"가 불명확.

### C-3. "오늘 얼마 썼어?" 경로별 단계 수

| 경로 | 단계 수 | 체감 지연 | 마찰 |
|---|---|---|---|
| 자연어 → MCP usage_summary | 4단계 | 1-3초 | 낮음 (MCP 등록됐을 때) |
| /mcp__token-meter__usage_summary | 4단계 | 1-3초 | 높음 (32자 타이핑) |
| /token-meter (install-command 후) | 4단계 | 1-3초 | 낮음 (단, 사전 설치 필요) |
| CLI npx stats | 3단계 | 0.3-8초 | 중간 (콜드 스타트 변동) |
| 대시보드 | 7단계 | 2-5초 | 높음 (serve 먼저 켜야 함) |

**발견 C-3**: 가장 빠른 경로는 "자연어 → MCP" 또는 "/token-meter 슬래시"이나,
둘 다 사전 셋업(install-mcp + install-command)이 필요하고 README에서 이 두 커맨드가
Quick Start의 3·4번째 옵션으로 묻혀 있다. 가장 중요한 진입점이 강조되지 않음.

### C-4. install-mcp vs install-command 분리 혼란

엔드유저 관점:
- `install-mcp all` = MCP 서버 등록 (4개 도구 사용 가능)
- `install-command claude-code` = `/token-meter` 단축 슬래시 추가

이 둘이 별개 명령임을 사용자가 인지해야 한다.
현재 README Quick Start:
```
npx @whdrnr2583/token-meter install-mcp all   ← 4번째 줄에 위치
```
`install-command`는 README에 없고 docs/mcp-server.md의 "Short `/token-meter`" 섹션에만 있다.

**발견 C-4**: `/token-meter` 가장 편한 진입점인데, 설치 경로가 secondary doc에 숨어 있다.

---

## 수정 권고 (우선순위순)

### P0 — Quick Win (commit 1개, commit-gate 경유 필요)

**[P0-1] recent_sessions default limit 15 → 5로 변경**
- 파일: `src/mcp.ts` line 121
- 근거: 15개 * ~40 tokens = ~620 tokens 낭비. 5개면 ~200 tokens.
- 분류: quick win
- commit-gate: 필요 (test 통과 확인)

**[P0-2] index.html REPLACE_ME 치환**
- 파일: `public/index.html` line 109
- `REPLACE_ME` → `whdrnr2583-cmd`
- 분류: quick win, broken link 수정
- commit-gate: 필요

**[P0-3] MCP 도구 title 앞부분 제거 (prefix 중복 해소)**
- 파일: `src/mcp.ts` title 필드
- 현재: `"Token Meter — usage summary"` → 권고: `"usage summary (Token Meter)"`
- 효과: / 목록에서 구별자가 앞에 와서 스캔하기 쉬워짐
- 분류: quick win
- commit-gate: 필요

### P1 — 설계 필요 (각 1-2시간, commit-gate 경유 필요)

**[P1-1] chart.js를 패키지에 번들**
- 현재: CDN `https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js`
- 권고: `public/vendor/chart.min.js`로 복사하여 `files`에 포함, index.html src 수정
- 근거: "100% offline" 포지셔닝 일관성. 현재 차트가 오프라인에서 빈다.
- tarball 증가: ~205KB (압축 후 ~80KB)
- 분류: 설계 필요 (postbuild 스크립트에서 복사 추가)
- commit-gate: 필요

**[P1-2] CLI 최초 실행 시 ingest 안내 추가**
- 현재: `token-meter stats`가 빈 DB면 그냥 "0 events" 출력
- 권고: events=0이면 "Run `token-meter ingest` first to scan your JSONL files." 한 줄 추가
- 파일: `src/cli.ts` printOverview 함수 내부 또는 stats 분기
- 분류: 설계 필요 (minor)
- commit-gate: 필요

**[P1-3] setup 명령에 install-command 자동 포함**
- 현재: `token-meter setup <key>` = activate + shell rc 추가
- 권고: activate + shell rc + install-mcp all + install-command claude-code 한 번에
- 근거: 유료 전환 후 가장 좋은 UX를 즉시 받아야 함
- 파일: `src/cli.ts` setup 분기
- 분류: 설계 필요
- commit-gate: 필요

### P2 — 낮은 우선순위 (결제 통과 후 검토)

**[P2-1] .map 파일 배포 제외**
- `package.json` files 배열에서 `dist/*.map` 제외 또는 `.npmignore` 추가
- tarball ~87KB → ~47KB (46% 절감)
- commit-gate: 필요

**[P2-2] recent_sessions session_id 앞 8자만 표시**
- `1f4f193b-16fb-4afa-ad0f-3e35483d81a7` → `1f4f193b…`
- resume 명령에는 전체 ID 유지
- 토큰 절감: 세션당 ~7 tokens
- commit-gate: 필요

**[P2-3] MCP startup ingestAll blocking 완화**
- 현재: startMcpServer 안에서 `ingestAll(db)` 동기 실행 (server.connect 전)
- 대용량 JSONL(수백 파일) 최초 실행 시 1-10초 blocking 가능
- 권고: `setImmediate` 또는 `server.connect` 후 비동기로 옮기기
- 실제 영향: 증분 ingest 기준 대부분 <100ms이므로 P2
- commit-gate: 필요

---

## 요약 표

| ID | 표면 | 발견 | 분류 | 급여 |
|---|---|---|---|---|
| B-2 | MCP recent_sessions | default 15개 = ~620 tokens 낭비 | quick win | P0 |
| B-5 | 대시보드 | chart.js CDN 의존 = offline 모순 | 설계 필요 | P1 |
| B-5 | 대시보드 | REPLACE_ME 미치환 broken link | quick win | P0 |
| B-4 | CLI | 콜드 스타트 2-8초 (npx) | 구조적 한계 | P2 |
| C-1 | CLI 온보딩 | ingest 없이 stats → 0 events | 설계 필요 | P1 |
| C-2 | MCP 슬래시 | /mcp__token-meter__ 32자 prefix | 구조적 한계 (MCP spec) | P1 workaround |
| C-2 | MCP 슬래시 | title 중복 prefix "Token Meter — " | quick win | P0 |
| C-4 | 온보딩 | install-command가 secondary doc에 숨어 있음 | 설계 필요 | P1 |
