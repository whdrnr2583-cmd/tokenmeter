# 05. 결정 박제 (Decision Log)

기록 시점의 결정과 근거를 박제. 번복 시 새 항목 추가하고 이유 기록.

## D-001. 결제 인프라: Polar.sh
**날짜**: 2026-05-13
**결정**: Stripe 직접 대신 Polar.sh 사용
**근거**:
- MoR (Merchant of Record) → 한국 1인이 글로벌 매출 세무 신고 부담 0
- 사업자 등록·Stripe 계좌 셋업 며칠 절약
- 4% + $0.40 (구독·국제 카드 추가 시 ~6%) → $9~12 구독 기준 $0.30/유저 추가 비용 감내 가능
- GitHub 네이티브, Tailwind Labs·Midday 등 검증된 채택
**감내 단점**: 지원 응답 느림 (2026-02 Reddit), 카드만 지원, Apple/Google Pay 없음
**전환 시점**: 유료 1,000명 돌파 시 Stripe 직접 + 한국 사업자 등록 재검토
**참고**: [Polar vs Stripe](https://polar.sh/resources/comparison/stripe)

---

## D-002. 토큰 카운트: 로컬 JSONL 파싱만
**날짜**: 2026-05-13
**결정**: 자체 토크나이저 안 만듦. 벤더 공식 카운트만 사용.
**근거**:
- tiktoken은 Claude에 **12% 오차** (OpenAI 토크나이저)
- Anthropic 휴리스틱 (1토큰 ≈ 3.5 chars)은 **20% 오차**
- Anthropic 토큰 카운트 API 호출 = 비용 + 레이턴시
- Claude Code는 모든 토큰을 **로컬 JSONL에 100% 정확 기록** (`~/.claude/projects/`)
- Cursor도 SQLite에 API 응답 카운트 저장
**구현**: 로컬 로그 파일 read-only watch, 자체 카운트 안 함
**한계**: 벤더 간 토큰 비교 무의미 → **$ 단위 비교 강제**

---

## D-003. 첫 통합 클라이언트: Claude Code 단독
**날짜**: 2026-05-13
**결정**: M1은 Claude Code만 통합. Cursor·Codex·Desktop은 M2 이후.
**근거**:
- Claude Code JSONL 형식 가장 공개적·안정적
- 본인이 Claude Code 메인 사용자 → 자체 검증 가능
- 단일 클라이언트로 PMF 게이트 통과 시 멀티로 확장
- 멀티 동시 시도 = MVP 범위 폭발 위험

---

## D-004. 라이선스: 코어 MIT + Pro 기능 closed
**날짜**: 2026-05-13
**결정**: 토큰 파싱·대시보드 코어는 MIT 오픈소스. 권장 엔진·자동 액션·sync는 closed source.
**근거**:
- OSS = 개발자 신뢰 + GitHub trending = 무료 마케팅
- ccusage·tokscale 모두 MIT → 표준 기대
- Pro 기능 closed = 수익화 보장
- 분리 명확: "core observability free, intelligence layer paid"

---

## D-005. 서버 부하 정책: 로컬 우선, 클라우드는 옵트인
**날짜**: 2026-05-13
**결정**: 모든 핵심 기능 로컬 SQLite. 클라우드 sync는 Pro 옵션.
**근거**:
- 사용자 운영 룰: 서버 부담 최소화
- 1인 운영 → 인프라 장애 대응 부담 최소
- 프라이버시 강점 (토큰 로그에 민감 정보 가능)
- Pro sync 옵션은 Cloudflare Workers + R2로 사용자당 월 $0.05 수준

---

## D-006. 가격 sweet spot: Pro $12 / Pro+ $25
**날짜**: 2026-05-13
**결정**: Free → Pro $12 → Pro+ $25 → Team $39/user
**근거**:
- $5: 컨버전 좋지만 마진·지원 부담 동일 → 비효율
- $12: "Cursor Pro($20)의 60%" 카피, 월 $100+ 지출자에 ROI 명확
- $25: 자동 액션 + 알림에 대한 가치 인식 가능
- $39 Team: Notion Team $15 비싸지만 AI 카테고리 정당화

**검증 필요**: M3에 가격 A/B 테스트 ($9 vs $12 vs $15)

---

## D-007. 신뢰·보안 영역 회피
**날짜**: 2026-05-13
**결정**: 에이전트 보안 가드레일, 권한 통제 등은 안 함.
**근거**:
- 사용자 룰: "보안은 네임드 아니면 안 씀"
- 인디 SaaS가 사고 시 책임 부담 큼
- 차별점은 옵저버빌리티·효율 자체로 충분

**예외**: 자동 액션의 "에이전트 깨뜨림 안전장치"는 운영 안정성 차원에서 유지

---

## D-008. 익명 벤치마크 데이터: 옵트인만
**날짜**: 2026-05-13
**결정**: "당신은 평균 사용자보다 30% 더 씀" 같은 비교 기능은 옵트인 사용자 데이터로만.
**근거**:
- 사용자 신뢰 + 법적 안전
- 옵트인 동의서 명확 (집계 통계만, 원본 데이터 비공개)
- 추후 익명 데이터 API 수익화 가능 (Year 3)

---

## D-009. 멀티벤더 정체성 처음부터 명시
**날짜**: 2026-05-13
**결정**: 모든 마케팅 카피·README에 "multi-vendor" 강조.
**근거**:
- Anthropic·Cursor 네이티브 토큰 보드 위협 최대 리스크
- 단일 벤더 사용자는 빼앗기되, 멀티 사용자(2.3개 평균)는 우리만 가능
- "the only place to see all your AI spend"

---

## D-010. MVP 첫 4주: 가시화만, 액션·권장 미포함
**날짜**: 2026-05-13
**결정**: M1은 순수 대시보드. 권장 엔진은 M2, 자동 액션은 M3.
**근거**:
- 가시화 자체로 PMF 검증 가능 (사용자가 매주 보러 오는가)
- 권장·액션은 가시화 위에서만 가치
- 범위 축소 = 4주 안 가능성 ↑

---

## D-011. 클라이언트 통합 순서 수정
**날짜**: 2026-05-13
**결정**: M2에 Codex 우선 통합 (기존 Cursor 우선 계획 수정)
**근거**:
- Codex 통합 난이도 ★ (Claude Code와 동일) — `~/.codex/history.jsonl` + `turn.completed.usage` 공식 노출
- Cursor 통합 난이도 ★★★ — SQLite 토큰 명시 저장 불확실, 형식 변경 위험
- "Claude + Codex" 멀티벤더 카피 빠르게 확보 → Anthropic·Cursor 네이티브 위협 우회
- ccusage가 이미 Codex 지원 → 참고 가능
**새 순서**: Claude Code → Codex → Gemini CLI → Claude Desktop → Cursor

---

## D-012. TPS·속도 인사이트 기능 포함
**날짜**: 2026-05-13
**결정**: Pro 기능에 모델별 평균 TPS·시간대별 성능 인사이트 추가
**근거**:
- JSONL의 timestamp + 토큰 카운트로 평균 TPS 계산 가능
- 모델 선택 권장 (Gemini 2.5 Pro 빠름, Opus 4.7 느림 등) → 사용자 가치 명확
- 시간대별 혼잡 감지 → 실용적 인사이트
**한계 박제**:
- 로그 기반은 **평균값만** (응답 시작 ~ 완료)
- TTFT·ITL 정밀 측정은 스트리밍 자체 가로채기 필요 → Pro+ MCP 프록시 모드에서만
- UI에 "추정 평균" 명시. 정확한 벤치마크는 외부 사이트 참조 권장

---

## D-013. 스코프 집중: Claude Code + Codex 단독 (클라우드)
**날짜**: 2026-05-13
**결정**: 클라우드 측은 Claude Code + Codex 2개만 진행. Gemini CLI, Cursor, Claude Desktop, Windsurf 모두 의도적 제외.
**근거**:
- Claude Code + Codex 모두 **JSONL 공식·표준** → 통합 난이도 ★ 동일
- Gemini CLI는 telemetry 옵트인 필요, 사용자 풀 작음
- Cursor SQLite는 토큰 명시 저장 불확실 + 형식 변경 위험
- Claude Desktop은 로그 형식 다양, 비용 분석 가치 낮음
- 스코프 집중 = MVP·후속 빠른 사이클 = 경쟁자 추월 속도
**리스크**: Cursor 사용자 잠재 시장 제외. 대신 로컬 LLM 시장 진입으로 보상.
**번복 트리거**: Cursor가 토큰 사용량을 공식 API로 노출 → 재검토

---

## D-014. 로컬 LLM 통합 (페르소나 B 진입)
**날짜**: 2026-05-13
**결정**: M3부터 Ollama·LM Studio·llama.cpp·vLLM 통합. HTTP 프록시 모드로 정밀 TPS·TTFT·ITL 측정.
**근거**:
- 사용자 요구: "비용 지불하더라도 사용되는 수준"
- 로컬 LLM 사용자 1~3M 글로벌, mainstream화 (2026)
- LLM API 80% 가격 인하로 로컬 vs 클라우드 ROI 계산 수요 증가
- 기존 OSS 도구는 **단발 CLI**, GUI·지속 모니터링·권장 부재 → 명백 공백
- 프록시 모드 = 밀리초 정확도 TPS/TTFT/ITL → 로그 파싱 대비 압도 차별점
- 하이브리드 사용자 (페르소나 AB) = 양쪽 통합 가치 가장 큼 = WTP 최고
**구현**:
- M3: Ollama (가장 보편) + LM Studio
- M4: llama.cpp (server 모드) + vLLM
- 모두 OpenAI-호환 API → 단일 프록시 어댑터로 커버
**리스크**: 기술 복잡도 (OS별, GPU별), WTP 가설 미검증
**검증 게이트** (M3 진입 전):
- 로컬 빌더 5명 인터뷰 중 3명 유료 의향
- 본인 Ollama 프록시 PoC 성공
- r/LocalLLaMA 베타 대기 30+ 반응
**번복 트리거**: 3개 게이트 중 2개 미달 → 로컬 진입 보류, 클라우드 단독 집중

---

## D-015. TPS·성능 측정 핵심 기능화
**날짜**: 2026-05-13
**결정**: TPS·TTFT·ITL을 Pro 핵심 기능으로 포지셔닝 (기존 사이드 기능 → 핵심)
**근거**:
- 클라우드: 평균 TPS는 로그로 추정 가능 (timestamp + 토큰)
- 로컬: 프록시 모드로 **밀리초 정확** TTFT/ITL/TPS 측정 가능
- 페르소나 B에게 TPS는 **1차 가치** (비용 가시화 < 성능 가시화)
- 페르소나 A에게 모델 선택 권장의 근거 데이터
**구현**:
- Pro: 평균 TPS, 모델·시간대별 비교
- Pro+: 정밀 TTFT/ITL (프록시 모드), GPU/VRAM 상관 분석
**한계 명시**: 클라우드 측은 "추정 평균"으로 라벨링, 정밀 벤치마크는 외부 사이트 참조 권장

---

## D-016. 가격 인상 ($12 → $15, $25 → $29) [폐기됨, D-017로 대체]
**날짜**: 2026-05-13
**결정**: Pro $15, Pro+ $29, Team $49/user
**근거**:
- 로컬 LLM 통합 + GPU 모니터링 추가 가치
- TPS 정밀 측정 = 고급 기능
- 페르소나 B (GPU $1k+ 보유)는 $15 인식 다름 ("$5k GPU의 0.3%")
- $15 = "Cursor Pro($20)의 75%" 카피
**폐기 이유**: 무료 티어가 너무 좁아 유입 풀 부족. 가격이 freemium 마찰 증가. D-017로 재설계.

---

## D-017. 무료 티어 강화 + 가격 인하 + Early Bird [폐기됨, D-020로 대체]
**날짜**: 2026-05-13
**결정**:
- **Free**: 멀티 소스 (Claude Code + Codex + 로컬 1개) + 30일 히스토리 + 모델·시간대 비교 + 기본 차트
- **Pro**: $12/월 ($120/년) [Early Bird $9/월 6개월 한정, 영구 락인]
- **Pro+**: $24/월 ($240/년)
- **Team**: $29/user/월

**근거**:
- 무료 티어 비교: ccusage (무한 + Claude Code only), tokscale (멀티 CLI) → 우리 Free가 둘을 흡수해야 유입 가능
- 개발자 freemium 전환율 1~3% → **풀 자체를 키우는 게 우선**
- 매출 시뮬레이션:
  - 이전: 무료 3k × 2% × $17 ARPU = $12k ARR
  - 수정: 무료 8k × 3% × $14 ARPU = $40k ARR
  - **3배 잠재**
- Early Bird $9는 한 끼 식사 = 심리적 anchor, 평생 락인으로 초기 고객 신뢰
- Notion Team $15 anchor 고려 시 Team $29가 정당화 한계

**시뮬레이션 가정 (검증 필요)**:
- 무료 사용자 8k Y1 = HN Show + GitHub trending 성공 + 페르소나 B 진입 가정
- 전환율 3% = freemium 평균 (실제는 1~5% 분포)
- 미달 시: M4에 가격·플랜 재설계 (Pro $7 등 추가 인하 검토)

**번복 트리거**: Year 1 ARR < $20k 도달 → 전체 재설계

---

## D-019. MCP·도구별 귀속을 핵심 차별점으로
**날짜**: 2026-05-13
**결정**: MCP 서버·도구 단위 토큰·지연 분석을 Free 기본 기능으로 포함. ccusage·tokscale 등 경쟁자 대비 명확 우위.

**근거**:
- 경쟁자 모두 **총 토큰**만 표시. MCP 단위 자동 분석 부재.
- JSONL의 `tool_use.name` 표준 `mcp__<server>__<tool>` 패턴으로 자동 그룹핑 가능
- 도구 응답 토큰·지연은 **100% 직접 측정** 가능 (heuristic 불필요)
- 사용자 가치: "어느 MCP가 토큰 가장 먹는지" 한 눈에 보임 → 권장 액션 직결

**측정 정밀도 박제**:
- 🟢 100% 정확: 호출 횟수, 응답 토큰, 지연
- 🟡 80% 추정: 청구 기여도 (LLM 추론과 툴 호출 혼재)
- 🔴 불가: 개별 토큰 단위 귀속

**Free 포함 사유**:
- 차별 카피 "Token Meter만 MCP별 분석" → 무료 사용자 흡수
- ccusage 사용자 이주 트리거 = "오, 이건 ccusage엔 없네"

**Pro 업그레이드 트리거**:
- 자동 trim 액션 (MCP 분석 결과 기반 자동 화이트리스트 적용)
- 클라우드-로컬 환산 (MCP 비용 → 로컬 대체 가능액)

---

## D-018. Free 티어 의도적 우위 정책
**날짜**: 2026-05-13
**결정**: Free가 ccusage·tokscale을 무조건 이기는 수준으로 유지.
**근거**:
- "왜 Token Meter Free를 쓸까?" 답이 명확해야 함
- Free가 약하면 유저가 무료 OSS 도구 옵션을 먼저 시도
- 우리 무료의 우월 차별점: **GUI + 멀티벤더 + 로컬 1 endpoint**
- 경쟁자가 이 셋을 동시에 무료로 제공할 가능성 낮음
**Pro 전환 트리거**:
- 무제한 히스토리 (30일 한계 도달 시)
- 권장 리포트 (수동 분석 vs 자동 제안)
- 클라우드-로컬 환산 (하이브리드 사용자)
**번복 트리거**: 무료 사용자 증가 but 유료 전환 1% 미만 → Free 일부 축소 검토

---

## D-020. Pro $5 단일 가격 + Pro+ 추후 + 응대·내부 토큰 최소화
**날짜**: 2026-05-13
**결정**:
- **가격 구조 단순화**: Free + Pro $5/월 **2단계만** 현재 작업
- **Pro+ ($24, 로컬 LLM·GPU·자동 액션) 추후 작업 보류** (M4+ 조건부)
- **Team (TBD) 추후 보류**
- **응대**: 이메일 단일 채널 + Gemini 자동 응답. 결제·환불·버그만 본인 처리
- **내부 LLM 토큰 최소**: 핵심 기능 LLM 0회 호출. Pro 권장 리포트만 주 1회 배치, 유저당 월 토큰 예산 캡 $0.20

**근거**:

### 가격 인하 ($12 → $5)
- 응대비 $0 (Gemini 자동) 확보 → 마진 81% 유지 가능 ($5 - $0.70 Polar - $0.05 인프라 - $0.20 LLM = $4.05)
- 한 끼 식사 anchor → 즉시 결제 마찰 최소
- 카톡 1차 신호 = 통증 존재 확인, WTP는 미검증 → 낮은 가격으로 진입
- $12에서 풀 확장이 가격 인상으로 잠재 차단

### Pro+ 보류
- 로컬 LLM 프록시 = 기술 복잡도 큼 (OS별, GPU별, 프록시 안정성)
- 로컬 LLM WTP 가설 미검증 (페르소나 B)
- GPU 트래킹·자동 액션 = 핵심 가치 검증 안 됨
- 4단계 동시 관리 = 1인 시간 폭발
- **추후 분리 게이트** (M4+): Pro 100명 + 로컬 LLM 요청 30건 + Ollama 프록시 PoC 성공

### 응대 자동화 (Gemini)
- 지원비 $5 매출 단가의 가장 큰 위협
- Gemini 자동 응답으로 80%+ 처리
- 시스템 프롬프트: "결제·환불·버그 = 본인 에스컬레이션"
- FAQ·셀프서비스 페이지 강화

### 내부 토큰 최소화
- 매출 단가 $5에 내부 LLM 비용이 들어가면 마진 즉시 무너짐
- 모든 핵심 분석은 **heuristics·정규식·timestamp 산수**로 처리:
  - 토큰 카운트 (JSONL 자체)
  - 비용 환산 (가격표 곱셈)
  - TPS·TTFT·ITL (timestamp)
  - MCP 그룹핑 (정규식)
  - 시간대 변동 (집계)
- LLM 호출 = Pro 주간 권장 리포트 1회 배치 (유저당 토큰 캡 $0.20)

### Free 티어 (네이티브 % 압도)
- Claude·Codex 네이티브 = 토큰 잔여 % 만 표시
- Token Meter Free = 프로젝트별 + MCP별 + 모델별 + 시간대별 + $ 환산 + 30일 + 평균 TPS = **7개 차원 우위**
- 카톡 사용자 통증 ("얼마/어디서 썼는지 모름") 직접 해결

**유닛 이코노믹스**:
- Pro $5 Gross: $4.05 (81%)
- 9개월 LTV: $36
- LTV/CAC: CAC $10 = 3.6x ✅, CAC $5 = 7.2x ✅
- MRR $1k = 235명, $5k = 1,175명

**검증 후 가격 인상 옵션** (M6+):
- Pro+ 분리 ($24) → ARPU 상승
- 미통과 시 Pro $5 → $7 인상 (신규만), 기존 락인

**번복 트리거**:
- M3 종료 후 Pro 유료 < 30명 → 가격·포지셔닝 재설계
- Gemini 응대 오답률 > 10% → 본인 응대 비율 ↑ → 마진 무너짐 → 가격 인상 강제

---

## D-021. 빌드 우선 접근 (사전 검증 생략)
**날짜**: 2026-05-13
**결정**: M0 사전 검증 (카톡 5명 + 본인 1주 데이터 분석) 생략. 곧장 M1 착수.

**근거**:
- Claude/Codex Max 잉여 → 빌드용 LLM 비용 $0
- 자본 0, 실제 비용 = 시간 40~80시간 (4-8주)
- 본인이 페르소나 A 헤비 유저 → 자가 dogfooding이 인터뷰 대용
- 출시 = 가장 강한 검증 (인터뷰 응답 50% 거짓말 vs 실제 DAU·결제 100% 진실)
- 자동매매 자동화 완료 → 시간 여유
- 콘텐츠 트랙 시너지 (한국 1인 글로벌 SaaS 도전 자체가 콘텐츠)

**유지되는 안전장치 (Stop-loss)**:
1. M1 시간 캡 **8주** (4주 목표). 초과 시 일시 중단. 본업·v18 침범 0
2. M2 출시 후 4주: DAU 30 + GitHub Star 100 미만 → 콘텐츠 가속 1회 → 미달 시 보류
3. M3 결제 후 4주: 유료 10명 미만 → 가격·포지셔닝 재설계 1회 → 미달 시 보류
4. 주차별 빌드 로그 1편 (블로그 or X) → 실패해도 콘텐츠 잔존

**번복 트리거**: 8주 초과 또는 위 stop-loss 게이트 2회 연속 미달

---

## D-022. 제품명 확정: Token Meter
**날짜**: 2026-05-13
**결정**: 제품명을 **Token Meter**로 확정. 도메인 후보 우선순위:
- `tokenmeter.dev` (1순위, 개발자 친화)
- `tokenmeter.io` (2순위)
- `token-meter.com` (3순위)

**근거**:
- 한국·영어권 동일 즉시 이해 ("전기 미터", "수도 미터" 비유)
- 11자, 2단어, 음절 4개 — 카피·도메인·NPM 모두 자연스러움
- 카피 직결: "Your token meter for Claude, Codex, and more"
- "Token Pulse"의 pulse는 비전공자에게 직관 약함
- AI Meter 후보 대비 "토큰"이 명시되어 카테고리 즉시 인지

**기각 후보**:
- AI Meter: 너무 범용, 검색 SEO 약함
- TokenLog: 검색 친화적이나 "로그"는 정적 느낌
- AI Tab: 영미권 특화, 한국어권 직관 약함

**적용 범위 (즉시)**:
- 문서·UI·CLI 표기 전체 교체 완료
- `package.json` name → `token-meter`, bin → `token-meter`

**적용 보류 (M3 결제 직전)**:
- 디렉토리 `token-pulse/` 그대로 (이름 교체 비용 > 가치)
- DB 경로 `~/.tokenpulse/` → 신규 설치는 `~/.tokenmeter/`, 기존 유저는 자동 마이그레이션 (M3 출시 직전)
- 도메인 등록 + Polar 상품명

**번복 트리거**: 도메인 모두 선점 + 합리적 대체 도메인 없음 → 후보 재검토

---

## D-023. 배포 인프라: Cloudflare 서버리스 + GitHub + npm (koreanpulse Lightsail 절대 분리)
**날짜**: 2026-05-13
**결정**:
- **koreanpulse Lightsail 절대 공유 안 함** (v18 자동매매·us-advisor 트랙 보호)
- **신규 Lightsail도 만들지 않음** (1인 운영 부담)
- **배포 스택**: GitHub (OSS) + npm (CLI 배포) + Cloudflare Pages (랜딩) + Cloudflare Workers + D1 (라이선스 API)
- **Polar.sh** 결제 (D-001 유지)

**근거**:
- Token Meter는 본질적으로 **로컬 우선** 제품 (D-005). 실서버 부하 = 라이선스 검증(5KB) + 정적 사이트만
- 트레이딩 인프라와 같은 서버 공유 시: HN 트래픽 폭발 / DDoS / Docker 충돌 → 트레이딩 차질 위험 (stop-loss 직접 트리거)
- Cloudflare 무료 한도: Workers 10만 req/일, D1 5GB, Pages 무제한 → 유료 1,000명까지 월 인프라비 $0~5
- 1인 운영: 서버리스 = 모니터링·OS 패치·Docker 불필요 → 본업·트레이딩 시간 보존

**M2-M3 단계 구조**:
```
github.com/<owner>/token-meter       ← public OSS (MIT, CLI 코어)
github.com/<owner>/token-meter-site  ← private (랜딩, CF Pages)
github.com/<owner>/token-meter-api   ← private (라이선스 API, CF Workers + D1)
```

**도메인**: `tokenmeter.dev` 1순위 (Cloudflare Registrar $12/yr). 백업: `tokenmeter.io`, `gettokenmeter.com`.

**배포 순서**:
1. **이번 주**: 도메인 등록 + Cloudflare 계정 점검 + npm 계정 확인 + GitHub 신규 organization 또는 username 선택
2. **M2 (5-8주)**: GitHub 공개 + npm publish + CF Pages 랜딩 + 베타 대기 폼
3. **M3 (9-12주)**: CF Workers 라이선스 API + Polar webhook + 이메일 발송 (Resend 무료 3k/월)

**Year 1 인프라 비용 예측**: 도메인 $12 + Polar 수수료 6% 외 0. 유료 200명 시 매출 $1,000/월 × 89% Gross.

**번복 트리거**:
- Cloudflare 무료 한도 폭발 (Pro 1,000명 초과 + 가격 인상 전) → 부분 셀프호스팅 검토
- 코어 OSS 가 분기점 도달 후 자체 클라우드 sync 수요 폭증 → R2 도입 (Pro+ 출시 시)

---

## D-024. Actions 모듈: 빌트인 최소 + 웹훅으로 확장
**날짜**: 2026-05-13
**결정**:
- **빌트인 액션 3종만 출시**: 데스크탑 알림 / 이메일 / 웹훅 POST
- **나머지는 웹훅으로 사용자 커스터마이즈** + 가이드 문서(`docs/customization.md`) 제공
- **Free**: 데스크탑 알림 1개 룰만 활성
- **Pro $5**: 무제한 룰 + 이메일 + 웹훅 + 주간 digest
- **Pro+ M4+**: MCP 자동 trim·모델 자동 전환 등 행동 변경 액션 (D-007 신뢰 룰 통과 후)

**근거**:
- 사용자 요구: "간단한 것만 빌트인, 나머지는 커스텀 가이드"
- 웹훅 1개 = Slack·Discord·n8n·Zapier·Pipedream·사용자 스크립트 전부 커버 → 빌트인 어댑터 안 만들어도 됨
- 응대 폭발 차단 ($5 단가 보호): "Slack 안 됨" 응대 = 사용자 본인이 Slack 웹훅 URL 설정 책임
- 행동 변경류는 매출 단가 대비 신뢰 비용 폭발 → Pro+로 분리 유지

**빌트인 3종 명세**:
| 액션 | Free | Pro | 구현 |
|---|---|---|---|
| `notify.desktop` | 1 룰 | 무제한 | 브라우저 Notification API (대시보드 폴링) |
| `notify.webhook` | ❌ | 무제한 | 로컬 fetch POST |
| `notify.email` | ❌ | 무제한 | CF Workers `/v1/action/email` → Resend |
| `digest.weekly` | ❌ | 1 (고정) | 동일 (이메일 변형) |

**안전장치**:
- 룰별 쿨다운 기본 24h
- 기본 OFF, 명시적 ON
- 드라이런: "이 룰은 지난 30일 동안 N회 발화했을 것" 미리보기
- 발화 로그 (`rule_firings`) 감사용

**커스텀 가이드 범위** (`docs/customization.md`):
- 웹훅 payload 스펙
- Slack/Discord incoming webhook 연결 레시피
- n8n·Zapier·Pipedream 연결 레시피
- 사용자 스크립트 트리거 레시피 (간단한 Node/Python 수신기 예제)
- "안전한 자동 액션 작성법" 가이드 (사용자 책임 명시)

**번복 트리거**:
- Pro 결제자의 50%+ 가 "Slack 빌트인 어댑터 원함" → Slack 빌트인 검토 (그래도 자동 액션은 Pro+ 유지)
- 행동 변경류 요청 누적 30+ → Pro+ M4 게이트 검증 가속

---

## D-025. 현실 기대치 박제: 콘텐츠 트랙 우선 + Y1 ARR $2k base
**날짜**: 2026-05-13
**결정**:
- **정체성 재정의**: "공개 빌드 + 무료 도구" 우선. Pro $5 결제는 부가
- **Y1 ARR 목표 재설정**:
  - **base $2,000**, **stretch $6,000**, **optimistic $20,000** (이전 D-020 $48k optimistic 폐기)
- **본업 대체 시도 명시 차단**: Token Meter는 부업·콘텐츠 트랙 (트랙 분리 룰 정합)
- **콘텐츠 KPI 추가**: 빌드 로그 12편, GitHub Star 500, DAU 100, 카톡 직접 응답자 50명
- **Pro+ ($24) 출시 게이트**: M6 + Pro 100명 + 로컬 LLM 요청 30건. 미통과 시 영구 Pro $5 단독

**근거**:
- ccusage 무료 = 70% 풀 흡수 → 진짜 결제 트리거는 Smart alerts 1개에 의존
- "$7,735 cost 절약" 카피는 Max 유저에게 **역방향** 인지 ("Max 좋다 → 추가 결제 왜?"). 진짜 WTP는 Pro $20 한도 도달 유저로 좁아짐
- MCP 분해 차별점은 ccusage 1주 캐치업 가능 → 단기 우위만
- 글로벌 영문 GTM 1인 미검증 (4.3 박제) → HN/Reddit 운빨 의존
- 본인이 Claude·Codex Max 사용하며 빌드 → 자기 dogfood의 자기 기만 위험 박제 필요

**중단 조건 (Stop-loss) 갱신**:
다음 중 하나라도 발생 시 **즉시 일시 중단**:
1. 8주 안에 알파 못 띄움
2. 본업·v18·us-advisor·koreanpulse 운영 차질
3. 사용자 룰 위반 (트랙·자본·5거래일 욕망)
4. **6개월 누적 매출 $200 + 시간 200시간 초과** (이전 $500보다 보수)
5. M1 PMF 게이트 2회 연속 미달
6. **"이걸로 1억 벌겠다"는 자기 기만 발생 시 즉시 본업·v18 회복 우선 모드 전환**

**잘 되는 경우 / 평타 / 망해도**:
| 시나리오 | 결과 | 자산 |
|---|---|---|
| 잘 됨 | $500~3,000/월, GitHub 인지도 ↑ | 이직 가치 ↑, 콘텐츠 자산 |
| 평타 | $50~200/월 | 코드·박제·블로그 글 잔존 |
| 망함 | $0 | **자본 손실 0** (시간만), 박제 데이터·콘텐츠 자산 잔존 |

**6개월 후 자가 점검**:
- project_reality_pin.md 재읽기
- "Token Meter가 자동매매 알파 음수 회피 행동인가?" 정직 답변
- 본업·v18 회복 우선 모드 전환 여부 결정

**번복 트리거**:
- Pro+ 게이트 통과 + Y1 ARR $20k+ 도달 → 본업 비중 조정 가능 (그래도 즉시 전업 X)
- Y1 매출 $200 미달 + 시간 200h 초과 → 폐기 또는 OSS 단독 유지 (수익화 포기)

---

## D-026. 히스토리 단계화 + Pro 4종 강화
**날짜**: 2026-05-13
**결정**:
- **히스토리 재분배**: Free **7일** / Pro **30일** / Pro+ **무제한**
- **Pro 강화 4종 추가**: 세션 드릴다운 · 비용 예측 · CSV·JSON export · 커스텀 가격 매트릭스
- **Pro+ 차별점 추가**: 무제한 히스토리 + 다중 머신 동기화 + PDF 자동 리포트
- **Free 차별점 유지 (D-018 갱신)**: ccusage·tokscale 대비 7일 한정이라도 멀티벤더 + MCP 분해 + GUI + 알림 1 룰로 우위

**근거**:
- 이전 Pro 차별점 = "무제한 히스토리 + Smart alerts" 두 축 중 히스토리는 결제 트리거 약함 ("30일이면 충분" 인식)
- 자동 trim **룰 제안** · 벤치마크 비교만으로는 $5 정당화 약함
- 4종 추가는 **내부 LLM 0회 + 인프라 0 + 신뢰 비용 0** → 마진 81% 유지
- "잘 다룰 사람은 알아서 잘 다룬다" — Free 축소가 결제 마찰보다 풀 자체에 큰 영향 없음 (advanced 유저는 OSS 코드 자체 fork 가능)

**Pro 강화 4종 명세**:

| 기능 | Free | Pro | 가치 |
|---|---|---|---|
| **세션·턴별 드릴다운** | ❌ | ✅ | "5/4 $2,400 어느 세션·메시지가 비쌌나" 클릭 3회 답 |
| **비용 예측·페이스** | ❌ | ✅ | "현재 페이스 → 월말 $X 예상", "예산 50% 도달 (월 10일)" |
| **CSV·JSON export** | ❌ | ✅ (30일) | 회계·외부 BI·자체 분석. UI · CLI 양쪽 |
| **커스텀 가격 매트릭스** | ❌ | ✅ | 회사 API 약정 단가 입력 → 정확한 비용 산정 |

**Free 검증 (D-018 갱신)**:
- Free 7일이라도: 멀티벤더 ✅ + MCP 분해 ✅ + GUI ✅ + 데스크탑 알림 1 룰 ✅ + 평균 TPS ✅
- ccusage 무제한 vs Token Meter 7일 — 히스토리 단일 차원만 ccusage 우위, 5개 차원 압도
- Advanced 유저는 OSS fork로 우회 가능 (MIT 코어 보장)

**구현 시점**:
- 히스토리 단계화: M3 (라이선스 게이팅 활성 시점). 그 전까지 dev는 무제한
- Pro 4종: M3 결제 출시 직전 묶음 구현 (예상 +10~15시간)
- Pro+ 추가 기능 (다중 머신 sync·PDF): Pro+ 출시 시점 (M4+)

**번복 트리거**:
- Free 7일 한도가 가입 직후 이탈률 폭증 → Free 14일 완화 검토 (가입 후 30일 무료 trial로 변형 가능)
- Pro 4종 중 결제자 사용률 < 20%인 기능 → 6개월 후 평가, 사용률 낮은 것 제거 또는 Pro+로 이동

**관련 박제**: D-018 Free 의도적 우위 / D-024 Smart alerts / D-020 가격 / D-025 현실 KPI

---

## D-027. 비용 중복 계산 버그 수정 — request_id 단위 dedup
**날짜**: 2026-05-13
**결정**: Claude Code JSONL의 동일 `request_id` 다중 등장을 **전역 dedup**. 1 request_id = 1 청구 이벤트.

**버그 진단**:
- Claude Code가 단일 API 응답을 여러 assistant 이벤트로 쪼개 JSONL에 기록 (예: `[thinking]` 블록 + `[text]` 블록 분리)
- 모든 분기는 **동일 request_id + 100% 동일 usage tuple** 유지
- `/resume` 등으로 **다른 세션 JSONL에도 같은 request_id 복제** 등장
- 검증 결과: 본인 데이터 **128/128 multi-entry 케이스가 usage 일치**, 최악 18회 중복
- **비용 60.3% 과대 계산** ($7,748 → 실제 $1,583)

**수정 사항**:
1. [src/parser.ts](src/parser.ts) — `seenRequestIds` set으로 파일 내 dedup (첫 등장만 적재)
2. [src/db.ts](src/db.ts) — 기존 unique index `(session_id, ts, request_id, model)` 폐기
   - 신규: `UNIQUE INDEX (source, request_id) WHERE request_id IS NOT NULL` (전역 dedup)
   - fallback: `(session_id, ts, model) WHERE request_id IS NULL` (Codex는 synth id로 항상 NOT NULL이라 여기로 안 옴)
3. [scripts/migrate-dedup.cjs](scripts/migrate-dedup.cjs) — 1회성: 레거시 index drop + token_events·ingest_state wipe → 전체 재ingest
4. Codex parser는 영향 없음 (synth requestId 이미 유일)

**실측 영향 (30일 누적)**:
| 지표 | 수정 전 | 수정 후 | 변화 |
|---|---|---|---|
| Claude Code USD | $7,718 | **$1,551** | -80% |
| Claude Code events | 8,857 | 2,374 | -73% |
| Codex USD | $33.71 | $33.71 | 0 |
| **합계** | **$7,752** | **$1,585** | **-80%** |
| 일평균 (Claude) | $258 | $52 | 합리적 ($200 Max 플랜과 정합) |

**시사점**:
- 카톡 사용자에게 **"내 종량제 환산 비용"** 표시 시 이전 수치는 5배 과장. 신뢰 사고 위험 컸음
- M2 출시 전 발견·수정 → 운영상 노출 0
- 다른 경쟁자 (ccusage 등)도 같은 버그 가능성 → 우리 dedup 정확성 자체가 차별점이 될 수 있음

**박제 학습**:
- JSONL 같은 stream 데이터는 의미상 1단위와 물리적 1줄이 다를 수 있음. 항상 의미 단위 키 (`request_id`)로 dedup
- 회계·비용 수치는 출시 전 반드시 외부 anchor (실결제 청구액)와 cross-check

**번복 트리거**:
- Anthropic이 향후 동일 request_id로 진짜 별개 청구를 발생시키는 경우 (현재 없음) → dedup 전략 재검토

---

## D-028. MCP 서버 모드 — 간단 헬퍼 4종 (Free 포함)
**날짜**: 2026-05-13
**결정**: Token Meter를 MCP 서버로도 노출 (`token-meter mcp`, stdio). Claude Code·Cursor·Claude Desktop이 호출. **Free 티어 포함** (Pro+의 풀 MCP 인터페이스와 별개의 경량 버전).

**근거**:
- 사용자 요구: "터미널 실수로 닫았을 때 도움 주는 간단한 MCP"
- MCP는 CLI 닫힘을 **막을 수 없음** (구조적). 대신 "닫혀도 데이터 안 잃음 + 빠른 resume" 보조
- 본인 데이터(JSONL·SQLite)만 읽음. 벤더 API·프로세스 제어 일절 없음 → 신뢰 비용 0
- Free 포함 사유: "Token Meter는 MCP로도 쓸 수 있다"는 차별점 자체가 마케팅. ccusage 등 경쟁자 없음

**노출 도구 4종**:
| 도구 | 용도 |
|---|---|
| `usage_summary` | today/week/month 비용·토큰 요약, 모델·프로젝트별 |
| `recent_sessions` | 최근 N시간 활동 세션 (실수로 닫은 거 찾기), `claude --resume` / `codex resume` 명령 즉시 제공 |
| `session_tools` | 특정 session_id가 쓴 MCP·도구별 호출수·응답크기·평균지연 ("왜 이 세션이 비쌌나" 디버깅) |
| `refresh_data` | JSONL 재스캔 |

**구현**:
- [src/mcp.ts](src/mcp.ts) — `@modelcontextprotocol/sdk` McpServer + StdioServerTransport
- [src/cli.ts](src/cli.ts) — `token-meter mcp` 명령
- [src/sessions.ts](src/sessions.ts) — `recentSessions()` 추가
- [docs/mcp-server.md](docs/mcp-server.md) — Claude Code·Cursor 등록 가이드
- [scripts/test-mcp.cjs](scripts/test-mcp.cjs) — handshake 스모크 테스트 (initialize → tools/list → tools/call)
- 의존성 추가: `@modelcontextprotocol/sdk`, `zod`

**"중단 세션 감지" 백로그 (M4+ nice-to-have)**:
- 현재 `recent_sessions`는 "최근 활동 세션" 기준. 진짜 "tool_use 후 tool_result 없이 끊김" 정밀 감지는 파서에 dangling-tool 카운트 추가 필요 → M4+ 정밀화
- v1은 "최근 N시간" 휴리스틱으로 충분 (사용자가 판단)

**Pro+ 풀 MCP 인터페이스와의 관계**:
- D-024·02-product.md의 Pro+ MCP 인터페이스 (`get_savings_recommendations`, `enable_trim`, `enable_local_routing` 등 행동 변경류)는 별개로 M4+ 유지
- 이번 D-028은 **읽기 전용 경량 4종만 Free 포함**

**번복 트리거**:
- MCP 도구 사용량 극저조 (6개월 호출 < 100건) → Free에서 빼고 Pro 한정 검토 (그래도 코드는 유지)

---

## 향후 결정 보류 항목

| 번호 | 항목 | 결정 시점 |
|---|---|---|
| TBD-1 | 최종 제품명·도메인 | M1 시작 전 |
| TBD-2 | 자동 액션 기본 ON/OFF 정책 | M3 출시 시 |
| TBD-3 | 자동 모델 라우팅 (로컬↔클라우드) | M4 |
| TBD-4 | GPU 모니터링 OS 우선순위 (NVIDIA 우선?) | M4 |
| TBD-5 | 한국어 UI 지원 여부 | M6 |
| TBD-6 | 모바일 앱 출시 여부 | Year 2 |
| TBD-7 | API 공개 시점·정책 | Year 2 |
| TBD-8 | Polar → Stripe 전환 시점 | 유료 1,000명 |
| TBD-10 | Pro+ ($24) 출시 여부·시점 | M4-M6 게이트 검증 후 |
| TBD-11 | Pro $5 → $7 인상 시점 | Pro+ 미출시 시 M6+ |
| TBD-9 | 익명 벤치마크 DB API 수익화 | Year 3 |
