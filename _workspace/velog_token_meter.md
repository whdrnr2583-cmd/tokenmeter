# Token Meter — Claude Code·Codex 토큰 사용량을 "가시화"하는 로컬 도구

LLM을 본격적으로 쓰기 시작하면 어느 순간 감각이 무너진다.

- 오늘 토큰을 얼마나 썼는지
- 어떤 툴이 비용·시간을 가장 많이 먹는지
- cache read/write 비중이 어떤지
- 어느 프로젝트가 비효율적인지
- 특정 날 비용이 왜 갑자기 튀었는지

대부분 모른 채 그냥 쓴다.

Token Meter는 그걸 보이게 만드는 도구다. 핵심은 한 줄이다.

> "안 보이던 LLM 사용량을 가시화한다."

말로만 하면 와닿지 않으니, 내 실제 데이터를 그대로 돌려봤다.

---

## 직접 돌려본 결과

설치랄 것도 없다. npm 한 줄이면 된다.

```sh
npx @whdrnr2583/token-meter ingest      # ~/.claude/projects + ~/.codex/sessions 스캔
npx @whdrnr2583/token-meter stats 7     # 최근 7일 요약
```

`ingest`는 로그를 스캔해 SQLite에 적재한다. 변경된 파일만 증분 처리한다.

```
Claude Code: scanned 59, processed 0, +0 tokens, +0 tools in 10ms
Codex:       scanned 42, processed 0, +0 tokens in 4ms
```

그리고 `stats 7` — 최근 7일:

```
=== Last 7 days ===
Events:        575
Input tokens:  265.9k
Output tokens: 650.4k
Cache read:    122.93M
Cache write:   3.31M
Estimated USD: $281.98

=== Daily (7d) ===
day         usd        input    output   cache_r  events
2026-05-12    $7.65      3.6k    76.2k     2.09M     50
2026-05-13  $273.21     15.9k   538.0k   117.24M    457
2026-05-15    $0.38    113.3k    13.0k     0.86M     27
2026-05-16    $0.74    133.2k    23.2k     2.75M     41
```

여기서 바로 한 가지가 눈에 띈다. **5월 13일 하루에 $273.21**. 그 주 전체 비용 $281의 97%가 하루에 몰려 있다.

그날은 내가 Token Meter 자체를 npm에 publish하던 날이었다. 457개 이벤트, cache read만 117M. "그날 뭔가 많이 했지" 하는 막연한 감각이, 숫자로 보면 이렇게 선명해진다.

모델별로 쪼개면 더 분명하다.

```
=== By model (7d) ===
claude-opus-4-7     $279.21   out=565.5k   events=465
claude-sonnet-4-6     $1.65   out= 48.8k   events= 42
gpt-5                 $1.12   out= 36.2k   events= 68
```

opus-4.7 하나가 전체의 99%다. Sonnet·GPT-5는 합쳐도 $3이 안 된다.

---

## 30일로 넓혀보면

`stats 30`을 돌리면 그림의 스케일이 달라진다.

```
=== Last 30 days ===
Events:        3231
Input tokens:  9.43M
Output tokens: 5.31M
Cache read:    742.04M
Cache write:   20.55M
Estimated USD: $1712.87
```

한 달에 **$1712**. 구독 요금제(Max plan)를 쓰면 실제로 이 돈을 내는 건 아니다 — 이건 "같은 사용량을 API로 그대로 했다면 얼마였을까"의 추정치다. 내 사용 강도를 객관적인 숫자로 환산해주는 셈이다.

모델별:

```
=== By model (30d) ===
claude-opus-4-7     $1676.39   out=3.83M   events=2488
gpt-5                 $34.83   out=1.43M   events= 701
claude-sonnet-4-6      $1.65   out=48.8k   events=  42
```

opus-4.7가 $1676 — 전체의 **97.9%**.

