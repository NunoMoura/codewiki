---
type: Concept
title: Implementation Loop
description: Implementation accepts realization only when one exact integrated Candidate binds planned obligations, source/tests, worker and Integration Evidence, required Check Results, and one Exit Report.
tags:
  - codewiki
  - system
  - implementation
  - loop
timestamp: 2026-07-30T00:00:00Z
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
  - implementation.candidate_recorded
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
      - implementation.candidate_recorded
    role: semantic_loop
---
# Implementation Loop

Implementation is the realization Loop for approved, planned Changes. It receives exact Work Items and worker/Integration evidence, evaluates one immutable realization candidate, and accepts Change realization only when required Check Results deterministically produce a passing Exit Report.

Workers perform Assignment attempts inside private Workbenches. They do not own an Implementation Loop and cannot mark success. No standalone Implementation reviewer or `implementation.review` model slot exists.

```text
planned obligation
→ Assignment/worker material or direct bounded realization
→ exact integrated source/test/Git Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Implementation Checks and UI review when activated
→ Check Results
→ Exit Report
→ Runtime Route
→ freshness/authority/expected-head acceptance
```

## Authority

Implementation owns semantic judgment over:

- realization of exact approved Change/Planning obligations;
- source, tests, package, README, and Knowledge updates inside scope;
- acceptance-requirement coverage;
- worker evidence and conflict disposition;
- component/path/test/source-ownership alignment;
- maintainability, safety, accessibility, privacy, dependency, and compatibility semantics when activated;
- residual issue and uncertainty disposition;
- route-back questions to Planning or Decision;
- outcome-observation disposition.

Runtime owns Work Item Claim, Assignment, Worker Workbench lifecycle, exact source/Git observations, Candidate and Report identity, trusted Evidence extraction, Check activation/thresholds, aggregate content/Integration proof, model routes, freshness, expected-head CAS, append, and all effects.

Implementation does not own new Change meaning, alter accepted Knowledge semantics, redesign Work Items, choose authority, mutate assurance policy, merge/push/publish/release, or treat views/tool output as truth.

## Source boundary

`src/implementation/**` owns all Implementation-specific Candidate construction, Check declarations, realization interpretation, semantic attempt composition, and route recommendation. It may call injected generic Runtime and Verification ports, but it does not import Pi, API, dashboard, or Runtime implementations. Runtime owns generic worker, workbench, Integration, persistence, recovery, and effect mechanics without Implementation policy. Current `implementation-worker-*` Runtime modules split into generic `src/runtime/workers/**` mechanics or Loop-local orchestration; they must not remain a second Implementation package. A local `exit/**` folder, if retained, contains only Implementation bindings and never shared Verification code.

## One Loop, bounded phases

Implementation may have two phases:

1. **Work Item realization:** validate Assignment scope and local evidence; repair source/tests/docs inside authority.
2. **Combined realization exit:** evaluate integrated tree, shared dependencies, aggregate verification, cross-Change requirements, preview evidence, and content proof.

These are phases inside one semantic Loop, not separate Loops or agents.

## Input

Implementation input binds:

- owning approved Change and current realization state;
- exact accepted Work Items and acceptance requirements;
- Sprint, dependency, Work Item Claim, Assignment, Worker Workbench, and Integration projections;
- immutable Worker Reports and provenance;
- current source/test/Git tree and runtime-built content proof;
- source ownership and Runtime-derived Planning Check minimums from canonical Planning evidence;
- relevant WorkState/relationship snapshot;
- prior candidate/Result/repair refs;
- trigger and route-back context;
- exact Loop Protocol, route, and configuration identities.

Runtime selects Change/Work Items, verifies correlation, loads canonical Planning/ownership/Git facts, and derives candidate identity and guards. Callers cannot replace trace id, Change ids, Planning operations, Assignment identity, source map, sequence, parent, bytes, time, snapshot/proof scope, aggregate proof, evidence policy, or Check activation.

## Candidate

Loop-owned immutable `ImplementationCandidateContent` describes the exact realization under evaluation:

- owning and contributing Changes;
- covered Work Items and acceptance requirements;
- exact changed source/docs/test paths and candidate Git/tree identity supplied by Runtime;
- bounded evidence refs and trusted observations;
- Worker Report/Assignment/Workbench provenance;
- Integration state and conflict findings;
- source ownership/component/test alignment;
- preview/experience Evidence Record refs when required;
- authenticated approval-receipt refs when subjective acceptance is required;
- residual issues, uncertainty, and outcome disposition;
- route-back questions.

