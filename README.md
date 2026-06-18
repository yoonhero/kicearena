# KICE 아레나

KICE 아레나는 수학 모의고사를 실시간 경쟁 방식으로 푸는 웹 앱이다. 사용자는 방을 만들거나 초대 링크로 입장해 한 문제씩 풀고, 서버가 관리하는 제출 기록과 순위표로 경쟁한다. 화면 톤은 시험지, OMR, 성적표, 대회 순위표에 맞춘다.

## 주요 기능

- 실시간 방 생성, 입장, 재접속, 초대 링크
- Casual / Contest 모드와 공개 이벤트 등록 흐름
- 한 문제 집중 풀이 화면, 객관식/단답형 제출, KaTeX 수식 렌더링
- 라이브 순위표, 프리즈 순위표, 최종 성적표
- 아이템 방해 효과와 서버 검증 기반 인벤토리 처리
- 관리자 시험/문항 편집, 문제 이미지 업로드, 캠페인 통계
- Postgres 기반 시험 카탈로그와 room state 저장
- Redis 기반 Socket.IO adapter, Prometheus/Grafana 모니터링
- 검색 노출용 한국어 메타데이터, `robots.txt`, `sitemap.xml`

## 기술 스택

- Runtime: Bun, Node-compatible server runtime
- Client: React, Vite, TypeScript
- Server: Express, Socket.IO
- Data: Postgres, Redis
- Test: Vitest, Playwright
- Ops: Docker Compose, Nginx gateway, Prometheus, Alertmanager, Grafana

## 빠른 시작

요구 사항:

- Bun
- Docker와 Docker Compose

설치:

```bash
bun install
```

로컬 앱 실행:

```bash
bun run dev:local
```

`dev:local`은 Postgres/Redis를 띄우고, 시험 카탈로그를 seed한 뒤 API 서버와 Vite 클라이언트를 함께 실행한다.

- Client: `http://localhost:5180/`
- Server: `http://localhost:3001`

포트가 이미 사용 중이면 다음을 확인한다.

```bash
docker compose ps
lsof -i :3001
```

## 자주 쓰는 명령

```bash
bun run local:db          # Postgres, Redis만 실행
bun run db:seed:local     # 로컬 DB에 시험 카탈로그 seed
bun run dev:server:local  # 로컬 DB/Redis를 쓰는 API 서버 실행
bun run dev:client        # Vite 클라이언트 실행
bun run format:check      # 포맷 검사
bun run lint              # ESLint
bun run typecheck         # TypeScript 검사
bun run test              # Vitest
bun run test:db:local     # DB 통합 테스트
bun run test:e2e          # Playwright E2E
bun run build             # 타입 검사 후 프로덕션 빌드
```

작은 Python 스크립트는 프로젝트 규칙에 따라 conda `mlenv` 환경에서 실행한다.

```bash
conda run -n mlenv python scripts/validate_codex_agents.py
```

## 프로젝트 구조

```text
client/                 React/Vite 앱
server/                 Express, Socket.IO, DB 접근, 운영 API
shared/                 클라이언트와 서버가 공유하는 타입/규칙
tests/e2e/              브라우저 흐름 회귀 테스트
docs/                   구현 프로토콜과 운영 문서
deploy/                 Nginx, Prometheus, Grafana, Alertmanager 설정
scripts/                seed, import, 검증, 문제 준비 스크립트
server/exams/           로컬 시험 manifest와 문제 asset
```

단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 브라우저 흐름을 검증하는 테스트만 `tests/e2e/*.spec.ts`에 둔다.

완료된 구현 범위는 `docs/completed-work.md`에 정리한다.

## 런타임 모델

서버가 게임 상태의 기준이다. 클라이언트는 UI 상태를 안내하지만, 제출 가능 여부, 방 상태, 참가자 권한, 아이템 대상, 점수, 페널티, 순위표 프리즈는 서버에서 검증하고 emit한다.

핵심 상태:

- 시험 카탈로그와 문제 asset: Postgres
- 방 스냅샷: Postgres `room_states`
- contest 제출: Postgres `contest_submissions`
- 다중 app container 브로드캐스트: Redis Socket.IO adapter
- 메트릭: `/metrics` + Prometheus scrape

같은 room code의 상태 변경은 advisory lock과 in-process mutex로 직렬화한다. 운영에서는 blue/green app container가 Nginx gateway 뒤에서 동작한다.

## 시험 카탈로그

