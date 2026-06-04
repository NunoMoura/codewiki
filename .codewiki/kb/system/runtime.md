---
id: spec.system.runtime
title: CodeWiki Runtime
state: active
summary: Source concept root for CodeWiki daemon-capable software-development runtime orchestration across agency plans, leases, compiler/gateway preparation, harness boundaries, and session spawning.
owners:
  - architecture
  - engineering
updated: "2026-06-05"
diagram_refs:
  - component-map:runtime
  - file-structure-map:runtime_orchestration_boundary
code_paths:
  - src/runtime
  - src/agency/tool.ts
  - src/adapters/pi/tools/ports.ts
code_paths_mode: explicit_override
---

# CodeWiki Runtime

## Responsibility

The CodeWiki runtime executes and, after the daemon refactor, dispatches CodeWiki software-development loops after agency policy authorizes them. It is not the Node runtime, a generic chat gateway, or an arbitrary agent swarm. CodeWiki builds on Pi Code as its primary runtime foundation and layers roadmap, compiler, gateway, worktree, content-evidence, and daemon-job semantics above it.

The long-term CodeWiki distribution should remain Pi-based: CodeWiki configures Pi Code with CodeWiki defaults, prompt contract, tools, skills, and workflow policy instead of forking Pi internals. Forking is reserved for a future blocker where Pi SDK/runtime hooks cannot enforce required CodeWiki behavior. Optional CLI entrypoints may support bootstrap, CI, linter, or admin workflows, but interactive development happens through Pi-hosted CodeWiki surfaces.

Runtime performs one bounded execution step at a time. Agency decides whether CodeWiki may continue; runtime performs the selected step and stops with evidence. Before claiming scopes or requesting a context boundary, runtime verifies the selected trace/task automation-readiness contract. Missing, expired, ambiguous, blocked, or waiting contracts stop the runner with exact blockers and next safe actions; only `runnable`, `retryable`, or `promotable` contracts may proceed to a decision, planning, implementation, or gate-preparation step.

The daemon can request fresh Pi worker or gate sessions only through an explicit runtime `freshWorkerBridge` adapter port. Command-context `newSession`/`withSession` remains replacement-session support for `/wiki-resume --new`; it is not evidence of parallel worker spawning. The Pi adapter’s supported bridge is subprocess-backed (`pi --mode json -p --no-session`) and marks `chat_context_shared=false`. If the bridge is unavailable, runtime records a precise `platform_limited` blocker with trace/gate/Git refs and manual `/wiki-resume --new` remediation.

Fresh worker requests carry role, task id, context path, build refs, validation refs, trace refs, gate refs, Git refs, artifact refs, and content-evidence requirements. Dirty implementation handoff requires exact `working_tree_digest` plus patch or worktree handoff refs. Promotion gates such as task-close, sprint-close, ship-ready, publication, and release require immutable content evidence such as commit/tree/package/archive/remote refs. Missing content proof blocks before spawning.

Daemon/agency completion is the enabling sprint for the broader structure refactor. Until runtime aligns with the three-loop model, telemetry traces, gate diagnostics/remediation, graph readiness queries, fresh worker session spawning, and safe worktree publishing, daemon automation is pilot-capable for observe/maintain or narrow bounded steps rather than broad autonomous refactor execution.

## Component and flow detail

- [Runtime and daemon component](components/runtime-daemon.md) owns runtime paths and contracts.
- [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md) describes job/run lifecycle.
- [Artifact lease wait/wake](flows/artifact-claim-wait-wake.md) describes session queue coordination. The file path retains legacy claim wording until migration renames it.
- [Resume context boundary](flows/resume-context-boundary.md) describes source-backed context refresh and replacement-session starts.

## Source layout

```text
src/runtime/
  runner.ts   # bounded runtime step implementation and dispatcher migration target
  ports.ts    # Pi Code foundation, fresh-worker bridge, and future runtime capability ports
  types.ts    # runtime result, fresh-worker request, daemon job/run, budget, and workflow evidence
```

Runtime coordinates `src/agency/**`, current compatibility `src/session/**`, current compatibility `src/state/**`, current compatibility `src/build/**`, and gateway behavior without absorbing their durable truth. Target source moves generated state to `src/graph/**`, compiler engines to loop roots, and trace persistence to `src/telemetry/**`.

## Daemon job model

Daemon jobs live at `.codewiki/runtime/jobs.json`. This repo-local runtime state records execution requests and attempts, not roadmap truth. Jobs can be `queued`, `running`, `blocked`, `completed`, or `cancelled`. Runs can be `running`, `completed`, `blocked`, `failed`, `stale`, or `cancelled`.

A pass boundary emits or references required loop trace, gate, compiler output, and content refs. Daemon jobs and runs store canonical `loop` values from the decision/planning/implementation model, with `observe` reserved for read-only runtime waiting. Legacy `validation`, `task-close`, and `publication` loop inputs are compatibility hints only: runtime normalizes them to implementation work and preserves the original gate intent in `gate_refs`. `trace_refs`, `gate_refs`, and `git_refs` are the daemon-safe source contract for later scheduling; legacy `build_refs`, `validation_refs`, and `content_refs` remain compatibility aliases during migration.

Fail/block boundaries keep the same canonical loop or job blocked until evidence, structured gate diagnostics/remediation, policy, retry limits, or user input resolves the issue. Daemon and runner scheduling consume the same graph/runtime readiness predicate so retryable failure, lease wait, and promotion states are source-backed and do not rely on chat inference.

## Invariants

- Runtime does not bypass decision, planning, implementation, publication, release, or destructive gate criteria.
- Runtime treats artifact status as temporary coordination evidence.
- Runtime releases leases it acquires before returning unless the adapter/process fails and records that failure.
- Runtime requests host capabilities through explicit adapter ports and records platform-limited evidence instead of fabricating behavior.
- Dogfood operational state under `.codewiki/runtime/**` is compatibility coordination state, not package source or target truth root.

## Related docs

- [Agency Controller](agency.md)
- [API](api.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Role Worktree Isolation](worktree-isolation.md)
