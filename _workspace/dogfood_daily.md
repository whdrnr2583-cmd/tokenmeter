# 본인 dogfood 일일 운영 (PMF 게이트 진행 매트릭스)

> RUNBOOK §T+24h 회고 자동화. 매일 1-3분.

---

## 매일 1회 (Claude Code 세션 끝날 때)

> ⚠️ **2026-05-17 정정**: 실사용은 WSL Claude Code(`/home/whdrnr/.claude`)에 있음.
> dogfood ingest는 **WSL(bash) 기준**으로 고정 — Windows `cmd.exe`로 돌리면
> 빈 Windows home(`C:\Users\whdrn\.claude`)만 스캔해 100배+ 과소집계됨.
> 두 home은 별도 DB(WSL `~/.tokenpulse` vs Windows `%USERPROFILE%\.tokenpulse`).

**기본 — WSL (bash, 실사용 대부분):**
```bash
npx -y @whdrnr2583/token-meter ingest    # /home/whdrnr/.claude → /home/whdrnr/.tokenpulse/usage.db
npx -y @whdrnr2583/token-meter stats 7
```

**보조 — Windows (token-meter 자체 개발분만, 선택):**
```bash
cd "/mnt/c/Users/whdrn/Desktop/money/token-pulse" && cmd.exe /c "npx -y @whdrnr2583/token-meter stats 7"
```

또는 Claude Code MCP 호출:
```
"token-meter usage_summary로 오늘 사용량 보여줘"
"token-meter recent_sessions로 최근 24시간 세션 보여줘"
```

---

## 매일 1회 체크 (1분)

- [ ] **npm 다운로드**: https://www.npmjs.com/package/@whdrnr2583/token-meter (페이지 하단 weekly downloads)
- [ ] **GitHub Star**: https://github.com/whdrnr2583-cmd/token-meter (상단 Star 카운트)
- [ ] **Tally 응답**: https://tally.so/forms/2E16vD/submissions
- [ ] **Gmail `hello@token-meter.dev`**: 라우팅 응답 1건이라도?

---

## 일별 박제 (간단)

| 날짜 | npm DL | GitHub ★ | Tally | Gmail | dogfood OK | 메모 |
|---|---|---|---|---|---|---|
| 5/13 | 0 | 0 | ? | ? | publish | v0.1.0→0.1.1 (MCP Registry mcpName) |
| 5/14 | 368* | 0 | ? | ? | ✓ | T+24h 회고 + v0.1.2 publish (serve subcommand fix + --version/--help). npx clean 검증 OK. *DL 368 = 5개 버전 균등 분포(88/112/135/98/100) → mirror·security scanner (Socket/Snyk 등) 자동 scan 추정, 실 install 0 |
| 5/15 | 0 | 0 | ? | ? | ✓ | v0.1.3 (license gating + Polar webhook + Resend) + v0.1.4 (setup) + v0.1.5 (install-mcp) 묶음 publish. D-031/D-032 박제. LEGACY 3종 archive (pmf_gate_progress / icp_interview_template / kakao_announcement_v1) |
| 5/16 | 0 | 0 | ? | ? | ✓ | dogfood 정상 — $0.7423 / 41 events / opus-4.7 위주. npm DL 0 (5/14·15 scanner burst 종료) |
| 5/17 | 183* | 0 | ? | ? | ✓ | 🔴 **dogfood 경로 버그 발견** — cmd.exe ingest는 Windows home(`C:\…\.claude`)만 스캔, 실사용은 WSL(`/home/whdrnr/.claude`)에 있음. 실제 5/17 = **$285.84 / 268 events (WSL DB)**, Windows-only는 $0.29/15뿐. WSL 7d 누적 $1924.64 (5/15 $410·5/16 $468·5/17 $285.84). 이전 메모 USD(5/16 $0.74 등)는 전부 Windows-only 과소집계 — 절차 버그(제품 버그 아님). 4-check: node_modules OS 불일치 → `npm ci` 후 40/40 통과, 배포본 npm 0.1.9 정상. *npm DL 183=5/16 final, ★0 |
| 5/18 | 19* | 0 | ? | ? | ✓ | dogfood 정상 — $177.36 / 186 events / opus-4.7 only / Codex 0. 7d 누적 $1837.44 / 2431 events. *npm DL 19 = 5/17 final(last-day API); 1주 누적 1088이나 단일일 19로 급락 = 5/14·15 scanner burst 완전 종료. ★0. W1 주간 회고 ↓섹션 |
| 5/19 | _ | _ | _ | _ | _ | W1 retention check |

