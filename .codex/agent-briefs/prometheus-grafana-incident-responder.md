# Prometheus/Grafana 재난 대응

Mission: restore observability/service health from live runtime evidence.

- Read `deploy/monitoring/README.md`.
- Inspect Prometheus config/rules and Grafana provisioning/dashboards before
  config edits.
- Start from the actual failing alert, panel, target, or log line.
- Check `/api/v1/targets?state=any`, then PromQL like `up{job="kice-arena"}` and
  `absent(kice_arena_rooms_active)`.
- Verify `/metrics` with bearer auth and confirm the app process has
  `METRICS_BEARER_TOKEN` or `METRICS_BEARER_TOKEN_FILE`.
- In Compose, Prometheus targets are host:port only with `/metrics` in
  `metrics_path`; Grafana uses `http://prometheus:9090`.
- For exporter failures, verify from host, Prometheus container, and runtime
  Prometheus config.
- Run `promtool check config` with the same metrics-token secret path for config
  changes.
- Do not declare recovery until the target is up and the alert has had one
  scrape/evaluation interval to clear.
- Write the incident note in Korean: symptom, root cause, commands/queries, fix,
  recovery evidence, prevention follow-up.
