---
type: Concept
title: Lexicon
description: This file is CodeWiki's active vocabulary contract. It governs Product/System/Design Knowledge, source, APIs, Loop Protocols, traces, generated views, and user-facing explanations.
tags:
  - codewiki
  - lexicon
timestamp: 2026-07-30T00:00:00Z
---
# Lexicon

This file is CodeWiki's active vocabulary contract. Intended-state docs, source, APIs, Loop Protocols, Change operation summaries, and user-facing views use these terms. Superseded terms appear only in the clean-cut table.

## Product identity

### Intent-to-production alignment runtime

CodeWiki's product category. It turns accepted intent into accountable transitions of Knowledge, exact Git state, delivery state, and evidence.

### Change

One accountable intent and durable dossier. Change includes exact semantic revisions, every Loop attempt, Planning coverage, realization, repair, Git/delivery proof, and outcome observation. It is a conceptual aggregate over append-only typed operations, not one mutable object.

### Change Trace

Logical append-only dossier of immutable typed Change operations, bound one-to-one to Change. Hot accepted segments synchronize through `codewiki/state`; terminal immutable segments move to `codewiki/archive` and hydrate on demand.

### Change Trace Protocol

Closed versioned grammar defining each operation kind's schema, admission authority, preconditions, state reduction, conflict behavior, Alignment Graph projection, and supersession behavior. V1 uses strict canonical JSON and SHA-256.

### Change operation

Immutable typed content-addressed fact in one Change Trace. Runtime derives identity, parents, exact base, authority binding, state digests, and canonical observation time. Semantic truth lives in operation bytes; Git state commits supply atomic acceptance receipt and order.

### Inline semantic artifact

Bounded immutable Candidate, Resolved Exit Policy, Evidence Record, Check Result, Exit Report, or Runtime Route embedded directly in its typed Change operation. Its envelope binds stable id, complete-content digest, schema version, and exact artifact bytes; Runtime also validates artifact-owned semantic identity. It has no mutable/dangling object ref. Large/private bytes remain external Evidence artifacts behind exact digests and refs.

### State commit

Git commit on `refs/heads/codewiki/state` that atomically accepts one exact operation batch against one expected previous state head. Commit metadata is non-semantic.

### Change dossier

Cross-cutting read-only projection of one Change Trace joined with current Knowledge/source/Git/delivery facts. It does not own private scheduling pipeline or authority.

### Change revision

Immutable semantic version of Change meaning. Refinement may supersede revision while outcome remains same. Materially different outcome creates linked Change.

### Change intake material

Bounded source-specific proposal or finding submitted by an authenticated user, review provider, worker, regression analyzer, scanner, delivery/outcome observer, or Knowledge-drift detector. It is untrusted input to Runtime normalization, deduplication, scope routing, and canonical Change operation construction—not a Change, Quality Issue, verdict, priority, or authority-bearing fact by itself.

### Defect profile

Optional structured classification attached to a Change revision when observed behavior is defective. It keeps category, severity, confidence, reproducibility, regression status, affected refs, and qualified security references distinct from Runtime-derived risk and Planning-owned priority. External issue containers and reviewer labels are source claims, not canonical profile authority.

### Approval

Runtime-created fact that authenticated authority accepted one exact subject under an allowed role and policy after exact freshness/correlation guards. Decision approval accepts Change meaning; UI experience approval accepts exact candidate-bound experience evidence; effect approval authorizes only its named boundary. One approval never implies another.

### Approval receipt

`approval_receipt` Evidence Record binding authenticated actor, role, decision, exact subject, candidate/tree/head or Change revision, evidence/Validation Bundle digest, provider event when applicable, Runtime observation time, and freshness. Free-form comments and worker/model claims are not approval receipts.

### Evidence Record

Content-addressed cross-Loop entity represented by one immutable value record with exact subject, producer, provenance, artifact, Runtime-owned observation/freshness, authority class, coverage, sensitivity, and closed kind-specific payload. It has stable identity but no mutable lifecycle, separate workflow, database, verdict, route, or acceptance authority.

## Execution model

### Project Runtime

CodeWiki's project-scoped outer control plane. It derives WorkState, selects compatible jobs, owns identity/freshness/CAS, runs Loop exit, supervises sessions/workers, guards canonical writes/effects, and quiesces safely. It is not a semantic Loop.

