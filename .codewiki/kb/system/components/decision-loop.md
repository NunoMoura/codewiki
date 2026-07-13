---
type: Concept
title: Decision Loop
description: The decision loop consumes exact validated Change revisions from the Changes Backlog and turns them into binding, trace-backed Decisions that Planning can trust.
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
  - src/changes/**
codewiki_test_patterns:
  - tests/decision/**
  - tests/changes/**
  - tests/helpers/proposed-change.mjs
codewiki_trace_events:
  - decision.changes_approved
codewiki_role: semantic_loop
codewiki_source_map:
  - id: decision
    source_patterns:
      - src/decision/**
      - src/changes/**
    test_patterns:
      - tests/decision/**
      - tests/changes/**
      - tests/helpers/proposed-change.mjs
    trace_events:
      - decision.changes_approved
    role: semantic_loop
---
# Decision Loop

The main CodeWiki session owns the user-agent conversation that shapes mutable Changes. The decision loop does not author a separate proposal domain. It consumes exact validated Change revisions from the Changes Backlog and turns them into binding, trace-backed Decisions that Planning can trust.

## Loop authority

The decision loop owns:

- binding interpretation of user intent and exact approval evidence;
- canonical Change kind, type, and scope classification;
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
load exact validated Change revisions from the Changes Backlog
verify revision, digest, validation state, evidence, safety, and user approval
interpret requirements, risks, alternatives, and knowledge impact
render the exact Decision proposal for final approval
check Decision exit conditions
create the trace and append decision.changes_approved through the guarded runtime boundary
continue, exit, route back, or block
```

The main session may create, revise, merge, split, defer, reject, or withdraw mutable Changes through `wiki_change`. `wiki_decide` accepts only an exact validated Change snapshot and digest; it must not silently read a mutable latest revision. The rendered Decision proposal remains preview state until the user approves that exact rendering and runtime creates the trace-backed Decision. After this boundary, the frozen Change snapshot embedded in the trace is self-contained and immutable.

The agent should ask the user when required authority is missing, risk is high, or ambiguity would otherwise leak into planning.

## Loop output

Decision loop output is the high-signal packet planning needs:

- Decisions bound to exact user-validated Change revisions and digests;
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

The accepted Change snapshot carries canonical `ChangeKind`, `ChangeType`, and `ChangeScope` classification. Kind captures semantic intent (`fix`, `improve`, `harden`, `migrate`, `introduce`, or `remove`). Type captures the governed pipeline category, such as behavior, architecture, workflow, incident, security, documentation, dependency, or release change. Scope captures the primary product, system, source, documentation, configuration, or runtime boundary. Classification selects package-owned quality, evidence, escalation, and forbidden-skip policy; it never creates another semantic loop.

Change classification describes intent and affected boundary, not size. Size and routing remain separate Decision fields:

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
