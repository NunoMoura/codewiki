---
type: Concept
title: Planning Loop
description: The Planning loop continuously turns the relevant portfolio of approved Changes into globally coherent Sprints, Work Items, dependencies, resolutions, and execution constraints.
tags:
  - codewiki
  - system
  - planning
  - loop
timestamp: 2026-08-01T00:00:00Z
codewiki_component: planning
codewiki_components:
  - planning
codewiki_source_patterns:
  - src/planning/**
codewiki_test_patterns:
  - tests/planning/**
  - tests/helpers/planning-work.mjs
codewiki_trace_events:
  - planning.change_planned
  - planning.change_replanned
  - planning.change_resolved
codewiki_generated_views:
  - .codewiki/views/work-plan.json
  - .codewiki/views/work-queue.json
  - .codewiki/views/triggers.json
  - .codewiki/views/quality.json
codewiki_role: semantic_loop
codewiki_source_map:
  - id: planning
    source_patterns:
      - src/planning/**
    test_patterns:
      - tests/planning/**
      - tests/helpers/planning-work.mjs
    generated_views:
      - .codewiki/views/work-plan.json
      - .codewiki/views/work-queue.json
      - .codewiki/views/triggers.json
      - .codewiki/views/quality.json
    trace_events:
      - planning.change_planned
      - planning.change_replanned
      - planning.change_resolved
    role: semantic_loop
---
# Planning Loop

Planning is the project-wide execution optimizer. It continuously observes a bounded horizon of approved Changes and active work, then creates or revises Sprints, Work Items, dependencies, resolutions, integration constraints, and execution order that Implementation and runtime can trust.

Planning owns Sprint creation. A Sprint is an execution grouping, not a Decision artifact and not a trace. One Change may require several Sprints; one Sprint may coordinate several Changes.

## Loop authority

Planning owns:

- selecting the relevant approved-Change planning horizon;
- grouping approved Changes into Sprints;
- splitting one Change across Sprints when rollback, dependency, integration, or capacity boundaries require it;
- stable Sprint and Work Item identities;
- one owning Change for every Work Item and explicit additional Change contribution refs;
- executable technical requirements and acceptance criteria;
- dependency and ordering constraints across Changes and Sprints;
- component refs, path scopes, test strategy, and integration targets;
- conflict, starvation, deferral, supersession, and route-back policy;
- worker-ready outcome boundaries, Workbench requirements, and safe concurrency constraints;
- optional narrowing of the normally available Pi Skill catalog for a Workbench;
- recurring schedules, event triggers, hooks, and manual triggers;
- replanning after implementation, Git, KB, policy, or capacity changes.

Planning does not approve Change meaning, edit source, execute workers, accept implementation evidence, or mutate approved Change revisions.

## Planning horizon

Planning sees the entirety of relevant work, not only one Change Trace. A bounded horizon includes:

- newly approved or superseded Changes needing coverage;
- their semantic and technical dependencies;
- overlapping Knowledge topics, UI refs, components, and path scopes;
- active Sprints and claimed Work Items that constrain replanning;
- current integration/worktree state;
- worker capacity, budgets, policy, and preview targets;
- explicit priority, deadline, trigger, and rollback constraints.

Planning need not reconsider unrelated closed history on every trigger. Horizon selection is deterministic, impact-based, and recorded in the planning epoch.

## Optimization order

Planning optimizes lexicographically rather than hiding authority inside one score:

1. preserve approved meaning, authority, and safety;
2. satisfy semantic and technical dependencies;
3. preserve coherent rollback and integration boundaries;
4. avoid component/path/worktree conflicts;
5. keep Work Items coherent, independently verifiable, and backed by buildable Workbench requirements;
6. maximize safe parallelism without harmful over-decomposition;
7. batch shared setup, verification, integration, and preview work;
8. reduce latency, model use, token cost, and repeated checks.

Efficiency can never override correctness, approval, or evidence requirements.

## Loop input

Planning input includes:

- exact approved Change refs and approval digests;
- relevant WorkState planning horizon and digest;
- current Sprint, Work Item, Assignment, integration, and conflict projections;
- source ownership and test contracts;
- prior accepted planning output refs and revisions;
- trigger, actor, policy, capacity, and budget refs;
- route-back evidence when Implementation requests replanning.

The core loads canonical Decision-loop output, traces, ownership, policy, and current state. Callers submit proposed plans or planning observations, not replacement repository truth.

## Loop cycle

```text
refresh relevant WorkState planning horizon
select approved Changes needing new or revised coverage
shape globally coherent Sprints
create or revise owned Work Items, criteria, dependencies, paths, tests, and triggers
declare Workbench context, capability, Skill-scope, isolation, Quality, evidence, and budget requirements
check active claims, conflicts, integration state, and execution capacity
record explicit deferrals, resolutions, and route-backs
resolve and run Planning Quality Policy
append per-Change slices of one planning epoch
continue, exit, route back, or block
```

Planning should refine or split work until Implementation can proceed without guessing accepted behavior, scope, ownership, acceptance, or integration order.

## Loop output

One accepted Planning iteration emits a planning epoch:

```ts
interface PlanningEpoch {
  planningEpochId: string;
  digest: string;
  observedWorkStateDigest: string;
  participantChanges: ParticipantChange[];
  sprints: SprintPlan[];
  workItems: WorkItem[];
  changeCoverage: ChangePlanningCoverage[];
  dependencies: PlanningDependency[];
  resolutions: ChangePlanningResolution[];
  qualityPolicyReceipt: QualityPolicyReceipt;
  assessments: QualityAssessment[];
}
```

Sprint plans contain:

- stable id and accountable execution goal;
- participating approved Change ids;
- rollback and integration boundary;
- dependency and ordering refs;
- canonical Knowledge/UI/preview targets when affected;
- `uiPreviewTargets[]` bindings with exact target/profile digests, contributing Change ids, and covered Work Item ids;
- policy and target digests that execution must freeze;
- Work Item refs.

Every Work Item contains:

- stable id and Sprint id;
- exactly one `owningChangeId`;
- optional `contributingChangeIds`;
- concrete technical requirements;
- stable acceptance criteria;
- components, path scopes, and verification;
- dependencies and Workbench requirements;
- optional narrowed Pi Skill scope, with omission preserving normal discovery;
- required capabilities, isolation, minimum Quality Standards, evidence, and budget class;
- trigger when applicable;
- uncertainty, worker readiness, and Workbench buildability assessment.

Planning does not select a concrete provider/model, install Skills, grant tools or credentials, or build the private Workbench. Runtime resolves the exact model route, Skill catalog, capabilities, source, context, isolation, and policy against fresh state before Claim.

Planning output excludes source edits, test results, worker-local checklists, implementation evidence, and product decisions made during decomposition.

## Replanning rules

- Unclaimed Work Items may be superseded by a later accepted planning revision.
- Claimed Work Items remain bound to exact plan, Change revision, policy, and source-base refs.
- Changing claimed scope requires explicit release, cancellation, or migration.
- Integrated work cannot disappear through silent replanning.
- Product meaning, outcome, Knowledge semantics, or material risk changes route to Decision.
- Planning may regroup unclaimed approved work across Sprints when global execution improves without violating accepted constraints.

## Multi-trace append

Planning runs once over its horizon, then runtime appends deterministic per-Change output slices to affected Change Traces. Each slice carries planning epoch id, participant set, observed WorkState digest, Sprint descriptor digests, and base planning revisions.

A partial multi-trace write is not accepted Sprint state. WorkState exposes `incomplete_commit`, and runtime retries deterministic missing events before downstream claim selection.

## Quality standards

| Quality standard | Required signal |
| --- | --- |
| approved_change_coverage_complete | Every selected approved Change is covered by Work Items or explicit resolution. |
| sprint_boundaries_coherent | Sprint goals, participants, rollback, integration, and dependencies form safe execution groups. |
| work_items_self_contained | Work Items have stable ids, one owner, outcome, requirements, criteria, and bounded paths. |
| cross_change_contribution_explicit | Additional Change coverage is declared without duplicating ownership. |
| technical_requirements_complete | Implementation requirements are concrete and preserve accepted meaning. |
| acceptance_and_verification_testable | Stable criteria and verification evidence are executable. |
| source_ownership_aligned | Components and path/test scopes match OKF ownership. |
| dependency_order_clear | Dependencies exist, are acyclic, and order overlapping work. |
| claimed_work_stable | Replanning does not silently mutate active Assignments. |
| integration_plan_safe | Worktree, merge, shared preview, and rollback constraints are explicit where needed. |
| ui_preview_targets_valid | Every preview binding freezes canonical target/profile digests and stays within Sprint Change/Work Item authority. |
| worker_assignment_ready | Work is coherent, independently verifiable, right-sized, and does not create harmful decomposition. |
| worker_workbench_buildable | Context, capabilities, Skill scope, isolation, minimum Standards, evidence, and budget requirements can produce a bounded Workbench. |
| uncertainty_resolved | Planning uncertainty is repaired or routed to Decision. |
| triggers_valid | Recurring/event/hook/manual triggers have bounded run and concurrency policy. |
| resolutions_accounted | Deferral, already-realized, knowledge-only, non-executable, superseded, or route-back facts carry evidence. |
| traceability_refs_canonical | Change, trace, KB, Git, digest, source, and test refs are canonical. |

## Exit statuses

- `continue`: same planning horizon can be repaired or optimized further.
- `exit`: every selected approved Change has accepted executable coverage or explicit resolution.
- `route_back`: Decision authority is needed for meaning, outcome, Knowledge, risk, or approval.
- `blocked`: external capacity, policy, integration conflict, or upstream state prevents a safe plan.

## Work queue relationship

```text
approved Planning epoch
-> per-Change trace facts
-> WorkState
-> Sprint/work-plan views
-> work queue
-> runtime tier selection and private Workbench provisioning
-> guarded Claim and Assignment activation
```

Runtime never invents Work Items from raw approved Changes. It selects only accepted Planning-owned Work Items whose owning Change, plan revision, dependencies, integration state, and policy remain current.

## Trace output

```json
{
  "event": "change_planned",
  "loop": "planning",
  "data": {
    "iteration": 2,
    "trigger": "approved_change_portfolio_changed",
    "observedWorkStateDigest": "sha256:...",
    "output": {
      "planningEpochId": "PE-42",
      "digest": "sha256:...",
      "participantChanges": [],
      "sprints": [],
      "workItems": [],
      "changeCoverage": [],
      "resolutions": [],
      "qualityPolicyReceipt": {},
      "assessments": []
    },
    "exit": {
      "status": "exit",
      "conditions": []
    },
    "progress": {}
  },
  "refs": []
}
```

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Quality Policy](quality-policy.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Source Map](source-map.md)