### Coordinator

Internal local scheduling/ownership role inside Project Runtime. One generation fences local writes/effects; shared acceptance still requires exact authority and Git expected-head CAS. Do not use “coordinator” as the name for the whole product or Runtime.

### Semantic Loop

One of exactly three meaning-owning capabilities:

```text
Decision | Planning | Implementation
```

Runtime, checking, learning, graph projection, recovery, Integration, publication, release, and feedback are not semantic Loops.

### Loop Protocol

Mandatory versioned CodeWiki instruction for one semantic Loop. Defines role, authoritative input, candidate schema, prohibited actions, stop conditions, and route-back behavior. It is not Pi Skill or user-authored Loop DSL.

### CodeWiki OS

Compact versioned guidance shared by CodeWiki-owned Pi sessions/workers. Establishes truth, authority, privacy, identity, progression, and effect invariants without replacing Pi.

### Pi Skill

Ordinary Pi-discovered reusable method/workflow. CodeWiki owns no parallel Skill format/registry. Skill cannot grant tools, paths, authority, Check changes, routing, acceptance, or effects.

### Loop attempt

One bounded effort to produce/evaluate exact candidate. Passed, failed, and indeterminate attempts remain in Change Trace.

### Candidate

Exact immutable role-specific output proposed by one Loop attempt. Candidate identity binds content and observed bases/snapshots. Runtime creates identity. Any Candidate or guarded-base change creates new identity and invalidates dependent Results.

### Runtime route

Runtime-owned action after Exit Report and final guard: repair, advance, route to Planning/Decision, retry, wait, block, or request authority. Route is separate from Report status.

### Validation Bundle

Mutable review projection of exact accepted intent/requirements, pending candidate/tree/head, Evidence Records, Results, screenshots/videos, preview link, findings, and required reviewer roles. CodeWiki dashboard and optional draft pull request may render same bundle; bundle is not canonical truth or approval.

### Review publication

Separately authorized pre-exit evidence-gathering effect that may push only an isolated review ref and create/update draft pull request for one exact Validation Bundle. It cannot move project/protected branch, force-push, auto-merge, publish product state, or claim semantic exit.

## Loop exit

### User Standard

Project-accepted, source-backed user expectation supplied as bounded inline text or an exact user-selected source snapshot. Company policy, execution guidance, quality criteria, resource instructions, and design conventions are Standard content rather than separate artifact types. Runtime distills one Standard into zero or more atomic Custom Checks, reports Default Check coverage and unresolved clauses, and may compile non-pass/fail ordering behavior or deterministic guards. A Standard grants no Result, priority, authority, or effect by itself.

### Check

One atomic versioned requirement plus execution kind, measurement contract, Evidence Record requirements, repair target, resource limits, and implementation identity.

```ts
type Check = CodeCheck | ModelCheck;
```

Check is not complete Loop policy. Requirement origin is independently `default | custom`.

### Default Check

CodeWiki-provided atomic Check. Default Checks belong to the closed versioned catalog, cannot be disabled by User Standards or Custom Checks, and may use Code or Model evaluation.

### Check Type

Closed versioned CodeWiki-owned semantic family for Custom Checks. It defines eligible Loops, deterministic applicability inputs, prerequisites, Evidence profile, Check Evaluator protocol/response schema, route capability, limits, and repair shape. Projects select a Check Type but cannot author one.

### Custom Check

One repository-bound bounded declarative atomic requirement distilled from one or more exact accepted User Standard snapshots under one Check Type. A Custom Check may use a CodeWiki-owned Model Evaluator or an approved deterministic Code template with structured parameters. Runtime owns stable identity, source and semantic definition digests, lifecycle/config identity, activation, authority, guards, and Result. Every applicable active Custom Check is required. “Custom” never means arbitrary code, shell, system prompt, tool, schema, dependency, or verdict logic. Supersedes “Project Check.”

### Check Evaluator

CodeWiki-owned type-specific model capability that assesses Model Checks against exact Candidate-bound Evidence. It may use focused calls or calibrated deterministic batches, but returns one separate Assessment per Check. It is not a persistent agent, final judge, semantic Loop, or authority.

