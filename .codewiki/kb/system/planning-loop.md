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
- acceptance criteria with stable ids;
- component refs from the file-structure map;
- code/docs/test path scopes;
- dependencies and ordering constraints;
- conflict notes and scheduling holds;
- verification strategy;
- deferrals with owner, trigger, and expiry when allowed;
- route-back questions for decision when authority is missing;
- canonical refs proving the output.

Planning output should not include code changes, test results, or worker-local execution evidence.

## Exit conditions

The planning loop can exit only when these conditions are met or explicitly deferred with authority:

| Condition | Required signal |
| --- | --- |
| decision_coverage | Every accepted decision requirement/question is mapped to work, deferral, no-work rationale, or existing implementation evidence. |
| work_units_valid | Work units have stable ids, titles, summaries, and owner loop context. |
| acceptance_defined | Each executable work unit has stable acceptance criterion ids and text. |
| dependencies_valid | Dependencies exist, are acyclic, and explain required ordering. |
| path_scopes_valid | Path scopes are canonical, bounded, and conflict-aware. |
| components_valid | Component refs exist in the file-structure map and cover declared paths/tests. |
| verification_ready | Test/check strategy is explicit enough for implementation. |
| scheduling_ready | Runtime can classify work as waiting, ready, blocked, or deferrable. |
| decision_routebacks_resolved | Missing product/system authority routes back to decision instead of leaking into implementation. |

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
      "workUnits": [],
      "dependencies": [],
      "conflicts": [],
      "deferrals": []
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
