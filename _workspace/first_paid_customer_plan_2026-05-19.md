# 첫 유료 고객 1명 확보 플랜 + 가격 검토 — 2026-05-19

> 산출 목적: Lucid 머니 전략 라운드 결론("token-meter 1개 집중, 마일스톤 = 첫 유료 고객 1명")의
> 실행 플랜. 코드 변경·커밋·publish 없음 — 플랜 문서만. 가격/인프라 숫자는 실제 파일 cross-check.
> 출처: 03-business.md, STRATEGY.md, src/license.ts, src/server.ts, src/cli.ts, infra/site/index.html,
> README.md, _workspace/dogfood_30d_retro_2026-05-14.md, _workspace/wtp_validation_kakao.md,
> _workspace/investigation_2026-05-19.md.

---

## 0. 사실 확인 (cross-check 완료)

### 가격 — 3개 소스 일치 ✅
| 소스 | 값 |
|---|---|
| `infra/site/index.html:153,162` | Pro `$5/mo`, Subscribe 버튼 `$5/mo` |
| `README.md:100` | Pro `$5/mo` |
| `03-business.md:9` / `STRATEGY.md:60` | Pro `$5/월` |
| Polar 체크아웃 | `buy.polar.sh/polar_cl_blIZX...` 단일 링크 (가격은 Polar 대시보드 측, 코드엔 미노출) |

→ **현재 월 구독가 = $5/mo 단일.** 3개 소스 모두 일치, 단일 라인 신뢰 아님.

### 연간 가격 — **문서상만 존재, 라이브 미배선** ⚠️
- `03-business.md:27` "연납 17% 할인 Pro $50/년" 박제 존재.
- 그러나 `infra/site/index.html`에 annual/yearly/yr 문자열 0건. Polar 링크는 monthly 하나뿐.
- → **연납은 현재 결제 불가.** 박제는 했으나 wiring 안 됨.

### 게이팅 default-ON이 실제 강제하는 것 (코드 확인)
`src/license.ts` + `src/server.ts` + `src/cli.ts` 기준, 라이선스 없으면 Free로 resolve.
Free가 막히는 지점 (402 paywall 또는 clamp):

| Free 제약 | 코드 위치 | 동작 |
|---|---|---|
| 히스토리 7일 cap | `license.ts:51` `HISTORY_CAP.free=7` / `cli.ts:412` / `server.ts:118` | 30일 요청 시 7일로 clamp + stderr 안내 |
| 알림 룰 1개 cap | `license.ts:57` `FREE_RULE_CAP=1` / `server.ts:179` | 2번째 룰 생성 시 `402 rule_count_over_1` |
| 알림 액션 desktop만 | `license.ts:58` `FREE_ACTION_TYPES={notify.desktop}` / `server.ts:175,206` | webhook/email 룰 생성 시 `402 action_type:...` |
| 세션 드릴다운 전체 차단 | `server.ts:257,267,276,285` | `/api/sessions*` 4개 라우트 전부 `402 session_drilldown` |
| 캐시 효율 + 낭비 신호 | `cli.ts:428-435` | Free는 출력 안 함 + "Pro" 안내 |
| escape hatch | `license.ts:60-66` | `TOKEN_METER_GATING=0` → 전부 Pro+ (dev/dogfood용) |

→ **게이팅은 진짜로 작동 중.** Pro 결제 시스템(Polar checkout→webhook→license)도 라이브
(`license.ts` 헤더 주석 + `infra/api/src/index.ts` webhook). 즉 **지금 누가 $5 내면 자동으로
Pro가 켜진다.** 첫 결제를 가로막는 건 기술이 아니라 *수요·발견·전환*이다.

### 운영/인프라 비용 (월)
- Cloudflare Pages(랜딩) + Workers(API) + D1(DB) + Registrar 도메인: **사실상 $0/월.**
  - CF Pages/Workers/D1 모두 Free tier 내 (트래픽 결제 0건 수준). 도메인 `token-meter.dev`만
    연 ~$10 (CF Registrar, 월 환산 <$1).
