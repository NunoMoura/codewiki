---
id: spec.system.compilers
title: Compilers
state: active
summary: Three CodeWiki compiler loops that append JSONL trace events and promote only through loop-owned gates.
owners:
  - architecture
updated: "2026-06-11"
---

# Compilers

CodeWiki has three compiler loops: decision, planning, and implementation. Compilers transform approved input into durable trace events. They do not own generated views and they do not promote themselves without passing their loop gate.

## Loop responsibilities

| Loop | Responsibility | Source root | Gate |
| --- | --- | --- | --- |
| Decision | Turn user intent and KB deltas into approved decisions, requirements, risks, and route-back questions. | `src/decision/**` | `decision/gate.ts` |
| Planning | Turn approved decision events into work units, ordering, conflicts, verification strategy, and work-plan ownership. | `src/planning/**` | `planning/gate.ts` |
| Implementation | Turn planned work into code/docs/tests changes, check evidence, content proof, and optional publication state. | `src/implementation/**` | `implementation/gate.ts` |

Gates are loop exits. There is no standalone validation loop or gateway source root in the target architecture.

## Trace output

Compiler output is recorded as JSONL trace events under `.codewiki/traces/TRACE-*.jsonl`.

Historic `decision_build`, `planning_build`, and `implementation_build` files are compatibility artifacts from the old implementation. They can guide migration, but the target output format is trace records and checkpoints.

## Promotion boundaries

- Decision gate pass allows planning to start.
- Planning gate pass allows implementation/runtime scheduling to start.
- Implementation gate pass allows closure or publication readiness.
- Gate fail/block routes remediation back to the originating loop.
- Compiler output alone cannot promote work.

## Generated views

Generated views under `.codewiki/views/**` are projections over KB, traces, source/tests, and Git refs. View refresh is separate from loop promotion. A stale view can be regenerated; it is not truth.

## Related docs

- [Traces](traces.md)
- [File Structure](file-structure.md)
- [Runtime](runtime.md)
- [Validation Gateway](validation-gateway.md)
