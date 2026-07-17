---
type: Concept
title: Planning Loop
description: The planning loop owns executable Work Item shaping and Sprints Queue health. It turns accepted Decisions into parallel-safe Work Items, ordering, conflicts, path scopes, component refs, and acceptance criteria that implementation and runtime can trust. Most accepted project-affecting Decisions enter planning; tiny/small low-risk Decisions may bypass planning only when the Decision loop records a safe direct implementation route.
tags:
  - codewiki
  - system
  - planning
  - loop
timestamp: 2026-06-30T00:00:00Z
codewiki_component: planning
codewiki_components:
  - planning
codewiki_source_patterns:
  - src/planning/**
codewiki_test_patterns:
  - tests/planning/**
  - tests/helpers/planning-work.mjs
codewiki_trace_events:
  - planning.work_units_created
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
      - planning.work_units_created
    role: semantic_loop
---
# Planning Loop

The planning loop owns executable Work Item shaping and Sprints Queue health. It turns accepted Decisions into parallel-safe Work Items, ordering, conflicts, path scopes, component refs, and acceptance criteria that implementation and runtime can trust. Most accepted project-affecting Decisions enter planning; tiny/small low-risk Decisions may bypass planning only when the Decision loop records a safe direct implementation route.

Compatibility wording: the planning loop owns executable work shaping and trace-queue health; in current product UX, this means Planning owns Sprints Queue health and Work Item shaping.

## Loop authority

The planning loop owns:

- Work Item materialization from approved Decisions;
- dependency ordering;
- Sprints Queue ordering, conflict, starvation, deferral, and route-back policy;
- path scopes and conflict strategy;
- component refs and test strategy;
- acceptance criteria ids;
- planning depth (`micro` or `standard`) for each work item;
- implementation handoff;
- triggers for recurring schedules, event triggers, hooks, and manual heartbeat handoff;
- runtime scheduling readiness;
- replanning answers from implementation.

The planning loop does not own product decisions, code changes, worker execution, or final content proof.

## Loop cycle

One planning cycle does this work:

```text
observe accepted decision output + KB/source/trace refs + active trace queue
map Decisions and questions to executable Work Items
assign component refs, path scopes, dependencies, and acceptance criteria
identify Sprints Queue conflicts, stale Decisions, deferrals, starvation risk, route-back needs, and runtime scheduling constraints
update planning output
check planning exit conditions
append planning.work_units_created
continue, exit, route back, or block
```

Planning should refine or split work until implementation can proceed without guessing scope or acceptance. For tiny or small low-risk Decisions that still route to Planning, planning may emit a micro-plan: one self-contained Work Item with explicit acceptance criteria, path scopes, and verification, but no dependency graph ceremony.

Planning does not need to create mandatory to-do lists or micro-steps inside each Work Item. A Work Item is the claimable unit; if a step needs separate ownership or scheduling, Planning should make it a Work Item instead of a private checklist item.

## Loop output

Planning loop output is the high-signal packet implementation and runtime need:

- Work Items with stable ids;
- Decision refs each Work Item covers;
- concrete technical requirements for implementation;
- acceptance criteria with stable ids;
- component refs from the source map;
- code/docs/test path scopes;
- dependencies and ordering constraints;
- optional trigger (`id`, `kind`, `runMode`, `concurrency`, `runKeyTemplate`, `owner`, `trigger`, and canonical refs) for recurring schedule, event trigger, hook, or manual heartbeat work;
- conflict notes and scheduling holds;
- verification strategy;
- planning depth (`micro` for compact one-Work Item handoff or `standard` for normal planning);
- worker profile and agent assessment of independence, implementation readiness, right sizing, and uncertainty resolution;
- resolutions using known kinds: work-unit, deferred, already-implemented, route-back, knowledge-only, or non-executable;
- deferrals with owner, trigger, rationale, and evidence when allowed;
- route-back resolutions with owner, trigger, rationale, and evidence when decision authority is missing;
- canonical refs proving the output.

Planning output should not include code changes, test results, planner-authored to-do lists, or worker-local execution evidence. Implementation workers may use private scratchpads/checklists later, but those are not Sprint Plan truth.

A micro-plan is still a planning artifact. It must cover exactly one accepted Decision ref, have no dependencies, stay low-risk by Decision classification, and carry enough acceptance/verification detail for implementation to proceed immediately. If planning discovers ambiguity, dependencies, broader path scope, or a need to split work, it must promote the work to standard planning or route back to Decision. If planning needs user clarification or validation, it routes to the Decision loop rather than blocking directly.

## Loop quality standards

The planning loop can exit only when loop-owned quality standards are met or explicitly routed back/blocked with authority:

| Quality standard | Mode | Required signal |
| --- | --- | --- |
| decision_coverage_complete | deterministic | Every accepted Decision ref is covered by a Work Item or explicit resolution. |
| worker_units_self_contained | deterministic | Work Items have stable ids, Decision refs, outcome, acceptance criteria, and bounded path scopes. |
| technical_requirements_complete | deterministic | Each Work Item breaks Decision intent into concrete implementation requirements. |
| acceptance_and_verification_testable | deterministic | Acceptance criteria have stable ids/text and verification refs or commands are present. |
| planning_depth_accounted | deterministic | Work Items declare micro or standard planning depth; micro-plans cover one Decision and have no dependencies. |
| worker_assignment_ready | agent | Agent assesses the Work Item as independent and implementation-ready, and a worker profile is declared. |
| uncertainty_resolved | agent | No unresolved planning uncertainty remains; Decision or user authority is routed instead of leaking into implementation. |
| work_unit_right_sized | agent | Work Item is neither Sprint-sized nor tiny busywork; Sprint remains the accountable grouping. |
| source_ownership_aligned | deterministic | Component refs exist in the source map and cover declared paths/tests. |
| dependency_order_clear | deterministic | Dependencies exist, are acyclic, and order overlapping path scopes. |
| triggers_valid | deterministic | Triggers use known kinds (`schedule`, `trigger`, `hook`, `manual`), `runMode: new_trace`, valid concurrency (`skip_if_active`, `queue`, `replace`), run key template, owner, trigger source, and canonical refs. |
| resolutions_accounted | deterministic | Resolutions use known kinds and carry required evidence; route-back resolutions carry evidence and return to decision authority before implementation. |
| traceability_refs_canonical | deterministic | Planning refs are canonical trace, KB, Git, digest, source, or test refs. |

## Exit statuses

- `continue`: same planning loop can split work, add criteria, fix deps, resolve conflicts, or improve verification strategy.
- `exit`: planning output is accepted; implementation/runtime can consume it.
- `route_back`: decision authority is needed for requirements, product behavior, risk, or scope.
- `blocked`: external approval/resource or unresolved upstream state prevents planning progress.

## Work queue relationship

Planning output is not a roadmap file. It is trace truth. Generated views project it:

```text
planning.work_units_created output -> work-plan view -> work-queue view -> runtime scheduling
```

The work-plan view is per-trace detail. The Sprints Queue is the product concept for cross-trace ordering, health, Sprint Traces, and blockers. The work-queue view is the runtime claim projection over Planning-approved ready Work Items.

A trace that remains `needs_planning` is a Planning-owned queue condition, not runtime truth to resolve heuristically. Planning must cover the Decision refs with Work Items, defer them with rationale, route them back to Decision or the user, or record why they are non-executable. Runtime and hosts may surface the condition, but they must not invent semantic work from raw Decisions. Compatibility wording: runtime and hosts must not invent semantic work from the raw proposed changes.

## Trace iteration data

Planning iterations should record compact facts:

```json
{
  "event": "work_units_created",
  "loop": "planning",
  "data": {
    "iteration": 1,
    "trigger": "decision_exit",
    "output": {
      "workItems": [
        {
          "trigger": {
            "id": "TRG-example",
            "kind": "schedule",
            "runMode": "new_trace",
            "concurrency": "skip_if_active",
            "runKeyTemplate": "example:${run}",
            "owner": "implementation",
            "trigger": "cron:0 9 * * 1",
            "refs": ["kb:system/components/runtime.md"]
          }
        }
      ],
      "resolutions": [],
      "qualityStandards": [],
      "dependencies": [],
      "conflicts": []
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

## Route-back handling

When implementation routes back to planning, the new planning iteration should:

1. cite the implementation route-back ref;
2. update work-unit scope, acceptance, dependencies, path scopes, or verification strategy;
3. route to decision if the issue is product/system authority rather than planning authority;
4. emit a new planning output that implementation can consume.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
- [Source Map](source-map.md)
