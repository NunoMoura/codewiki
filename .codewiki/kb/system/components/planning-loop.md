---
type: Concept
title: Planning Loop
description: Planning turns a bounded portfolio of approved Changes into globally coherent Sprints, worker-ready Work Items, dependencies, resolutions, Integration boundaries, and verification obligations.
tags:
  - codewiki
  - system
  - planning
  - loop
timestamp: 2026-07-28T00:00:00Z
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
  - .codewiki/views/loop-exit.json
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
      - .codewiki/views/loop-exit.json
    trace_events:
      - planning.change_planned
      - planning.change_replanned
      - planning.change_resolved
    role: semantic_loop
---
# Planning Loop

Planning is the project-wide execution optimizer and coherence-shaping Loop. It observes a bounded approved-Change portfolio and creates or revises Sprints, worker-ready Work Items, dependencies, resolutions, Integration constraints, and verification obligations that Runtime and Implementation can trust.

Planning owns Sprint creation. A Sprint is an execution grouping, not a Decision artifact, separate trace, or scheduling process. One Change may span several Sprints; one Sprint may coordinate several Changes.

## Authority

Planning owns:

- relevant approved-Change horizon and explicit participants;
- grouping/splitting work across Sprints;
- semantic Sprint and Work Item identities;
- exactly one owning Change per Work Item plus explicit contribution refs;
- technical and acceptance requirements;
- dependency/order constraints across Changes and Sprints;
- component/path scopes, source ownership, tests, preview targets, and Integration/rollback boundaries;
- conflict, starvation, deferral, supersession, and route-back resolution;
- worker-ready outcome boundaries and Workbench requirements;
- optional narrowing of ordinary Pi Skill discovery;
- triggers and concurrency requirements;
- replanning after accepted implementation, Git, Knowledge, policy, or capacity changes.

Planning does not approve Change meaning, edit source, execute workers, accept realization, select concrete provider/model credentials, activate Claims, or perform Integration/effects.

Runtime owns candidate/epoch/event/job identity envelopes, current-state observations, Check activation/thresholds, concrete model route, Workbench provisioning, capacity admission, generation/CAS, and append.

## Horizon and global coherence

Planning sees relevant work globally, not one Change in isolation. Horizon includes:

- approved/superseded Changes needing coverage;
- semantic and technical dependencies;
- overlapping Knowledge, UI refs, components, paths, tests, and delivery targets;
- active Sprints, Claims, Assignments, and integrated work that constrain revision;
- worker capacity, policy, budgets, preview targets, and rollback boundaries;
- priority, deadline, triggers, and explicit authority.

Selection is deterministic, impact-bounded, and persisted with policy identity. Unrelated closed history is not loaded by default.

Planning optimizes lexicographically:

1. preserve approved meaning, authority, and safety;
2. satisfy semantic/technical dependencies;
3. preserve coherent rollback and Integration boundaries;
4. avoid path/component/worktree/target conflicts;
5. produce coherent independently verifiable worker-ready outcomes;
6. maximize safe parallelism without harmful over-decomposition;
7. batch shared setup, verification, preview, and Integration;
8. reduce latency, model use, token cost, and repeated Checks.

Efficiency never overrides correctness, authority, or evidence.

## Input

Planning input binds:

- exact approved Change revisions/approval refs;
- bounded WorkState and relationship snapshot;
- current Sprints, Work Items, Assignments, Claims, Integration, and conflicts;
- Knowledge/source/test ownership and target contracts;
- prior accepted Planning revisions;
- trigger, authenticated authority, configuration, capacity, and budget refs;
- exact route-back evidence from Implementation;
- Loop Protocol and model-route identities.

Runtime loads canonical facts. Callers may propose observations or semantic plan content, never replacement repository state, activation, time, or authority.

## Candidate

Loop-owned immutable `PlanningCandidateContent` contains:

- participant Change revisions;
- proposed Sprints and worker-ready Work Items;
- ownership and cross-Change contribution;
- dependencies and global coverage;
- explicit resolutions/deferrals/route-backs;
- acceptance/verification obligations;
- source ownership, path/component/test scope;
- Integration, rollback, preview, and trigger requirements;
- Workbench capability/Skill/tool/isolation/minimum-Check/budget requirements;
- uncertainties and rationale.

Candidate excludes canonical runtime job/event identity, observed timestamps, current snapshot digests supplied by Runtime, concrete provider/model credentials, activated Workbenches/Claims, Check Results, Exit Report, and final route. Executable Sprint, Work Item, and UI preview-target content uses exact camel-case schemas with recursive unknown-field and value validation; Pi SDK tools expose the same closed shape.

Planning aims for **worker-ready**, not smallest. It avoids splitting work where boundaries create coordination overhead, incoherent verification, or shared-state risk.

## Loop cycle

```text
refresh bounded portfolio horizon
→ shape globally coherent Sprints and Work Items
→ declare ownership, contribution, dependencies, verification, Integration, and Workbench requirements
→ preserve claimed/integrated work or route explicit migration
→ produce immutable Planning candidate
→ resolve candidate-specific Planning Exit Policy
→ run independent Code/Model Checks
→ build Exit Report
→ repair or hand Report to Runtime
→ Runtime final freshness/authority/CAS guard and multi-trace append
```

## Planning candidate shape

Conceptually:

```ts
interface PlanningCandidate {
  participantChanges: ParticipantChange[];
  sprints: SprintPlan[];
  workItems: PlanningWorkItem[];
  changeCoverage: ChangePlanningCoverage[];
  dependencies: PlanningDependency[];
  resolutions: ChangePlanningResolution[];
  rationale: string[];
}
```

Runtime wraps passed content in exact candidate, policy, Report, epoch, trace-slice, observation, and append identities.

Each Sprint includes goal, participating Changes, rollback/Integration boundary, dependency/order refs, Knowledge/UI/preview targets, frozen target/profile obligations, and Work Item refs.

Each Work Item includes:

- stable semantic id and Sprint id;
- exactly one owning Change plus optional contributions;
- coherent outcome and technical requirements;
- stable acceptance requirements and verification;
- components/path/test scope and dependencies;
- Workbench context/capability/Skill/tool/isolation needs;
- minimum required Checks/evidence and budget class;
- optional trigger;
- uncertainty and worker-readiness rationale.

Omitted Skill scope preserves normal Pi discovery. Planning may narrow but cannot invent/install Skills, grant tools/credentials, or let Skills widen authority.

## Baseline Checks

| Check intent | Required signal |
| --- | --- |
| Approved Change coverage | Every selected approved Change is covered or explicitly resolved. |
| Sprint coherence | Goals, participants, rollback, Integration, and dependencies form safe execution groups. |
| Worker-ready Work Items | Every item has one owner, coherent outcome, technical and acceptance requirements, and bounded scope. |
| Cross-Change contribution | Additional coverage is explicit without duplicate ownership. |
| Technical requirements | Implementation can proceed without inventing accepted behavior. |
| Acceptance and verification | Stable acceptance requirements and evidence obligations are executable. |
| Source ownership | Components, paths, and tests fit accepted ownership. |
| Dependency closure | References exist, graph is acyclic, and overlap is ordered. |
| Claimed work stability | Replanning never silently mutates active Assignments. |
| Integration safety | Worktrees, combined-tree checks, preview, merge, and rollback are explicit where needed. |
| UI preview targets | Every binding freezes canonical target/profile identity and stays within participant authority. |
| Workbench buildability | Context, capability, Skill/tool scope, isolation, minimum Checks, evidence, and budget can form a bounded Workbench. |
| Uncertainty ownership | Ambiguity is repaired or routed to Decision. |
| Trigger validity | Scheduled/event/manual triggers have bounded execution/concurrency policy. |
| Resolution accountability | Deferral, already-realized, Knowledge-only, supersession, and route-back carry evidence. |
| Canonical traceability | Change, Knowledge, source/test, Git, trace, and digest refs are valid. |

The executable Check Catalog includes Planning-only `ui_preview_targets_valid` when UI scope activates it. Release-producing work activates Planning-specific release-plan safety rather than Implementation effect approval. Global Check ids cannot silently inherit another Loop's description or repair target.

Protected kernel Checks cannot be disabled. Planning minimums become frozen obligations for downstream Workbenches/Implementation; actual effects may add but never silently remove them.

## Exit and route

Exit Report status is `pass | fail | indeterminate`.

- `pass`: exact candidate has coherent executable coverage or explicit resolution for all participants.
- `fail`: Planning candidate needs repair or route-back.
- `indeterminate`: required checking or evidence is unavailable; Runtime retries/waits/blocks.

Runtime route is separate. Semantic uncertainty about approved meaning, Product outcome, Knowledge, material risk, or authority routes to Decision. Operational capacity may block scheduling without making a coherent plan fail.

## Replanning rules

- Unclaimed Work Items may be superseded by later passed-and-appended Planning output.
- Claimed work remains bound to exact plan, Change, Check minimum, Workbench, and source base.
- Claimed scope changes require release/cancel/migration.
- Integrated work cannot disappear through silent replanning.
- Meaning/outcome/Knowledge/material-risk changes route to Decision.
- Unclaimed approved work may regroup when global execution improves without violating accepted constraints.

## Multi-trace append

Planning runs once, then Runtime appends deterministic per-Change slices. One immutable candidate and Exit Report cover all slices. Epoch identity binds participants, exact base revisions/tails, policy/report, and slice digests.

A partial multi-trace write is not accepted complete Planning state. WorkState exposes incomplete epoch state; Runtime uses deterministic event ids and private recovery packet to append missing slices idempotently before Claims.

## Work queue relationship

```text
passed-and-appended Planning epoch
→ WorkState
→ Work/Sprint/queue projections
→ Runtime tier and Workbench resolution
→ guarded Claim and Assignment
```

Runtime never invents Work Items directly from approved Changes. It selects only current accepted Planning items with satisfied dependencies and compatible Integration/policy state.

## Trace target

```json
{
  "event": "change_planned",
  "loop": "planning",
  "data": {
    "iteration": 2,
    "candidate": { "id": "candidate:...", "digest": "sha256:..." },
    "resolvedExitPolicy": { "digest": "sha256:..." },
    "exitReport": { "id": "report:...", "status": "pass" },
    "planningEpoch": { "id": "PE-42", "participants": [] },
    "route": { "kind": "advance" },
    "progress": {}
  },
  "refs": []
}
```

Current event names, payload fields, and legacy exit-view filename remain executable migration state until clean Planning/trace/view cuts replace them together.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Source Map](source-map.md)
