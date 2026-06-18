# Decision Loop

The decision loop owns product and system intent. It turns user goals, current project state, alternatives, risks, and knowledge impact into an accepted decision output that planning can trust.

## Loop authority

The decision loop owns:

- user intent and approvals;
- decision kind classification (`debug`, `fix`, `harden`, `improve`, `migrate`, `docs`, or `release`);
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

Decision rows carry shared intent fields plus a `decisionKind`. Kind-specific fields shape the row without creating another loop:

| decisionKind | Additional required signal |
| --- | --- |
| debug | Target refs, hypothesis, invariant/failure boundary, probe or repro plan, expected safe behavior, and stop condition. |
| fix | Known reproduction, expected behavior, and regression coverage plan. |
| harden | Safety boundary, failure/abuse modes, negative test plan, and compatibility impact. |
| improve | Current pain, desired outcome, success signal, and non-goals. |
| migrate | Source behavior, target behavior, preserved invariants, equivalence proof, and rollback or containment plan. |

`docs` and `release` rows currently use the shared decision standards only unless a narrower kind better describes the decision.

## Exit quality standards

The decision loop can exit only when loop-owned quality standards are met. Research, uncertainty handling, and blind-spot review are not separate top-level concepts; they are evidence for these standards.

| Quality standard | Required signal |
| --- | --- |
| decision_table_ready | At least one approved row exists, approval state is explicit, and row ids are stable. |
| intention_understood | Approved rows state the user intention as current state, desired state, and rationale. |
| user_value_clear | Approved rows explain how the intention benefits users or improves user outcomes. |
| cost_understood | Approved rows expose maintainer impact and a bounded effort estimate. |
| recommendation_justified | The agent gives a clear approve/reject/defer/ask-user recommendation and explains why approved rows should proceed. |
| intention_validated | The agent judges that the user's good-faith intention is aligned with real user value and the project's long-term interests. This is an agent-judgment standard, not a deterministic fact. |
| approval_safety | High-risk approved rows have explicit user approval authority and a canonical approval ref. |
| current_state_grounded | Current KB/source/trace/Git/test baseline refs are present and canonical. |
| evidence_sufficient | Source/proof refs are enough for planning to trust the intention. High-risk rows need explicit proof refs for research, prior art, validation, or user guidance. |
| risks_and_alternatives_considered | Approved rows declare a low/medium/high risk tier; high-risk intentions identify affected layers and at least one viable alternative before planning. |
| knowledge_impact_accounted | Required KB/diagram changes are made, or no-impact rationale is recorded. |
| decision_kind_classified | Approved rows classify the decision kind so kind-specific standards can apply inside the decision loop. |
| debug_decision_focused | Debug rows include target, hypothesis, invariant, probe, expected safe behavior, and stop condition. |
| fix_decision_reproducible | Fix rows include reproduction, expected behavior, and regression coverage. |
| harden_decision_boundary | Hardening rows include safety boundary, failure modes, negative tests, and compatibility impact. |
| improve_decision_outcome | Improvement rows include current pain, desired outcome, success signal, and non-goals. |
| migrate_decision_equivalent | Migration rows include source/target behavior, preserved invariants, equivalence proof, and rollback strategy. |

Deterministic standards stay fast and repeatable. Agent-judgment standards are used when structural checks are not enough to protect user/project alignment. User-approval standards are reserved for high-risk decisions where UX cost is justified.

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
      "qualityStandards": [],
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