- Resend(이메일 알림)는 아직 미배선 — 배선해도 Free tier 3,000통/월 = $0.
- Polar: 거래 수수료만 (~6% + $0.40/건). 고정 월비 0.
- **결론: token-meter 월 고정 운영비 ≈ $0 (도메인 연 $10 제외).** D-005/D-023 정합 — 새 인프라 0.

---

## 작업 1 — 첫 유료 고객 확보 플랜

### 1. ICP 정의 — 추정 아닌 "제품이 실제로 푸는 pain"에서 도출

**제품이 *실제로* 잘 푸는 pain 3개** (dogfood 30d 데이터로 검증된 것만):

1. **"이번 달 비용이 왜 이렇게 나왔는지 retroactive로 모른다"** — dogfood에서 peak day 1개
   (4/27 $400)가 30d의 23%. 평균값이 거짓말. token-meter는 일자별·세션별로 그 peak를 짚어줌.
2. **"세션 하나가 왜 오래/비싸게 걸렸는지 디버깅 불가"** — Agent 도구 평균 131초. `session_tools`
   + 세션 드릴다운(Pro)이 정확히 이걸 푼다.
3. **"Claude Code + Codex를 둘 다 쓰는데 통합 뷰가 없다"** — 네이티브는 % 잔여만, ccusage는
   Claude Code only. token-meter Free가 유일하게 둘을 한 화면에.

**제품이 *못 푸는/검증 안 된* pain** (정직 박제 — ICP에서 제외):
- MCP·도구별 분해는 STRATEGY가 "핵심 차별점"이라 부르지만, **dogfood 본인은 MCP 3건/3,163**.
  본인이 페르소나 A("MCP 헤비유저")가 아님. MCP 차별점은 *마케팅 카피로는 약하다.* 비용 통증이
  훨씬 보편적.
- 로컬 LLM/GPU = Pro+ 영역, M4+ 동결. ICP 아님.

**→ ICP (첫 결제자 단 1명의 초상):**

> **"Claude Code를 종량제(API key) 또는 Max 플랜으로 매일 쓰는, 월 체감 지출 $50+ 의 개인
> 빌더/인디 해커. 최근에 '청구서 보고 놀란' 경험이 있고, Codex도 병행한다. 비용을 *통제*하고
> 싶지만 ccusage는 Claude-only라 반쪽이고 네이티브 %는 정보가 없다고 느낀다."**

핵심: **헤비 + 최근 놀란 경험 + 멀티 클라이언트.** "헤비"가 아니면 $5 ROI(03-business §3.2:
캐주얼 $20 유저는 ROI -$2~+$3)가 안 나온다 → 첫 결제자는 반드시 *미들~헤비*. 캐주얼은
무료 사용자로 두고 절대 결제 타깃 삼지 말 것.

세그먼트 우선순위:
| 세그먼트 | WTP | 도달성 | 우선 |
|---|---|---|---|
| 헤비 인디 빌더 (API key 종량제, 청구서 직접 봄) | ★★★ | 카톡 AI방·HN | **1순위** |
| Max 플랜 헤비 (한도 도달 불안) | ★★ | 동일 | 2순위 (단 "이미 정액이라 왜 더 내" 인지 마찰) |
| 팀/회사 비용 담당 | ★★★ | 도달 어려움 (outbound 룰) | 보류 |
| 캐주얼 | ★ | — | **제외** |

### 2. 현 퍼널 진단 — 단계별 leak

