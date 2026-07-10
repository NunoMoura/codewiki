---
type: Concept
title: Decision Loop
description: The decision loop owns product and system intent and KB meaning updates. It turns user goals, current project state, alternatives, risks, and knowledge impact into user-validated proposed changes that can become an accepted decision output Planning can trust.
tags:
  - codewiki
  - system
  - decision
  - loop
timestamp: 2026-06-30T00:00:00Z
codewiki_component: decision
codewiki_components:
  - decision
codewiki_source_patterns:
  - src/decision/**
codewiki_test_patterns:
  - tests/decision/**
  - tests/helpers/proposed-change.mjs
codewiki_trace_events:
  - decision.changes_approved
codewiki_role: semantic_loop
codewiki_source_map:
  - id: decision
    source_patterns:
      - src/decision/**
    test_patterns:
      - tests/decision/**
      - tests/helpers/proposed-change.mjs
    trace_events:
      - decision.changes_approved
    role: semantic_loop
---
# Decision Loop

The decision loop owns product and system intent and KB meaning updates. It turns user goals, current project state, alternatives, risks, and knowledge impact into user-validated proposed changes that can become an accepted decision output Planning can trust.

## Loop authority

The decision loop owns:

- user intent and approvals;
- decision kind and resolved decision type classification (`debug`, `fix`, `harden`, `improve`, `migrate`, `docs`, `release`, or a guarded direct-implementation type);
- work scale classification (`tiny`, `small`, `normal`, or `large`), planning depth (`micro` or `standard`), and route target;
- requirements and non-goals;
- product/system tradeoffs;
- risk tier and approval needs;
- current-state baseline refs;
- KB and diagram propagation decisions;
- questions that planning must answer;
- route-back answers from planning or implementation.

The decision loop does not own implementation details, task scheduling, worker start, or code evidence.

## Loop cycle

One decision cycle does this work:

```text
observe user request + KB/source/trace/Git refs
identify decisions, requirements, risks, alternatives, and unknowns
prepare or verify KB/diagram propagation
update decision output
check decision exit conditions
append decision.changes_approved
continue, exit, route back, or block
```

Candidate proposed changes should be visible to the user as Sprint Proposal cards before append. The user can approve, edit, reject, or defer each proposed change. That validated proposal is the Decision loop input; it is not final workflow truth until Decision quality standards pass and runtime appends `decision.changes_approved`.

The agent should ask the user when required authority is missing, risk is high, or ambiguity would otherwise leak into planning.

## Loop output

Decision loop output is the high-signal packet planning needs:

- Decisions accepted from user-validated Proposed Changes;
- requirement ids;
- current-state baseline refs;
- affected product/system areas;
- KB and diagram refs changed or explicitly not impacted;
- alternatives considered and rejection rationale;
- risk tier and approval evidence;
- assumptions and non-goals;
- downstream planning questions;
- planning-depth handoff guidance (`micro` or `standard`) and route metadata (`planning` by default, or direct `implementation` for eligible tiny/small low-risk changes);
- route-back answers;
- canonical refs proving the output.

Decision output should not include task breakdowns, implementation plans, or worker instructions. It may include a direct implementation scope only for tiny/small low-risk changes that explicitly skip Planning; that scope is a bounded acceptance/verification packet, not a task plan.

Proposed changes carry shared intent fields plus a `decisionKind` and resolved `decisionType`. `decisionKind` captures semantic intent; `decisionType` selects package-owned pipeline, quality-profile, evidence-policy, escalation, and forbidden-skip defaults. Kind-specific fields shape the proposed change without creating another loop:

| decisionKind | Additional required signal |
| --- | --- |
| debug | Target refs, hypothesis, invariant/failure boundary, probe or repro plan, expected safe behavior, and stop condition. |
| fix | Known reproduction, expected behavior, and regression coverage plan. |
| harden | Safety boundary, failure/abuse modes, negative test plan, and compatibility impact. |
| improve | Current pain, desired outcome, success signal, and non-goals. |
| migrate | Source behavior, target behavior, preserved invariants, equivalence proof, and rollback or containment plan. |

`docs` and `release` changes currently use the shared decision standards only unless a narrower kind better describes the decision.

`decisionKind` describes semantic intent, not size. Size and routing are separate fields:

| Field | Values | Meaning |
| --- | --- | --- |
| `workScale` | `tiny`, `small`, `normal`, `large` | The estimated amount of work and review surface. |
| `planningDepth` | `micro`, `standard` | Whether planning should emit a compact one-unit micro-plan or a full standard plan. |
| `routeTarget` | `planning`, `implementation` | The next loop if the decision exits. Defaults to `planning`. |
| `implementationMode` | `tdd`, `targeted_checks` | Required only for direct implementation changes. |

Micro planning is allowed only for low-risk `tiny` or `small` decisions. Direct implementation is narrower: it also requires explicit route rationale, implementation mode, `directImplementationScope.pathScopes`, acceptance criteria, and verification. `normal`, `large`, medium-risk, high-risk, ambiguous, destructive, dependency, API/product, security/privacy, release, or multi-component work must use standard planning.

## Loop quality standards

The decision loop can exit only when loop-owned quality standards are met. Research, uncertainty handling, and blind-spot review are not separate top-level concepts; they are evidence for these standards.

| Quality standard | Required signal |
| --- | --- |
| sprint_proposal_ready | Decision loop output has at least one Decision, approval state is explicit, and Decision ids are stable. |
| intention_understood | Decisions state the user intention as current state, desired state, and rationale. |
| user_value_clear | Decisions explain how the intention benefits users or improves user outcomes. |
| cost_understood | Decisions expose maintainer impact and a bounded effort estimate. |
| recommendation_justified | The agent gives a clear approve/reject/defer/ask-user recommendation and explains why Decisions should proceed. |
| intention_validated | The agent judges that the user's good-faith intention is aligned with real user value and the project's long-term interests. This is an agent-judgment standard, not a deterministic fact. |
| approval_safety | High-risk Decisions have explicit user approval authority and a canonical approval ref. |
| current_state_grounded | Current KB/source/trace/Git/test baseline refs are present and canonical. |
| evidence_sufficient | Source/proof refs are enough for planning to trust the intention. High-risk Decisions need explicit proof refs for research, prior art, validation, or user guidance. |
| risks_and_alternatives_considered | Decisions declare a low/medium/high risk tier; high-risk intentions identify affected layers and at least one viable alternative before planning. |
| knowledge_impact_accounted | Required KB/diagram changes are made, or no-impact rationale is recorded. |
| work_routing_classified | Decisions classify work scale and planning depth; micro planning is limited to tiny or small low-risk work. |
| loop_route_safe | Decisions choose a safe next loop; direct implementation is limited to scoped, low-risk Decisions with validation. |
| decision_kind_classified | Decisions classify the decision kind so kind-specific quality can apply inside the decision loop. |
| debug_decision_focused | Debug Decisions include target, hypothesis, invariant, probe, expected safe behavior, and stop condition. |
| fix_decision_reproducible | Fix Decisions include reproduction, expected behavior, and regression coverage. |
| harden_decision_boundary | Hardening Decisions include safety boundary, failure modes, negative tests, and compatibility impact. |
| improve_decision_outcome | Improvement Decisions include current pain, desired outcome, success signal, and non-goals. |
| migrate_decision_equivalent | Migration Decisions include source/target behavior, preserved invariants, equivalence proof, and rollback strategy. |

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
  "event": "changes_approved",
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
