---
name: kice-subagent-routing
description: Use when spawning KICE Arena custom subagents for high-token parallel work such as UI audits, browser-flow debugging, realtime load tests, DB I/O investigation, or Prometheus/Grafana incidents.
---

# KICE Subagent Routing

Use custom subagents only when parallel evidence gathering or specialist review
is worth the extra tokens. For small edits, stay in the parent thread.

## Agents

- `ui_ux_designer`: ambiguity removal, copy cleanup, low-entropy UI review,
  AI-smell removal, visual density, alignment, overlap, mobile/desktop layout.
- `browser_debugger`: client-flow bugs, Socket.IO races, stale state, unsafe UI.
- `ui_ux_optimizer`: render cost, bundle/runtime weight, responsiveness.
- `server_throughput_tester`: 50/100/500 realtime interaction evidence.
- `db_maintainer`: query shape, indexes, heavy I/O on realtime paths.
- `prometheus_grafana_incident_responder`: monitor.mmeme.org, scrape failures,
  dashboards, alerts, and incident notes.

## Token Discipline

- Spawn the minimum set of agents that can run independently.
- Ask each agent for evidence and a short result, not broad recommendations.
- Tell each agent to read only its matching `AGENTS.md` role and named files.
- Merge results in the parent thread; do not ask agents to coordinate with each
  other unless the user explicitly wants that.
- Do not spawn subagents for routine formatting, one-file fixes, or obvious
  local tests.
