# Decision Loop

The decision loop owns product and system intent. It turns user goals, current project state, alternatives, risks, and knowledge impact into an accepted decision output that planning can trust.

## Loop authority

The decision loop owns:

- user intent and approvals;
- requirements and non-goals;
- product/system tradeoffs;
- risk tier and approval needs;
- current-state baseline refs;
- KB and diagram propagation decisions;
- questions that planning must answer;
- route-back answers from planning or implementation.

The decision loop does not own implementation details, task scheduling, worker dispatch, or code evidence.

## Loop cycle

One decision cycle does this work:

```text
observe user request + KB/source/trace/Git refs
identify decisions, requirements, risks, alternatives, and unknowns
prepare or verify KB/diagram propagation
update decision output
check decision exit conditions
append decision.iteration
continue, exit, route back, or block
```

The agent should ask the user when required authority is missing, risk is high, or ambiguity would otherwise leak into planning.

## Loop output

Decision loop output is the high-signal packet planning needs:

- approved decision rows or equivalent accepted decision facts;
- requirement ids;
- current-state baseline refs;
- affected product/system areas;
- KB and diagram refs changed or explicitly not impacted;
- alternatives considered and rejection rationale;
- risk tier and approval evidence;
- assumptions and non-goals;
- downstream planning questions;
- route-back answers;
- canonical refs proving the output.

Decision output should not include task breakdowns, implementation plans, test commands, or worker instructions.

## Exit conditions

The decision loop can exit only when these conditions are met or explicitly deferred with authority:

| Condition | Required signal |
| --- | --- |
| intent_accepted | The user intent or accepted decision facts are explicit. |
| requirements_clear | Requirements, non-goals, and assumptions are clear enough for planning. |
| current_state_grounded | Current KB/source/trace/Git baseline refs are present. |
| kb_propagation_accounted | Required KB/diagram changes are made, or no-impact rationale is recorded. |
| risk_assessed | Product/system risk, migration impact, and approval needs are recorded. |
| alternatives_considered | Relevant alternatives/tradeoffs are captured when material. |
| route_back_answered | Questions from planning/implementation are answered or intentionally deferred. |
| planning_handoff_ready | Planning has enough accepted facts, refs, and questions to start. |

## Exit statuses

- `continue`: same decision loop can add missing decisions, refs, KB propagation, or risk analysis.
- `exit`: decision output is accepted and planning can consume it.
- `route_back`: rare; used only when prior trace/source state needs observation before decision can continue.
- `blocked`: user approval, product authority, or external context is missing.

## Trace iteration data

Decision iterations should record compact facts:

```json
{
  "event": "decision.iteration",
  "loop": "decision",
  "data": {
    "iteration": 1,
    "trigger": "user_request",
    "output": {
      "decisions": [],
      "requirements": [],
      "kbPropagation": [],
      "planningQuestions": []
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

When implementation or planning routes back to decision, the new decision iteration should:

1. cite the route-back iteration ref;
2. answer the exact question;
3. update KB/decision facts if the answer changes intent;
4. emit a new decision output;
5. allow planning to revise work from the new accepted decision output.

## Related docs

- [Loop Model](loop-model.md)
- [Planning Loop](planning-loop.md)
- [Traces](traces.md)
- [Knowledge](knowledge.md)
