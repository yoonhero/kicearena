# KICE Arena

KICE Arena는 수학 모의고사를 실시간 경쟁 방식으로 푸는 웹 앱이다. 한 문제 집중 풀이 화면, 라이브/프리즈 순위표, 아이템 방해 효과, 시험장 톤의 로그와 UI를 중심으로 설계한다.

## Development

### Local app test

The server requires a seeded Postgres exam catalog. Use the local helper script
when you want to open the app and test room/lobby/game flows in a browser:

```bash
bun install
bun run dev:local
```

`bun run dev:local` does the following:

1. Starts local Docker Postgres and Redis with `docker compose up -d postgres redis`.
2. Stops the Compose app container if it is already using port `3001`.
3. Seeds the exam catalog from `server/exams/*`.
4. Starts the API server and Vite client.

개발 서버는 기본적으로 다음 주소를 사용한다.

- Client: `http://localhost:5180/`
- Server: `http://localhost:3001`

If port `3001` is still occupied, check it with:

```bash
docker compose ps
lsof -i :3001
```

검증 명령:

```bash
bun run build
bun run test
```

문제 카탈로그 DB:

```bash
bun run local:db
bun run db:seed:local
bun run dev:server:local
```

`bun run db:seed`는 로컬 `server/exams/*/manifest.json`과 SVG/PNG/JPEG/WebP 문제 asset을 Postgres에 저장한다. 서버 런타임은 `DATABASE_URL`을 필수로 요구하며, 시험 문제와 diagram SVG는 DB에서만 읽는다. Docker Compose 배포는 `kice-arena-seed` 일회성 컨테이너로 카탈로그를 동기화한 뒤 앱을 시작한다. DB 통합 테스트는 아래 명령으로 실행한다.

```bash
bun run test:db:local
```

Room/gate runtime state는 Postgres `room_states`에 스냅샷으로 저장된다. 같은 room code의 상태 변경은 Postgres advisory transaction lock으로 직렬화하고, `REDIS_URL`이 설정되면 Socket.IO Redis adapter가 켜져 여러 app container의 room broadcast가 공유된다. Compose 기본 배포는 내부 `redis://redis:6379`를 사용한다.

Bundled monitoring includes Prometheus exporters for Postgres and Redis. Prometheus scrapes `postgres-exporter:9187` and `redis-exporter:9121` inside Compose, while the exporter ports are bound to localhost for host-local inspection or an external Prometheus.

## GitHub Deploy Configuration

`Deploy Home Server` 워크플로는 GitHub environment/repository Variables와 Secrets를 원격 서버의 `.env` 및 metrics secret 파일로 쓴 뒤 Compose 기반 blue/green rolling 배포를 실행한다. `kice-arena-gateway`가 host port를 계속 잡고, 교체하지 않을 app container가 healthy인지 확인한 다음 교체 대상 색상을 nginx upstream에서 잠시 내리고 새 image로 재생성한다. 새 container healthcheck가 통과하면 두 색상을 다시 upstream에 올린다. 운영 첫 배포 전에 아래 required 값을 GitHub에서 직접 정한다. 값이 없으면 배포는 실패한다.

기존 단일 `kice-arena` container에서 이 구조로 최초 전환할 때는 host port를 gateway로 넘기는 짧은 전환 구간이 있다. 전환 이후 배포는 seed 성공과 새 app healthcheck를 확인한 뒤 한쪽 app container만 교체하므로 HTTP 기준 무중단으로 진행된다. 진행 중인 Socket.IO 연결은 연결된 app container가 교체될 때 재연결될 수 있다.