```
설치(npm install)
   │  현 상태: npx 1줄. install-mcp / install-command 헬퍼 있음.
   │  ⚠ LEAK 1: README Quick start가 `ingest` → `stats` → `serve` → `mcp` 4줄.
   │           첫 실행에 무엇부터인지 모호. "ingest 먼저 안 하면 빈 화면" 함정
   │           (MEMORY: 설계 3건 중 '첫실행 ingest 함정' 우선순위 1위).
   ▼
사용 (가치 첫 경험 = "내 비용 숫자를 본다")
   │  현 상태: stats / serve / MCP usage_summary 어디로든 숫자 나옴.
   │  ⚠ LEAK 2: WSL 듀얼 환경에서 Windows쪽 Claude 로그 누락 → 숫자가 절반
   │           (investigation A: WSL homedir만 스캔). ICP가 WSL+Windows 혼용이면
   │           "내 비용이 이상하게 적게 나온다" → 신뢰 상실 → 이탈.
   ▼
gating 노출 (Free 한계에 부딪힘 = Pro 가치 인지)
   │  현 상태: 코드상 작동. 단 노출이 *수동적*.
   │  ⚠ LEAK 3: Free 유저가 30일을 요청해야 7일 clamp 메시지를 봄. 세션
   │           드릴다운은 클릭해야 402. 즉 "Pro가 뭘 더 주는지" 능동 광고 약함.
   │           CLI는 stderr 한 줄, 대시보드는 402 JSON — UX상 Pro 가치 전달 약함.
   ▼
Pro 전환 (Polar checkout → 결제 → license 이메일 → activate)
   │  현 상태: 기술 경로 전부 라이브 (license.ts 헤더 + infra/api webhook).
   │  ⚠ LEAK 4: 카드 입력 후 라이선스 키를 *이메일로* 받아 `token-meter
   │           activate <key>` 를 손으로 쳐야 함. 결제→가치 사이 수동 단계 1개.
   │  ⚠ LEAK 5: 외부 전환율 데이터 — dev tool freemium 1~3%가 SaaS 최저.
   │           CC 안 받는 무료→유료 전환은 CC 받는 트라이얼의 1/5.
```

**가장 큰 leak = LEAK 1·3.** 기술 결제 경로는 멀쩡한데, (a) 첫 실행에서 가치를 못 보고 이탈,
(b) Free 한계가 능동적으로 안 보여 Pro를 *모른 채* 떠난다. 결제 0건의 원인은 "결제가 어려워서"가
아니라 **"그 앞 단계에 사람이 거의 안 들어와서"** — funnel entry 문제 (MEMORY: koreanpulse도
동일 진단 "진입 자체 없음" 가설).

### 3. 첫 고객 채널 — outbound 룰(Gmail + HN 2채널) 안에서

**제약 (엄수):**
- 외부 outbound = Gmail + Hacker News 2채널만. social/platform DM·댓글 금지.
- 카톡 = D-039로 **1회 우회 승인** + WTP 검증 라운드 진행 중 (opener에 가격 비노출).

**현실적 buyer 군집 진입 경로 (우선순위순):**

| # | 채널 | 무엇 | 룰 정합 | 첫 고객 기대 |
|---|---|---|---|---|
| 1 | **카톡 AI 오픈채팅방** (D-039 진행 중) | 무료 도구 공유 + 답글 대화로 통증 가진 사람 식별 | D-039 우회 승인 | 중 — 이미 진행. 강 신호 3+면 다음 라운드 |
| 2 | **Hacker News — Show HN** | "Show HN: Token Meter — see where your Claude Code/Codex tokens go" | HN = 허용 2채널 | 높음 — buyer 밀도 최고. 단 계정 워밍 필수 (MEMORY: brand-new 계정 차단/flag) |
| 3 | **HN 댓글 워밍** (Show HN 사전) | 토큰 비용/ccusage 관련 스레드에 가치 댓글 (50-80단어 plain) | HN 허용 | 간접 — 계정 신뢰 적립 |
| 4 | **Gmail — ICP 인터뷰 아웃리치** | 클라우드 5명에게 Mom Test 인터뷰 요청 (sales pitch 아님) | Gmail 허용 + research≠sales 분리 | 낮음 직접결제, 높음 학습 |

**채널 논리:** 카톡은 *지금* 진행 중이니 그 신호를 먼저 본다 (강 신호 3+ → Pro WTP 라운드).
**HN Show HN이 첫 결제의 최대 후보** — buyer(헤비 Claude Code 유저)가 가장 밀집. 단 MEMORY
박제대로 계정 워밍 없이 올리면 차단/flag. → **Show HN은 계정 워밍 2주 후.** 그 사이 카톡
신호 + dogfood 데이터로 Show HN 카피를 다듬는다. 마케팅보다 "buyer가 모인 곳(HN)에 제품을
보여주는 것"이 핵심 (배경 전제 정합).