Candidate excludes caller-authored aggregate proof, cached-review inclusion switches, TDD/evidence policy switches, runtime time, candidate id, authority, Check Results, Exit Report, and final route. Executable candidate evidence, command-result evidence, acceptance evidence, assessments, sensitive-surface observations, and archive disposition use exact camel-case schemas with recursive unknown-field and closed-value validation; Pi SDK tools expose the same closed shape. The executable Implementation facade now accepts only normalized evidence field names and rejects caller proof, approval authority, routing identity, and deprecated snake-case aliases at admission. Nested `ImplementationChangeInput`, canonical `ImplementationWorkerReportInput`, and canonical `ImplementationWorkerProofInput` are camel-case-only and reject unknown fields rather than silently normalizing compatibility aliases. Worker reports carry one `changeInputs` collection and one nested `proof`; flattened proof fields and recursive proof wrappers are forbidden. Runtime derives worker-proof identity with the shared strict canonical JSON/SHA-256 primitive. Pi/OpenClaw-style adapters may parse their own external wire formats, but must materialize this one normalized Runtime contract before admission. Archive disposition has one exact normalized contract; the duplicate compatibility input and its snake-case aliases have been deleted.

Runtime constructs aggregate content proof from exact source or Integration state. Supplied proof can never override observed proof.

## Loop cycle

```text
receive ready Work Item/Worker Report/Integration observation
→ validate plan, Assignment, Workbench, base, scope, dependencies, and provenance
→ realize or normalize exact source/test/docs state
→ construct immutable role-specific candidate
→ resolve candidate-specific Implementation Exit Policy
→ run bounded independent Code/Model Checks
→ map Results to requirements and repair targets
→ build immutable Exit Report
→ repair or hand Report to Runtime
→ Runtime final freshness/authority/CAS guard and append
```

Private logs, prompts, reasoning, raw output, unrestricted diffs, and Workbench state stay under bounded runtime storage.

## Cross-Change realization

Every Work Item has one owning Change; its canonical realization operation belongs to that Change Trace. Explicit `contributingChangeIds` and evidence refs allow other Change views to resolve coverage without duplicating authority.

A shared evidence artifact may be referenced by several Changes. Each owning Change still gets its own candidate-bound exit decision against approved outcomes and requirements.

## Baseline and adaptive Checks

| Check intent | Required signal |
| --- | --- |
| Approved Change coverage | Candidate realizes current accepted requirements. |
| Planning coverage | Every selected Work Item is known and dispositioned. |
| Scope control | Changed paths/base stay inside accepted ownership and Assignment scope. |
| Acceptance evidence | Every acceptance requirement maps to structured evidence. |
| Verification | Required scoped and integrated checks are complete and passing. |
| Worker correlation | Evidence binds exact Work Item Claim, Assignment, Worker Workbench, worker, Planning epoch, and base. |
| Integration conflict | No unresolved base/path/ownership/semantic conflict remains. |
| Content proof | Runtime-observed local and aggregate tree proof exists where required. |
| Source ownership | Source/test changes match stable ownership boundaries. |
| Production readiness | Simplicity, maintainability, style, and error handling are fit for project standards. |
| Outcome realization | Delivery, experience, and outcome dimensions have evidence or explicit disposition. |
| Uncertainty ownership | Ambiguity is repaired or routed to Planning/Decision. |
| Canonical traceability | Change, trace, Knowledge, source/test, Git, and digest refs are valid. |

Adaptive activation may add Checks for TDD, security/privacy, accessibility/UI preview, dependency risk, compatibility/migration, performance, packaging, publication readiness, or other accepted traits/effects. Small diffs never imply low risk.

Actual Candidate effects may add required Checks but cannot silently remove Runtime-derived Planning minimums. Every active Check records `activatedBy`.

Tool output is evidence material only. Pi-Lens, LSP, compiler, linter, browser, AST, test, and Skill output becomes an Evidence Record only after Runtime validates a closed kind-specific contract; it becomes authoritative for exit only when an approved Check consumes it under exact implementation/configuration identity. Pi-Lens is not an authoritative Check adapter in v1.

Security activation begins with the universal deterministic surface classification established during Decision and is recomputed for the exact integrated Candidate/tree. Activated Code Checks prefer exact dependency advisory/version matching, lockfile integrity, secret/SAST/AST/unsafe-API rules, configuration/IaC/container scans, authorization/migration tests, and source/configuration freshness before isolated falsification-oriented security challenge Model Checks. Missing required capability remains `indeterminate`; a scanner's severity is a claim until Runtime maps qualified Evidence under policy.

