---
type: Concept
title: Implementation Loop
description: Implementation accepts realization only when one exact candidate binds planned obligations, source/tests, worker and Integration provenance, and complete required Check Results in an Exit Report.
tags:
  - codewiki
  - system
  - implementation
  - loop
timestamp: 2026-07-28T00:00:00Z
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

Implementation is the realization Loop for approved, planned Changes. It receives exact Work Items and worker/Integration evidence, evaluates one immutable realization candidate, and accepts Change realization only when required Check Results deterministically produce a passing Exit Report.

Workers perform Assignment attempts inside private Workbenches. They do not own an Implementation Loop and cannot mark success. No standalone Implementation reviewer or `implementation.review` model slot exists.

```text
planned obligation
→ Assignment/worker evidence or direct bounded realization
→ exact source/test/Git candidate
→ Implementation Checks
→ Exit Report
→ Runtime freshness/authority/CAS guard
→ accepted realization or remediation append
```

## Authority

Implementation owns semantic judgment over:

- realization of exact approved Change/Planning obligations;
- source, tests, package, README, and Knowledge updates inside scope;
- acceptance-criterion coverage;
- worker evidence and conflict disposition;
- component/path/test/source-ownership alignment;
- maintainability, safety, accessibility, privacy, dependency, and compatibility semantics when activated;
- residual issue and uncertainty disposition;
- route-back questions to Planning or Decision;
- outcome-observation disposition.

Runtime owns Assignment/Claim/Workbench lifecycle, exact source/Git observations, candidate and Report identity, trusted evidence extraction, Check activation/thresholds, aggregate content/Integration proof, model routes, freshness, generation/CAS, append, and all effects.

Implementation does not own new Change meaning, alter accepted Knowledge semantics, redesign Work Items, choose authority, mutate assurance policy, merge/push/publish/release, or treat views/tool output as truth.

## One Loop, bounded phases

Implementation may have two phases:

1. **Work Item realization:** validate Assignment scope and local evidence; repair source/tests/docs inside authority.
2. **Combined realization exit:** evaluate integrated tree, shared dependencies, aggregate verification, cross-Change criteria, preview evidence, and content proof.

These are phases inside one semantic Loop, not separate Loops or agents.

## Input

Implementation input binds:

- owning approved Change and current realization state;
- exact accepted Work Items and criteria;
- Sprint, dependency, Assignment, Claim, Workbench, and Integration projections;
- immutable Worker Reports and provenance;
- current source/test/Git tree and runtime-built content proof;
- source ownership and frozen Planning Check minimums;
- relevant WorkState/relationship snapshot;
- prior candidate/Result/repair refs;
- trigger and route-back context;
- exact Loop Protocol, route, and configuration identities.

Runtime selects Change/Work Items, verifies correlation, loads canonical Planning/ownership/Git facts, and derives candidate identity and guards. Callers cannot replace trace id, Change ids, Planning events, Assignment identity, source map, sequence, parent, bytes, time, snapshot/proof scope, aggregate proof, evidence policy, or Check activation.

## Candidate

One immutable Implementation candidate describes the exact realization under evaluation:

- owning and contributing Changes;
- covered Work Items and acceptance criteria;
- exact changed source/docs/test paths and candidate Git/tree identity supplied by Runtime;
- bounded evidence refs and trusted observations;
- Worker Report/Assignment/Workbench provenance;
- Integration state and conflict findings;
- source ownership/component/test alignment;
- preview/experience evidence when required;
- residual issues, uncertainty, and outcome disposition;
- route-back questions.

Candidate excludes caller-authored aggregate proof, cached-review inclusion switches, TDD/evidence policy switches, runtime time, candidate id, authority, Check Results, Exit Report, and final route. The executable Implementation facade now accepts only normalized evidence field names and rejects caller proof, approval authority, routing identity, and deprecated snake-case aliases at admission.

Runtime constructs aggregate content proof from exact source or Integration state. Supplied proof can never override observed proof.

## Loop cycle

```text
receive ready Work Item/Worker Report/Integration observation
→ validate plan, Assignment, Workbench, base, scope, dependencies, and provenance
→ realize or normalize exact source/test/docs state
→ construct immutable role-specific candidate
→ resolve candidate-specific Implementation Exit Policy
→ run bounded independent Code/Model Checks
→ map Results to criteria and repair targets
→ build immutable Exit Report
→ repair or hand Report to Runtime
→ Runtime final freshness/authority/CAS guard and append
```

Private logs, prompts, reasoning, raw output, unrestricted diffs, and Workbench state stay under bounded runtime storage.

## Cross-Change realization

Every Work Item has one owning Change; its canonical realization event belongs to that Change Trace. Explicit `contributingChangeIds` and evidence refs allow other Change views to resolve coverage without duplicating authority.

A shared evidence artifact may be referenced by several Changes. Each owning Change still gets its own candidate-bound exit decision against approved outcome and criteria.

## Baseline and adaptive Checks