### 4. 수동 온보딩 플레이북 — 첫 10명을 손으로 전환

배경 전제: 첫 10~20 고객은 수동 온보딩(1인 ~30분)이 정석. 영어 장벽(user_english_barrier) 고려.

**원칙:** 결제를 *졸졸 따라다니며* 시키는 게 아니라, **가치 첫 경험까지를 손으로 보장**하고
Free 한계를 자연스럽게 보여준 뒤 *상대가 물으면* Pro를 한 줄로 답한다 (D-039 정합).

**플레이북 (반응한 사람 1명당):**
1. **가치 첫 경험 보장 (5분)** — "설치하면 `npx @whdrnr2583/token-meter stats` 한 줄이면
   바로 숫자 나와요" 라고 *ingest를 명시적으로 안내* (LEAK 1 우회를 사람이 메움). 빈 화면 뜨면
   "ingest부터 돌려보세요" 즉답.
2. **그들의 진짜 숫자를 같이 본다** — 스크린샷 받아서 "여기 이 peak day가 뭐였어요?" 같이
   해석. dogfood의 surprising pattern 5종이 대화 스크립트 (회고 문서 그대로 활용).
3. **Free 한계를 자연스럽게** — "30일치 보려면? 그건 Pro예요. 7일은 무료." *강요 X.*
4. **Pro는 상대가 물을 때만** — "유료도 있어요?" → "기본 무료, 30일 히스토리·세션 드릴다운·캐시
   효율이 월 $5 Pro" 한 줄. URL 먼저 안 꺼냄.
5. **결제 후 activate를 손으로 도와줌** — LEAK 4(수동 activate). "이메일 온 키를
   `token-meter activate <key>` 붙여넣으세요" 1:1 안내. 막히면 화면 공유 수준으로.

**영어 장벽 대응:** HN Show HN 본문·HN 댓글·영문 인터뷰 메일은 Claude가 KO 요약 + EN 초안을
미리 deliverable로 제공 (user_english_barrier 워크플로우 강제). 사용자는 검토·발송만.
카톡은 한국어라 장벽 없음 → 카톡을 1차 수동 온보딩 무대로 삼는 게 합리적.

### 5. 타임라인 + 마일스톤 — 첫 결제까지 (시간 캡 주 10시간)

