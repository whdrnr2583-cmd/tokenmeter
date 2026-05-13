# 02. 제품·기술

## 2.1 제품 정의

**Token Meter = 클라우드 + 로컬 LLM 통합 사용·성능 옵저버빌리티 + 권장·자동 액션**

### 두 측면, 다른 기술 접근

| 측면 | 데이터 수집 | 정확도 | 사용자 페르소나 |
|---|---|---|---|
| **클라우드** | 로컬 JSONL **read-only 파싱** | 100% 토큰, 평균 TPS | 페르소나 A |
| **로컬 LLM** | OpenAI-호환 API **HTTP 프록시** | 100% 토큰, **정확 TPS/TTFT/ITL** | 페르소나 B |

## 2.2 3계층 가치

### Layer 1: Pulse (가시화) — Free + Pro
- Claude Code + Codex 통합 비용 대시보드
- 로컬 LLM TPS·VRAM 차트 (프록시 활성화 시)
- 일·주·월 추이
- 모델별·프로젝트별 breakdown

### Layer 2: Diagnose (진단) — Pro
- 클라우드 토큰 낭비 패턴 탐지
- **모델 성능 비교**:
  - Sonnet 4.6 vs Opus 4.7 vs Codex GPT-5 (가성비)
  - Ollama qwen2.5-coder vs llama3.1 (속도)
- **하이브리드 비용 환산**:
  - "이번주 로컬로 처리한 게 Claude API면 $X"
  - "이번주 클라우드 사용분을 로컬 7B로 했으면 $Y 절감"
- 시간대별 성능 변동 (오후 클라우드 혼잡, 저녁 로컬 thermal throttle 등)
- 주간 권장 리포트

### Layer 3: Act (액션) — Pro+ **(M4+ 추후 작업, 보류)**
- 클라우드 자동 액션 (trim, cache, loop break)
- 로컬 모델 자동 선택 라우터 (작업별 최적 모델)
- GPU 알림 (VRAM 임계, thermal)
- 클라우드↔로컬 자동 폴백 권장

**보류 사유**: 현재 작업은 Free + Pro $5까지. Pro+ ($24)는 Pro 결제 트리거·로컬 LLM WTP 검증 후 분리.
**Pro에 포함되는 액션 (대안)**: 자동 trim **룰 제안** (사용자가 수동 적용). 자동 실행은 Pro+ 한정.

## 2.3 클라우드 통합 (M1, M2)

### Claude Code (M1)
- 위치: `~/.claude/projects/<project>/*.jsonl`
- 형식: JSONL, 메시지마다 timestamp + usage 객체
- 추출: input/output/cache_read/cache_write 토큰, model, tool calls
- TPS 계산: (output_tokens) ÷ (response_completed_at - request_started_at)
- 한계: TTFT 부정확 (요청 전송 ~ 첫 응답 시점 분리 안 됨)

### Codex (M2)
- 위치: `~/.codex/history.jsonl` + `codex --json` 스트림
- 형식: `turn.completed` 이벤트의 `usage` 객체
- 추출: input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens
- TPS 계산: 동일 패턴
- 참고: ccusage가 이미 Codex 지원 — 파서 로직 참고

## 2.4 로컬 LLM 통합 (M4+ 추후 작업, Pro+ 분리 후)

**현재 작업 범위에서 제외**. Pro $5는 클라우드 (Claude Code + Codex)만 지원.
Pro+ 분리 게이트 통과 시 (M4+) 아래 통합 진행.


### 작동 원리: HTTP 프록시

```
[사용자 코드] → http://localhost:8765 (TokenMeter 프록시)
                    │
                    ├─ 요청 timestamp 기록
                    ├─ 요청 헤더·바디 파싱 (model, prompt 길이)
                    ↓
                http://localhost:11434 (실제 Ollama)
                    │
                    ↓ SSE 스트림
                [TokenMeter 프록시] 
                    ├─ 첫 토큰 timestamp → TTFT
                    ├─ 토큰별 timestamp → ITL
                    ├─ 완료 timestamp → 총 TPS
                    ↓ 동일 SSE 그대로 전달
                [사용자 코드]
```