로컬 manifest는 `server/exams/*/manifest.json`에 둔다. `bun run db:seed`는 manifest와 SVG/PNG/JPEG/WebP asset을 Postgres에 저장한다. 서버 런타임은 DB에서 시험과 diagram asset을 읽는다.

관리자 API와 UI는 시험 공개 여부, 공개 시각, 제한 시간, 프리즈 시작 시각, 문제 본문, 정답, 난도, 배점, diagram asset을 편집한다.

## 환경 변수

로컬 기본값은 `.env.example`을 기준으로 한다.

필수 운영 값:

- `POSTGRES_PASSWORD`
- `ADMIN_TOKEN`
- `CAMPAIGN_AUTH_SECRET`
- `ADMIN_BASIC_AUTH_HTPASSWD`
- `METRICS_BEARER_TOKEN`
- `GRAFANA_ADMIN_PASSWORD`

주요 선택 값:

- `HOST_PORT`: gateway host port, 기본 `3001`
- `DATABASE_URL`: 외부 Postgres를 쓸 때만 설정
- `REDIS_URL`: 외부 Redis를 쓸 때만 설정
- `CORS_ORIGINS`: 허용할 browser origin 목록
- `CAMPAIGN_REFERRAL_WHITELIST`: `추천코드:학교ID` 목록
- `CAMPAIGN_LOCATION_RADIUS_KM`: 추천 링크 위치 인증 반경 km
- `CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL`: 이메일 인증 코드 발송 webhook
- `DISCORD_WEBHOOK_URL`: Alertmanager Discord relay

`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`는 Postgres volume 최초 초기화 때 적용된다. 운영 volume이 이미 있으면 값을 바꾸기 전에 마이그레이션 또는 volume 재생성 계획이 필요하다.

## 배포

Docker Compose 운영 배포는 다음 구성으로 실행된다.

- `kice-arena-blue`, `kice-arena-green`: app container
- `kice-arena-gateway`: sticky upstream Nginx gateway
- `kice-arena-seed`: 배포 시 시험 카탈로그 동기화
- `postgres`, `redis`
- `postgres-exporter`, `redis-exporter`
- `prometheus`, `alertmanager`, `alertmanager-discord`, `grafana`

GitHub Actions의 `Deploy Home Server` 워크플로는 Secrets/Variables를 원격 서버 `.env`와 metrics secret 파일로 쓰고, seed 성공과 새 app healthcheck를 확인한 뒤 blue/green rolling 배포를 수행한다.

## 모니터링

운영 메트릭과 알림 문서는 `deploy/monitoring/README.md`에 있다. 기본 대시보드는 다음을 본다.

- HTTP RPS, 5xx 비율, latency
- event loop lag, GC, memory, open file descriptors
- active rooms, room stale state, cleanup pressure
- contest sessions, participants, submissions
- Socket.IO connection consistency

모니터링 복구는 Prometheus target, alert firing 상태, app healthcheck가 함께 정상일 때 완료로 본다.

## SEO

기본 HTML은 한국어 title/description, Open Graph, Twitter card, JSON-LD WebApplication을 포함한다. 서버는 `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`를 제공한다. 네이버 서치어드바이저나 Google Search Console 검증 태그는 실제 발급 토큰이 있을 때만 추가한다.

## 개발 원칙

- 공유 타입과 순수 규칙은 `shared/`를 우선한다.
- 서버 검증 없이 클라이언트 UI만으로 게임 규칙을 강제하지 않는다.
- UI 작업은 `DESIGN_NOTES.md`와 `design.md`를 먼저 확인한다.
- 아이템 작업은 `docs/item-protocol.md` 순서를 따른다.
- CSS는 기능별 파일로 나누고, 최종 파일이 400줄을 넘지 않게 유지한다.
- 코드 골프식 축약보다 복잡도 감소와 가독성을 우선한다.
- “speedup” 변경은 벤치마크 없이 주장하지 않는다.
- 관련 없는 진행 중 변경을 되돌리지 않는다.

## 검증 기준

일반 코드 변경:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
```

프로덕션 영향 변경:

```bash
bun run build
```

DB 스키마 또는 room persistence 변경:

```bash
bun run local:db
bun run test:db:local
```

브라우저 흐름 변경:

```bash
bun run dev:local
bun run test:e2e
```

UI 변경은 최소 모바일 viewport와 desktop viewport에서 직접 확인한다. 실행하지 못한 검증은 작업 보고에 명시한다.
