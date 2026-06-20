# Docker Blue/Green Deploy Archive

This is the previous home-server deploy model. It is not the default path while
the app runs directly on the macOS home server, but it remains useful when
moving to a cloud runtime or back to image-based deployment.

## Previous Shape

- `kice-arena-blue`, `kice-arena-green`: app containers from GHCR
- `kice-arena-gateway`: Nginx sticky upstream gateway
- `kice-arena-seed`: one-shot seed container
- `postgres`, `redis`
- `postgres-exporter`, `redis-exporter`
- `prometheus`, `alertmanager`, `alertmanager-discord`, `grafana`

The deploy workflow previously ran after `Publish Image`, wrote remote secrets
into `.env` and secret files, pulled the GHCR image, seeded the catalog, and
rolled the blue and green app containers behind the fixed gateway.

## Files Kept For Later

- `docker-compose.yml`
- `deploy/nginx-app.conf`
- `deploy/monitoring/`
- `deploy/alertmanager/`
- `deploy/grafana/`
- `scripts/publish-ghcr.sh`
- `.github/workflows/publish-image.yml`

`Publish Image (archived)` is now manual-only. Re-enable its push/tag triggers
when image publication becomes part of the release path again.

## Restore Checklist

1. Re-enable automatic image publishing in `.github/workflows/publish-image.yml`.
2. Change `.github/workflows/deploy-home-server.yml` back to an image/compose
   deploy, or create a cloud deploy workflow.
3. Verify `docker compose config --quiet`.
4. Verify seed logs and exit code from the named `kice-arena-seed` service.
5. Verify `kice-arena-blue`, `kice-arena-green`, and `kice-arena-gateway`
   healthchecks.
6. Verify Prometheus targets and alerts after one scrape/evaluation interval.