### 통합 대상 (OpenAI-호환 API 보유)
| 도구 | 기본 엔드포인트 | 우선순위 |
|---|---|---|
| Ollama | `http://localhost:11434` | M3 |
| LM Studio | `http://localhost:1234` | M3 |
| llama.cpp (server) | `http://localhost:8080` | M4 |
| vLLM | `http://localhost:8000` + Prometheus | M4 |
| LocalAI | OpenAI 호환 | M5+ |

### 프록시 모드 장점
- **밀리초 정확도** TTFT, ITL 측정 가능 (SSE 가로채기)
- 모델 자동 감지 (`model` 파라미터에서)
- 100% 정확한 토큰 카운트 (응답에 포함)
- 사용자 코드 변경 불필요 — base URL만 바꾸면 됨

### GPU/VRAM 트래킹 (Pro+)
- NVIDIA: `nvidia-smi` 호출 (Linux/Windows)
- AMD: `rocm-smi`
- Apple Silicon: `powermetrics` (sudo 필요)
- 측정: VRAM 사용, GPU utilization, 온도
- 인퍼런스 timestamp와 상관 분석 → "추론 중 VRAM 95% 도달"

## 2.4.1 MCP·도구별 토큰·속도 귀속 (핵심 차별점)

다수 경쟁자가 **총 토큰**만 표시. 우리는 **MCP 서버·도구 단위로 쪼개서** 어디서 새는지 직접 보여준다.

### 측정 정밀도 (정직)

#### 🟢 100% 정확 (직접 측정)
| 지표 | 측정 방법 |
|---|---|
| 도구별 호출 횟수 | JSONL `tool_use.name` 카운트 |
| 도구별 응답 토큰 | `tool_result` 콘텐츠 토큰화 |
| 도구별 지연 (latency) | `tool_result.ts - tool_use.ts` |
| MCP 서버 그룹핑 | `mcp__<server>__<tool>` 패턴 파싱 |

#### 🟡 추정 (~80% 정확)
| 지표 | 방법 |
|---|---|
| 도구의 청구 기여도 | 응답 토큰 + 비례 턴 오버헤드 |
| 도구 제거 시 절감액 | 시뮬레이션 |

#### 🔴 측정 불가
| 지표 | 이유 |
|---|---|
| 개별 토큰의 도구 귀속 | LLM 추론·툴 호출 한 턴 혼재. 수학적 분리 불가 |

### 출력 예시
```
═══ 이번주 MCP별 분석 ═══

┌─────────────────┬──────┬──────────┬────────┬──────────┐
│ MCP             │ 호출 │ 응답토큰  │ 지연    │ 청구기여 │
├─────────────────┼──────┼──────────┼────────┼──────────┤
│ notion          │   89 │  412k    │ 4.2s   │ ~$3.50   │
│ github          │  142 │  287k    │ 1.8s   │ ~$2.40   │
│ filesystem      │  523 │   95k    │ 0.3s   │ ~$1.20   │
│ web-search      │   34 │  178k    │ 2.1s   │ ~$1.80   │
│ bash            │  267 │   62k    │ 0.5s   │ ~$0.70   │
└─────────────────┴──────┴──────────┴────────┴──────────┘

🚨 발견:
- Notion 응답 평균 4.6k 토큰 → 사용 필드 3개 → 80% trim 가능 (~$2.80/주 절감)
- filesystem 호출 빈도 1위 → 동일 파일 반복 read → 캐시 시 50% ↓
- Notion 지연 4.2s ← 정상 (서버측 응답 시간)

🛠 권장 액션:
[ ] Notion MCP 응답 필드 화이트리스트
[ ] filesystem MCP 세션 캐시 활성화
```

### 클라우드 vs 로컬 측정 범위

| 측정 | Claude Code / Codex (JSONL) | 로컬 LLM (프록시) |
|---|---|---|
| 도구 호출 횟수 | ✅ | — (로컬 LLM은 MCP 미인지) |
| 도구 응답 토큰 | ✅ | — |
| 도구 지연 | ✅ | — |
| 청구 기여도 | 🟡 추정 | — |
| 요청별 TPS·TTFT·ITL | 🟡 평균만 | ✅ 밀리초 정확 |
| 모델별 비교 | ✅ | ✅ |

→ **MCP 단위 분석은 클라우드 측 전용**. 로컬은 **모델·프롬프트 단위** 분석.