Security or quality findings inside accepted scope block/repair the current Candidate. Independent pre-existing discrepancies become bounded linked Change intake after sanitation and deduplication. Neither worker nor reviewer confidence can suppress an in-scope finding or grant final assurance.

For user-visible UI Changes, Planning activates exact preview targets and Implementation normally requires candidate-bound screenshots and short interaction videos, objective preview-manifest validation, bounded independent experience review, and authenticated user or delegated-role approval. Workers may capture artifacts but cannot approve them. A mutable live link supplements immutable media and manifest digests.

Timeout, unavailable service, malformed model output, missing review artifact, cancellation, and operational failure are `indeterminate`, not score zero or fabricated candidate failure.

## User and team review

CodeWiki owns the canonical Change dossier, Evidence Records, Results, approval freshness, and Exit Report. Dashboard review is always available; team policy may additionally require a pull-request review surface. CodeWiki publishes a bounded Validation Bundle with exact intent, acceptance requirements, candidate/tree/head, Check status, screenshots, short videos, preview link, findings, reviewer roles, and dossier link. A provider review becomes an approval receipt only after Runtime re-observes authenticated actor, role, repository, pull request, exact head, decision, bundle digest, and provider event.

Review does not require duplicate approval. An approval made through an allowed dashboard or pull-request channel is normalized once and projected to the other surface where possible. New source, candidate, head, preview target/profile, capture manifest, or media bundle invalidates dependent approval.

Request changes feedback remains in the same Change Trace while accountable intent is stable and creates a new Implementation candidate. Scope/Work Item/preview-plan changes route to Planning; Product behavior, accepted meaning, material risk, or authority changes route to Decision; materially different outcome creates a linked Change.

When pull-request approval is required before exit, Runtime may perform an explicitly authorized review-publication effect after required non-approval review-readiness Checks pass. It may push only an isolated review ref and create/update a draft pull request under exact CAS and privacy policy. It cannot move the project branch, auto-merge, force-push, publish a product artifact, or claim semantic exit. Final Exit Report still waits for approval-backed Result fan-in.

## Repair cycle

```text
producer builds Candidate from direct realization or Runtime-integrated Worker Report material
→ Checks evaluate immutable Candidate
→ Exit Report identifies failed/indeterminate Checks and repair targets
→ agent uses scoped tests/Pi-Lens/browser/AST/tools/Skills
→ producer or assigned worker repairs within bounded authority
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

A passing Exit Report permits semantic realization append only. It does not authorize a new Integration attempt, source-branch merge, push, publication, release, or deployment. Runtime performs the isolated guarded Integration used by the exact Candidate before final assurance; later branch and delivery effects remain separate.

## Runtime and workers

```text
accepted Planning Work Item
→ Runtime tier/Worker Workbench/Work Item Claim
→ isolated Assignment attempt
→ immutable Worker Report
→ guarded Integration and exact integrated-tree proof
→ exact integrated Implementation Candidate
→ Resolved Exit Policy and Results
→ Exit Report
→ accepted trace fact or remediation
```

Workers share no peer/private memory. Completion never implies acceptance. Work Item Claim remains bound to the Work Item's owning Change and exact Assignment. Release and authenticated takeover are canonical coordination facts; automatic expiry is deferred without trusted time.

Before final Implementation assurance, Planning-approved Integration workspaces combine accepted worker output and bind exact proof to the Candidate. Dashboard/preview must distinguish integrated visible Changes, isolated output, pending merge, and conflict. Conceptual association cannot make isolated files one product state.

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

## Operation target

One Implementation attempt records distinct immutable operations:

```text
loop.attempt_started
implementation.candidate_recorded
evidence.recorded
loop.exit_policy_recorded
check.result_recorded
loop.exit_report_recorded
runtime.route_recorded
loop.attempt_ended
```

Integration and later effects use their own operation kinds and authority. Current event payloads still include legacy `qualityGraph`, `qualityStandards`, and `qualityDiagnostics`; retention compatibility also recognizes `archive_disposition_ready` and `retain_hot`. Clean Implementation/Trace cuts delete those legacy fields and persist exact native identities.

## Related docs

- [WorkState](work-state.md)
- [Change Intake and Backlog Triage](change-intake.md)
- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Evidence Records](evidence.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Loop Model](loop-model.md)
- [Loop Contracts](loop-contracts.md)
- [Planning Loop](planning-loop.md)
- [Runtime](runtime.md)
- [Traces](traces.md)
- [Worktree Isolation](worktree-isolation.md)
