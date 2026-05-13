# 배포 가이드 — Token Meter

전제: koreanpulse Lightsail **절대 공유 안 함** (D-023). 모든 인프라는 Cloudflare 서버리스 + GitHub + npm.

---

## 0. 사전 준비 (이번 주)

| 항목 | 어디서 | 비용 | 비고 |
|---|---|---|---|
| GitHub 사용자/Org 정리 | github.com | $0 | `<owner>` 결정 |
| Cloudflare 계정 | cloudflare.com | $0 | 기존 계정 사용 가능 |
| 도메인 `tokenmeter.dev` | Cloudflare Registrar | **$12/yr** | 1순위. 백업 `tokenmeter.io` |
| npm 계정 + 2FA | npmjs.com | $0 | publish 권한용 |
| Polar.sh 가입 | polar.sh | $0 | M3 결제 시작 시 활성화 |
| Resend 계정 (M3) | resend.com | $0 | 3k 이메일/월 무료, 라이선스 키 발송 |

**도메인 등록 즉시 — 5분**:
1. Cloudflare Registrar에서 `tokenmeter.dev` 검색
2. 등록 (개인정보 보호 자동 포함)
3. DNS는 자동으로 Cloudflare nameserver

---

## 1. M2 — OSS 공개 + 랜딩

### 1.1 GitHub 리포 3개 생성

```bash
# public, MIT, OSS 코어
gh repo create <owner>/token-meter --public --license mit \
  --description "One local dashboard for your Claude Code and Codex usage."

# private, 랜딩 (Cloudflare Pages 연결)
gh repo create <owner>/token-meter-site --private \
  --description "Token Meter marketing site."

# private, 라이선스 API (Cloudflare Workers)
gh repo create <owner>/token-meter-api --private \
  --description "Token Meter license + waitlist API."
```

### 1.2 npm publish 준비

```bash
# 패키지명 충돌 확인
npm view token-meter  # → 404가 정답

# CLI 빌드 검증
npm ci
npm run build        # tsc → dist/cli.js
node dist/cli.js stats

# 첫 publish (수동 1회)
npm login
npm publish --access public
```

이후 publish는 GitHub Actions가 처리 (`v0.2.0` 태그 push → `.github/workflows/release.yml`).

### 1.3 npm 토큰 등록 (자동 publish용)

1. npmjs.com → Access Tokens → Generate → "Granular" → publish scope만
2. GitHub `<owner>/token-meter` → Settings → Secrets → `NPM_TOKEN` 추가

### 1.4 Cloudflare Pages 랜딩 배포

```bash
# Pages dashboard:
# 1. token-meter-site 리포 연결
# 2. Build command: (none, 정적 사이트)
# 3. Build output: /
# 4. Custom domain: tokenmeter.dev
```

`infra/site/` 폴더를 `<owner>/token-meter-site` 리포 루트에 복사하여 사용.

---

## 2. M3 — 결제 API

### 2.1 Cloudflare Workers + D1 셋업

```bash
cd infra/api
npm install

# D1 데이터베이스 생성
npx wrangler d1 create token-meter
# → 출력된 database_id를 wrangler.toml에 붙여넣기

# 스키마 마이그레이션
npm run db:migrate:remote

# Secrets 등록
npx wrangler secret put POLAR_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY

# 첫 배포
npx wrangler deploy
# → https://token-meter-api.<account>.workers.dev

# 커스텀 도메인 연결 (Cloudflare 대시보드):
# Workers → token-meter-api → Triggers → Add Custom Domain
# api.tokenmeter.dev
```

### 2.2 Polar webhook 연결

1. Polar 대시보드 → Webhooks → Add
2. URL: `https://api.tokenmeter.dev/v1/polar/webhook`
3. Secret 생성 → `wrangler secret put POLAR_WEBHOOK_SECRET`로 등록
4. Events 구독: `subscription.created`, `subscription.active`, `subscription.canceled`, `subscription.revoked`

### 2.3 CLI에 라이선스 검증 추가 (코드, M3 진입 시)

`src/license.ts` (M3 진입 시 생성):
```typescript
// token-meter activate <key>
// ~/.tokenmeter/license.json 저장
// startup 시 1일 1회 verify
```

---

## 3. 도메인 DNS 구성