---

## 주간 회고 (월요일, 5분)

- [ ] 1주 dogfood로 발견한 본인 사용 패턴 (어느 MCP / 도구 / 시간대 비쌌나)
- [ ] 1주 동안 본인이 사용하지 않은 기능 (가치 낮음 → backlog 또는 제거)
- [ ] 새로 발견한 버그 0건? 1+ 건이면 v0.1.x 패치 우선
- [ ] **PMF 게이트 진행** (`pmf_gate_progress.md` 갱신)

---

## W1 주간 회고 — 2026-05-18 (월)

> dogfood 7일차 (5/11~5/18 ingest 기준). 첫 주간 회고.

### 1. 본인 사용 패턴 (7d · $1837.44 / 2431 events)
- **모델**: 100% claude-opus-4-7. Codex 0건 — Codex 파서 코드는 있으나 본인은 Codex 미사용.
- **비용 곡선**: 5/15 $410 · 5/16 $468 피크 → 5/17 $296 · 5/18 $177(부분). 주중 후반 급증.
- **토큰 최대 소비 도구** (resp tokens): Read 392.9k · Agent 219.3k · Bash 212.6k. 파일 읽기가 컨텍스트 최대 소비원.
- **최고 지연 도구**: Agent avg 91.6s (251회) — 서브에이전트 호출이 압도적으로 느림. (AskUserQuestion 174s는 사용자 대기시간이라 비용 아님.)
- **cache**: read 660.7M / write 22.3M — 캐시 의존도 매우 높음. opus 비용의 상당 부분이 cache read.

### 2. 본인이 거의 안 쓴 기능 (가치 낮음 신호)
- **token-meter MCP 도구**: 7d 동안 usage_summary 1회 · refresh_data 1회 · recent_sessions 0 · session_tools 0.
- dogfood라면서 정작 제품 MCP를 거의 안 쓰고 CLI `stats`로만 확인 중.
- → backlog 관찰 항목 (제거 아닌 관찰): "MCP 도구 4종 중 실제 가치 있는 건 무엇인가" — 1개월 회고까지 데이터 더 누적.

### 3. 새 버그
- 제품 버그 **0건**. v0.1.x 패치 불요.
- (5/17 dogfood 경로 버그는 절차 버그 — cmd.exe→WSL home 불일치. 박제 완료, 제품 무관.)

### 4. PMF 게이트 진행
- 알파 0 / ICP 인터뷰 0 / 카톡 0 / dogfood day 6/30 진행 / Y1 ARR $0 — **모두 정체**.
- 구조적 원인: 알파·카톡·인터뷰는 outbound 필요 → D-031 outbound 차단으로 채널 자체가 비활성. dogfood만 유일하게 움직이는 지표.
- W1 사실 박제: 게이트 5조건 중 4개가 outbound에 묶여 진행 불가. W2~W4 동안 dogfood 완주 외 게이트 변동 여지 없음 — 1개월 회고 때 이 구조를 사용자와 재논의 (처방 제안 아님, 사실 기록).

---

## 1개월 회고 (PMF 게이트 1st check)

PMF 게이트 5조건 통과 여부 (`pmf_gate_progress.md`):
- 알파 W2 5명 중 3+ 사용
- 본인 dogfood 1개월 X 일 (X >= 25)
- 카톡 직접 응답 N명 (≥ 10이 시작점)
- ICP 인터뷰 5명 (Mom Test 방식)
- npm 다운로드 / GitHub Star 추이

3+ 통과 → M3 결제 wiring 진입 검토
미달 → D-021 stop-loss #2 발동 → 가격·포지셔닝 재설계 1회 → 미달 시 보류
