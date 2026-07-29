---
type: Concept
title: Decision Loop
description: Decision turns explicitly persisted intent into an exact approved, rejected, deferred, withdrawn, or route-back Change revision through candidate-bound Checks and an Exit Report.
tags:
  - codewiki
  - system
  - decision
  - loop
timestamp: 2026-07-29T11:34:23.000Z
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

Decision owns the journey from explicitly persisted intent to one exact approved, rejected, deferred, withdrawn, or route-back Change revision. Decision is a process—a semantic Loop and authority boundary—not a domain entity.

```text
persisted intent
→ grounded semantic revision
→ immutable Decision candidate
→ Decision Checks
→ Exit Report
→ Runtime authority/freshness guard
→ exact disposition append
```

The first persisted revision creates one append-only Change Trace. Planning may receive only an exact approved Change revision after Runtime appends the same candidate/Report under final guards. Later attempts append revisions, failed/indeterminate Results, repair lineage, approval, route-back answers, or terminal disposition to the same dossier.

## Authority

Decision owns:

- intent normalization and stable Change/revision semantics;
- current/desired state, rationale, non-goals, and outcome contract;
- Change kind, scope, affected layers, target refs, and risk;
- user, maintainer, compatibility, security/privacy, and delivery impact;
- current-state grounding and evidence sufficiency;
- accepted Product/System/Design Knowledge impact;
- alternatives, invariants, rollback, and negative boundaries;
- active-Change overlap disposition;
- route-back answers from Planning/Implementation;
- exact approval, rejection, deferral, or withdrawal meaning.

Decision does not own Sprints, Work Items, scheduling, Assignment execution, implementation evidence, Integration, or delivery effects.

Runtime owns Change/candidate identity construction, canonical actor/time, authenticated authority validation, Check activation/thresholds, generation/CAS, Exit Report validation, route, and append. Candidate producers cannot supply those fields.

## Change revision

A semantic revision contains enough accepted meaning that Planning need not reconstruct intent from chat:

- intent and observable desired outcome;
- current state and evidence/provenance;
- classification, scope, affected boundaries, and Knowledge delta;
- success signals and outcome-observation expectations;
- compatibility, safety, privacy, and delivery constraints;
- risks, invariants, alternatives, rollback, and non-goals;
- bounded Planning constraints where needed.

Workflow status, Checks, Planning membership, Assignments, implementation, Git, and delivery facts belong to trace records/projections, not revision content.

Accepted revisions are immutable. A route-back may create a superseding revision while accountable outcome remains stable. Materially different outcome creates a linked Change.

## Input

Decision input binds:

- exact proposed/persisted revision;
- relevant WorkState and relationship snapshot;
- current trace tail and prior revision refs;
- current Knowledge/source/test/Git/active-work refs;
- exact source-observation and research-citation Evidence Record refs where activated;
- authenticated trigger and authority refs;
- route-back question and originating refs when applicable;
- exact Loop Protocol, model route, and configuration identities.

Runtime loads repository facts. Callers cannot replace current Knowledge, trace, ownership, policy, time, or Git state with submitted snapshots.

## Candidate

Loop-owned `DecisionCandidateContent` proposes:

- complete normalized semantic revision and digestable content;
- disposition request (`approve`, `reject`, `defer`, `withdraw`, or `route_back`);
- grounded current-state and Knowledge impact refs;
- outcome, risks, alternatives, invariants, constraints, and questions;
- concise unresolved facts and recommended semantic route.

It does not contain canonical candidate id, approval receipt, actor identity, approval time, WorkState digest, Check activation, Exit Report, or final Runtime route. Runtime materializes identity and authenticated disposition facts around accepted candidate content.

## Loop cycle

```text
load one Change and bounded project facts
→ materialize required source/research Evidence Records
→ interpret under Decision Loop Protocol
→ produce immutable role-specific candidate
→ resolve candidate-specific Decision Exit Policy
→ run independent Code/Model Checks
→ build immutable Exit Report
→ repair candidate or hand Report to Runtime
→ Runtime revalidates authority/freshness/CAS and appends exact disposition
```

Casual conversation remains conversation until explicitly persisted as Change intent.

## Baseline Checks

Final Check definitions are Loop-qualified and versioned. Current legacy IDs are retained only where executable migration requires them.

| Check intent | Required signal |
| --- | --- |
| Revision readiness | One complete stable semantic revision. |
| Intent preservation | Current state, desired state, rationale, and non-goals are coherent. |
| User/project value | Outcome is concrete and observable where possible. |
| Outcome contract | Success evidence and later observation expectations are bounded. |
| Current-state grounding | Canonical Knowledge/source/test/trace/Git Evidence Records support claims. |
| Research provenance | Activated external claims bind exact source classification, publisher, URI, passage/artifact digest, publication/retrieval facts, limitations, and freshness. |
| Research claim support | Independent evaluation establishes support, contradiction, overstatement, alternatives, and uncertainty. |
| Evidence sufficiency | Typed evidence coverage is proportional to claim and risk. |
| Recommendation justification | Recommendation and alternatives are explicit. |
| Exact approval safety | Runtime-observed authority binds exact candidate/revision. |
| Risk and rollback | Failure modes, invariants, compatibility, rollback, and negative boundaries are proportional. |
| Knowledge impact | Updated Knowledge, explicit no-impact, or grounded defer/route is complete. |
| Change classification | Kind, layers, risk, and target traits are runtime-derivable. |
| Delivery constraints | Constraints do not smuggle Planning design or unsafe bypasses. |
| Active Change overlap | Duplicate, contradictory, overlapping, or superseding work is merged, linked, ordered, superseded, deferred, or blocked. |