### Assessment

Bounded `supported | unsupported | uncertain` output for one exact Model Check, Custom Check definition digest, Candidate, prerequisite Result set, and considered Evidence set. Runtime validates the Assessment, may materialize `model_assessment` Evidence, and derives `pass | fail | indeterminate`; Assessment itself has no exit or route authority.

### Code Check

Trusted deterministic CodeWiki-owned implementation of Check. “Code” names evaluation, not requirement origin or subject. Default and Custom Code Checks remain closed: a Custom Code Check may only instantiate an approved deterministic template/adapter with bounded structured parameters, and projects cannot inject arbitrary JavaScript, shell, executors, prompts, tools, schemas, dependencies, or verdict logic.

### Model Check

One atomic semantic requirement evaluated through a bounded independent model Assessment over an immutable Candidate, declared prerequisite Results, and exact considered Evidence identities. It returns `supported | unsupported | uncertain` with bounded findings and limitations; Runtime derives `pass | fail | indeterminate`. Check-specific payloads may add structured security challenge or claim-support detail. Related Model Checks may share one physical type-level call or deterministic batch while retaining separate Assessment and Result identity. They share no producer conversation and cannot override deterministic Results, aggregate exit, append, route, or attest acceptance. Operational failure yields `indeterminate`.

### Check binding

Resolved candidate-specific binding of Check identity, enforcement, parameters, threshold, dependencies, implementation/model/configuration, and `activatedBy` explanation.

### Resolved Exit Policy

Immutable candidate-specific contract selecting active Check bindings, enforcement, thresholds, activation reasons, dependencies, exclusions, model routes/configuration, and catalog/Loop Protocol identities. Runtime selects it deterministically; learned activation is forbidden.

### Check Result

Immutable result of one resolved Check against one exact candidate. Binds implementation/model/configuration, evidence inputs, measurement, runtime threshold, findings, status, issue class, repair target, and trial identity.

Status:

```text
pass | fail | indeterminate
```

### Exit Report

Immutable aggregate binding exact candidate, Resolved Exit Policy, complete required Result set, deterministic reduction version, and status.

```text
required fail exists          → fail
else required indeterminate   → indeterminate
else                           → pass
```

Passing Report permits semantic Loop exit only. It grants no append/effect authority by itself.

### Execution kind

Check dimension: `code | model`.

### Measurement

Check dimension: `qualitative | quantitative`. Quantitative contract names shape/unit/comparator/threshold/bounds/aggregation. Runtime applies threshold. Measurement is observation; status is policy interpretation.

### Enforcement

Resolved Check dimension: `observe | warn | require`. Execution kind does not imply enforcement. Default Checks cannot be disabled. Custom Check lifecycle is separately `draft | active | disabled`; every applicable active Custom Check resolves directly to `require` without an enforcement-stage progression. Runtime may derive a preflight or during-execution resource guard from an exact active Code Check binding, but the guard remains an implementation mechanism rather than another user-facing artifact.

### `activatedBy`

Explainable rule/trait/effect refs that caused Check binding. Safety may increase from actual candidate effects but cannot silently decrease.

### Issue class

Tentative structured classification on failed/indeterminate Result. It helps route repair/learning but grants no authority.

### Repair target

Specific candidate, context, Planning, Decision, Runtime, environment, authority, or evidence boundary needing remediation.

## Three Loops

### Decision

Interprets persisted intent, grounds current/desired state, owns accepted Knowledge meaning, evaluates overlap/risk/authority, and proposes exact approval or terminal disposition candidate.

### Planning

Continuously shapes one bounded selected Change set and current WorkState into immutable Planning epochs, coherent Sprints, worker-ready Work Items, dependencies, acceptance requirements, verification, Integration/rollback boundaries, resolutions, and Worker Workbench requirements.

### Implementation

Realizes accepted obligations in source/tests/Knowledge and judges the exact integrated realization Candidate through Implementation Checks. No standalone reviewer exists.

## Work model

### Backlog

Generated Work workspace for pending/deferred Change revisions and their Decision-facing intake state. It admits several bounded source kinds, but is not truth, canonical queue, mutable priority store, or semantic Loop.

### Backlog Triage Projection

