---
type: Concept
title: Planning Loop
description: Planning continuously turns a bounded selected Change set and current WorkState into immutable Planning epochs, worker-ready Work Items, dependencies, verification, Integration boundaries, and safe execution frontiers.
tags:
  - codewiki
  - system
  - planning
  - loop
timestamp: 2026-07-30T00:00:00Z
codewiki_component: planning
codewiki_components:
  - planning
codewiki_source_patterns:
  - src/planning/**
  - src/change-trace/rolling-planning.ts
  - src/change-trace/planning-mutation.ts
codewiki_test_patterns:
  - tests/planning/**
  - tests/helpers/planning-work.mjs
  - tests/traces/rolling-planning-v1.test.mjs
codewiki_trace_events:
  - planning.epoch_recorded
  - planning.epoch_bound
codewiki_generated_views:
  - .codewiki/views/work-plan.json
  - .codewiki/views/work-queue.json
  - .codewiki/views/triggers.json
  - .codewiki/views/loop-exit.json
codewiki_role: semantic_loop
codewiki_source_map:
  - id: planning
    source_patterns:
      - src/planning/**
      - src/change-trace/rolling-planning.ts
      - src/change-trace/planning-mutation.ts
    test_patterns:
      - tests/planning/**
      - tests/helpers/planning-work.mjs
      - tests/traces/rolling-planning-v1.test.mjs
    generated_views:
      - .codewiki/views/work-plan.json
      - .codewiki/views/work-queue.json
      - .codewiki/views/triggers.json
      - .codewiki/views/loop-exit.json
    trace_events:
      - planning.epoch_recorded
      - planning.epoch_bound
    role: semantic_loop
---
# Planning Loop

Planning is the project-wide execution optimizer and coherence-shaping Loop. It continuously observes accepted Change revisions, active work, dependencies, conflicts, source/Knowledge state, policies, and capacity, then proposes one immutable Planning Candidate and epoch.

Decision remains independent per Change. Planning does not wait for all Changes to finish Decision, and accepting a new Change does not silently rewrite active work.

```text
selected approved Change set
+ current WorkState
+ active Change Claims and Work Item Claims
+ active Work Items and Assignments
+ source/Knowledge/config/policy snapshot
→ immutable Planning Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Planning Checks
→ Check Results
→ Exit Report
→ Runtime Route
→ atomic Planning epoch acceptance
```

## Authority

Planning owns Sprint creation, Work Item meaning, and project-wide execution coherence:

- Planning horizon and selected Change set;
- Sprints and Work Items;
- one owning Change per Work Item and explicit contributing Changes;
- project-wide execution priority across accepted Changes, including explicit urgency/risk-of-inaction/impact/effort tradeoffs refreshed from current WorkState;
- dependencies, ordering, concurrency, and safe execution frontier;
- acceptance requirements and verification obligations;
- path/component/Knowledge boundaries;
- Integration, rollback, and release-order constraints;
- Worker Workbench requirements;
- explicit resolution for Changes not selected or not safely executable;
- disposition of active work when new intent invalidates assumptions.

Planning does not approve Change meaning, implement source, select concrete provider credentials, grant Change Claim or Work Item Claim authority, accept Worker Reports, or perform Integration/effects. Backlog Triage may order pending revisions for Decision attention using asserted and derived urgency/impact/effort dimensions, but that order is not execution priority and does not constrain Planning.

Runtime owns candidate and epoch identity, exact participant revisions, WorkState/base digests, Change Claim and Work Item Claim lifecycle, scheduling, Check activation, accepted state commit, CAS, recovery, and routing.

## Rolling epochs

```text
accept Change A
→ Planning epoch P1
→ Work Item A starts

accept Change B while A executes
→ Planning epoch P2 observes A, B, active work, conflicts, and source state

accept Change C
→ Planning epoch P3 repeats from a fresh snapshot
```

One content-addressed `PlanningEpochRecord` stores:

- Planning Candidate ID and Exit Report ID;
- exact participant Change revisions;
- source, Knowledge, config, policy, and WorkState snapshot;
- Sprints, Work Items, dependencies, and requirements;
- active-work preservation or invalidation decisions;
- global Work Item graph digest;
- safe execution frontier.

Its executable closed shape is:

```ts
interface PlanningEpochRecord {
  operationId: Sha256Digest;
  body: {
    protocol: {
      id: "codewiki.planning-epoch";
      version: "1.0.0";
      canonicalJson: "codewiki.canonical-json/1.0.0";
    };
    kind: "planning.epoch_recorded";
    kindVersion: "1.0.0";
    recordedAt: ExactUtcTimestamp;
    baseSnapshot: BaseSnapshot & { workStateDigest: Sha256Digest };
    authorityBinding: AuthorityBinding;
    planningCandidateId: StableId;
    exitReportId: StableId;
    participants: ChangeBinding[];
    sprints: PlanningSprint[];
    workItems: PlanningWorkItem[];
    activeWorkDispositions: ActiveWorkDisposition[];
    safeExecutionFrontier: WorkItemId[];
    globalWorkItemGraphDigest: Sha256Digest;
  };
}
```

Each Sprint binds ID, goal, participant Changes, Work Items, Sprint dependencies, and Integration boundary. Each Work Item binds ID, Sprint, title/outcome, owning and contributing Change revisions/tails, Work Item dependencies, requirement-to-Evidence/Check mappings, source/Knowledge/component scope, Workbench profile/tools/Skills/context/budget, and Integration target/Checks/rollback/review requirement. The graph digest hashes only exact participant and Work Item graph semantics. Runtime derives `operationId` from the complete body after validating sorted unique sets, referential integrity, and acyclic Sprint/Work Item dependencies.

Planning Candidate content names participant, owning, and contributing Change IDs without predicting future Trace tails. After every participant has the exact passing Planning exit, Runtime derives current revision/tail bindings and materializes Work Items against them. This avoids an identity cycle in which a Candidate would need to contain operation IDs produced by its own evaluation.

Runtime accepts `planning.epoch_recorded` once and atomically appends `planning.epoch_bound` to every participating Change through one state commit.

A partial batch is not accepted Planning. Remote Git expected-head CAS makes the complete batch atomic.

## In-flight stability

New Planning preserves active Work Items and Assignments when their assumptions, scope, base, dependencies, and Integration boundary remain safe.

If new intent invalidates active work, Planning must explicitly choose:

```text
preserve
pause
migrate
cancel
block
route_back
```

Planning cannot silently edit an active Assignment or reinterpret completed worker output. Runtime enforces the accepted disposition.

## Input

Planning input binds:

- exact approved Change revisions in the current horizon;
- dependencies, overlaps, merge/split/supersession, and Knowledge relationships;
- current Planning epoch and participant bindings;
- active Change Claims, Work Item Claims, Work Items, Assignments, and Integration work;
- current source/test/Git/ownership state;
- config, policy, capacity, supervision, and delivery constraints;
- prior Planning Candidates, Check Results, repair refs, and route-back context;
- exact Loop Protocol and model route.

Runtime loads current facts. Candidate producers cannot replace remote state head, source/Knowledge/config/policy digests, authority, current ownership, or active Assignment state.

## Candidate

`PlanningCandidateContent` proposes:

- bounded selected Change set and explicit resolutions;
- Sprints and worker-ready Work Items;
- owning/contributing Change IDs, which Runtime resolves to exact current revision/tail bindings after passing exit;
- dependencies, ordering, conflict boundaries, and safe parallelism;
- acceptance requirements and evidence obligations;
- source/path/component/Knowledge scope;
- verification and integrated-tree minimums;
- Worker Workbench requirements and budgets;
- Integration, rollback, preview, review, and delivery constraints;
- disposition of active work;
- unresolved questions requiring Decision or Runtime authority.

Candidate excludes canonical IDs, accepted epoch identity, actor/time, current snapshot digests supplied by Runtime, concrete credentials, activated Worker Workbenches, Change Claims, Work Item Claims, Check Results, Exit Report, and final route.

Work Items are immutable content inside an accepted Planning Candidate/epoch. A changed Work Item requires a new Candidate and epoch; no mutable Work Item CRUD API exists.

## Baseline Checks

| Check intent | Required signal |
| --- | --- |
| Participant validity | Every selected Change revision is exact, approved, and current. |
| Outcome coverage | Every selected Change has coherent executable coverage or explicit resolution. |
| Cross-Change coherence | Dependencies, overlap, merge/split, and conflicts are accounted for. |
| Active-work stability | Existing Work Items and Assignments are preserved or explicitly dispositioned. |
| Work Item readiness | Each Work Item has one owner, bounded scope, requirements, verification, and Integration target. |
| Dependency safety | No unresolved cycle or unsafe ordering remains. |
| Concurrency safety | Parallel work has compatible source/Knowledge/Integration boundaries. |
| Verification sufficiency | Requirements map to declarative Evidence obligations and exact Checks. |
| Workbench completeness | Runtime can provision reproducible bounded execution. |
| Integration safety | Combined-tree verification, rollback, and promotion boundaries are explicit. |
| Decision authority | Meaning/risk ambiguity is routed to Decision rather than invented. |

Resolved Exit Policy derives Planning minimums from canonical Planning evidence. Candidate input cannot supply or freeze Runtime-owned thresholds.

## Selection and scheduling boundary

Planning proposes the safe execution frontier. Runtime admits work only after revalidating:

- current Planning epoch and exact Work Item;
- fresh remote/source/Knowledge/config/policy snapshot;
- dependencies and conflicts;
- active Change Claim and Work Item Claim state;
- capacity, supervision, budgets, and worker adapter availability;
- Worker Workbench readiness.

Planning does not acquire ownership or start workers.

## Route-back

Planning routes to Decision when accepted meaning, outcome, Product/System/Design impact, material risk, compatibility, or authority is insufficient or contradictory.

Runtime handles stale snapshots, CAS rejection, unavailable capabilities, ownership races, worker capacity, and recovery.

A materially different outcome becomes a linked Change. Existing approved revisions remain immutable.

## Views

Backlog, Planning graph, Sprint lanes, work queue, safe frontier, blockers, and Change coverage are projections over accepted operations plus current WorkState. No mutable current-plan or backlog file is synchronized.

Graph position is presentation only. Every displayed relationship binds underlying facts and snapshot provenance.

## Executable rolling foundation

`createRollingPlanningCandidate()` creates strict immutable global Candidate identity without caller-supplied IDs or future participant tails. `resolveRollingPlanningEpoch()` validates exact participant exits, materializes current bindings, accounts for every active Work Item, preserves only unchanged semantic meaning, derives the safe frontier, and creates one epoch plus every Change binding. `commitRollingPlanningEpoch()` requires fresh synchronization and an unchanged WorkState digest, preflights the complete batch, uses exact expected-head CAS, and refuses stale retry without rerunning Planning. `projectRollingPlanningView()` derives current Sprint, frontier, and Work Item status from accepted state; no mutable backlog is written.

`tests/traces/rolling-planning-v1.test.mjs` proves multi-Change atomic acceptance, dependency-derived readiness, stale global Candidate rejection when a new Change arrives, exact active Assignment preservation, explicit pause, and persistence despite a far-future untrusted timestamp.

## Current executable drift

The v1 protocol and rolling Planning foundation are executable, but the production `wiki_plan`/coordinator path still shapes a locally bounded approved set and writes legacy per-Trace Planning events. Phase 7/9 performs the clean cut to this single global path rather than adding dual behavior.

## Related docs

- [Decision Loop](decision-loop.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [WorkState](work-state.md)
- [Change Traces](traces.md)
- [Worker Workbench](worker-workbench.md)
- [Loop Exit](loop-exit.md)
- [Alignment Model](alignment-model.md)
