# 카톡 1차 알림 메시지 (v1, 2026-05-13 publish day +0) — **🛑 LEGACY (2026-05-14)**

> **🛑 LEGACY 마킹 (2026-05-14)**: D-031 사용자 결정으로 카톡 알림 발송 자체 폐기. Outbound 채널 전면 차단.
> 메시지 본문 보존 (재활성 시 reference). 발송 작업 진행 X.
>
> ~~RUNBOOK §T+10 "조용한 첫 공개". 본인이 시점·채널 선택 후 발송.~~ (D-031로 폐기)
> ~~**HN/Reddit/Twitter 영문 GTM 적극 push는 1-2주 dogfood + v0.1.x 패치 1-2회 후 (RUNBOOK 박제).**~~ (D-031로 폐기)

---

## 메시지 본문 (한국어 카톡 AI 오픈채팅방)

```
Token Meter v0.1.0 공개했습니다.
Claude Code + Codex 토큰 사용량 로컬 대시보드 + MCP 서버 (무료, MIT, PC 안에서만).

설치:
  npm install -g @whdrnr2583/token-meter
  token-meter ingest && token-meter serve   # localhost:8765 대시보드

Claude Code MCP 등록:
  claude mcp add token-meter -- npx -y @whdrnr2583/token-meter mcp
  → Claude Code에서 "최근 세션 보여줘" / "이번 주 비용 요약" 가능

특징:
- MCP·도구별 토큰 분해 (어느 MCP가 가장 많이 쓰는지)
- 세션 드릴다운 (어떤 세션이 비쌌나)
- USD 환산 (Max 플랜 사용해도 종량제 기준 얼마였는지)

베타: https://token-meter.dev
GitHub: https://github.com/whdrnr2583-cmd/tokenmeter

피드백 환영합니다. 본인은 매일 dogfood 중.
```

---

## 발송 채널 분기

### 1순위 (오늘 또는 내일 가능)
- AI 코딩 한국 카톡 오픈채팅방 1-2개 (본인 가입 중인 곳만)

### 2순위 (1주 후, v0.1.x 패치 후)
- HN Show (영문 paste-back 패턴, `user_english_barrier.md` 의무)
- r/ClaudeAI / r/Codex 게시
- 본인 X (Twitter) 1줄 + 스크린샷

### 의도적으로 안 함 (사용자 박제)
- 메일 magazine / Substack — 사용자 영어 장벽
- Product Hunt — 인디 SaaS 함정 (트래픽만 ↑, retention X)
- 카톡 가족·지인 채널 — 사적 친분 활용 메타룰 위반

---

## 응대 정책 (도착 메시지 응답)

- 기능 요청 / 버그: **본인 직접 응답** (D-020 박제: Gemini 자동 응답 미설정)
- "Pro $5 언제?": "정확한 시점 미정. 베타 1-2개월 후 검토" — PMF 게이트 통과 전엔 결제 wiring X
- "MCP 응답 토큰 분해 신기" → 좋아하는 부분 박제 (마케팅 카피 학습 데이터)
- "그냥 ccusage 쓰면 됨" → 차이점 1줄: "ccusage는 Claude Code만. Token Meter는 Codex + MCP 분해 + 시간대별"

---

## 박제 (발송 후 갱신)

- [ ] 발송 시각: ____
- [ ] 발송 채널: ____
- [ ] 1시간 안 응답: ____ 건
- [ ] 24시간 안 응답: ____ 건
- [ ] Tally 응답 (베타 가입): ____ 명
- [ ] 부정 응답·반론: ____ (RUNBOOK §피드백 흡수 작업으로)
