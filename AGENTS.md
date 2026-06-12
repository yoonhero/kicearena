1. 단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 예: `server/scoring.ts`의 테스트는 `server/scoring.test.ts`, `shared/runtimeMetrics.ts`의 테스트는 `shared/runtimeMetrics.test.ts`에 둔다.
2. 브라우저 흐름을 검증하는 E2E 테스트만 `tests/e2e/*.spec.ts`에 둔다.

## Alignable project agents

Project subagents are defined under `.codex/agents/`. Their detailed role
briefs live under `.codex/agent-briefs/`; each agent should read only its own
brief plus the shared rules here.

Role brief map:
- `ui_ux_designer`: `.codex/agent-briefs/ui-ux-designer.md`
- `browser_debugger`: `.codex/agent-briefs/browser-debugger.md`
- `ui_ux_optimizer`: `.codex/agent-briefs/ui-ux-optimizer.md`
- `server_throughput_tester`: `.codex/agent-briefs/server-throughput-tester.md`
- `db_maintainer`: `.codex/agent-briefs/db-maintainer.md`
- `prometheus_grafana_incident_responder`: `.codex/agent-briefs/prometheus-grafana-incident-responder.md`

All agents must avoid rewriting unrelated in-progress work. Keep responses
evidence-first and short.

Shared verification:
- Run relevant colocated unit tests when logic changes.
- Add `tests/e2e/*.spec.ts` only for browser-flow regressions.
- For visible UI changes, verify a small mobile viewport and a desktop viewport.
- Report commands, test/browser evidence, and any remaining risk.
