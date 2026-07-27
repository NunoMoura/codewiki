---
type: Concept
title: Decision Loop
description: The Decision loop receives and refines persisted Changes, validates exact revisions against current WorkState, and appends binding approval or terminal disposition facts to each Change Trace.
tags:
  - codewiki
  - system
  - decision
  - loop
timestamp: 2026-08-01T00:00:00Z
codewiki_component: decision
codewiki_components:
  - decision
codewiki_source_patterns:
  - src/decision/**
  - src/changes/**
codewiki_test_patterns:
  - tests/decision/**
  - tests/changes/**
  - tests/helpers/accepted-change.mjs
  - tests/helpers/canonical-loop-events.mjs
  - tests/helpers/proposed-change.mjs
codewiki_trace_events:
  - decision.change_received
  - decision.change_revised
  - decision.change_approved
  - decision.change_deferred
  - decision.change_rejected
codewiki_role: semantic_loop
codewiki_source_map:
  - id: decision
    source_patterns:
      - src/decision/**
      - src/changes/**
    test_patterns:
      - tests/decision/**
      - tests/changes/**
      - tests/helpers/accepted-change.mjs
      - tests/helpers/canonical-loop-events.mjs
      - tests/helpers/proposed-change.mjs
    trace_events:
      - decision.change_received
      - decision.change_revised
      - decision.change_approved
      - decision.change_deferred
      - decision.change_rejected
    role: semantic_loop
---
# Decision Loop

The Decision loop owns the journey from explicitly persisted intent to an exact approved, rejected, deferred, or withdrawn Change revision. Decision is a process and semantic authority, not a domain entity. Its successful executable result is an approved Change.

```text
persisted Change
-> refinement and current-state grounding
-> quality and authority evaluation
-> exact approved Change revision and receipt
```

The first persisted Change creates its append-only Change Trace. Later Decision iterations append revisions, validation, approval, route-back answers, or terminal disposition to that same trace.

## Loop authority

The Decision loop owns:

- receiving and normalizing user, agent, runtime, lab, or worker-proposed intent;
- stable Change identity and semantic revision boundaries;
- current and desired state, rationale, non-goals, and outcome contract;
- Change kind, type, scope, affected layers, and target refs;
- user, maintainer, compatibility, and safety impact;
- evidence sufficiency and current-state grounding;
- Product/System Knowledge impacts and accepted Knowledge propagation;
- risks, alternatives, invariants, rollback, and negative-test boundaries;
- exact approval, rejection, deferral, or withdrawal authority;
- route-back answers from Planning or Implementation;
- delivery constraints Planning must respect.

Decision does not own Sprint creation, Work Item design, scheduling, worker execution, code evidence, or final implementation acceptance.

## Change revision

The Change revision is the semantic carrier. Before approval, the Decision loop may produce a complete next revision rather than a generic patch. A revision should contain enough accepted meaning that Planning does not need a separate flattened Decision object:

- intent and observable desired outcome;
- classification and affected boundaries;
- Knowledge impacts;
- acceptance/success signals;
- safety and compatibility constraints;
- evidence and provenance;
- bounded planning constraints when required.

Workflow status, validation status, Sprint membership, Assignments, and implementation results belong to trace events and generated Change views, not the content digest of the semantic Change revision.

Every approved revision is immutable. A route-back may append a later superseding revision while the accountable outcome remains stable. A material new outcome creates a linked Change.

## Loop input

Decision input includes:

- persisted or proposed Change revision;
- relevant WorkState slice;
- exact current trace tail and prior revision refs;
- current KB, source, test, Git, and active-work refs;
- actor and trigger;
- approval or other authority refs when supplied;
- route-back question and originating refs when applicable.

The facade loads repository facts itself. Callers should not replace current KB, trace, source ownership, policy, or Git state with arbitrary submitted snapshots.

## Loop cycle

```text
receive or reload one Change Trace
observe relevant WorkState and canonical sources
refine the next semantic Change revision
assess intent, user value, outcome, evidence, Knowledge impact, risk, and alternatives
render one immutable revision and approval-receipt candidate
resolve and evaluate Decision Quality Policy
append the iteration through runtime
continue, exit, route back, or block
```

Persisting a draft is explicit. Casual chat remains chat until the user or agent asks CodeWiki to retain a Change.

## Loop output

Decision output contains:

- complete normalized Change revision and digest;
- validation findings and recommendations;
- current-state baseline refs and digest;
- Knowledge impacts and propagation refs or explicit no-impact rationale;
- outcome contract and success signals;
- risks, alternatives, invariants, compatibility, rollback, and non-goals;
- delivery constraints and planning questions;
- exact approval receipt when authority accepts the revision;
- terminal disposition when rejected, deferred, or withdrawn;
- Quality Policy resolution, immutable Quality Report, and canonical refs.

Approval receipt includes at least:

```ts
interface ChangeApproval {
  changeRevision: number;
  changeDigest: string;
  approvedBy: string;
  approvalRef: string;
  observedWorkStateDigest: string;
  qualityRef: string;
  approvedAt: string;
}
```

`ChangeApproval` is an event fact, not another entity. Batch approval is a guarded command that appends one exact approval fact to each participating Change Trace; it does not create a bundled Decision object or Sprint.

## Knowledge timing

Decision owns accepted Product/System Knowledge meaning changes. Before approval, it compares proposed intent against current KB and implementation state. It exits only when each affected concept has an accepted update, explicit no-impact rationale, or grounded route/defer result.

KB may describe accepted future intent before source realizes it. WorkState must therefore distinguish expected realization pending from unexplained semantic drift.

## Quality Policy baseline

Decision uses the user-selected Decision model route under the mandatory Decision Stage Protocol. Runtime resolves exact Standards from protected kernel invariants, Decision baseline, Change kind/risk/layers, project traits, active overlap, and approved additions. Decision can approve only when deterministic gates over every required assessment and exact authority fact permit exit.

Baseline Standards include:

| Quality Standard | Required signal |
| --- | --- |
| change_revision_ready | One stable, complete Change revision and digest are present. |
| intention_understood | Current state, desired state, rationale, and non-goals are explicit. |
| user_value_clear | User or project outcome is concrete and observable where possible. |
| outcome_contract_complete | Desired outcome, success signal, and evidence expectations are bounded. |
| current_state_grounded | Canonical KB/source/test/trace/Git refs ground current state. |
| evidence_sufficient | Evidence supports the claim and risk level. |
| recommendation_justified | Agent recommendation and rationale are explicit. |
| intention_validated | Agent assessment protects user value and long-term project interest. |
| approval_safety | Required human authority binds the exact revision and digest. |
| risks_and_alternatives_considered | Risk, failure modes, alternatives, invariants, and rollback are proportional. |
| knowledge_impact_accounted | KB changes or explicit no-impact rationale are complete. |
| change_kind_classified | Kind-specific quality policy can activate. |
| delivery_constraints_safe | Planning constraints do not smuggle Work Item design or unsafe bypasses. |
| active_change_overlap_accounted | Duplicate, contradictory, overlapping, or superseding active Changes are resolved or ordered. |

Kind-specific standards continue to enforce reproducibility for fixes, safety boundaries for hardening, observable outcomes for improvements, and preserved invariants/equivalence for migrations.

## Exit statuses

- `continue`: same Decision loop can refine Change meaning, evidence, Knowledge propagation, risk, or approval packet.
- `exit`: exact revision is approved or receives an explicit terminal disposition.
- `route_back`: current project observation is insufficient and must be refreshed before Decision can continue.
- `blocked`: user/product authority, external evidence, or policy capability is missing.

Planning consumes only exact approved Change revisions. Rejected, withdrawn, deferred, blocked, or non-exited revisions remain visible accountability facts but cannot create executable work.

## Trace output

```json
{
  "event": "change_approved",
  "loop": "decision",
  "data": {
    "iteration": 3,
    "trigger": "user_approval",
    "observedWorkStateDigest": "sha256:...",
    "output": {
      "changeRevision": {},
      "approval": {},
      "knowledgeImpacts": [],
      "qualityPolicyResolution": {},
      "qualityReport": {}
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

## Route-back

Planning or Implementation route-back cites the exact originating event and unmet authority. Decision appends a new iteration to the same Change Trace, preserves prior approved revisions, and either confirms existing intent, emits a superseding approved revision, blocks, or creates/recommends a linked new Change when accountable outcome changed materially.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Quality Policy](quality-policy.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Planning Loop](planning-loop.md)
- [Traces](traces.md)
- [Knowledge](knowledge.md)
