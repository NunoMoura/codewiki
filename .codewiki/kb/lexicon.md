---
type: Concept
title: Lexicon
description: This file is CodeWiki's active vocabulary contract. It governs Product/System/Design Knowledge, source, APIs, Loop Protocols, traces, generated views, and user-facing explanations.
tags:
  - codewiki
  - lexicon
timestamp: 2026-06-30T00:00:00Z
---
# Lexicon

This file is CodeWiki's active vocabulary contract. Desired-state docs, source, APIs, Loop Protocols, trace summaries, and user-facing views use these terms. Superseded terms appear only in the migration table.

## Product identity

### Intent-to-production alignment runtime

CodeWiki's product category. It turns accepted intent into accountable transitions of Knowledge, exact Git state, delivery state, and evidence.

### Change

One accountable intent and durable dossier. Change includes exact semantic revisions, every Loop attempt, Planning coverage, realization, repair, Git/delivery proof, and outcome observation. It is a conceptual aggregate over append-only records, not one mutable object.

### Change Trace

One append-only JSONL dossier under `.codewiki/traces/TRACE-CHG-<id>.jsonl`, bound one-to-one to Change. It contains semantic attempts, Runtime coordination, exact evidence identities, route-backs, delivery boundaries, observations, checkpoints, and retention facts.

### Change dossier

Cross-cutting read-only projection of one Change Trace joined with current Knowledge/source/Git/delivery facts. It does not own private scheduling pipeline or authority.

### Change revision

Immutable semantic version of Change meaning. Refinement may supersede revision while outcome remains same. Materially different outcome creates linked Change.

### Approval

Runtime-created fact that authenticated authority accepted one exact subject under an allowed role and policy after exact freshness/correlation guards. Decision approval accepts Change meaning; UI experience approval accepts exact candidate-bound experience evidence; effect approval authorizes only its named boundary. One approval never implies another.

### Approval receipt

`approval_receipt` Evidence Record binding authenticated actor, role, decision, exact subject, candidate/tree/head or Change revision, evidence/Validation Bundle digest, provider event when applicable, Runtime observation time, and freshness. Free-form comments and worker/model claims are not approval receipts.

### Evidence Record

Content-addressed cross-Loop entity represented by one immutable value record with exact subject, producer, provenance, artifact, Runtime-owned observation/freshness, authority class, coverage, sensitivity, and closed kind-specific payload. It has stable identity but no mutable lifecycle, separate workflow, database, verdict, route, or acceptance authority.

## Execution model

### Project Runtime

CodeWiki's project-scoped outer control plane. It derives WorkState, selects compatible jobs, owns identity/freshness/CAS, runs Loop exit, supervises sessions/workers, guards canonical writes/effects, and quiesces safely. It is not semantic Loop.

### Coordinator

Internal elected scheduling/ownership role inside Project Runtime. One generation owns durable write/effect authority. Do not use “coordinator” as name for whole product/runtime.

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

Exact immutable role-specific output proposed by one Loop attempt. Candidate identity binds content and observed base/snapshots. Runtime creates identity. Any candidate or guarded-base change creates new identity and invalidates dependent Results.

### Runtime route

Runtime-owned action after Exit Report and final guard: repair, advance, route to Planning/Decision, retry, wait, block, or request authority. Route is separate from Report status.

### Validation Bundle

Mutable review projection of exact accepted intent/requirements, pending candidate/tree/head, Evidence Records, Results, screenshots/videos, preview link, findings, and required reviewer roles. CodeWiki dashboard and optional draft pull request may render same bundle; bundle is not canonical truth or approval.

### Review publication

Separately authorized pre-exit evidence-gathering effect that may push only an isolated review ref and create/update draft pull request for one exact Validation Bundle. It cannot move project/protected branch, force-push, auto-merge, publish product state, or claim semantic exit.

## Loop exit

### Check

One atomic versioned requirement plus execution kind, measurement contract, Evidence Record requirements, repair target, resource limits, and implementation identity.

```ts
type Check = CodeCheck | ModelCheck;
```

Check is not complete Loop policy.

### Code Check

Trusted deterministic CodeWiki-owned implementation of Check. “Code” names implementation, not subject. Initial catalog is closed; projects cannot inject arbitrary JavaScript/shell/executors.

### Model Check

Independent bounded Pi model session evaluating one semantic requirement over immutable candidate-bound Evidence Records. It shares no producer conversation, returns structured output, and cannot append/route/attest acceptance. Operational failure yields `indeterminate`.

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

Check dimension: `observe | warn | require`. Execution kind does not imply enforcement. Kernel Checks cannot be disabled. Project Checks progress through explicit approval.

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

Globally shapes bounded approved-Change portfolio into coherent Sprints, worker-ready Work Items, dependencies, acceptance requirements, verification, Integration/rollback boundaries, resolutions, and Workbench requirements.

### Implementation

Realizes accepted obligations in source/tests/Knowledge and judges exact realization candidate through Implementation Checks. No standalone reviewer exists.

## Work model

### Backlog

Generated Work workspace for intake and Change revisions not yet approved/terminal. Not truth or semantic Loop.

### Sprint

Planning-created execution grouping across one or more Changes under coherent dependency, Integration, rollback, and verification boundaries. Generated view joins facts from participating traces.

### Planning epoch

One global Planning candidate/append batch over bounded participant set. May create/revise several Sprints and Work Items.

### Work Item

