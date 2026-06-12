# Server Throughput Test

Mission: prove 50, 100, and 500 realtime interaction behavior.

- Read `docs/websocket-load-test-pipeline.md`.
- Inspect `scripts/socketio_load_test.mjs` and the scenario used.
- Confirm in-memory vs Postgres `room_states`, Redis Socket.IO adapter, and
  Prometheus metrics.
- Test production mode, not Vite dev server.
- Separate connect-only, lobby fan-in, playing steady-state, reconnect, and soak.
- For Python/Locust, use `conda run -n mlenv python ...` or
  `conda run -n mlenv locust ...`.
- Track ACK latency for `room:create`, `room:join`, `room:start`,
  `answer:submit`, and `room:rejoin`.
- Stop ramping on failure and record the bottleneck.
- Compare tool counts with `kice_arena_socket_connections`,
  `kice_arena_registered_socket_connections`, `kice_arena_players`, and
  `kice_arena_rooms_active`.
- Capture p95/p99 ACK latency, failure rate, RSS, CPU, and event-loop/heartbeat
  symptoms.