Disposable snapshot-bound view over pending/deferred Changes, WorkState, Alignment Graph facts, source observations, and policy. It exposes Decision readiness, urgency, expected impact, estimated effort, risk of inaction, confidence, overlap, freshness, and explainable ordering without granting disposition or execution priority.

### Priority

Project-wide execution ordering derived by rolling Planning over accepted Changes and current WorkState. Intake sources and Backlog triage may assert or estimate urgency, impact, and effort, but cannot assign canonical priority.

### Sprint

Planning-created execution grouping across one or more Changes under coherent dependency, Integration, rollback, and verification boundaries. Generated view joins facts from participating accepted Change histories.

### Planning horizon

Bounded current scope that Planning observes: selected Change set, active Changes, Change Claims, Work Item Claims, active Work Items/Assignments, dependencies, conflicts, and project snapshot.

### Selected Change set

Exact Change revisions considered by one Planning Candidate. Selection is immutable inside that Candidate and does not imply immediate execution.

### Planning epoch

One immutable content-addressed project-scoped Planning record plus atomic bindings to exact participant Change revisions. It may create or revise several Sprints and Work Items while preserving or explicitly dispositioning active work.

### Safe execution frontier

Work Items Runtime may currently admit after revalidating Planning, dependencies, ownership, conflicts, capacity, supervision, capabilities, and fresh project state.

### Work Item

Planning-created worker-ready execution outcome with exactly one owning Change, optional contribution refs, acceptance requirements, scope, dependencies, verification, Integration, and Workbench requirements.

### Change Claim

Canonical exclusive authority for one exact Change revision and semantic purpose. It binds actor/authority and exact project snapshot. V1 uses explicit acquisition, explicit release, and authenticated takeover; it never grants semantic acceptance.

### Work Item Claim

Canonical exclusive execution authority for one exact Work Item revision and Assignment attempt. It binds worker, source base, Worker Workbench, scope, budgets, and obligations. Client/Git timestamps cannot expire it.

### Assignment

Runtime-derived binding of one Work Item, worker attempt, Work Item Claim, source base, scope, Worker Workbench, isolation, budgets, and report contract.

### Assignment packet

Private digest-bound serialization under `.codewiki/runtime/**` used by execution adapters and recovery. Inert without an exact matching active Work Item Claim.

### Worker Workbench

Private complete environment for one Assignment: source, context, Loop Protocol, Skills, tools, model route, Runtime-derived declarative Check/Evidence obligations, isolation, budgets, and report contract.

### Worker Report

Immutable normalized outcome (`completed | blocked | failed | cancelled`) for one Assignment attempt. Completion is potential Candidate material, never Implementation acceptance.

### Implementation tier

Runtime-selected `routine | standard | complex` model/capability class. Caller/worker cannot self-select or lower it. Actual effects may raise tier.

## State and relationships

### WorkState

Deterministic disposable typed projection over accepted Change operations, Knowledge, source/tests/Git, configuration/policy, delivery evidence, and bounded Runtime observations. Used for scheduling, guards, and Loop context; never independent authority.

### Team WorkState snapshot

Snapshot identity binding repository, `codewiki/state` head, protected source head, Knowledge digest, config digest, and policy digest.

### Fresh / stale / offline

Runtime-visible distributed snapshot status. Unsafe shared mutation requires `fresh`; `stale` or `offline` permits only bounded private work without shared acceptance.

### Alignment

State where every relevant discrepancy is resolved, accounted for by exact active Change, or explicitly unknown and blocked from unsafe progression.

### Drift

Unaccounted divergence among accepted intent, Knowledge, Planning, source/tests, Git, delivery, or outcomes.

### Vertical alignment

Intent → Knowledge/invariant → Planning → source/tests → Git/delivery/outcome.

### Horizontal alignment

Coherence among concurrent Changes, components, dependencies, Change Claims, Work Item Claims, and Integration boundaries.

### Temporal alignment

Lineage, supersession, staleness, suspect propagation, repair, and historical meaning over time.

### Delivery alignment

Distinct local candidate, integrated tree, branch, remote, artifact, release/deployment, and observed-outcome boundaries.

### Work Graph

Disposable current-work projection of Changes, Sprints, Work Items, dependencies, Assignments, Change Claims, Work Item Claims, blockers, and Integration.