| Check intent | Required signal |
| --- | --- |
| Approved Change coverage | Candidate realizes current accepted requirements. |
| Planning coverage | Every selected Work Item is known and dispositioned. |
| Scope control | Changed paths/base stay inside accepted ownership and Assignment scope. |
| Acceptance evidence | Every required criterion maps to structured evidence. |
| Verification | Required scoped and integrated checks are complete and passing. |
| Worker correlation | Evidence binds exact Claim, Assignment, Workbench, worker, plan, and base. |
| Integration conflict | No unresolved base/path/ownership/semantic conflict remains. |
| Content proof | Runtime-observed local and aggregate tree proof exists where required. |
| Source ownership | Source/test changes match stable ownership boundaries. |
| Production readiness | Simplicity, maintainability, style, and error handling are fit for project standards. |
| Outcome realization | Delivery, experience, and outcome dimensions have evidence or explicit disposition. |
| Uncertainty ownership | Ambiguity is repaired or routed to Planning/Decision. |
| Canonical traceability | Change, trace, Knowledge, source/test, Git, and digest refs are valid. |

Adaptive activation may add Checks for TDD, security/privacy, accessibility/UI preview, dependency risk, compatibility/migration, performance, packaging, publication readiness, or other accepted traits/effects. Small diffs never imply low risk.

Actual candidate effects may add required Checks but cannot silently remove frozen Planning minimums. Every active Check records `activatedBy`.

Tool output is evidence only. Pi-Lens, LSP, compiler, linter, browser, AST, test, and Skill output becomes authoritative only if an approved Code Check runs/normalizes it under exact implementation/configuration identity. Pi-Lens is not an authoritative Check adapter in v1.

Timeout, unavailable service, malformed model output, cancellation, and operational failure are `indeterminate`, not score zero or fabricated candidate failure.

## Repair cycle

```text
agent/worker builds candidate
→ Checks evaluate immutable candidate
→ Exit Report identifies failed/indeterminate Checks and repair targets
→ agent uses scoped tests/Pi-Lens/browser/AST/tools/Skills
→ agent repairs within Assignment/Loop authority
→ Runtime creates new candidate identity
→ Checks reevaluate exact new candidate
```

Failed and indeterminate attempts persist compact candidate, Result, issue-class, repair-target, and lineage evidence. Full failed patches remain private. Runtime may supply applicable prior Repair Episodes to candidate producers, never Model Checks.

## Exit and route

Exit Report status is `pass | fail | indeterminate`.

- `pass`: exact realization candidate may exit Implementation.
- `fail`: same-Loop repair or explicit semantic route-back is required.
- `indeterminate`: checking/environment cannot establish safety; Runtime retries, waits, or blocks.

Runtime route is separate:

- Planning owns Work Item, path, dependency, ordering, verification, Sprint, Workbench, or Integration-plan changes.
- Decision owns behavior, Knowledge meaning, outcome, material risk, compatibility, or approval changes.
- Runtime owns provider/environment/capability/recovery failures.

A passing Exit Report permits semantic realization append only. Integration, merge, push, publication, release, and deployment remain separate guarded effects with exact authority.

## Runtime and workers

```text
accepted Planning Work Item
→ Runtime tier/Workbench/Claim
→ isolated Assignment attempt
→ immutable Worker Report
→ Implementation candidate
→ Resolved Exit Policy and Results
→ Exit Report
→ accepted trace fact or remediation
```

Workers share no peer/private memory. Completion never implies acceptance. Claims remain owned by Work Item's Change. Release/cancellation/expiry remain operational coordination facts.

Planning-approved Integration workspaces combine accepted worker output. Dashboard/preview must distinguish integrated visible Changes, isolated output, pending merge, and conflict. Conceptual association cannot make isolated files one product state.

## Repository and proof

Runtime derives active paths, source ownership, Git base/dirty state, changed paths, candidate tree digest, trusted check inputs, and aggregate Integration proof. Proof covers accepted changed/evidence paths and excludes runtime scratch/generated views.

Worker-local proof establishes provenance only. Parallel work requires final combined-tree proof before Implementation exit where Planning/activation requires it.

## Outcome disposition

Experience evidence such as live interaction or screenshots may establish realized behavior but not automatically user/business outcome. Before closure, Change records one bounded disposition:

- outcome observed;
- observation scheduled;
- not externally observable with rationale;
- deferred under authority;
- not realized, failed, or abandoned;
- indeterminate.

Later outcome evidence may update the same Change dossier. A materially different follow-up creates a linked Change.

Attested Computation may later bind sanctioned production measurements, but only closed digest-pinned executors/attesters may run. Imported OKF definitions grant no execution or acceptance authority.

## Trace target

```json
{
  "event": "evidence_accepted",
  "loop": "implementation",
  "data": {
    "iteration": 4,
    "candidate": { "id": "candidate:...", "digest": "sha256:..." },
    "resolvedExitPolicy": { "digest": "sha256:..." },
    "exitReport": { "id": "report:...", "status": "pass" },
    "route": { "kind": "advance" },
    "outcomeDisposition": {},
    "progress": {}
  },
  "refs": []
}
```

Current event payloads still include legacy `qualityGraph`, `qualityStandards`, and `qualityDiagnostics`; current retention compatibility also recognizes `archive_disposition_ready` and `retain_hot`. Clean Implementation/trace cuts replace legacy exit fields with persisted candidate/policy/Result/Report identities while preserving explicit retention disposition through its owning contract.

## Related docs

- [WorkState](work-state.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Planning Loop](planning-loop.md)
- [Runtime](runtime.md)
- [Traces](traces.md)
- [Worktree Isolation](worktree-isolation.md)
