# PMF 게이트 진행 매트릭스 (M3 결제 wiring 진입 조건) — **🛑 LEGACY (2026-05-14)**

> **🛑 LEGACY 마킹 (2026-05-14)**: D-031 사용자 명시 결정으로 본 게이트는 **결제 wiring 진입 차단 조건으로 폐기**.
> 외부 채널 (카톡 / Reddit / ICP 인터뷰) 모두 outbound 차단되어 카운트 영영 0. 본인 dogfood만 측정 의미 유지.
> 코드·박제는 보존하되 매트릭스 갱신·작업 진행 X. 사용자 본인 명시 갱신 시에만 재활성.
>
> 박제 출처: 04-risks.md §4.4 M3 KPI / §4.9 페르소나 검증 게이트 / D-021 stop-loss / D-025 현실 KPI / D-029 M3 보류 / **D-031 outbound 차단**
> ~~**3+ 통과 시 결제 wiring 진입 검토. 미통과 시 Pro $5 출시 금지 (메타룰 정합).**~~ (D-031로 폐기)

---

## 5조건 매트릭스

| # | 조건 | 박제 기준 | 측정 방법 | 현재 (2026-05-13) | 통과 |
|---|---|---|---|---|---|
| 1 | 알파 W2 사용 | 5명 중 3+ | 베타 사용자에게 2주 후 직접 확인 | 0/0 | ❌ |
| 2 | 본인 dogfood | 1개월 (25+ 일) | `dogfood_daily.md` 일별 박제 | 0/25 | ❌ |
| 3 | 카톡 직접 응답 | 50명 (D-025) | 카톡 메시지 발송 후 응답자 카운트 | 0/50 | ❌ |
| 4 | ICP 인터뷰 | 클라우드 5명 + 로컬 5명 | Mom Test, `icp_interview_template.md` | 0/10 | ❌ |
| 5 | Y1 ARR base | $2k (D-025) | 결제 wiring 후만 측정 가능 | $0 | ❌ |

---

## Stop-loss 트리거 (D-021 / D-025 / 04-risks §4.7)

다음 중 하나라도 발생 시 **즉시 일시 중단**:
- [ ] 8주 안에 알파 못 띄움 (목표 2026-07-08)
- [ ] 본업·v18·us-advisor·koreanpulse 운영 차질
- [ ] 사용자 룰 위반 (트랙·자본·5거래일 욕망)
- [ ] 6개월 누적 매출 $200 + 시간 200h 초과 (목표 점검 2026-11-13)
- [ ] M1 PMF 게이트 2회 연속 미달
- [ ] "이걸로 1억 벌겠다" 자기 기만 발생 → 본업·v18 회복 우선 모드 전환

---

## 결제 wiring (M3) 진입 결정 로직

```
IF (게이트 3+ 통과) AND (8주 캡 안 침범) AND (본업 영향 0):
    M3 진입 검토 (단 추가 사용자 인터뷰 5명 → 결제 시점 결정)
ELSE:
    Pro $5 wiring 금지
    Pro+ / 로컬 LLM / Team 모두 동결
    오직 Free OSS dogfood + 인터뷰 + 카톡 응답 수집만 진행
```

---

## 주간 갱신 (매주 월요일)

| 주 | 알파 사용 | dogfood 일 | 카톡 응답 | 인터뷰 누적 | npm DL | GitHub ★ | 통과 |
|---|---|---|---|---|---|---|---|
| W1 (~5/19) | _/3 | _/7 | _/50 | _/10 | _ | _ | _ |
| W2 (~5/26) | _/3 | _/14 | _/50 | _/10 | _ | _ | _ |
| W3 (~6/2) | _/3 | _/21 | _/50 | _/10 | _ | _ | _ |
| W4 (~6/9) | _/3 | _/28 | _/50 | _/10 | _ | _ | _ |

---

## 마일스톤 회고 (월말)

## 2026-05-20 W1 dogfood 마감 시 작업 (예약)

- [ ] dogfood 7일 박제 검토 (`dogfood_daily.md` 표)
- [ ] **awesome-mcp-servers PR 재진행** (`listing_drafts.md` §단계 2 개정 — Glama 사전 등재 의무)
  - [ ] Glama.ai 등재 + score badge URL 받기 (30분-1시간)
  - [ ] fork sync (whdrnr2583-cmd/awesome-mcp-servers)
  - [ ] Monitoring 섹션 정확한 위치 + badge 포함 entry
  - [ ] cross-fork PR 생성 (직접 URL `punkpeye/awesome-mcp-servers/compare/main...whdrnr2583-cmd:...`)
- [ ] 카톡 알림 1차 발송 (RUNBOOK §T+10, `kakao_announcement_v1.md`)
- [ ] ICP 인터뷰 5명 콜드 DM 시작 (`icp_interview_template.md`)

### 1개월 회고 (~2026-06-13)
- [ ] dogfood 25+ 일 통과?
- [ ] 인터뷰 5+ 누적?
- [ ] 카톡 응답 10+?
- [ ] 본인 dogfood 발견: 가장 가치 있는 기능 1개 / 거의 사용 안 한 기능 1개
- [ ] W4 retention (자기 자신 기준) 70%+?

### 3개월 회고 (~2026-08-13)
- [ ] 결제 wiring 진입 결정 (5조건 3+ 통과 시) — D-021 stop-loss #3 가드
- [ ] 또는 OSS 단독 모드 전환 (수익화 보류) — D-025 폐기/유지 분기

### 6개월 회고 (~2026-11-13)
- [ ] 누적 매출 $200 도달? 시간 200h 초과? → stop-loss 발동 여부
- [ ] 본업·v18·us-advisor·koreanpulse 정량 영향 0 검증
- [ ] project_reality_pin.md 재읽기 + "Token Meter가 매매 알파 음수 회피 행동인가?" 정직 답변

---

## 결제 wiring 진입 시 작업 (예약, 진입 결정 전엔 X)

1. **Polar.sh 가입** + Pro $5 상품 등록
2. **CF Workers + D1 deploy** (`infra/api/` 코드 — Polar webhook + license verify)
3. **`api.token-meter.dev` 커스텀 도메인** 연결
4. **CLI `src/license.ts` 작성** + `token-meter activate <key>` 명령 추가
5. **라이선스 게이팅 활성화** (Free 7일 / Pro 30일 / Pro+ 무제한)
6. **Resend 발신 도메인 검증** + DKIM
7. **첫 결제자 본인 카드** 테스트 1회 → 환불 검증
8. **Pro 결제 페이지** 랜딩에 추가 (이 시점 Connect to Git 자동 배포 검토)

예상 소요 시간: 10~15시간 (RUNBOOK §M3 추정).
**진입 결정 없이 시작 금지** (D-021 stop-loss + 사용자 메타룰 위반).