| 호스트 | 타입 | 값 | 용도 |
|---|---|---|---|
| `tokenmeter.dev` | CNAME | `<pages-project>.pages.dev` | 랜딩 |
| `www.tokenmeter.dev` | CNAME | `tokenmeter.dev` | redirect |
| `api.tokenmeter.dev` | Workers Route | `token-meter-api` | 라이선스 API |
| MX | — | (이메일 미사용 시 공란) | — |
| `hello@tokenmeter.dev` | Cloudflare Email Routing | 본인 이메일로 forward | 응대 채널 |

Cloudflare Email Routing 사용 → 무료. 발송은 Resend 사용.

---

## 4. 응대 자동화 (Gemini)

D-020 결정대로 결제·환불·버그만 본인. 나머지 Gemini 자동.

**구성 (M3 진입 시)**:
1. `hello@tokenmeter.dev` → Cloudflare Email Routing → 본인 Gmail
2. 본인 Gmail에 필터: 자동 라벨링 (결제·환불·버그 vs 기타)
3. "기타" 라벨 → Apps Script 또는 별도 워커 → Gemini API 응답 생성 → 초안 저장 (자동 발송 X, 본인 1회 검토 후 발송)
4. 결제·환불·버그 라벨 → 본인 직접 응답

자동 발송하지 않는 사유: 첫 6개월은 응답 품질·톤 관찰. 익숙해지면 자동 발송으로 전환 검토.

---

## 5. 비용 추적 (Year 1)

| 항목 | 월 | 연 |
|---|---|---|
| 도메인 | $1 | $12 |
| Cloudflare Pages | $0 | $0 |
| Cloudflare Workers | $0 (~10만 req/일) | $0 |
| Cloudflare D1 | $0 (~5GB) | $0 |
| npm | $0 | $0 |
| Resend | $0 (3k/월) | $0 |
| Polar 수수료 | 매출의 ~6% | 매출 비례 |
| **고정비 총액** | **$1** | **$12** |

Pro 1,000명 도달 시: Workers 유료 $5/월로 전환 가능 (1천만 req/월).

---

## 6. 배포 체크리스트 (M2 출시 직전)

- [ ] `npm view token-meter` 비어있는지 최종 확인
- [ ] `tokenmeter.dev` 도메인 활성화 + TLS
- [ ] GitHub 리포 3개 생성 + 시드 커밋
- [ ] `NPM_TOKEN` GitHub secret 등록
- [ ] `v0.1.0` 태그 푸시 → release.yml 트리거 → npm publish 검증
- [ ] `npx token-meter ingest` 깨끗한 머신에서 동작 확인 (Win/Mac/Linux)
- [ ] README 영문 polish, 스크린샷 3장
- [ ] HN Show 초안 작성 (출시일 +1 발사)
- [ ] r/ClaudeAI 베타 안내 글 초안
- [ ] 카톡 AI 오픈채팅방 한국어 안내 초안

---

## 7. 배포 체크리스트 (M3 결제 직전)

- [ ] Polar 상품 등록: Token Meter Pro $5/월
- [ ] CF Workers 배포 + custom domain
- [ ] Polar webhook 연결 + secret 등록
- [ ] D1 schema 마이그레이션 (remote)
- [ ] 실거래 1회 (본인 카드로 결제 → 라이선스 발급 확인 → 환불)
- [ ] CLI `token-meter activate` 명령 추가 + 검증
- [ ] Resend 발신 도메인 검증 + DKIM
- [ ] 결제 페이지 → 랜딩에 Pro 결제 버튼 추가
- [ ] 환불 정책 명시 (7일 무조건 환불)
- [ ] Pro 첫 결제자 1명에게 본인 직접 이메일 (활성화 확인)

---

## 8. 위험 발생 시 대응

| 위험 | 대응 |
|---|---|
| Workers 무료 한도 초과 | $5/월 Workers Paid 전환. 매출로 회수 |
| D1 5GB 초과 | 오래된 webhook_events 1년 후 자동 삭제 |
| npm 패키지 탈취 | 2FA + provenance 사용. NPM_TOKEN 정기 회전 |
| Polar 장애 | Stripe 직접 결제 백업 플랜 (D-001 보류) |
| 도메인 만료 | auto-renew 활성화 + 2개월 전 알림 |
| 본인 Gemini API 한도 | Gemini Free 한도 충분. 초과 시 응대 폴백 = 본인 직접 |
