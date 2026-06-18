# KICE 아레나 완료 사항

작성일: 2026-06-18

이 문서는 현재까지 구현 또는 문서화가 끝난 범위를 한곳에 모은 완료 기록이다. 아직 정책 결정이나 제품 판단이 필요한 항목은 제외하고, 코드/테스트/운영 문서로 근거가 있는 항목만 적는다.

## 제품과 사용자 흐름

- 실시간 방 생성, 입장, 초대 링크, 재접속 흐름을 구현했다.
- 사용자는 익명 nickname으로 참가할 수 있고, 방장은 시험 시간, 프리즈 시작 시각, 아이템 사용 여부를 설정할 수 있다.
- Casual / Contest room mode를 분리했다.
- Contest room은 최대 200명까지 수용하도록 guardrail을 두었다.
- 공개 이벤트 등록 흐름을 만들고, 이벤트 방은 invite 중심으로 참가하도록 제한했다.
- 관전자는 문제 화면을 볼 수 있는 spectator flow를 사용할 수 있다.

주요 파일:

- `client/src/screens/HomeScreen.tsx`
- `client/src/screens/HomeEntryActions.tsx`
- `client/src/screens/LobbyScreen.tsx`
- `client/src/screens/SpectatorProblemScreen.tsx`
- `server/index.ts`
- `shared/roomConfig.ts`
- `shared/roomLifecycle.ts`

## 문제와 시험 카탈로그

- 문제 본문/선지 구조를 `ProblemBodyBlock` 기반으로 정리했다.
- 객관식, 단답형, paragraph, note, choices, diagram block을 처리한다.
- KaTeX 기반 수식 렌더링을 공통 컴포넌트로 분리하고 캐시 경로를 도입했다.
- SVG/PNG/JPEG/WebP diagram asset을 시험 DB에 저장하고 클라이언트에서 표시한다.
- 로컬 `server/exams/*/manifest.json`을 Postgres 시험 카탈로그로 seed한다.
- 관리자 화면에서 시험 설정, 문항 본문, 정답, 난도, 배점, diagram asset을 편집하고 미리볼 수 있다.

주요 파일:

- `shared/game.ts`
- `shared/problemBody.ts`
- `client/src/components/common/MathHtml.tsx`
- `client/src/components/arena/ProblemContent.tsx`
- `client/src/screens/admin/*`
- `client/src/screens/adminProblemMarkup.ts`
- `server/examDatabase.ts`
- `server/seedExamCatalog.ts`

## 풀이, 제출, 점수

- 서버가 제출 가능 여부, 방 상태, 참가자 권한, 정답 판정, 점수, 페널티를 검증한다.
- 제출 기록, 재시도 횟수, 정답 여부, 점수, 페널티를 저장한다.
- Contest 제출은 idempotency key로 재시도 안전성을 확보한다.
- 객관식 중복 제출, 이미 맞힌 문항 재제출, 잘못된 room/player/socket 상태를 서버에서 차단한다.
- frozen scoreboard와 실제 개인 점수 상태를 분리했다.
- 최종 reveal 단계에서 프리즈 이후 제출과 성적표 표시를 처리한다.

주요 파일:

- `server/scoring.ts`
- `server/roomDatabase.ts`
- `server/problemAttemptDatabase.ts`
- `server/index.ts`
- `shared/reveal.ts`
- `client/src/screens/RankingsScreen.tsx`
- `client/src/screens/ResultsScreen.tsx`
- `client/src/screens/FinalReportView.tsx`

## 순위표와 성적표

- DOMjudge식 순위표 UI를 구현했다.
- 라이브 순위표와 프리즈 공개 순위를 분리했다.
- 최종 성적통지표 화면을 만들었다.
- 표준점수, 백분위, 등급 계산 유틸을 구현했다.
- 결과 reveal 보조 로직과 관련 테스트를 추가했다.

주요 파일:

- `client/src/screens/RankingsScreen.tsx`
- `client/src/screens/ResultsScreen.tsx`
- `client/src/screens/FinalReportView.tsx`
- `client/src/lib/report.ts`
- `shared/reveal.ts`

## 아이템 시스템

- 아이템 정의, 인벤토리, 대상 선택, 사용, active effect, cooldown/expiry 흐름을 구현했다.
- 아이템 사용 가능 여부는 room mode에 따라 서버와 공유 규칙으로 판단한다.
- item protocol 문서를 작성해 새 아이템 추가 순서와 검증 범위를 정리했다.

주요 파일:

- `shared/game.ts`
- `shared/roomConfig.ts`
- `server/items.ts`
- `client/src/components/arena/ItemDock.tsx`
- `client/src/components/arena/ItemIcon.tsx`
- `docs/item-protocol.md`

## Campaign gate와 인증

- 추천 코드 기반 referral URL whitelist를 만들었다.
- 고등학교 위치 기반 인증 흐름을 구현했다.
- username/password 로그인과 캠페인 auth cookie/token을 구현했다.
- 캠페인 참가자 상태, phone, PG metadata 저장 슬롯을 DB 모델에 반영했다.
- 관리자 캠페인 통계와 referral whitelist 관리 화면을 구현했다.

주요 파일:

- `shared/campaign.ts`
- `server/campaignAuth.ts`
- `server/campaignDatabase.ts`
- `server/campaignWhitelistDatabase.ts`
- `server/campaignStatsDatabase.ts`
- `server/highSchoolGeo.ts`
- `client/src/components/ReferralSchoolGate.tsx`
- `client/src/screens/AdminCampaignScreen.tsx`
- `client/src/components/AdminCampaignStats.tsx`