### 차별점 (재명시)

| 도구 | MCP별 토큰 | MCP별 지연 | 권장 액션 |
|---|---|---|---|
| ccusage | ❌ (총 토큰만) | ❌ | ❌ |
| tokscale | ❌ | ❌ | ❌ |
| claude-usage (phuryn) | ❌ | ❌ | ❌ |
| Langfuse (SDK 통합 시) | ✅ (앱 빌더용) | ✅ | 부분 |
| **Token Meter** | **✅ (JSONL 자동)** | **✅** | **✅** |

→ **Claude Code/Codex 사용자에게 MCP 단위 자동 분석 = 우리만 제공**.

---

## 2.5 TPS·성능 측정 (핵심 기능)

### 측정 가능 지표 매트릭스

| 지표 | 정의 | 클라우드 (로그) | 로컬 (프록시) |
|---|---|---|---|
| **avg TPS** | 출력 토큰 / 응답 시간 | ✅ 추정 (~95% 정확) | ✅ 정확 |
| **TTFT** | 요청 → 첫 토큰 | ⚠ 부정확 (request_started 부재) | ✅ 밀리초 정확 |
| **ITL** | 토큰 간 평균 간격 | ❌ 불가 | ✅ 밀리초 정확 |
| **p50/p95/p99 latency** | 응답 시간 분포 | ✅ | ✅ |
| **모델별 비교** | 같은 작업 다른 모델 | ✅ | ✅ |
| **시간대별 변동** | 클라우드 혼잡·로컬 thermal | ✅ | ✅ |
| **GPU/VRAM 상관** | 인퍼런스 중 GPU 상태 | — | ✅ (Pro+) |
| **batch throughput** | 동시 요청 처리량 | ❌ (단일 세션) | ✅ |

### 인사이트 예시
```
이번주 클라우드 성능:
  Claude Sonnet 4.6   95 tok/s (평균 99 tok/s)
  Codex GPT-5         88 tok/s (평균 92 tok/s)
  오후 2-4시 응답 30% 느림 → 시간 분산 권장

이번주 로컬 성능 (Ollama on RTX 4090):
  qwen2.5-coder-7B    62 tok/s  TTFT 380ms
  llama3.1-8B         71 tok/s  TTFT 290ms ← 빠름
  qwen2.5-32B-Q4      18 tok/s  TTFT 1.2s  ← VRAM 95%, 느림

권장:
- 코드 작업 → llama3.1-8B (속도+가성비)
- 깊은 추론 → 클라우드 Opus (로컬 32B보다 빠름·정확)
- 이번달 로컬 처리분이 클라우드면: $47 (현재 GPU 전기료 ~$12)
- 결론: 로컬 ROI 양호. 32B는 양자화 Q3로 시도 권장.
```

## 2.6 MCP 인터페이스 (Pro+, M4+ 추후)

**현재 작업 범위에서 제외**. Pro+ 분리 시 출시.

```
get_usage_report(period?: "day"|"week"|"month", source?: "cloud"|"local"|"all")
get_savings_recommendations()
get_performance_insights()
benchmark_local(model: str, prompt_set: str)
suggest_model(task_type: str)
enable_trim(server: str, fields: list)
enable_local_routing(rules: list)
get_cloud_vs_local_equivalence()
```

## 2.7 저장 구조

```
~/.tokenmeter/
├── usage.db              # 통합 (cloud + local)
├── config.yaml
├── rules/
└── proxies/
    ├── ollama.log
    └── lmstudio.log
```

### SQLite 스키마 (핵심)
```sql
CREATE TABLE token_events (
  id INTEGER PRIMARY KEY,
  ts INTEGER,                  
  source TEXT,                 -- claude-code | codex | ollama | lmstudio | llamacpp | vllm
  source_kind TEXT,            -- cloud | local
  model TEXT,
  project TEXT,
  session_id TEXT,
  input_tokens INT,
  output_tokens INT,
  cache_read_tokens INT,
  cache_write_tokens INT,
  ttft_ms INT,                 -- 로컬만 정확, 클라우드는 NULL
  itl_avg_ms REAL,             -- 로컬만
  total_duration_ms INT,
  tps REAL,                    
  usd_estimate REAL,           -- 클라우드는 실비, 로컬은 0
  usd_equivalent REAL          -- 로컬을 클라우드로 했을 시 추정
);

CREATE TABLE gpu_samples (         -- Pro+ 만
  id INTEGER PRIMARY KEY,
  ts INTEGER,
  vram_used_mb INT,
  vram_total_mb INT,
  gpu_util_pct INT,
  temp_c INT
);
```

