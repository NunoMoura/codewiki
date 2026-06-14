# Planning Loop

The planning loop owns executable work shaping. It turns accepted decision output into work units, ordering, conflicts, path scopes, component refs, and acceptance criteria that implementation and runtime can trust.

## Loop authority

The planning loop owns:

- work-unit materialization;
- dependency ordering;
- path scopes and conflict strategy;
- component refs and test strategy;
- acceptance criteria ids;
- implementation handoff;
- runtime scheduling readiness;
- replanning answers from implementation.

The planning loop does not own product decisions, code changes, worker execution, or final content proof.

## Loop cycle

One planning cycle does this work:

```text
observe accepted decision output + KB/source/trace refs
map decisions and questions to executable work units
assign component refs, path scopes, dependencies, and acceptance criteria
identify conflicts, deferrals, and runtime scheduling constraints
update planning output
check planning exit conditions
append planning.iteration
continue, exit, route back, or block
```

Planning should refine or split work until implementation can proceed without guessing scope or acceptance.

## Loop output

Planning loop output is the high-signal packet implementation and runtime need:

- work units with stable ids;
- decision refs each work unit covers;
- concrete technical requirements for implementation;
- acceptance criteria with stable ids;
- component refs from the file-structure map;
- code/docs/test path scopes;
- dependencies and ordering constraints;
- conflict notes and scheduling holds;
- verification strategy;
- worker profile and agent assessment of independence, implementation readiness, and right sizing;
- deferrals with owner, trigger, and expiry when allowed;
- route-back questions for decision when authority is missing;
- canonical refs proving the output.

Planning output should not include code changes, test results, or worker-local execution evidence.

## Exit quality standards

The planning loop can exit only when loop-owned quality standards are met or explicitly routed back/blocked with authority:

| Quality standard | Mode | Required signal |
| --- | --- | --- |
| decision_coverage_complete | deterministic | Every accepted decision ref is covered by a work unit or explicit resolution. |
| worker_units_self_contained | deterministic | Work units have stable ids, decision refs, outcome, acceptance criteria, and bounded path scopes. |
| technical_requirements_complete | deterministic | Each work item breaks decision intent into concrete implementation requirements. |
| acceptance_and_verification_testable | deterministic | Acceptance criteria have stable ids/text and verification refs or commands are present. |
| worker_assignment_ready | agent | Agent assesses the unit as independent and implementation-ready, and a worker profile is declared. |
| work_unit_right_sized | agent | Unit is neither sprint-sized nor tiny busywork; sprint remains a grouping or dispatch batch. |
| source_ownership_aligned | deterministic | Component refs exist in the file-structure map and cover declared paths/tests. |
| dependency_order_clear | deterministic | Dependencies exist, are acyclic, and order overlapping path scopes. |
| resolutions_accounted | deterministic | Deferred/non-executable/route-back/knowledge-only/already-implemented decisions carry required evidence. |
| traceability_refs_canonical | deterministic | Planning refs are canonical trace, KB, Git, digest, source, or test refs. |

## Exit statuses

- `continue`: same planning loop can split work, add criteria, fix deps, resolve conflicts, or improve verification strategy.
- `exit`: planning output is accepted; implementation/runtime can consume it.
- `route_back`: decision authority is needed for requirements, product behavior, risk, or scope.
- `blocked`: external approval/resource or unresolved upstream state prevents planning progress.

## Work queue relationship

Planning output is not a roadmap file. It is trace truth. Generated views project it:

```text
planning.iteration output -> work-plan view -> work-queue view -> runtime scheduling
```

The work-plan view is per-trace detail. The work-queue view is cross-trace scheduling state.

## Trace iteration data

Planning iterations should record compact facts:

```json
{
  "event": "planning.iteration",
  "loop": "planning",
  "data": {
    "iteration": 1,
    "trigger": "decision_exit",
    "output": {
      "workItems": [],
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
- [File Structure](file-structure.md)
