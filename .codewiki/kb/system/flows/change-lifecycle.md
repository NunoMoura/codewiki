---
type: Concept
title: Change Lifecycle
description: A CodeWiki change starts as user intent and becomes durable when it is represented consistently in KB, JSONL traces, source/tests, and Git proof.
tags:
  - codewiki
  - system
  - change
  - lifecycle
timestamp: 2026-06-30T00:00:00Z
---
# Change Lifecycle

A CodeWiki change starts as user intent and becomes durable when it is represented consistently in KB, JSONL traces, source/tests, and Git proof.

## Flow

1. Decision loop iterates until intent, requirements, alternatives, risks, KB impact, and planning handoff satisfy decision exit conditions.
2. A decision iteration with `exit` appends accepted decision output and canonical refs to the trace.
3. Planning loop starts from exited decision output and current KB refs, then iterates until work units, dependencies, path scopes, acceptance criteria, conflicts, and verification strategy satisfy planning exit conditions.
4. A planning iteration with `exit` appends accepted planning output for implementation and runtime scheduling.
5. Runtime outer loop folds traces, projects work queues, coordinates claims, starts workers, enforces budgets, and stores temporary scratch.
6. Implementation loop starts from exited planning output, changes source/tests/docs, gathers checks/evidence, aggregates workers, and iterates until implementation exit conditions are satisfied.
7. An implementation iteration with `exit` appends accepted implementation output, aggregate content proof, residual ownership, and publication refs when needed.
8. Generated views update from traces, KB, source/tests, and Git refs.
9. Retention can close, compact, archive, hydrate, or restore trace detail after policy allows it.

Failed, blocked, or route-back iterations append compact provenance and next actions, not downstream-consumable facts.

Chat history is continuity only. Pi native compaction may compress chat; CodeWiki-owned resume injection remains disabled during the rebuild.

## Related docs

- [Loop Model](../components/loop-model.md)
- [Traces](../components/traces.md)
- [Loop Contracts](../components/loop-contracts.md)
- [Runtime](../components/runtime.md)