흥미로운 건 GPT-5다. 이벤트 수(701)와 output 토큰(1.43M)은 opus의 3~4할쯤 되는데, 비용은 $34밖에 안 된다. 전체의 2%다. 모델 단가 차이가 이렇게 크다는 걸, 막연히 "opus가 비싸지" 하고 아는 것과 숫자로 보는 건 완전히 다르다.

---

## 가장 유용했던 화면: 툴별 분해

`stats`는 MCP·툴별 분해도 같이 보여준다. 30일 기준:

```
=== MCP & tools (30d, top) ===
tool             calls   resp_tok   avg_latency
Read               279     305.4k       235ms
WebSearch          330     264.1k      8265ms
Bash               785     213.4k      9771ms
Agent               17      37.0k    131174ms
Grep                56      23.3k      1455ms
Edit               461      17.8k       836ms
WebFetch            56       8.7k     41979ms
```

여기서 진짜 인사이트가 나왔다.

`Agent` 툴은 30일 동안 **17번밖에 안 불렸는데 평균 응답이 131초**다. 2분이 넘는다. `WebFetch`는 평균 42초. 호출 횟수만 보면 작아 보이지만, "내 세션이 왜 이렇게 늘어지지"의 범인은 사실 이 둘이었다.

그리고 한 가지 더. 내 경우엔 무거운 외부 MCP 서버가 거의 없었다. 비용·시간을 먹은 건 대부분 내장 툴 — WebSearch, Bash, Agent였다. "MCP를 많이 붙이면 어디서 새는지 모른다"는 말은 맞지만, 정작 내 데이터에선 **내장 툴 자체가 비용 센터**라는 걸 이 표를 보고 나서야 알았다. 감각으로는 절대 안 보였다.

---

## 무엇을 하는 도구인가?

정리하면, Token Meter는 Claude Code와 Codex가 로컬에 남기는 JSONL 로그를 읽어서:

- 토큰 사용량 (input / output / cache)
- USD 추정 비용
- 모델별 / 프로젝트별 / 툴별 사용량
- 세션별 breakdown
- 시간대별 분포

를 전부 **로컬에서** 분석한다.

중요한 점:

- 데이터 외부 전송 없음
- 벤더 API 호출 없음 (OpenAI/Anthropic 계정 접근 자체가 없다)
- 전부 로컬 JSONL 파싱 + SQLite 집계

즉 "로컬 observability 도구"에 가깝다. 코드도 프롬프트도 내 머신 밖으로 안 나간다.

---

## 지원 소스

현재 지원하는 소스는 둘이다.

- Claude Code → `~/.claude/projects/**/*.jsonl`
- OpenAI Codex CLI → `~/.codex/sessions/**/*.jsonl`

SQLite WAL 모드로 저장하고, 변경된 파일만 증분 ingest한다.

---

## 제일 중요했던 문제: 중복 집계

위 숫자들이 의미가 있으려면 한 가지 함정을 먼저 넘어야 했다.

Claude Code는 한 응답을 thinking block, text block 등으로 나눠 기록하는 경우가 있다. 문제는 **usage 정보도 같이 중복 기록된다**는 점이다.

이걸 그대로 합산하면 비용이 실제보다 2~3배까지 부풀려진다. $1712가 $4000처럼 보이게 된다.

그래서 Token Meter에는:

- `request_id` 단위 dedup
- usage merge
- replay-safe 증분 ingest

로직이 들어가 있다. 이 부분은 실제로 데이터를 들여다본 사람만 겪는 문제라, 처음 발견했을 때 꽤 중요했다.

---

## 대시보드

`token-meter serve`를 실행하면 `http://localhost:8765`에 로컬 대시보드가 뜬다. (127.0.0.1 바인딩 — 외부에서 접근 불가)

CLI `stats`가 텍스트 요약이라면, 대시보드는:

- day / model / project breakdown (Chart.js 시각화)
- Claude + Codex 통합 화면
- 툴별 분석
- 시간대별 output token 분포
- 세션 drill-down — 메시지별 USD 추정
- 평균 응답 속도(TPS)

