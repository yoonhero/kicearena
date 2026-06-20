# Home Server Bun Deploy

This is the current home-server deploy path before moving to a cloud runtime.
It avoids building or pulling a Docker image for the app.

## Runtime Shape

- App: macOS host process, run by Bun under `launchd`
- Data services: `docker compose up -d postgres redis`
- Seed: `bun run db:seed`
- Healthcheck: `http://127.0.0.1:${HOST_PORT:-3001}/api/health`

The deploy script stops the old Docker app/gateway services if they exist, then
keeps only Postgres and Redis in Docker.

## Manual Deploy

Run this on the home server checkout:

```bash
scripts/deploy-home-bun.sh --branch main
```

The script:

1. optionally fast-forwards the requested branch,
2. starts Postgres and Redis with Docker Compose,
3. installs dependencies with `bun install --frozen-lockfile`,
4. runs `bun run build`,
5. seeds the exam catalog,
6. writes `.deploy/run-home-server.sh`,
7. installs `~/Library/LaunchAgents/dev.yoonhero.kice-arena.plist`,
8. restarts the app with `launchctl`,
9. waits for `/api/health`.

## Required Host Tools

- Git
- Bun
- Docker with Docker Compose
- macOS `launchctl`
- curl

## Required Environment

The GitHub workflow writes `.env` on the home server before running the script.
For manual deploys, create `.env` in the repo root.

Required production values:

```bash
POSTGRES_PASSWORD=...
ADMIN_TOKEN=...
CAMPAIGN_AUTH_SECRET=...
METRICS_BEARER_TOKEN=...
```

Common optional values:

```bash
HOST_PORT=3001
KICE_DOCKER_BACKEND=colima
POSTGRES_DB=kice_arena
POSTGRES_USER=kice_arena
POSTGRES_HOST_PORT=5432
REDIS_HOST_PORT=6379
CORS_ORIGINS=https://example.com
CAMPAIGN_REFERRAL_WHITELIST=...
CAMPAIGN_LOCATION_RADIUS_KM=3
CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL=...
```

If `DATABASE_URL` or `REDIS_URL` is omitted, the script points the host app at
`127.0.0.1:${POSTGRES_HOST_PORT:-5432}` and
`127.0.0.1:${REDIS_HOST_PORT:-6379}`.

Set `KICE_DOCKER_BACKEND=colima` when Postgres/Redis should run on Colima. The
script starts Colima if needed and points Docker at the default Colima socket.

## Operations

Check service state:

```bash
launchctl print gui/$(id -u)/dev.yoonhero.kice-arena
docker compose ps postgres redis
curl -fsS http://127.0.0.1:${HOST_PORT:-3001}/api/health
```

View logs:

```bash
tail -f .deploy/logs/home-server.out.log
tail -f .deploy/logs/home-server.err.log
```

Restart app only:

```bash
launchctl kickstart -k gui/$(id -u)/dev.yoonhero.kice-arena
```

Stop app:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/dev.yoonhero.kice-arena.plist
```

## Monitoring Note

The bundled Docker Prometheus/Grafana stack was built around the old Docker
gateway service name. Keep it off for this host-Bun deploy path unless its
scrape config is updated to target the host app.
