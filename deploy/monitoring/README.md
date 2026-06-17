# KICE Arena monitoring

The app exposes Prometheus metrics at:

```text
GET /metrics
```

The endpoint is closed by default unless both protections pass:

- The request comes from a private network, loopback, or link-local source address.
- The request includes `Authorization: Bearer <METRICS_BEARER_TOKEN>`.

Set `METRICS_BEARER_TOKEN` on the app process and use the same value in the
Prometheus scrape config. Keep the app endpoint reachable only over a private
network or through a reverse proxy that restricts `/metrics` to trusted private
or Prometheus source ranges.

The integrated `docker-compose.yml` mounts `./secrets/kice-arena-metrics-token`
as a Docker secret for both the app and Prometheus when `METRICS_TOKEN_FILE` is
set. Without that override, it uses the committed development token at
`deploy/monitoring/kice-arena-metrics-token.default` so a fresh clone can start
with only `docker compose up`.

The app reads the token through `METRICS_BEARER_TOKEN_FILE`, while Prometheus
reads the same secret from `/run/secrets/kice_arena_metrics_token`.

For the bundled home-server stack, run:

```bash
docker compose up -d
```

That starts the app, Prometheus, Alertmanager, the Discord alert bridge, and
Grafana. It also starts Prometheus exporters for Postgres and Redis. The
bundled `prometheus.yml` already loads the scrape jobs, Alertmanager target,
and rule file:

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093
rule_files:
  - /etc/prometheus/rules/kice-arena-prometheus-rules.yml
```

For an existing external Prometheus instead of the bundled compose service,
merge `prometheus-scrape.yml` into the existing Prometheus server config,
replace the placeholder targets with the private app/exporter hosts and ports, copy
`rules/kice-arena-prometheus-rules.yml` into the Prometheus rules directory, add
it to `rule_files`, then reload Prometheus.

The bundled Grafana service provisions the Prometheus data source and both
dashboards automatically:

- `../grafana/dashboards/kice-arena.json`: baseline server dashboard
- `../grafana/dashboards/kice-arena-cause-first.json`: incident triage first dashboard

Default local ports:

- App: `http://127.0.0.1:3001`
- Postgres exporter: `http://127.0.0.1:9187/metrics`
- Redis exporter: `http://127.0.0.1:9121/metrics`
- Prometheus: `http://127.0.0.1:9090`
- Alertmanager: `http://127.0.0.1:9093`
- Grafana: `http://127.0.0.1:3000`

Override them with `HOST_PORT`, `PROMETHEUS_HOST_PORT`,
`POSTGRES_EXPORTER_HOST_PORT`, `REDIS_EXPORTER_HOST_PORT`,
`ALERTMANAGER_HOST_PORT`, and `GRAFANA_HOST_PORT`.

Useful custom metrics:

- `kice_arena_runtime_metrics_info{service="kice-arena"}`
- `kice_arena_runtime_metrics_last_success_unixtime{service="kice-arena"}`
- `kice_arena_rooms_total`
- `kice_arena_rooms_active`
- `kice_arena_rooms_by_status`
- `kice_arena_room_expiry_seconds{stat="avg|max"}`: time until playing rooms finish or inactive rooms become eligible for cleanup
- `kice_arena_playing_room_time_remaining_seconds{stat="avg|max"}`
- `kice_arena_players{state="total|connected|disconnected"}`
- `kice_arena_contests_active`: distinct contest events with at least one active participant session
- `kice_arena_contest_sessions{event_id,status="lobby|playing|finished"}`: contest participant sessions by event
- `kice_arena_contest_participants{event_id,state="total|connected|disconnected"}`: contest participants by event
- `kice_arena_socket_connections`: all current Socket.IO connections, including visitors that have not joined a room
- `kice_arena_registered_socket_connections`: Socket.IO connections currently associated with a tracked room player
- `kice_arena_rooms_created_total`
- `kice_arena_players_joined_total`
- `kice_arena_answers_submitted_total{correct="true|false"}`
- `kice_arena_contest_submissions_total{event_id,correct="true|false"}`
- `kice_arena_http_request_duration_seconds`
- `kice_arena_players_disconnected_ratio`
- `kice_arena_players_per_active_room{state="total|connected"}`
- `kice_arena_rooms_empty_lobby`
- `kice_arena_rooms_disconnected_lobby`
- `kice_arena_rooms_partially_disconnected`
- `kice_arena_rooms_zombie_playing`
- `kice_arena_rooms_player_count_mismatch`
- `kice_arena_rooms_expiring_soon`
- `kice_arena_rooms_expired`
- `kice_arena_room_expiry_overdue_seconds{stat="avg|max"}`
- `kice_arena_room_disconnect_risk_score`
- `kice_arena_room_cleanup_pressure_score`

Useful dependency exporter metrics:

- `pg_up`: Postgres exporter can connect to Postgres
- `pg_exporter_last_scrape_error`: Postgres exporter scrape failure flag
- `pg_stat_activity_count`: Postgres connection count by state
- `pg_database_size_bytes`: Postgres database size
- `redis_up`: Redis exporter can connect to Redis
- `redis_connected_clients`
- `redis_memory_used_bytes`
- `redis_evicted_keys_total`
- `redis_rejected_connections_total`

The bundled Alertmanager config sends alerts to the internal Discord bridge.
The bridge returns success without sending anything when `DISCORD_WEBHOOK_URL`
is empty, so the stack still starts before Discord is configured.

To enable Discord notifications:

1. In Discord, open the target channel settings.
2. Go to Integrations, then Webhooks.
3. Create a webhook and copy its webhook URL.
4. On the home server, create `.env` next to `docker-compose.yml`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

5. Restart the stack:

```bash
docker compose up -d
```

When deploying through GitHub Actions, set `DISCORD_WEBHOOK_URL` as a
GitHub secret instead of editing `.env` by hand. The deploy workflow writes the
remote `.env` file before running Docker Compose.

Optional Alertmanager webhook example:

- `../alertmanager/kice-arena-alertmanager-hook.example.yml`

To enable external notifications, merge that receiver into
`../alertmanager/alertmanager.yml` and replace
`https://example.internal/hooks/kice-arena-alerts` with the real incident hook
URL.
