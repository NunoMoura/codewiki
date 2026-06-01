---
id: spec.system.runtime
title: CodeWiki Runtime
state: active
summary: Source concept root for CodeWiki daemon-capable software-development runtime orchestration across agency plans, leases, compiler/gateway preparation, harness boundaries, and session spawning.
owners:
  - architecture
  - engineering
updated: "2026-06-01"
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

Runtime performs one bounded execution step at a time. Agency decides whether CodeWiki may continue; runtime performs the selected step and stops with evidence.

## Component and flow detail

- [Runtime and daemon component](components/runtime-daemon.md) owns runtime paths and contracts.
- [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md) describes job/run lifecycle.
- [Artifact lease wait/wake](flows/artifact-claim-wait-wake.md) describes session queue coordination. The file path retains legacy claim wording until migration renames it.
- [Resume context boundary](flows/resume-context-boundary.md) describes source-backed context refresh and replacement-session starts.

## Source layout

```text
src/runtime/
  runner.ts   # bounded runtime step implementation and dispatcher migration target
  ports.ts    # Pi Code foundation and future runtime capability ports
  types.ts    # runtime result, daemon job/run, budget, and workflow evidence
```

Runtime coordinates `src/agency/**`, `src/session/**`, `src/state/**`, `src/build/**`, and `src/gateway/**` without absorbing their durable truth.

## Daemon job model

Daemon jobs live at `.codewiki/runtime/jobs.json`. This repo-local runtime state records execution requests and attempts, not roadmap truth. Jobs can be `queued`, `running`, `blocked`, `completed`, or `cancelled`. Runs can be `running`, `completed`, `blocked`, `failed`, `stale`, or `cancelled`.

A pass boundary emits or references required handoff/build/validation/content refs. Fail/block boundaries keep the same loop or job blocked until evidence, policy, retry limits, or user input resolves the issue.

## Invariants

- Runtime does not bypass decision, planning, implementation, validation, task-close, ship-ready, publish, release, or destructive gates.
- Runtime treats artifact status as temporary coordination evidence.
- Runtime releases leases it acquires before returning unless the adapter/process fails and records that failure.
- Runtime requests host capabilities through explicit adapter ports and records platform-limited evidence instead of fabricating behavior.
- Dogfood operational state under `.codewiki/runtime/**` is repo-local state, not package source.

## Related docs

- [Agency Controller](agency.md)
- [API](api.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Role Worktree Isolation](worktree-isolation.md)