Planning-created worker-ready execution outcome with exactly one owning Change, optional contribution refs, acceptance requirements, scope, dependencies, verification, Integration, and Workbench requirements.

### Claim

Canonical temporary reservation granting exact Assignment attempt bounded execution right and preventing unsafe overlap. Claim never grants semantic acceptance.

### Assignment

Runtime-derived binding of one Work Item, worker attempt, Claim, source base, scope, Workbench, isolation, budgets, and report contract.

### Assignment packet

Private digest-bound serialization under `.codewiki/runtime/**` used by execution adapters and recovery. Inert without exact matching active Claim.

### Worker Workbench

Private complete environment for one Assignment: source, context, Loop Protocol, Skills, tools, model route, frozen Check/evidence obligations, isolation, budgets, and report contract.

### Worker Report

Immutable normalized outcome (`completed | blocked | failed | cancelled`) for one Assignment attempt. Completion is candidate evidence, never Implementation acceptance.

### Implementation tier

Runtime-selected `routine | standard | complex` model/capability class. Caller/worker cannot self-select or lower it. Actual effects may raise tier.

## State and relationships

### WorkState

Disposable typed projection over Change Traces, Knowledge, source/tests/Git, configuration, delivery evidence, and Runtime observations. Used for bounded scheduling/context; never authority.

### Alignment

State where every relevant discrepancy is resolved, accounted for by exact active Change, or explicitly unknown and blocked from unsafe progression.

### Drift

Unaccounted divergence among accepted intent, Knowledge, Planning, source/tests, Git, delivery, or outcomes.

### Vertical alignment

Intent → Knowledge/invariant → Planning → source/tests → Git/delivery/outcome.

### Horizontal alignment

Coherence among concurrent Changes, components, dependencies, Claims, and Integration boundaries.

### Temporal alignment

Lineage, supersession, staleness, suspect propagation, repair, and historical meaning over time.

### Delivery alignment

Distinct local candidate, integrated tree, branch, remote, artifact, release/deployment, and observed-outcome boundaries.

### Work Graph

Disposable projection of Changes, Sprints, Work Items, dependencies, Assignments, Claims, blockers, and Integration.

### Alignment Graph

Disposable projection connecting OKF Knowledge/provenance, components, source/test ownership, Changes/candidates/Results, Git/delivery proof, and outcomes.

### Learning View

Disposable temporal projection of candidate failures, repairs, and later outcomes. Not separate truth graph.

### Relationship query result

Bounded read-only semantic facts plus snapshot digest, provenance, authority class, coverage, truncation, and staleness. No arbitrary Cypher/graph mutation.

## Knowledge

### Knowledge

Accepted durable Product/System/Design intent under `.codewiki/kb/**`. Distinct from workflow history and executable source truth.

### OKF

Open Knowledge Format used for portable Knowledge concepts/provenance. CodeWiki targets v0.2 with v0.1 fallback. Imported metadata remains untrusted.

### Source ownership

Stable CodeWiki mapping from system responsibility/interface to source/test patterns. Fine-grained symbol relationships stay derived.

### Attested Computation

OKF mechanism that may later describe sanctioned outcome measurements. CodeWiki executes only closed digest-pinned executor/attester definitions under explicit authority; imported definitions are inert data.

### Hot Knowledge / cold Knowledge

Hot: current accepted Knowledge. Cold: history reachable through Git/restore refs/retained evidence.

## Git and delivery proof

### Integration proof

Canonical Runtime evidence that accepted worker output was applied under exact Planning target/base into guarded Integration tree. Binds Claim, Assignment, Worker Report, commits/trees, paths, patch digest, and checks. Grants no merge/push/publication authority.

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

Derived relation from failed/indeterminate Result through subsequent repair candidate to later Check/Integration/delivery/outcome evidence.

### Repair Pattern

Derived aggregation of applicable successful and harmful Repair Episodes. Advisory until held-out validated and promoted through accountable Change.

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

Canonical trace artifact references only. Commands/prose/findings belong in structured `data`; private material belongs in neither.

### Retention

Close/compact/hydrate/restore lifecycle using traces and Git restore refs. Not generic garbage collection.

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
| Quality Standard / Exit Criterion | Check |
| Deterministic Verifier | Code Check |
| Model Evaluator | Model Check |
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
| Task / work unit | Work Item |
| Roadmap | Work/Planning projection over canonical traces |
| Graph truth | Disposable relationship view over canonical sources |
| Lesson / Memory entity | Derived Repair Episode/Pattern or promoted Knowledge through Change |
| Telemetry trace | Change Trace or explicit Feedback Bundle, never automatic telemetry |
| Garbage collection | Retention/cleanup |

Legacy names may remain temporarily in executable source/tests and migration documentation only. Clean cuts remove old paths/exports rather than adding adapters.

## Related docs

- [Product](product/overview.md)
- [Alignment Model](system/components/alignment-model.md)
- [Loop Model](system/components/loop-model.md)
- [CodeWiki OS and Loop Protocols](system/components/codewiki-os.md)
- [Loop Exit](system/components/loop-exit.md)
- [Worker Workbench](system/components/worker-workbench.md)
- [Model Routing](system/components/model-routing.md)
- [Decision Loop](system/components/decision-loop.md)
- [Planning Loop](system/components/planning-loop.md)
- [Implementation Loop](system/components/implementation-loop.md)
- [Traces](system/components/traces.md)
- [API Tool Surface](system/components/api-tools.md)