## 상태 저장과 동시성

- room state를 Postgres `room_states`에 snapshot으로 저장한다.
- 같은 room code의 상태 변경을 Postgres advisory lock과 in-process mutex로 직렬화한다.
- Socket.IO Redis adapter를 붙여 여러 app container의 room broadcast를 공유한다.
- stale socket, room version, frozen standings snapshot처럼 contest 내구성에 필요한 상태 방어를 추가했다.
- 대규모 contest 부하 테스트용 Socket.IO 스크립트와 운영 파이프라인 문서를 마련했다.

주요 파일:

- `server/roomDatabase.ts`
- `server/keyedMutex.ts`
- `server/index.ts`
- `scripts/socketio_load_test.mjs`
- `docs/websocket-load-test-pipeline.md`

## 운영과 배포

- Bun 기반 개발/검증 명령을 정리했다.
- Docker Compose blue/green app container와 sticky Nginx gateway 구성을 만들었다.
- 배포 시 `kice-arena-seed`가 시험 카탈로그를 동기화한다.
- Bun/Node image flavor 차이를 흡수하는 runtime-aware command와 healthcheck를 구성했다.
- GitHub Actions 기반 CI, image publish, home server deploy workflow를 둔다.
- Postgres, Redis, Prometheus, Alertmanager, Grafana를 Compose 운영 구성에 포함했다.

주요 파일:

- `package.json`
- `bun.lock`
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/*`
- `deploy/nginx-app.conf`
- `deploy/monitoring/*`
- `deploy/grafana/*`

## 모니터링

- `/metrics` endpoint와 Prometheus scrape 설정을 구성했다.
- runtime heartbeat, active rooms, room status, contest sessions, participants, submissions, socket connections를 계측한다.
- incident cause-first Grafana dashboard를 만들었다.
- KiceArenaMetricsMissing 계열 장애 대응을 문서화하고, target/alert truth를 기준으로 복구 여부를 판단하는 절차를 세웠다.

주요 파일:

- `server/index.ts`
- `shared/runtimeMetrics.ts`
- `deploy/monitoring/README.md`
- `deploy/monitoring/prometheus.yml`
- `deploy/monitoring/rules/kice-arena-prometheus-rules.yml`
- `deploy/grafana/dashboards/kice-arena.json`
- `deploy/grafana/dashboards/kice-arena-cause-first.json`

## UI와 디자인 정리

- 홈, 로비, 결과 화면을 시험장 톤에 맞춰 정리했다.
- OMR, 성적표, 순위표 중심의 시각 언어를 유지하도록 `DESIGN_NOTES.md`와 `design.md`를 기준 문서로 둔다.
- 아이템 ON/OFF, 입장/초대, 결과 watermark 등 주요 UI affordance를 정리했다.
- 큰 CSS 파일을 화면/컴포넌트 소유 단위로 분리했다.
- 최종 파일 400줄 제한과 code golf 금지 원칙을 프로젝트 규칙으로 유지한다.

주요 파일:

- `DESIGN_NOTES.md`
- `design.md`
- `client/src/styles.css`
- `client/src/styles/**`
- `client/src/screens/**`

## SEO와 공개 메타데이터

- 제품명을 `KICE 아레나`로 통일했다.
- 기본 HTML에 한국어 title, description, keywords, Open Graph, Twitter card, JSON-LD WebApplication을 추가했다.
- `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`를 서버에서 제공한다.
- sitemap과 manifest URL은 요청 Host와 `x-forwarded-*` 헤더를 기준으로 생성한다.
- 네이버/구글 검증 태그는 실제 발급 토큰이 있을 때만 추가하도록 남겨두었다.

주요 파일:

- `client/index.html`
- `server/seo.ts`
- `server/seo.test.ts`
- `server/index.ts`

## 문서화

- README를 `KICE 아레나` 기준으로 다시 작성했다.
- 개발/운영/검증 명령, 런타임 모델, 배포, 모니터링, SEO, 개발 원칙을 README에 정리했다.
- 아이템 프로토콜, WebSocket 부하 테스트 파이프라인, 디자인 정량화 문서를 별도 문서로 유지한다.

주요 파일:

- `README.md`
- `docs/item-protocol.md`
- `docs/websocket-load-test-pipeline.md`
- `docs/design-quantification.md`
- `docs/completed-work.md`

## 검증 근거

현재까지 확인된 검증 범위:

- colocated unit tests: `server/*.test.ts`, `shared/*.test.ts`, `client/src/**/*.test.ts`
- browser-flow regression tests: `tests/e2e/kice-flows.spec.ts`
- SEO helper tests: `server/seo.test.ts`
- runtime metrics tests: `shared/runtimeMetrics.test.ts`
- DB integration tests: `server/examDatabase.test.ts`, `server/roomDatabase.test.ts`

최근 문서/SEO 작업에서 실행한 검증:

- `bunx prettier --check README.md`
- `bunx prettier --check client/index.html server/seo.ts server/seo.test.ts server/index.ts shared/runtimeMetrics.ts README.md`
- `bun run test -- server/seo.test.ts`
- `bun run test -- shared/runtimeMetrics.test.ts server/seo.test.ts`

주의: 2026-06-18 현재 작업 트리에는 여러 진행 중 변경이 섞여 있다. 전체 `bun run build`는 별도 `freezeBeforeSec` 타입 변경이 완전히 정리되기 전에는 실패할 수 있다.
