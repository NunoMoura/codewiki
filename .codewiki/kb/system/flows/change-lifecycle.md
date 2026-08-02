---
type: Concept
title: Change Lifecycle
description: One Change carries accountable intent through immutable typed operations, exact Loop exits, rolling Planning, Implementation, Integration, delivery, outcomes, archive, and optional reopening.
tags:
  - codewiki
  - system
  - change
  - lifecycle
timestamp: 2026-07-30T00:00:00Z
---
# Change Lifecycle

A Change begins when Runtime accepts explicit intent. Its complete logical Trace is immutable typed operation history; Runtime owns project-wide scheduling and progression.

```text
intent and revisions
→ Decision Candidates and exact disposition
→ rolling Planning epochs and Work Items
→ Work Item Claims, Assignments, and Worker Reports
→ guarded Integration and exact integrated-tree proof
→ Implementation Candidates and realization
→ optional separately authorized Git/delivery effects
→ outcome observation
→ terminal closure and archive
→ optional hydration and reopening
```

## Flow

1. Runtime admits intent against exact project base/authority and accepts `trace.opened` plus `change.proposed` through `codewiki/state` expected-head CAS.
2. Backlog Triage recommends attention, then an authenticated user selects one exact eligible current revision against the current WorkState, projection, protected config and policy, authority Evidence, and idempotency key. Pending Change presence alone starts no Decision work.
3. Decision produces one immutable Candidate against exact Evidence Records.
4. Runtime resolves Exit Policy, executes Checks, records Results/Exit Report, revalidates authority/freshness, and records Runtime Route.
5. A passing authorized Decision disposition makes the exact Change revision eligible for rolling Planning; failed/indeterminate attempts remain durable.
6. Planning observes the selected Change set, active Change Claims, active Work Item Claims, active work, dependencies, conflicts, and fresh project snapshot.
7. Passing Planning accepts one immutable `PlanningEpochRecord` and atomic `planning.epoch_bound` operations for all participants.
8. Runtime provisions exact private Worker Workbenches, acquires Work Item Claims, and dispatches compatible isolated Assignments.
9. Worker Reports supply asserted producer material. Runtime integrates accepted output in an isolated workspace, materializes valid Evidence, and builds the exact Implementation Candidate over integrated source/tests/Knowledge/Git facts.
10. If policy requires pre-exit review, Runtime may publish only an authorized isolated review projection after non-approval readiness Checks pass, then re-observe exact approval Evidence.
11. Implementation follows Candidate → Evidence Records → Resolved Exit Policy → Checks → Check Results → Exit Report → Runtime Route against that exact integrated tree.
12. Runtime atomically accepts the exact Integration result, final assurance records, route, and ownership disposition through expected-head CAS.
13. Local branch merge, remote push, publication, release, delivery, and outcome observation progress only under separate authority and proof.
14. `trace.closed` records terminal closure only after configured Integration, ownership, review/effect, and outcome obligations complete.
15. Runtime pushes immutable archive, fetches/verifies digest, then removes hot state copy.
16. Historical inspection hydrates read-only cache. Authorized reopening creates a new hot segment with `trace.reopened` referencing archived closure.

Local work remains provisional until accepted on `codewiki/state`. A stale push requires fetch, replay, and semantic reevaluation.

Failed, indeterminate, stale, excluded, contradictory, withdrawn, superseded, and abandoned history remains visible. Raw private work does not become canonical by default.

Knowledge may intentionally lead source/delivery while exact active Changes account for the transition. Unaccounted divergence is drift; unknown required coverage blocks unsafe progression.

Pi owns chat/session compaction. CodeWiki resumes semantic work from accepted operations and current WorkState, not private cognition.

## Related docs

- [Alignment Model](../components/alignment-model.md)
- [Loop Model](../components/loop-model.md)
- [Loop Exit](../components/loop-exit.md)
- [Change Traces](../components/traces.md)
- [Runtime](../components/runtime.md)
- [Remote State Synchronization](remote-state-synchronization.md)