Required GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`
- `POSTGRES_PASSWORD`
- `ADMIN_TOKEN`
- `CAMPAIGN_AUTH_SECRET`: 캠페인 로그인 쿠키 서명키. 운영에서는 `openssl rand -base64 32`처럼 긴 랜덤 값을 사용한다.
- `ADMIN_BASIC_AUTH_HTPASSWD`: `/admin`과 `/api/admin/*`를 nginx Basic Auth로 보호할 htpasswd 내용. 예: `htpasswd -nbB admin 'strong-password'` 출력 전체를 secret에 저장한다.
- `METRICS_BEARER_TOKEN`
- `GRAFANA_ADMIN_PASSWORD`

`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`는 Postgres volume 최초 초기화 때 적용된다. 운영 서버에서 이미 `postgres-data` volume이 만들어진 뒤 값을 바꾸려면 DB 마이그레이션 또는 volume 재생성이 필요하다.

Optional GitHub Variables:

- `HOST_PORT`
- `POSTGRES_DB`: 비우면 `kice_arena`를 사용한다.
- `POSTGRES_USER`: 비우면 `kice_arena`를 사용한다.
- `POSTGRES_HOST_PORT`
- `REDIS_HOST_PORT`
- `POSTGRES_EXPORTER_HOST_PORT`
- `REDIS_EXPORTER_HOST_PORT`
- `PROMETHEUS_HOST_PORT`
- `ALERTMANAGER_HOST_PORT`
- `GRAFANA_HOST_PORT`
- `GRAFANA_ADMIN_USER`
- `CORS_ORIGINS`
- `CAMPAIGN_REFERRAL_WHITELIST`: 쉼표 또는 공백으로 구분한 `추천코드:학교ID` 목록. 예: `abc234:B100000546`. 추천 코드는 지정된 학교 위치에서만 인증된다.
- `CAMPAIGN_LOCATION_RADIUS_KM`: 추천 링크 위치 인증에서 허용할 학교 반경 km. 기본값은 `3`.
- `REDIS_URL`: 외부 Redis를 쓸 때만 설정. 비우면 Compose 내부 Redis를 사용한다.

Optional GitHub Secrets:

- `POSTGRES_DB`, `POSTGRES_USER`: Variables 대신 Secrets에 넣은 경우에도 deploy workflow가 읽는다.
- `REDIS_URL`: Variables 대신 Secrets에 넣은 경우에도 deploy workflow가 읽는다.
- `DATABASE_URL`: 외부 DB를 쓸 때만 설정. 비우면 Compose 내부 Postgres URL을 사용.
- `DISCORD_WEBHOOK_URL`

테스트 위치 규칙:

- 단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 예: `server/scoring.ts` -> `server/scoring.test.ts`.
- 브라우저 흐름을 검증하는 E2E 테스트만 `tests/e2e/*.spec.ts`에 둔다.

## Project Layout

- `client/src`: React client UI.
- `server/index.ts`: Express and Socket.IO game server.
- `shared`: client/server shared game types and pure helpers.
- `docs`: implementation protocols and contributor-facing notes.
- `deploy`: deployment and monitoring configuration.
- `scripts`: exam/problem preparation scripts.
- `tests/e2e`: Playwright browser-flow tests.
- `todo.md`: active roadmap and task checklist.

## Contribution Guide

### 1. Read the relevant protocol first

Before changing a subsystem, read the matching notes.

- UI direction: `design.md`; historical route/review notes: `DESIGN_NOTES.md`
- Item additions: `docs/item-protocol.md`
- Runtime metrics and monitoring: `deploy/monitoring/README.md`
- Current roadmap: `todo.md`

If a protocol and code disagree, update the protocol or explain why the code is intentionally changing.

### 2. Keep shared contracts authoritative

Shared types in `shared/game.ts` are the contract between server and client. Do not duplicate gameplay rules separately in server and client code when a shared helper or shared type can express the rule.

For item work, follow this order:

1. Add the `ItemId` to `ITEM_IDS`.
2. Add the keyed definition to `ITEM_DEFINITIONS`.
3. Wire server validation and state updates.
4. Wire client affordances and rendering.
5. Run build, tests, and a local usage check.

See `docs/item-protocol.md` for the full item protocol.

### 3. Treat the server as the source of truth

Client UI can guide users, but gameplay authority belongs on the server.

- Validate room status, player identity, inventory, target eligibility, duplicate effects, cooldowns, and payload limits on the server.
- Only mutate inventory or score after all validation passes.
- Keep effects, expired effects, cooldowns, submissions, and scoreboard reveal state consistent in emitted room state.

### 4. Preserve existing UX direction

The app should feel like a competitive live mock exam, not a generic dashboard.

- Keep the solving view focused on one large problem page.
- Keep ranking and contest analysis on dedicated ranking/result screens.
- Prefer compact exam-administration labels over explanatory marketing copy.
- Avoid unrelated redesigns while working on gameplay logic.
- Check mobile and desktop layouts when adding overlays, target banks, buttons, or long Korean labels.

### 5. Keep changes scoped

Make the smallest coherent change that solves the task.

- Do not revert unrelated dirty files.
- Do not mix unrelated roadmap work into one patch.
- If a file already has user changes, preserve them and edit only the necessary lines.
- Update `todo.md` only for work that is actually implemented and verified.

### 6. Verify before marking work done

For most code changes, run:

```bash
bun run build
bun run test
```

For frontend/gameplay changes, also run the local app and manually check the affected flow in a browser. For example:

- Room creation and join.
- Answer submission.
- Item award, target selection, use, active state, cooldown, and expiry.
- Scoreboard freeze/reveal behavior when touched.
- Mobile-width layout if UI controls or overlays changed.

If a check cannot be run, state that explicitly in the handoff.

### 7. Review standard

When reviewing changes, prioritize:

1. Gameplay correctness and server-side trust boundaries.
2. Shared contract drift between `shared`, `server`, and `client`.
3. Missing cleanup/recovery behavior for temporary state.
4. UI states that can overlap, disappear, or become unusable on small screens.
5. Missing tests or manual verification for touched workflows.

Summaries are secondary; findings should identify the concrete file and line that can break behavior.

## Documentation Rules

Add or update docs when a change creates a repeatable protocol, a subsystem contract, or a new verification checklist. Keep docs operational: contributors should be able to follow the document while making the next change.