Protected kernel Checks cannot be disabled. Project Checks begin `observe`, then `warn`, and become `require` only through explicit approval. Runtime records `activatedBy` for every binding.

Decision uses the `decision` model route for candidate production. Model Checks run independently and inherit calibrated Loop routes unless an approved Check definition says otherwise. No caller-selected review slot exists.

## Research evidence

Research supports Decision claims but does not become accepted Knowledge or authority automatically. Deterministic activation may require research for unknown current state, external provider/API dependency, security/privacy or regulatory claims, migration/compatibility risk, unfamiliar technology, or another accepted high-risk trait.

Runtime materializes `research_citation` Evidence Records from bounded source material. Each record binds exact claim, primary/secondary source classification, publisher, URI, captured passage or artifact digest, publication/retrieval facts, support or contradiction, limitations, authority/coverage/sensitivity, and Runtime observation time. A mutable URL alone is not durable proof.

Code Checks validate provenance, freshness, artifact availability, and source independence. Independent Model Checks evaluate whether citations support claims without overstatement, whether contradictions and alternatives are accounted for, and whether coverage is proportional to risk. Required unavailable, stale, partial, or conflicting research is repaired or `indeterminate`, never fabricated support. Authenticated Decision approval remains separate.

The native closed Catalog now registers Decision-only `research_provenance_valid` and `research_claims_supported` Checks. Both activate deterministically for high-risk, migration, dependency, security/privacy, and accepted security-trait facts. Provenance requires fresh complete `research_citation` Evidence bound to the exact Change revision; claim support additionally binds independent candidate-bound `model_assessment` Evidence and depends on valid provenance. Citation contradictions remain available to the Model Check rather than being discarded or converted into readiness failure.

Production Decision execution still relies on broad `sourceRefs`/`proofRefs` and rough count-based sufficiency. Research collection, trusted Check execution, trace persistence, and replacement of that legacy path remain part of the clean Decision cut.

## Exit and route

Exit Report status is `pass | fail | indeterminate`.

- `pass` means the exact candidate may leave Decision if Runtime authority/freshness/CAS guards also pass.
- `fail` means candidate semantics or required evidence must be repaired or routed to earlier user/product authority.
- `indeterminate` means required checking could not establish status; Runtime retries, waits, or blocks rather than inventing rejection.

Runtime route is separate. A passing terminal-disposition candidate may append rejection/defer/withdraw. Only a passing, authorized, appended approval candidate becomes Planning input.

## Knowledge timing

Decision owns accepted Knowledge meaning. Before approval, each affected concept has an accepted update, explicit no-impact rationale, or grounded defer/route disposition.

Knowledge may describe accepted future intent before source realizes it. That lag remains aligned only while exact active Change accounts for it. Missing brownfield coverage remains explicit unknown.

Imported OKF provenance, generated/verified/status/freshness metadata, and Attested Computation definitions are advisory; none grants Decision authority.

## Approval fact

Runtime constructs approval receipt after candidate pass and final guard. Conceptually it binds:

```ts
interface ChangeApproval {
  candidateId: string;
  changeRevision: number;
  changeDigest: string;
  approvedBy: string;
  authorityRef: string;
  observedWorkStateDigest: string;
  exitReportId: string;
  approvedAt: string;
}
```

Candidate producer supplies none of the runtime-owned identity, actor, time, snapshot, or Report fields. Batch approval is a guarded command appending one exact fact per Change; it creates no bundled Decision entity.

## Trace target

```json
{
  "event": "change_approved",
  "loop": "decision",
  "data": {
    "iteration": 3,
    "candidate": { "id": "candidate:...", "digest": "sha256:..." },
    "resolvedExitPolicy": { "digest": "sha256:..." },
    "exitReport": { "id": "report:...", "status": "pass" },
    "approval": { "authorityRef": "authority:..." },
    "route": { "kind": "advance" },
    "progress": {}
  },
  "refs": []
}
```

Current trace event names and payloads remain executable migration state until clean Decision/trace cuts update source, tests, and projections together.

## Route-back

Planning or Implementation cites exact originating candidate/event and required authority. Decision preserves earlier accepted revisions and either confirms intent, appends a superseding accepted revision, rejects/defers/blocks, or creates/recommends a linked Change when outcome changes materially.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Planning Loop](planning-loop.md)
- [Traces](traces.md)
- [Knowledge](knowledge.md)