## 2.8 프라이버시·보안

| 항목 | 처리 |
|---|---|
| 클라우드 JSONL | read-only, 메타데이터만 추출 (대화 내용 X) |
| 로컬 프록시 | 메타데이터만 기록, 프롬프트/응답 본문 저장 X (디폴트) |
| 본문 저장 옵션 | 옵트인, 로컬 암호화 SQLite |
| 클라우드 sync | E2E 암호화, 옵트인 |
| GPU 모니터링 | 시스템 명령 호출, 본인 기기만 |
| API 키 | 사용 안 함 |

→ **GDPR·개인정보보호법 거의 무관**.

## 2.9 기술 스택

| 레이어 | 선택 | 이유 |
|---|---|---|
| Local Agent | Node.js (TypeScript) | MCP SDK 성숙, HTTP 프록시 쉬움 |
| HTTP 프록시 | http-proxy-middleware | Node 표준 |
| 저장 | SQLite | 임베디드, 충분 |
| 대시보드 UI | React + Vite, localhost:8080 | 크로스플랫폼 |
| 차트 | Recharts | 가벼움 |
| 클라우드 sync (Pro) | Cloudflare Workers + R2 + D1 | 서버리스 |
| 결제 | Polar.sh | MoR |
| GPU 모니터링 | nvidia-smi / rocm-smi / powermetrics 호출 | OS 표준 |
| 배포 | npx, Homebrew, brew tap (옵션) | 인디 친화 |

## 2.10 MVP 범위 (M1, 4주)

**M1 포함**:
- Claude Code JSONL 파싱 엔진
- 로컬 대시보드 (localhost:8080)
- 일·주·월 비용 차트
- 모델별 breakdown
- **평균 TPS 계산·표시** (Claude Code 단독)
- 알파 5명 테스트

**M1 제외 (이후 단계)**:
- Codex (M2)
- 로컬 LLM 프록시 (M3)
- 권장 엔진 (M2-M3)
- 자동 액션 (M3-M4)
- 클라우드 sync (M3)
- 결제 (M3)
- GPU 모니터링 (M4)

## 2.11 단계별 로드맵 (확정 — $5 단일)

| 시점 | 추가 통합 | 추가 기능 | 가격 | 핵심 가치 |
|---|---|---|---|---|
| M1 (4주) | Claude Code | 가시화, MCP 분석, 평균 TPS | Free | 단일 클라이언트 PMF |
| M2 (8주) | Codex | 권장 엔진 v0, 통합 뷰 | Free | "Claude + Codex 멀티벤더" |
| M3 (12주) | — | 무제한 히스토리, 주간 권장 리포트, 자동 trim 룰 제안 | **Pro $5** | 결제 시작 |
| M4-M6 | — | Pro+ 분리 게이트 검증, 콘텐츠 가속 | Pro $5 | 풀 확장 |
| M7+ (조건부) | Ollama, LM Studio, llama.cpp, vLLM | GPU 모니터링, 자동 액션, 벤치마크 랩 | **Pro+ $24** | 게이트 통과 시만 출시 |
| Year 2 (조건부) | Team 기능 | 팀 벤치마크, 정책 | Team TBD | B2B 진입 |

## 2.12 의도적 제외

| 제외 항목 | 이유 |
|---|---|
| Gemini CLI 통합 | telemetry 옵트인 필요, 사용자 작음 |
| Cursor 통합 | SQLite 토큰 저장 불확실, 형식 변경 위험 |
| Claude Desktop 통합 | 로그 형식 다양, 비용 차원에서 우선순위 낮음 |
| 자체 토크나이저 | 부정확, 유지보수 부담 |
| 보안 가드레일 | 신뢰·책임 부담 (사용자 룰) |
| 모바일 앱 | Year 2+ |
| 로컬 LLM 호스팅 자체 | 범위 폭발 |
