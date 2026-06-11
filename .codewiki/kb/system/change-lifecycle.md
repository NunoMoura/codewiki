---
id: spec.system.change-lifecycle
title: Change Lifecycle
state: active
summary: Lifecycle of one accountable change through decision, planning, implementation, trace records, generated views, and Git proof.
owners:
  - architecture
updated: "2026-06-11"
---

# Change Lifecycle

A CodeWiki change starts as user intent and becomes durable when it is recorded in KB, JSONL traces, source/tests, and Git proof.

## Flow

1. Decision loop approves intent, alternatives, risks, and KB impact.
2. Decision gate promotes to planning or routes remediation back to decision.
3. Planning loop materializes executable work units, ordering, conflicts, and verification.
4. Planning gate promotes to implementation/runtime scheduling or routes remediation back to planning.
5. Runtime coordinates boundaries, claims, budgets, dispatch, and temporary data.
6. Implementation loop changes source/tests/docs and records evidence.
7. Implementation gate promotes closure/publication readiness or routes remediation back to implementation.
8. Generated views update from traces, KB, source/tests, and Git refs.

Chat history is continuity only. Pi native compaction may compress chat; CodeWiki-owned resume injection remains disabled during the rebuild.

## Related docs

- [Traces](traces.md)
- [Runtime](runtime.md)
- [Compilers](compilers.md)
