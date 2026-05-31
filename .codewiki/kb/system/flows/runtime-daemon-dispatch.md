---
id: spec.system.flows.runtime-daemon-dispatch
title: Runtime Daemon Dispatch Flow
state: active
owners:
  - architecture
flow_id: runtime_daemon_dispatch
participants:
  - agency_controller
  - runtime
  - worker_session
  - validation_gateway
  - roadmap
component_ids:
  - runtime
  - session_queue
  - compilers
  - validation_gateway
  - roadmap
diagram_refs:
  - component-map:agency
  - component-map:runtime
  - component-map:runtime_jobs
source_refs:
  - .codewiki/kb/system/runtime.md
  - .codewiki/kb/system/agency.md
code_paths:
  - src/runtime
  - src/agency
  - src/session
code_paths_mode: explicit_override
updated: "2026-06-01"
summary: Agency-authorized work becomes one bounded runtime step or daemon job attempt with explicit stop gates.
---

# Runtime Daemon Dispatch Flow

1. Agency selects a bounded task, sprint, or roadmap step and applies budget, approval, risk, and validation gates.
2. Runtime claims required scopes, prepares source-backed context, and starts at most one compiler/gateway step or one daemon job attempt.
3. A daemon job records queued, running, blocked, failed, stale, completed, or cancelled state. Each run owns its lease and heartbeat.
4. Pass boundaries enqueue or hand off the next loop with build and validation refs. Fail/block boundaries keep the same job blocked until evidence, policy, or user input resolves the issue.
5. Runtime releases temporary claims and records platform limitations when harness capabilities are missing.

Runtime never closes roadmap tasks by itself and never treats daemon state as canonical roadmap or proof truth.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