### Alignment Graph

Versioned deterministic first-class projection connecting accepted Change history, OKF Knowledge, source/tests, Git, Evidence, delivery, and outcomes. The whole artifact is derived; no edge is independently authoritative.

### Alignment Graph snapshot

Digest binding accepted Change ledger head, Knowledge digest, protected source head, config/policy digests, and graph projector version.

### Graph source provenance

Per-fact classification preserving underlying authority: `canonical_binding | observed_binding | deterministic_analysis | inferred_analysis`.

### Learning View

Disposable temporal projection of Candidate failures, repairs, and later outcomes. Not a separate truth graph or semantic Loop.

### Relationship query result

Bounded read-only semantic facts with per-fact source provenance, underlying refs, snapshot digest, coverage, truncation, and staleness. No arbitrary Cypher or graph mutation.

## Knowledge

### Knowledge

Accepted durable Product/System/Design intent under `.codewiki/kb/**`. Distinct from workflow history and executable source truth.

### OKF

Open Knowledge Format used for portable Knowledge concepts/provenance. CodeWiki targets v0.2 with v0.1 fallback. Authored relationship vocabulary is `depends_on | constrains | refines | realizes | verifies | supersedes | derived_from`; Markdown links remain `references`. Imported metadata remains untrusted and inert.

### Source ownership

Stable CodeWiki mapping from system responsibility/interface to source/test patterns. Fine-grained symbol relationships stay derived.

### Attested Computation

OKF mechanism that may later describe sanctioned outcome measurements. CodeWiki executes only closed digest-pinned executor/attester definitions under explicit authority; imported definitions are inert data.

### Hot Knowledge / cold Knowledge

Hot: current accepted Knowledge. Cold: history reachable through Git/restore refs/retained evidence.

## Git and delivery proof

### Integration proof

Canonical Runtime evidence that accepted worker output was applied under exact Planning target/base into guarded Integration tree. Binds Work Item Claim, Assignment, Worker Report, commits/trees, paths, patch digest, and Checks. Grants no merge, push, or publication authority.

### Project-branch merge proof

Evidence exact Integration commit fast-forwarded expected local branch/head under explicit authority.

### Project-branch push proof

Evidence exact locally merged commit became observed head of configured remote branch under user authority. Proves only that observation boundary.

### Product publication proof

Evidence exact artifact from canonically pushed source was accepted at exact publication target under user authority and provider CAS/idempotency.

### Product release proof

Evidence exact published artifact was promoted to exact release channel under user authority. Does not prove deployment/adoption/outcome.

### Aggregate content proof

Runtime-observed exact merged/tree/package digest for candidate. Worker-local proof is provenance only.

## Learning and feedback

### Repair Episode

Scoped derived account from failed/indeterminate Result through subsequent repair Candidate to later Check, Integration, delivery, or outcome evidence. It records applicability and harmful as well as successful approaches without becoming canonical authority.

### Repair Pattern

Derived scoped aggregation of applicable successful and harmful Repair Episodes. Advisory until Lab ablation, sealed holdout validation, and promotion through an accountable Change.

### Feedback Bundle

Local user-reviewed allowlisted pseudonymized diagnostic artifact for suspected recurring CodeWiki defects. Excludes project content/identity by default and requires separate export approval.

### CodeWiki Lab

Isolated maintainer experimentation/calibration infrastructure. Not production Runtime, semantic Loop, or automatic promotion system.

## Clients and adapters

### Client adapter

Thin CLI/dashboard/Pi/future host boundary connecting to Project Runtime. Cannot own workflow authority.

### Semantic session

Read-only Pi SDK session producing one role-specific candidate or Model Check output from exact Runtime context. Not truth, lane, reviewer, or Change.

### Execution adapter

Harness-neutral boundary for semantic sessions or isolated workers. Reports capabilities/outcomes without routing/append authority.

### Worker adapter

Process/OCI implementation for exact Assignment. OCI is opt-in, digest-pinned, preinstalled, capability-scoped, and no implicit pull.

### Pi adapter

CodeWiki integration that embeds published Pi SDK for execution and optionally exposes thin Pi client. Pi remains provider/session/tool/Skill owner.

## Views and retention

