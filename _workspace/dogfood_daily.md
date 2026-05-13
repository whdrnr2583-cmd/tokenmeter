# 본인 dogfood 일일 운영 (PMF 게이트 진행 매트릭스)

> RUNBOOK §T+24h 회고 자동화. 매일 1-3분.

---

## 매일 1회 (Claude Code 세션 끝날 때)

```powershell
cd C:\Users\whdrn\Desktop\money\token-pulse
npx -y @whdrnr2583/token-meter ingest
npx -y @whdrnr2583/token-meter stats 7
```

또는 Claude Code MCP 호출:
```
"token-meter usage_summary로 오늘 사용량 보여줘"
"token-meter recent_sessions로 최근 24시간 세션 보여줘"
```

---

## 매일 1회 체크 (1분)

- [ ] **npm 다운로드**: https://www.npmjs.com/package/@whdrnr2583/token-meter (페이지 하단 weekly downloads)
- [ ] **GitHub Star**: https://github.com/whdrnr2583-cmd/tokenmeter (상단 Star 카운트)
- [ ] **Tally 응답**: https://tally.so/forms/2E16vD/submissions
- [ ] **Gmail `hello@token-meter.dev`**: 라우팅 응답 1건이라도?

---

## 일별 박제 (간단)

| 날짜 | npm DL | GitHub ★ | Tally | Gmail | dogfood OK | 메모 |
|---|---|---|---|---|---|---|
| 5/13 | _ | _ | _ | _ | _ | publish |
| 5/14 | _ | _ | _ | _ | _ | |
| 5/15 | _ | _ | _ | _ | _ | |
| 5/16 | _ | _ | _ | _ | _ | |
| 5/17 | _ | _ | _ | _ | _ | |
| 5/18 | _ | _ | _ | _ | _ | |
| 5/19 | _ | _ | _ | _ | _ | W1 retention check |

---

## 주간 회고 (월요일, 5분)

- [ ] 1주 dogfood로 발견한 본인 사용 패턴 (어느 MCP / 도구 / 시간대 비쌌나)
- [ ] 1주 동안 본인이 사용하지 않은 기능 (가치 낮음 → backlog 또는 제거)
- [ ] 새로 발견한 버그 0건? 1+ 건이면 v0.1.x 패치 우선
- [ ] **PMF 게이트 진행** (`pmf_gate_progress.md` 갱신)

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
