---
id: spec.system.components.runtime-daemon
title: Runtime and Daemon Component
state: active
component_id: runtime
diagram_refs:
  - component-map:runtime
  - file-structure-map:runtime_orchestration_boundary
source_roots:
  - src/runtime/**
  - src/runtime/**
owners:
  - architecture
  - engineering
updated: "2026-06-01"
summary: Bounded execution and daemon-dispatch layer for CodeWiki software-development loops.
---

# Runtime and Daemon Component

## Responsibility

The runtime executes one bounded CodeWiki step after agency policy authorizes it. It coordinates claims, compiler/gateway preparation, context boundaries, daemon job attempts, worker lifecycle, and stop evidence without replacing roadmap, build, validation, or Git proof.

## Owned paths

- `src/runtime/**` owns runner, dispatcher, ports, and runtime result types.
- `src/runtime/**` owns agency planning and budget policy that the runtime consumes.
- `.codewiki/runtime/**` stores dogfood runtime job state, not package source.

## Contracts

- Runtime must stop on unavailable claims, unsupported harness capability, validation block, risk/user gate, publication/destructive gate, or budget exhaustion.
- Daemon jobs are execution-attempt records only; they do not close roadmap tasks.
- Pi Code is the first-class runtime foundation, and future runtimes must preserve CodeWiki truth and proof semantics.

## Flow links

- [Runtime daemon dispatch](../flows/runtime-daemon-dispatch.md)
- [Artifact claim wait/wake](../flows/artifact-claim-wait-wake.md)
- [Resume context boundary](../flows/resume-context-boundary.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