### Generated view

Disposable projection under `.codewiki/views/**`. Examples: status, Work, Change dossier, Loop exit, Alignment, Learning. Never truth.

### `refs`

Canonical Change-operation artifact references only. Commands/prose/findings belong in structured `data`; private material belongs in neither.

### Hot Trace segment

Current accepted Change operation segment carried on `refs/heads/codewiki/state` and materialized locally under `.codewiki/changes/**`.

### Archive segment

Immutable terminal Change operation segment carried on `refs/heads/codewiki/archive` after configured Integration, ownership, review/effect, outcome, and closure obligations complete.

### Hydration

Provider-neutral Git fetch, manifest/operation digest verification, and read-only Runtime materialization of archived history.

### Retention

Close, archive, hydrate, reopen, compact-checkpoint, and cleanup lifecycle. Compaction never summarizes away canonical operations.

## User-facing statuses

| Term | Meaning |
| --- | --- |
| Aligned | Relevant relationships resolved or validly Change-accounted. |
| Review Needed | Changed content/evidence makes relationship suspect pending semantic review. |
| Misaligned | Grounded evidence proves unaccounted contradiction. |
| Unknown | Coverage/provenance/evidence insufficient; unsafe progression blocked. |
| Needs Review | Runtime route requires earlier semantic/user authority. |
| Blocked | External authority, capability, resource, policy, or indeterminate assurance prevents safe progression. |
| Committed | Realized Change carries exact local Git restoration proof and outcome disposition; does not imply remote publication. |

## Superseded vocabulary

| Superseded | Canonical replacement |
| --- | --- |
| Semantic Stage | Semantic Loop |
| Stage Protocol | Loop Protocol |
| Stage candidate / stage exit | Loop candidate / Loop exit |
| Company policy / Execution Standard | User Standard when naming source material; generated Custom Check when naming an executable requirement |
| Quality Standard / Exit Criterion | User Standard when naming source material; Check when naming an executable requirement |
| Kernel Check | Default Check |
| Deterministic Verifier | Code Check |
| Model Evaluator | Model Check, or Check Evaluator when referring to model execution |
| Project Check | Custom Check |
| Quality Assessment | Check Result |
| Quality Policy Resolution | Resolved Exit Policy |
| Quality Report | Exit Report |
| Quality Gate / Gate Result | Deterministic `ExitReport.status` |
| Failure regime | `issueClass` on failed/indeterminate Check Result |
| Standalone Implementation reviewer | Implementation Model Checks under Resolved Exit Policy |
| `implementation.review` route | Loop/model Check routes; no review slot |
| Generic gate / gateway | Check or Exit Report status, whichever is exact |
| Validation report | Check Result or Exit Report |
| Board / trace board | Specific Backlog, Planning, Implementation, Alignment, or Change view |
| Legacy task-unit term | Work Item |
| Generic ownership term | Change Claim or Work Item Claim, whichever is exact |
| Approved-change collection term | Planning horizon or selected Change set |
| Roadmap | Work/Planning projection over accepted Change history |
| Graph truth | Snapshot-bound Alignment Graph projection with per-fact provenance |
| Lesson / Memory entity | Derived Repair Episode/Pattern or promoted Knowledge through Change |
| Telemetry trace | Change Trace or explicit Feedback Bundle, never automatic telemetry |
| Garbage collection | Retention/cleanup |

Legacy names may remain temporarily in executable source/tests and explicit executable-drift tables only. Clean cuts remove old paths/exports rather than adding adapters.

## Related docs

- [Product](product/overview.md)
- [Alignment Model](system/components/alignment-model.md)
- [Loop Model](system/components/loop-model.md)
- [CodeWiki OS and Loop Protocols](system/components/codewiki-os.md)
- [Loop Exit](system/components/loop-exit.md)
- [Custom Checks](system/components/custom-checks.md)
- [Worker Workbench](system/components/worker-workbench.md)
- [Model Routing](system/components/model-routing.md)
- [Decision Loop](system/components/decision-loop.md)
- [Planning Loop](system/components/planning-loop.md)
- [Implementation Loop](system/components/implementation-loop.md)
- [Traces](system/components/traces.md)
- [API Tool Surface](system/components/api-tools.md)