| 주차 | 목표 | 작업 (시간 캡 내) | 마일스톤 |
|---|---|---|---|
| **W1 (~5/26)** | 카톡 신호 수집 + 진입 함정 1개 제거 | 카톡 maker-share opener 게시(D-039) → 반응 로그. 병행: **LEAK 1 수정** (첫 실행 ingest 자동화/안내 — 설계 3건 #1). HN 계정 워밍 시작 (댓글 1~2개) | 카톡 반응 5명 로그 / 강·중·약 분류 |
| **W2 (~6/2)** | 카톡 신호 판정 + HN 워밍 계속 | 카톡 강 신호 3+ 판정 (wtp_validation_kakao §판정). HN 댓글 누적. Show HN 카피 KO/EN 초안 작성 | 카톡 판정 GO/NO-GO |
| **W3 (~6/9)** | Show HN 게시 | 워밍된 계정으로 Show HN. KO 요약 + EN 본문 사전 deliverable. 게시 후 댓글 1:1 응대 (수동 온보딩 플레이북 가동) | Show HN 라이브 / npm DL·트래픽 측정 |
| **W4 (~6/16)** | 수동 온보딩 → 첫 결제 시도 | Show HN·카톡 반응자 중 헤비 ICP 3~5명 1:1 온보딩. 가치 경험 보장 → Free 한계 노출 → 물으면 Pro | **첫 유료 고객 1명** (목표) |
| **W5+ (~6/23)** | 회고 or 재시도 | 첫 결제 발생 시: 그 1명 인터뷰("왜 냈나"). 0건이면: funnel 어느 단계 leak인지 3-layer cross-check | 결제 1건 or leak 진단 |

**마일스톤 정의:**
- M-A (W2): 카톡 강 신호 3+ → free 도구에 pull 존재 확인. 0~1이면 포지셔닝 재검토.
- M-B (W3): Show HN 게시 + 외부 트래픽 측정값 확보.
- M-C (W4): 첫 유료 고객 1명. — *현존하는 유일한 진짜 마일스톤.*
- stop-loss (MEMORY/04-risks): 8주 안에 알파 미가동 / 6개월 매출 $200 미달 → 본업 회복 모드.

**시간 배분 (주 10h):** 카톡·HN 응대 4h / 코드 수정(LEAK) 3h / 영문 초안·인터뷰 2h / 박제·회고 1h.

---

## 작업 2 — 월 가격 검토

### 현재 가격: Pro $5/mo 단일 (연납 미배선)

### 적정성 3축 판정

**축 ① dev tool 표준 대비 ($10-20/월 개인):**
$5는 표준의 *절반 이하*. 03-business §3.2가 "한 끼 식사 anchor / freemium 마찰 최소화"로
정당화. → 표준 대비 **낮음. 인하 여지 없음 — 이미 바닥.**

**축 ② Pro가 주는 가치 대비:**
Pro = 30일 히스토리 + 무제한 알림 + 세션 드릴다운 + 캐시 효율 + 낭비 신호.
dogfood ROI 산식(§3.2): 미들 유저 절감 잠재 $8~15/월, 헤비 $20~40/월.
→ **$5는 가치 대비 명백히 저가.** 헤비 ICP에게 $5는 "ROI 계산할 가치도 없이 그냥 산다" 수준.

**축 ③ 첫 고객 전환 난이도 대비:**
여기가 핵심. 외부 데이터: dev tool freemium 전환 1~3% = SaaS 최저. **그러나 그 낮은 전환율의
원인은 가격이 아니라 funnel entry·가치 인지다** (LEAK 1·3 진단). $5에서 $3으로 내려도 "안
들어온 사람"은 여전히 안 들어온다.

### 판정: **$5 유지. 인하 금지.**

**근거 (사업가적):**
1. **$5는 이미 dev tool 최저 anchor.** 더 내리면 "이게 진짜 쓸만한가" 가치 신호가 떨어진다.
   $1~3짜리 도구는 "장난감"으로 인지된다 — 헤비 빌더(ICP)일수록 *너무 싼 가격을 의심*한다.
2. **첫 결제를 막는 건 가격이 아니다.** 결제 0건의 원인은 funnel entry (LEAK 1·3). 가격을
   내리면 *진단을 회피*하는 것 — 진짜 문제(아무도 안 들어옴)는 그대로.
3. **인하는 비가역에 가깝다.** 한 번 $5→$3 내리면 다시 올릴 때 기존 유저 반발. 첫 고객 0명인
   지금 내릴 이유가 없다 — 내릴 데이터(가격이 마찰이라는 증거)가 없다.
4. **$5는 본인의 검증 안 된 WTP 가설에 대한 *낮은 진입 가격*으로 이미 설계됨** (D-020). 더
   낮추는 건 가설을 두 번 헷지하는 것.
5. **마진:** $5에서 Polar 수수료 후 ~$4.05 (81%, §3.5). $3으로 내리면 ~$2.45 (수수료 고정비
   $0.40 비중 급증) → 마진 구조 악화. 운영비 $0라 마진 자체는 버티지만, 인하 이득이 0.

### 인하 *대신* 할 것 (우선순위순)

| 대안 | 효과 | 비용 | 권고 |
|---|---|---|---|
| **funnel LEAK 1·3 수정** | 진입·가치인지 ↑ — 전환율의 진짜 레버 | 코드 ~3-6h | **최우선.** 가격보다 이걸 먼저 |
| **연납 $50/년 (17%↓) wiring** | 박제는 했으나 미배선. 연납 = LTV·캐시플로 ↑, 헤비 유저는 연납 선호 | Polar 상품 1개 추가, 랜딩 1줄 | 권고 — 단 첫 결제 발생 *후* (지금 우선순위 낮음) |
| **런치 가격 / 평생 할인** | 첫 N명에게 "Founding $4 평생" — 희소성 + 얼리어답터 보상 | Polar 쿠폰 | 보류 — 첫 1명도 없는데 할인부터는 순서 틀림. 결제 5건 후 재검토 |
| **CC 요구 트라이얼 (14일)** | 외부 데이터상 전환율 *5배*. "카드 등록 후 무료 체험" | Polar 트라이얼 설정 | **검토 가치 큼.** 단 무료 OSS 신뢰(D-004)와 충돌 가능 — Free tier는 영구 무료 유지하되, *Pro 트라이얼*만 CC 요구. 사용자 결정 필요 |

**결론:** 가격은 건드리지 말 것. 전환을 원하면 ① funnel 수정 ② (결제 발생 후) 연납 배선
③ Pro 트라이얼 CC 모델 검토. 인하는 가치 신호만 깎고 진단을 회피하는 역효과.

### 운영비 (월) — 1줄

token-meter 월 고정 운영비 ≈ **$0** (CF Pages/Workers/D1 모두 Free tier 내, 도메인만 연 ~$10).
Polar는 거래 수수료(~6%+$0.40/건)만 — 결제 0건이면 비용 0. D-023(인프라 비공유) 정합.

---

## 메모리 승격 후보 (이번엔 박제 X — 후보만 표시)

1. **"첫 결제 차단 = funnel entry, not price"** — 게이팅/Polar 경로 전부 라이브 확인.
   결제 0건 원인은 진입·가치인지 (LEAK 1·3). 가격 인하 충동 시 이 진단 우선 참조.
   → `project_tokenmeter.md` 또는 D-040 후보.
2. **ICP 확정 초상** — "헤비 + 최근 청구서 놀란 경험 + Claude Code+Codex 멀티" / 캐주얼 제외.
   ICP 인터뷰·Show HN 카피 SoT로 승격 가치 있음.
3. **연납 $50/년 미배선 사실** — 03-business는 박제했으나 Polar/랜딩 미반영. 결제 발생 후
   wiring TODO로 어딘가 박제 필요 (현재 어느 SoT에도 "미배선" 명시 없음).

→ 승격 여부·위치는 사용자 결정. audit inflation 가드(MEMORY) 정합 — 이번 세션 박제 0건 유지.

---

## 사용자 결정 필요 분기점

| # | 분기 | 선택지 | Claude 권고 |
|---|---|---|---|
| D1 | **LEAK 1 (첫 실행 ingest 함정) 수정 시점** | (a) W1에 바로 / (b) Show HN 전까지 | (a) — Show HN 전에 반드시. 진입 후 첫 화면이 비면 전환 0 |
| D2 | **Show HN 게시 시점** | (a) 계정 워밍 2주 후 W3 / (b) 더 늦게 | (a) — MEMORY 박제(brand-new 차단)대로 워밍 필수, 2주가 최소선 |
| D3 | **Pro 트라이얼 CC 요구 모델 도입 여부** | (a) 도입 (전환 5배 데이터) / (b) 미도입 (OSS 신뢰 우선) | 보류 판단 — 첫 결제 발생 후 결정. 지금 결정 불필요하나 인지는 해둘 것 |
| D4 | **연납 $50/년 wiring** | (a) 첫 결제 후 / (b) 지금 | (a) — 첫 1명 전이라 우선순위 낮음. 단 "미배선" 사실은 박제 권고 |
| D5 | **카톡 강 신호 0~1일 때** | (a) 포지셔닝 재검토 / (b) Show HN 강행 | wtp_validation_kakao §판정 따름 — 0~1이면 (a), Show HN으로 2차 검증 병행 가능 |
| D6 | **메모리 승격 3건** | 승격 / 보류 | 사용자 결정. 최소 #1·#2는 가치 큼 |
