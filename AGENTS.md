1. 단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 예: `server/scoring.ts`의 테스트는 `server/scoring.test.ts`, `shared/runtimeMetrics.ts`의 테스트는 `shared/runtimeMetrics.test.ts`에 둔다.
2. 브라우저 흐름을 검증하는 E2E 테스트만 `tests/e2e/*.spec.ts`에 둔다.
3. No code golf. 낮은 라인 수는 참고 지표일 뿐이며, 진짜 목표는 복잡도 감소와 가독성 향상이다. 줄바꿈을 지우는 식의 축약은 도움이 되지 않는다.
4. "speedup"이라고 주장하는 변경은 반드시 벤치마크로 입증한다. 기본 목표는 단순성이므로, 미세한 성능 개선도 유지보수성과 가독성의 비용을 함께 판단한다.
5. 최종 파일이 400줄을 넘지 않게 유지한다. 특히 큰 CSS 파일은 기능별 분리, 중복 제거, 의미 있는 공통화로 줄이되 code golf식 축약은 금지한다.

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