위 `stats` 출력이 글로 와닿았다면, 같은 데이터를 그래프로 보는 화면이라고 보면 된다.

---

## MCP 서버로도 동작한다

Token Meter는 MCP 서버로도 동작한다. Claude Code·Cursor·Claude Desktop에 등록하면 에이전트가 직접 호출할 수 있다.

```sh
npx -y @whdrnr2583/token-meter install-mcp all
```

제공하는 도구:

- `usage_summary` — 기간별 비용·토큰 요약
- `recent_sessions` — 최근 세션 + 붙여넣기용 `claude --resume` / `codex resume` 명령 (실수로 닫은 터미널 복구용)
- `session_tools` — 세션별 툴 breakdown
- `refresh_data` — 재스캔

그래서 채팅 안에서 그냥 *"이번 주 사용량 보여줘"* 라고 물으면 된다.

v0.1.9부터는 `readOnlyHint` / `destructiveHint` 같은 MCP tool annotations도 지원한다. 조회 도구는 확인 프롬프트 없이 바로 동작하도록.

---

## Smart Alerts

단순 조회만 하는 도구는 아니다. 룰 기반 alert도 있다.

- 하루 USD 초과
- cache write 폭증
- output token 급증

같은 조건을 감지해 데스크탑 알림 / 웹훅 POST / 이메일(Pro 예정)로 보낼 수 있다. per-rule cooldown이 있어서 스팸처럼 울리지 않는다.

5/13 같은 $273짜리 날을, 다음엔 그날 안에 알 수 있게 하는 장치다.

---

## 가격 계산은 "추정치"다

USD 숫자는 Anthropic/OpenAI 공개 단가표 기반의 **추정치**다. 지원: Opus / Sonnet / Haiku, GPT-5 / GPT-5-Codex / GPT-4o / mini 계열.

실제 벤더 invoice와 100% 일치하는 회계 시스템은 아니다. 벤더가 단가를 바꾸기도 하고, 구독제는 정액이라 화면의 $는 "API로 했다면" 금액이며, 일부 토큰 항목(server-side tool use, cache write 변형)은 근사값이다.

목적은 정확한 청구가 아니라 — **낭비 탐지와 행동 교정**이다. 숫자는 "절대 금액"보다 "상대 신호"로 보면 된다.

---

## 왜 만들었나

LLM을 오래 쓰다 보면 결국 드는 생각이 하나 있다.

> "지금 뭐가 새고 있는 거지?"

특히 MCP와 툴을 많이 붙이기 시작하면 — 어떤 게 비싼지, 어떤 프롬프트가 비효율적인지, cache가 왜 폭증하는지 — 감각으로는 절대 안 보인다.

위에서 본 것처럼, 내 30일치를 돌려보고 나서야 "opus가 97.9%", "Agent 호출 하나가 2분", "5/13 하루에 $273" 같은 사실들을 알았다. 쓰는 내내 몰랐던 것들이다.

그래서 만든 게 Token Meter다. 한마디로:

> LLM 사용량 observability. 더 짧게는 — 가시화.

---

## 현재 상태 & 앞으로

지금은 베타다. Pro gating은 비활성, 전 기능 개방 상태다.

앞으로 검토 중인 것:

- 로컬 LLM proxy (Ollama / vLLM 연동)
- GPU/VRAM 추적
- 자동 trim 제안

다만 이건 수요가 확인되면 붙일 영역이고, 지금 핵심은 "클라우드 LLM 사용량을 정직하게 보여주는 것" 하나다.

---

## 정리

Token Meter는 AI 모델을 더 "잘 쓰게" 만드는 도구라기보다,

> "내가 지금 어떻게 쓰고 있는지 보이게 만드는 도구"

에 가깝다.

LLM 시대에는 결국 observability도 인프라의 일부가 된다고 생각한다. 안 보이면, 새는 줄도 모른다.

- npm: `@whdrnr2583/token-meter`
- GitHub: `whdrnr2583-cmd/token-meter`
- Site: token-meter.dev
- License: MIT (코어)
