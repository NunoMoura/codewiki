---
type: Concept
title: Use Loop-Governed Automation
description: As a user, I want Project Runtime to advance compatible work automatically while exact Loop, Check, budget, authority, isolation, and effect boundaries remain visible and fail closed.
tags:
  - codewiki
  - product
  - stories
  - automation
timestamp: 2026-07-28T00:00:00Z
---
# Use Loop-Governed Automation

As a user, I want Project Runtime to advance compatible work automatically while exact Loop, Check, budget, authority, isolation, and effect boundaries remain visible and fail closed.

## Acceptance signals

- Runtime advances only Decision, Planning, and Implementation semantic work.
- Runtime owns job/candidate/Result/Report identity, scheduling, freshness, CAS, recovery, and writes without inventing semantic truth.
- Users configure bounded automation, supervision, capacity, isolation, budgets, and approval ceilings.
- Runtime stops/routes/retries/waits on ambiguity, required fail/indeterminate Results, budget exhaustion, no progress, stale state, missing capability, or authority.
- Users see exact candidate, activated Checks and reasons, Report status, Runtime route, proof refs, and next safe action.
- Independent Checks continue after unrelated failure and use bounded resource-specific pools.
- Parallel workers use exact Claims/private Workbenches and never self-attest acceptance.
- Integration, merge, push, publication, release, and deployment remain separately guarded effects.
- Knowledge, Change Traces, source/tests, Git/delivery evidence, and generated views retain separate authority.
- Learned repair context cannot weaken Checks, thresholds, routing authority, or approval.

## Related docs

- [Agents](../users/agents.md)
- [Loop Model](../../system/components/loop-model.md)
- [Loop Exit](../../system/components/loop-exit.md)
- [Runtime](../../system/components/runtime.md)
- [Worker Workbench](../../system/components/worker-workbench.md)
