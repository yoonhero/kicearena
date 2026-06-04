# KICE Arena monitoring

The app exposes Prometheus metrics at:

```text
GET /metrics
```

Merge `prometheus-scrape.yml` into the existing Prometheus server config and
replace the placeholder target with the reachable app host and port.

Grafana can import `../grafana/dashboards/kice-arena.json`. During import,
select the existing Prometheus data source.

Useful custom metrics:

- `kice_arena_rooms_total`
- `kice_arena_rooms_active`
- `kice_arena_rooms_by_status`
- `kice_arena_room_expiry_seconds{stat="avg|max"}`: time until playing rooms finish or inactive rooms become eligible for cleanup
- `kice_arena_playing_room_time_remaining_seconds{stat="avg|max"}`
- `kice_arena_players{state="total|connected|disconnected"}`
- `kice_arena_socket_connections`
- `kice_arena_rooms_created_total`
- `kice_arena_players_joined_total`
- `kice_arena_answers_submitted_total{correct="true|false"}`
- `kice_arena_http_request_duration_seconds`
