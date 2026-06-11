---
id: spec.system.runtime
title: Runtime
state: active
summary: Runtime coordination for boundaries, claims, scheduling, automation policy, budgets, temporary data, and Pi-native compaction boundaries.
owners:
  - architecture
updated: "2026-06-11"
---

# Runtime

Runtime coordinates execution around the three semantic loops. It is not a fourth loop and it does not own product truth.

## Responsibilities

Runtime owns:

- source-backed context boundaries;
- trace-owned worker claims;
- ephemeral leases and lock helpers;
- scheduling and automation policy;
- budgets and stop conditions;
- dispatch requests;
- lifecycle helpers;
- temporary working data under `.codewiki/runtime/tmp/**`;
- Pi session refs and Pi-native compaction boundaries.

Runtime does not own accepted requirements, work-plan truth, gate history, implementation evidence, or generated views. Those are trace/KB/source/Git concerns.

## Context and compaction

CodeWiki-owned context refresh is disabled for this repository during the rebuild. The old CodeWiki refresh window, source-backed projection injection, and automatic resume pickup caused agents to resume deprecated workflow assumptions.

Until a future explicit decision reintroduces extension behavior, conversation compression must use Pi native automatic compaction only. Runtime code may not inject refresh control messages, hidden projection messages, or per-turn CodeWiki compaction triggers.

## Temporary data

Temporary working data belongs under:

```text
.codewiki/runtime/tmp/<trace-id>/<loop>/
```

Cleanup policy:

- Gate pass deletes the loop temp after durable trace, KB, source, test, or Git refs exist.
- Gate fail/block preserves loop temp for remediation.
- A superseding same-loop run deletes or replaces stale temp.
- Trace close deletes all remaining trace temp.

Temporary data is never source truth. Anything needed after gate pass must be promoted to trace events/checkpoints, KB docs, source/tests, or Git refs before cleanup.

## Runtime source root

Runtime code lives under `src/runtime/**`:

- `boundary.ts`
- `claims.ts`
- `leases.ts`
- `scheduler.ts`
- `policy.ts`
- `budget.ts`
- `dispatcher.ts`
- `lifecycle.ts`
- `tmp.ts`
- `types.ts`

The old `src/runtime/**` root is folded into runtime. Agency is automation policy and scheduling behavior, not an architecture root.

## Related docs

- [Traces](traces.md)
- [File Structure](file-structure.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
