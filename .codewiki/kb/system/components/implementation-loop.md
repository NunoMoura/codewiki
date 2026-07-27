---
type: Concept
title: Implementation Loop
description: The Implementation loop continuously receives planned Work Items and worker reports, then accepts Change realization only after scoped integration, checks, evidence, and content proof pass.
tags:
  - codewiki
  - system
  - implementation
  - loop
timestamp: 2026-08-01T00:00:00Z
codewiki_components:
  - git
  - implementation
codewiki_source_patterns:
  - src/git/**
  - src/implementation/**
codewiki_test_patterns:
  - tests/implementation/**
  - tests/runtime/git-status.test.mjs
  - tests/runtime/worktrees.test.mjs
  - tests/helpers/implementation-change.mjs
codewiki_trace_events:
  - implementation.evidence_accepted
  - implementation.evidence_rejected
codewiki_roles:
  - content_proof
  - semantic_loop
codewiki_source_map:
  - id: git
    source_patterns:
      - src/git/**
    test_patterns:
      - tests/implementation/**
      - tests/runtime/git-status.test.mjs
      - tests/runtime/worktrees.test.mjs
    role: content_proof
  - id: implementation
    source_patterns:
      - src/implementation/**
    test_patterns:
      - tests/implementation/**
      - tests/helpers/implementation-change.mjs
    trace_events:
      - implementation.evidence_accepted
      - implementation.evidence_rejected
    role: semantic_loop
---
# Implementation Loop

Implementation is the continuous realization service for approved, planned Changes. It receives ready Work Items and worker reports across active Sprints, integrates candidate output, runs scoped and aggregate checks, and appends accepted or rejected evidence to each owning Change Trace.

Workers execute Assignment attempts inside runtime-provisioned private Workbenches. They do not own an Implementation loop and cannot mark semantic success. The Implementation loop's resolved Quality Policy alone governs whether planned intent is realized. There is no standalone Implementation reviewer agent.

## Loop authority

Implementation owns:

- source, test, package, README, and product-document edits inside accepted Work Item scope;
- local TDD when required;
- Worker Report, Workbench, and active-Assignment correlation;
- integration and conflict handling within Planning authority;
- deterministic, model, external, and human Quality assessments;
- acceptance-criterion coverage;
- component/path/test alignment;
- Change realization evidence;
- aggregate content proof over integrated output;
- residual issue disposition;
- publication readiness and archive disposition when configured;
- route-back questions for Planning or Decision.

Implementation does not own new Change meaning, Knowledge semantics, approval, Sprint/Work Item design, trace append authority, execution-policy mutation, or generated views.

## Two implementation levels

One semantic Implementation loop has two bounded levels:

1. **Work Item realization** receives one or more Assignment results, validates local scope and checks, and produces candidate realization evidence for the owning Change.
2. **Integration and exit Quality evaluation** evaluates merged output, shared dependencies, aggregate checks, cross-Change acceptance, preview evidence, and content proof before deterministic gates may accept Change realization.

These are phases inside one semantic loop, not separate loops.

## Loop input

Implementation input includes:

- owning approved Change ref and current realization state;
- exact accepted Work Item and acceptance-criterion refs;
- relevant Sprint, dependency, Assignment, and integration projections;
- normalized Worker Reports plus Claim, Assignment, Workbench, model-tier, and session provenance;
- current source/test/Git snapshot and content proof;
- source ownership and resolved Quality Policy inputs;
- relevant WorkState slice and digest;
- prior implementation output refs;
- trigger and route-back context.

`runWikiImplement()` accepts a WorkState freshness guard plus normalized worker reports or explicit evidence keyed by Work Item. Runtime selects the Sprint and Work Items, resolves each owning Change, verifies Assignment correlation, loads canonical Planning events, source ownership, existing paths, policy, trace tails, and Git state, and derives sequence, parent, and byte guards. Caller-supplied `traceId`, Planning events, Change IDs, Planning refs, Assignment identity, source map, sequence, parent, and expected bytes are rejected as replacement repository facts.

One bounded invocation writes evidence for one owning Change. Portfolio work is grouped by canonical Work Item ownership, then runtime refreshes WorkState and repeats for remaining Change groups.

## Loop cycle

```text
receive ready Work Item or worker report
refresh owning Change and integration WorkState
validate Assignment, Workbench, plan revision, source base, path scope, and dependencies
integrate candidate source/docs/tests
build one immutable candidate and shared facts
run required evidence adapters and bounded Quality verifier fan-out
map assessments and evidence to acceptance criteria and Change outcome
create aggregate content proof and apply deterministic gates
append accepted/rejected evidence to owning Change Trace
continue, exit, route back, or block
```

Noisy logs, model output, diffs, screenshots, and tool streams remain bounded runtime or evidence artifacts. Trace output retains only required summaries, refs, and digests.

## Loop output

Implementation output contains:

- owning Change ref and covered Work Item refs;
- optional additional contributed-to Change refs;
- changed source/docs/test paths;
- structured checks with command, phase, criterion id, and status;
- acceptance evidence mapped to stable criterion ids;
- TDD red/green proof when required;
- Worker Report, Assignment, Workbench, model-tier, protocol, and policy provenance;
- normalized worker proof and conflict findings;
- component/path/test alignment evidence;
- integration state and shared Sprint refs;
- UI preview/capture evidence when Planning requires it;
- aggregate content proof over merged output;
- residual issue and outcome-disposition evidence;
- publication/archive refs when configured;
- Quality Policy receipt, compact per-Standard assessments, deterministic gate results, and efficiency summary;
- route-back questions and canonical refs.

Implementation output excludes full logs, private scratch, unbounded diffs, planner-authored replacements, and new product meaning decided during coding.

## Cross-Change realization

Every Work Item has one owning Change. Its implementation event is canonical in that Change Trace. If work contributes to other Changes, output carries `contributingChangeIds` and evidence refs. Other Change views resolve that coverage without duplicating the implementation result.

A shared Sprint or integration check may provide one content-addressed evidence artifact referenced by several Change Traces. Each Change still receives its own quality-governed realization decision against its approved outcome and acceptance coverage.

## Quality Policy baseline

Implementation resolves its exact Quality Policy from protected kernel Standards, stage baseline, frozen Planning minimums, Change risk/layers, project traits, paths, technologies, actual effects, and approved additions. Actual effects may add mandatory Standards but cannot silently remove the Planning minimum. Independent verifiers run against one immutable candidate; required assessments join before deterministic exit gates.

Baseline Standards include:

| Quality Standard | Required signal |
| --- | --- |
| approved_change_coverage_complete | Accepted implementation evidence covers current approved Change requirements. |
| planning_coverage_complete | Every claimed/selected Work Item ref is known and dispositioned. |
| scope_controlled | Changed paths remain inside accepted component/path scope and source base. |
| acceptance_evidence_complete | Every required criterion maps to structured evidence. |
| verification_passed | Required scoped and aggregate checks are present and passing. |
| tdd_evidence_valid | Required red/green proof maps to acceptance criteria. |
| worker_claims_correlated | Worker evidence binds active Assignment, worker, session, Work Item, plan, and source base. |
| integration_conflicts_resolved | Merged output contains no unresolved path, base, ownership, or semantic conflict. |
| content_proof_recorded | Local provenance and final aggregate integrated proof exist where required. |
| source_ownership_aligned | Source/test changes fit OKF ownership and component test policy. |
| production_quality_reviewed | Maintainability, simplicity, style, and error handling are production-ready. |
| outcome_realization_accounted | Delivery, experience, and externally observable outcome dimensions have evidence or explicit disposition. |
| archive_disposition_ready | Required post-commit retention action or retain-hot rationale exists. |
| uncertainty_resolved | Remaining ambiguity is repaired or routed to Planning/Decision. |
| security_privacy_reviewed | Sensitive changes carry explicit review evidence. |
| accessibility_ui_reviewed | UI changes carry accessibility and required live-preview evidence. |
| dependency_risk_controlled | Dependency-surface changes carry risk and package evidence. |
| release_safety_approved | External, destructive, release, or publication action has exact user authority. |
| traceability_refs_canonical | Change, trace, KB, Git, digest, source, and test refs are canonical. |

External tools are evidence sensors. CodeWiki-owned deterministic gates retain progression authority. Verifier timeout or operational failure is `indeterminate`, not fabricated evidence that implementation is bad or score `0`.

## Exit statuses

- `continue`: same Implementation loop can edit, integrate, test, collect evidence, or repair local issues.
- `exit`: owning Change's current planned realization is accepted and its outcome disposition permits closure or observation wait.
- `route_back`: Planning or Decision authority is required.
- `blocked`: worker, integration, environment, policy, resource, or external capability prevents progress.

Implementation routes to Planning for Work Item, path, dependency, ordering, verification, Sprint, or integration-plan changes. It routes to Decision for product behavior, Knowledge meaning, outcome, risk, compatibility, or approval changes.

## Runtime and workers

```text
WorkState work queue
-> runtime Implementation tier selection
-> private Worker Workbench provisioned
-> guarded Claim activates exact Assignment
-> isolated worker attempt
-> immutable Worker Report candidate
-> Implementation Quality Policy evaluation
-> accepted Change Trace evidence
```

Runtime may schedule many Work Items across Changes. Claims remain trace-owned by the Work Item's owning Change. Workers share no private memory or peer scratch. Worker completion is candidate evidence only. Release does not imply semantic acceptance.

Planning-approved shared integration workspaces combine selected worker outputs. The dashboard and Live Preview must identify which Changes are integrated and visible, which remain isolated, and which conflict. Conceptual association alone cannot make isolated work appear in one preview.

## Repository and content proof

Implementation derives current repo facts through core helpers:

- active existing paths;
- changed paths and source ownership;
- current Git base and dirty state;
- deterministic working-tree or integration-tree digest;
- final aggregate content proof;
- package, review, and acceptance evidence.

Proof covers accepted changed/evidence paths and excludes runtime temp and generated views. Worker-local proof is provenance; merged parallel work requires final integrated proof.

## Outcome disposition

Experience evidence such as live interaction and screenshots may prove realization of a UI behavior but cannot automatically prove product or business outcome. Before Change Trace closure, Implementation records one bounded disposition:

- outcome observed;
- observation scheduled;
- not externally observable with rationale;
- deferred under authority;
- failed or abandoned.

Long-running observation may leave a delivered Change dormant but open under retention policy. A later materially different follow-up creates a linked Change.

## Trace output

```json
{
  "event": "evidence_accepted",
  "loop": "implementation",
  "data": {
    "iteration": 4,
    "trigger": "worker_results",
    "observedWorkStateDigest": "sha256:...",
    "output": {
      "owningChangeId": "CHG-example",
      "contributingChangeIds": [],
      "coveredWorkItemRefs": [],
      "changes": [],
      "checks": [],
      "acceptanceEvidence": [],
      "aggregateContentProof": {},
      "outcomeDisposition": {},
      "qualityPolicyReceipt": {},
      "assessments": []
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

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Stage Protocols](codewiki-os.md)
- [Quality Policy](quality-policy.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Planning Loop](planning-loop.md)
- [Runtime](runtime.md)
- [Traces](traces.md)
- [Worktree Isolation](worktree-isolation.md)
