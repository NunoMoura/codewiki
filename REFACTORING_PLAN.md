# CodeWiki Refactoring Plan

## Status

Architecture review approved on 2026-07-30. This plan replaces the earlier local-linear Trace and partial multi-file recovery direction with a clean Change Trace Protocol v1, provider-neutral Git synchronization, rolling Planning, deterministic Alignment Graph projection, hot/archive handling, and measured repair learning.

Latest synchronized executable checkpoint before this documentation cut:

```text
f7b01fa feat: transport decision claim checks through pi
836 tests across 137 suites
836 passed, 0 failed
```

The repository is pre-production. No legacy Trace migration, compatibility parser, deprecated aliases, dual-write path, or old/new contract bridge will be built.

## Goal

Turn CodeWiki into a standalone, project-scoped intent-to-production alignment runtime whose exact project state advances only when required evidence is complete, fresh, and authorized.

> **Change owns accountable intent and durable history. Runtime owns project-wide scheduling and progression.**

The target coordination model is:

```text
typed Change operations
→ accepted Git-backed history
→ deterministic WorkState
→ rolling global Planning
→ first-class Alignment Graph
→ local views and bounded agent queries
```

CodeWiki keeps exactly three semantic Loops:

```text
Decision
Planning
Implementation
```

Runtime, checking, graph projection, synchronization, Integration, recovery, archive, delivery, learning, and feedback are not additional semantic Loops.

The exact Loop-exit chain is:

```text
Change
→ Loop
→ Candidate
→ Evidence Records
→ Resolved Exit Policy
→ Checks
→ Check Results
→ Exit Report
→ Runtime Route
```

A passing Exit Report permits one exact Candidate to leave one Loop attempt. Runtime must still revalidate generation, freshness, authority, expected bases, and effect-specific policy before canonical append, any new Integration attempt, merge, push, publication, release, deployment, or an external effect.

## Sources of truth

- `.codewiki/kb/**` is intended product and system design truth.
- `src/**` and `tests/**` are executable truth.
- Git is checkpoint, source-history, acceptance-receipt, and synchronization evidence.
- Generated views, graph indexes, Runtime scratch, and local materializations are disposable.
- This source checkout does not load or dogfood its own CodeWiki extension during stabilization.
- Packed candidates are tested only in disposable external projects with isolated Pi settings.

Drift between Knowledge and executable truth remains explicit until an accountable Change closes it.

## Non-negotiable boundaries

### Runtime authority

Runtime alone owns:

- canonical identity and admission;
- actor and authority binding;
- canonical observation time;
- WorkState and snapshot digests;
- freshness and expected-head CAS;
- scheduling and bounded concurrency;
- Change Claims and Work Item Claims;
- Assignments, Integration, recovery, and routing;
- exact Evidence Record, Check Result, Exit Report, request, policy, and operation identity;
- canonical writes and guarded effects.

Clients, sessions, candidate producers, workers, Checks, provider events, graph adapters, and generated views cannot choose canonical identity, grant authority, lower policy, or route project state.

Runtime-visible jobs, Checks, Change Claims, Work Item Claims, Assignments, Integration work, and guarded effects are the only durable concurrency model. Hidden sub-agent trees cannot own durable work or canonical writes.

### Pi boundary

Pi owns providers, authentication plumbing, model transport, sessions, compaction, tool mechanics, extensions, and normal Skill discovery. CodeWiki injects versioned CodeWiki OS guidance, one exact Loop Protocol, bounded current work, scoped historical repair guidance for producers/workers, and scoped tools/Skills.

Candidate producers and independent Model Checks never share conversational state. Independent Model Checks remain tool-free where their protocol requires it and never receive producer repair-learning context.

### Privacy boundary

Raw prompts, private reasoning, credentials, unrestricted diffs, tool output, screenshots, videos, logs, pages, and provider payloads remain private or external. Canonical operations retain bounded typed metadata, digests, and references.

## Target architecture

### Canonical temporal layer

Immutable typed Change operations are canonical history. Semantic truth belongs in operation bytes. Git commit author, message, and timestamp do not define semantic meaning or authority.

Every v1 operation kind defines:

```text
schema
admission authority
preconditions
state reduction
conflict behavior
graph projection
supersession behavior
```

No arbitrary mutation patch, generic status operation, user-authored operation DSL, or arbitrary graph mutation is allowed.

### Deterministic projection layer

Accepted operation history reduces deterministically into WorkState and projects a versioned Alignment Graph. Full replay and incremental replay must produce identical state and graph snapshots.

### Disposable presentation layer

Backlog, Planning, Implementation, Change dossiers, dashboards, queues, graph layouts, search indexes, notifications, and repair-retrieval indexes are projections. They never become another truth store.

### Change intake and Backlog triage

One closed Change intake boundary accepts bounded authenticated material from users, ordinary pull-request reviews by any configured human or agent, CodeWiki workers, regression/security/scanner runs, delivery/outcome observations, and Knowledge drift:

```ts
type ChangeIntakeMaterial =
  | UserSuggestionMaterial
  | PullRequestFindingMaterial
  | WorkerDiscoveryMaterial
  | RegressionFindingMaterial
  | SecurityScannerFindingMaterial
  | DeliveryObservationMaterial
  | OutcomeFindingMaterial
  | KnowledgeDriftMaterial;
```

Each source member requires exact source-specific actor/provider/Assignment/run/tree/Trace bindings. Producers may submit observed/expected behavior, affected refs, source evidence, and claimed category/severity/confidence. They cannot supply canonical Change/operation identity, authority, time, priority, risk, route, or Check outcome.

Runtime authenticates, sanitizes, normalizes, deduplicates, classifies source claims, and scope-routes each item. Current Candidate violations become current-Change repair feedback; scope/dependency changes route to Planning; intent/risk/authority changes route to Decision; independent discrepancies become pending Changes with `discovered_from`; duplicates reinforce existing Changes; non-actionable, stale, or unauthorized material creates no new Change. Sensitive security findings are redacted or held for authorized handling.

Backlog triage is a snapshot-bound disposable projection over pending/deferred Changes, WorkState, Alignment Graph facts, source observations, config, and policy. It exposes provenance-bearing Decision readiness, urgency, expected impact/improvement, estimated effort, risk of inaction, change risk, confidence, overlap, freshness, work unblocked, and explainable ordering. Unknown remains unknown. Evidence authority (`asserted | observed | verified | approved`) remains distinct from graph/projection provenance (`canonical_binding | observed_binding | deterministic_analysis | inferred_analysis`). No opaque overall score may hide safety or uncertainty.

Backlog ordering chooses Decision attention only. Decision accepts exact Change meaning independently; rolling Planning alone owns project-wide execution ordering across accepted Changes.

Target source placement keeps this inside the Change domain rather than creating a fourth top-level subsystem:

```text
src/changes/intake/**
src/changes/triage/**
```

Runtime orchestration remains under `src/runtime/**`. The clean cut replaces legacy `src/changes/intake.ts`; no `src/triage/**`, compatibility alias, dual contract, or separate triage authority is added.

## Change Trace Protocol v1

### Canonical identity

Use a versioned strict canonical JSON profile and SHA-256 for every authority-bearing identity.

Executable Change-scoped envelope:

```ts
interface CanonicalChangeOperation {
  operationId: Sha256Digest;
  body: ChangeOperationBody;
}

interface ChangeOperationBody {
  protocol: {
    id: "codewiki.change-trace";
    version: "1.0.0";
    canonicalJson: "codewiki.canonical-json/1.0.0";
  };
  changeId: ChangeId;
  kind: ChangeOperationKind;
  kindVersion: "1.0.0";
  parents: OperationId[];
  baseSnapshot: BaseSnapshot;
  authorityBinding: AuthorityBinding;
  recordedAt: ExactUtcTimestamp;
  preStateDigest: Sha256Digest;
  postStateDigest: Sha256Digest;
  payload: PayloadByKind[ChangeOperationKind];
}
```

`operationId` is excluded from its own hash input. Runtime derives all canonical fields. The strict JSON profile rejects alternate byte encodings, duplicate keys, unknown fields, non-data values, and non-canonical numbers. Unknown required versions, missing parents, invalid canonical bytes, digest mismatch, or unauthorized actors remain visible and block dependent progression.

Reduction digests bind canonical semantic Change state while excluding operation ID, accepted-tail metadata, diagnostics, caches, and graph layout. This avoids a cycle between `postStateDigest` and `operationId`; accepted tail and full WorkState digest derive after identity exists.

Use separate private attempt/job identity and accepted operation identity. A stale base can preserve private work correlation, but reevaluation creates a new canonical operation identity. Never alias two canonical IDs.

### Base and authority binding

```ts
interface BaseSnapshot {
  remoteStateHead: GitObjectId | null;
  sourceHead: GitObjectId;
  knowledgeDigest: Sha256Digest;
  configDigest: Sha256Digest;
  policyDigest: Sha256Digest;
}

interface AuthorityBinding {
  actorId: string;
  principalRef: string;
  role: string;
  actorPolicyDigest: string;
  authenticationEvidenceId?: string;
  runtimeProtocolDigest: string;
}
```

Clients cannot supply either binding.

Local single-user mode may use asserted actor identity. Protected team mode may require standard signed Git state commits for authority-bearing writes. External approvals and effects require authenticated provider receipts. CodeWiki will not invent a PKI.

### Parent model

```text
initial or reopened hot-segment root   0 parents
ordinary accepted Change operation     exactly 1 current Change tail
explicit same-Change causal merge      1 to 64 exact parents
cross-Change relationship             exact typed payload bindings
```

`trace.opened` and `trace.reopened` are roots. Reopening binds verified archive manifest/tail/closure IDs in its payload instead of making cold archive bytes hot parents. Multiple parents are not generic conflict resolution. Cross-Change merge, split, relationship, and Planning semantics use exact revision bindings and atomic accepted batches.

### Project-scoped Planning and structural records

V1 has exactly two closed semantic scopes: ordinary Change-scoped operations and one project-scoped `PlanningEpochRecord`. A Planning epoch becomes relevant to each participating Change only through atomic `planning.epoch_bound` operations. No generic subject scope exists.

V1 also defines separate closed content-addressed structural schemas for:

- `StateCommitManifest`;
- `ArchiveManifest`;
- replay checkpoints that never replace operations.

Structural manifests cannot mutate WorkState by existing alone.

### State commit manifest

```ts
interface StateCommitManifest {
  manifestId: Sha256Digest;
  body: {
    protocol: {
      id: "codewiki.state-commit-manifest";
      version: "1.0.0";
      canonicalJson: "codewiki.canonical-json/1.0.0";
    };
    previousStateHead: GitObjectId | null;
    operationIds: OperationId[];
    changedTraceTails: {
      changeId: ChangeId;
      previousTail: OperationId | null;
      nextTail: OperationId;
    }[];
    batchDigest: Sha256Digest;
  };
}
```

One Git state commit accepts the complete listed batch or none. Its parent supplies global accepted order; operation bytes supply semantics.

### Closed v1 catalog

```text
trace.opened
trace.closed
trace.reopened

change.proposed
change.revised
change.relationship_recorded
change.relationship_superseded
change.merge_recorded
change.split_recorded
change.withdrawal_recorded
change.feedback_recorded

change_claim.acquired
change_claim.released
change_claim.takeover_recorded

loop.attempt_started
loop.attempt_ended
decision.candidate_recorded
planning.candidate_recorded
implementation.candidate_recorded
loop.exit_policy_recorded
evidence.recorded
check.result_recorded
loop.exit_report_recorded
runtime.route_recorded

planning.epoch_recorded
planning.epoch_bound

work_item_claim.acquired
work_item_claim.released
work_item_claim.takeover_recorded
assignment.dispatched
assignment.cancel_requested
assignment.terminal_recorded
worker.report_recorded

integration.attempt_started
integration.result_recorded
source.branch_merge_recorded
source.branch_push_recorded

review_projection.published

product.publication_recorded
product.release_recorded
delivery.observation_recorded
outcome.observation_recorded
```

`planning.epoch_recorded` accepts one immutable project-scoped Planning record. `planning.epoch_bound` is Change-scoped.

### Explicit non-operations

Do not create operations equivalent to:

```text
graph edge or node mutation
lesson or memory persistence
generic priority or status mutation
Check disabling or threshold lowering
heartbeat or session-message persistence
prompt or raw-output persistence
cache or view refresh
```

## Provider-neutral Git synchronization

### Refs and paths

Protected source branch retains durable project material such as:

```text
.codewiki/kb/**
.codewiki/config.json
```

Local hot materialization:

```text
.codewiki/changes/*.jsonl
.codewiki/runtime/**
.codewiki/views/**
```

Accepted hot state:

```text
refs/heads/codewiki/state
  .codewiki/changes/**  # operations include bounded inline semantic artifacts
  state manifest
```

Immutable archive:

```text
refs/heads/codewiki/archive
  changes/<prefix>/<changeId>/<segmentDigest>.jsonl
  changes/<prefix>/<changeId>/manifest.json
```

`.codewiki/changes/**` never becomes protected-source-branch truth. Local copies remain provisional until accepted on `codewiki/state`.

### Acceptance protocol

```text
local proposal
→ validate against exact fetched snapshot
→ Runtime creates operation and state manifest
→ expected-head Git push
→ shared acceptance
→ fetch, verify, replay, and project
```

A rejected push requires:

```text
fetch current state
→ verify history
→ rebuild WorkState and Alignment Graph
→ reevaluate semantic eligibility
→ create fresh valid operation or reject proposal
```

Never blind rebase and retry authority-bearing writes.

### Freshness and notifications

Team WorkState snapshot identity binds:

```text
repository identity
+ codewiki/state head
+ protected source head
+ Knowledge digest
+ config and policy digests
```

Runtime exposes:

```text
fresh | stale | offline
```

Unsafe distributed mutation requires `fresh`. Offline work may create private attempts and artifacts but cannot gain shared acceptance.

Polling, webhooks, SSE, and provider notifications only invalidate local state. Runtime fetches and verifies Git data. Duplicate, missed, or reordered notifications cannot change semantics.

### Initial contention model

Start with one provider-neutral `codewiki/state` branch and exact expected-head CAS. Measure contention before partitioning. If measured need emerges, partition non-exclusive contribution streams first; keep Change Claim, Work Item Claim, Planning, Integration, and effects globally serialized.

## Change Claims and Work Item Claims

Keep separate domain contracts.

A Change Claim binds exact Change revision, semantic purpose, actor/authority, remote state head, and relevant project snapshot.

A Work Item Claim binds exact Work Item/Planning revision, Assignment attempt, worker, source base, Worker Workbench, scope, budgets, and obligations.

V1 lifecycle:

```text
explicit acquisition
explicit release
authenticated takeover
```

Client and Git timestamps cannot determine ownership. Automatic expiry requires trusted remote time and is deferred. Private heartbeats may inform UX but cannot grant, expire, or transfer authority.

## Rolling Planning

Decision proceeds independently per Change. A user may accept Change B while Change A executes.

Planning is rolling and epoch-based:

```text
selected approved Change set
+ active Changes
+ active Change Claims
+ active Work Item Claims
+ Work Items and Assignments
+ source/Knowledge/config/policy snapshot
→ new immutable Planning epoch
```

Each epoch stores one content-addressed `PlanningEpochRecord` and atomically binds exact participant revisions through `planning.epoch_bound` operations.

New Planning preserves active Work Items and Assignments when safe. It cannot silently rewrite an active Assignment. Invalidated work must be explicitly preserved, paused, migrated, cancelled, blocked, or routed back.

Use these terms:

```text
Planning horizon
selected Change set
active Changes
safe execution frontier
Change Claim
Work Item Claim
Work Item
```

Backlog, current Planning, work queue, ready frontier, and dashboard remain projections.

## Evidence and Loop exit

Initial closed Evidence kinds:

```text
research_citation
source_observation
command_execution
ui_capture
model_assessment
worker_report
integration_proof
approval_receipt
delivery_attestation
outcome_observation
```

Evidence authority describes observation strength only:

```text
asserted | observed | verified | approved
```

It cannot grant Check pass, Loop exit, Integration, merge, release, or deployment.

Evidence obligations are immutable, declarative, and non-executable. Missing, stale, partial, unavailable, contradictory, or unusable required Evidence produces waiting, repair, or `indeterminate`.

Every considered Evidence identity—including excluded, stale, negative, and contradictory records—stays bound into each Result:

```text
evidenceResolutions
evidenceRecordIds
evidenceInputDigest
```

Workers produce asserted Worker Reports. Runtime materializes admitted Evidence Records. Final assurance evaluates the exact integrated Candidate and tree, never worker confidence.

## Custom Checks and Check Evaluators

Custom Checks let one repository define company policy, design-system rules, API conventions, accessibility expectations, compatibility promises, and release requirements that Skills may guide but cannot independently enforce. One Custom Check is one bounded project-authored declarative atomic requirement under one closed versioned CodeWiki-owned Check Type. Check Types own eligible Loops, deterministic applicability, prerequisite Code Checks, Evidence profile, Model Check protocol/schema, route capability, limits, and repair shape. Initial families cover intent/Product, research/claims, architecture/API, security/privacy, accessibility, design system, library compatibility, Implementation quality, delivery/release, and organization policy.

Kernel/custom requirement origin, project/kernel authority, `code | model` execution kind, Check Type, qualitative/quantitative measurement, and `observe | warn | require` enforcement remain independent. V1 text-based Custom Checks execute as Model Checks. Future Custom Code Checks may instantiate only approved deterministic templates/adapters with structured parameters; projects never inject JavaScript, shell, executable policy, arbitrary prompts, tools, response schemas, dependencies, or verdict logic.

Dashboard is the primary authoring surface. It submits a narrow bounded proposal containing Check Type, name, one requirement, optional repair guidance, closed applicability filters, and bounded Knowledge refs. Runtime owns id/revision/digest, canonical policy binding, activation, route, approval, Assessment validation, Result, and exit. Accepted configuration remains protected Git-backed `.codewiki/config.json` truth. Rollout is `draft → observe → warn → explicitly approved require`. A Candidate changing Custom Check configuration is evaluated under the protected-base policy and cannot weaken its own assurance; accepted changes activate only from the next protected config snapshot.

Each Check Type has one Check Evaluator: a CodeWiki-owned type-specific semantic model capability, not a persistent agent, final judge, or new Loop. It returns a separate `supported | unsupported | uncertain` Assessment for every exact active Custom Check; Runtime derives one separate `pass | fail | indeterminate` Result. Physical execution may use one focused call per Check, one type-level call, or deterministic bounded batches without merging semantic identity. Per-type batching is promoted only after fair sealed comparison against focused calls shows no safety regression across false passes, escaped critical defects, false failures, `indeterminate`, repair usefulness, prompt-injection resistance, latency, tokens/cost, retries, and intervention. One focused call per logical Model Check remains baseline until then.

## Cross-Loop security assurance

Security is layered across exactly three Loops:

```text
Decision        unsafe intent, incomplete trust/data/authorization boundaries, abuse potential
Planning        required security work, isolation, sequencing, reviewer and rollback obligations
Implementation  exact integrated-tree scanners, tests, adversarial review, and residual-risk Evidence
```

Every Change receives a cheap deterministic security-surface classification derived from exact revision, Knowledge/component/layer, source ownership, dependency, data-flow, public-interface, and source-scope facts—not only caller-supplied type or risk. Initial surfaces include authentication/authorization, sensitive data, secrets, network/public API, dependencies/supply chain, parsing/deserialization, process execution, filesystem, cryptography, persistence/migration, infrastructure/configuration, and browser trust boundaries.

Where possible, Code Checks run first: required-field/invariant validation, dependency advisory matching, lockfile integrity, secret/SAST/AST/unsafe-API rules, configuration/IaC/container scans, authorization and migration tests, source ownership, qualified reviewer obligations, and exact scanner/tree/configuration freshness. A detector activates assurance; it does not pass security. Missing required scanner capability or stale advisory data is `indeterminate`.

Activated falsification-oriented security challenge Model Checks use isolated candidate-bound context and attempt to falsify safety through attacker goals, misuse/abuse cases, trust-boundary and authorization bypasses, privacy minimization/retention, confused-deputy paths, supply-chain assumptions, rollback, and missing controls. They return bounded attack-path, invariant, claimed severity/confidence, Evidence-gap, mitigation, and limitation observations. Their authority remains `asserted`; they cannot assign canonical CVSS, verify exploitability, accept residual risk, pass themselves, or prioritize a Change.

High/critical policy may require independent model routes, deterministic reproduction, qualified research, authenticated security approval, or explicit residual-risk acceptance. Candidate producers and security challenge Model Checks never share conversational state. Findings route through the same Change intake boundary: current Candidate defects repair current Change; independent vulnerabilities become redacted linked pending Changes; uncertainty remains an Evidence gap or `indeterminate`; duplicates reinforce existing work.

## Alignment Graph

### Layers

```text
Change Trace operations       canonical temporal history
Alignment Graph projection    deterministic and first-class
indexes and rendering         disposable
```

The entire graph artifact is derived. Every fact retains one source provenance class:

```text
canonical_binding
observed_binding
deterministic_analysis
inferred_analysis
```

No edge is independently authoritative. Contradictory, superseded, stale, partial, and unknown facts remain visible. Absence from a partial graph cannot prove non-existence.

### Snapshot identity

```text
accepted Change ledger head
+ Knowledge digest
+ protected source head
+ config and policy digests
+ graph projector version
= Alignment Graph snapshot digest
```

### Queries

Expose bounded read-only semantic query families such as:

```text
what realizes this Change
why does this source exist
which Changes affect this concept
what blocks this Change
which Evidence supports this requirement
what changed since this checkpoint
what depends on this Work Item
which outcomes followed this Change
```

Every returned fact includes snapshot digest, source provenance, underlying refs, coverage, truncation, and staleness. Do not expose arbitrary Cypher or generic graph mutation.

### OKF relationship vocabulary

OKF owns stable accepted Knowledge and authored Knowledge relationships:

```text
depends_on
constrains
refines
realizes
verifies
supersedes
derived_from
```

Ordinary Markdown links remain `references`. Reject vague `related_to`. Dynamic Change/source/evidence/delivery relationships stay in operations and graph projection. Imported OKF remains untrusted and cannot execute code, grant authority, pass Checks, or authorize exit.

### Graphify

Graphify remains optional derived analysis and a benchmark candidate. It may contribute stable IDs, typed relations, source locations, confidence, incremental hashes, and bounded analysis, but cannot become canonical storage or authority.

## Hot history, archive, and hydration

Archive only after:

```text
intended Integration completed
+ no active Change Claim
+ no active Work Item Claim
+ no pending required review or effect
+ no pending configured outcome obligation
+ terminal Trace closure recorded
```

Safe ordering:

```text
close Trace
→ write immutable archive bundle
→ push codewiki/archive
→ fetch and verify remote digest
→ remove hot copy from codewiki/state
```

Duplicate hot/archive content after a crash is safe. Premature deletion is not.

`ArchiveManifest` hashes exact segment bytes, boundaries, closure, accepted state commits, and the expected previous archive head. It cannot contain its own Git commit ID because that commit depends on manifest bytes. The verified containing archive commit is the external atomic acceptance receipt observed after push.

Compaction may create replay checkpoints but cannot summarize away canonical operations.

Inspection hydrates exact archived segments into read-only Runtime cache after Git fetch and digest verification. Reopening creates a new hot segment with `trace.reopened` referencing the archived tail and closure. Archive bytes remain immutable.

## Historical repair learning

Learning is a cycle, not another semantic Loop:

```text
completed Change history
→ derived Repair Episodes
→ derived Repair Patterns
→ bounded retrieval for future producers/workers
→ measured promotion or rejection
```

Historical guidance must be scoped, structured, bounded, provenance-bearing, and include harmful as well as successful approaches. It cannot enter independent Model Check context, disable Checks, lower thresholds, change deterministic activation, grant authority, or include raw Trace history.

Required ablations:

```text
no history
equal-token generic summary
raw history
scoped Repair Episodes
held-out-validated Repair Patterns
```

Stable guidance is promoted only through Lab ablation, sealed holdout confirmation, and a normal accountable Change into Knowledge, Loop Protocol, Check, route, config, source, or tests.

No first-class Lesson, Memory, Todo, persistent Agent, Evidence aggregate, or learning Loop is added.

## Benchmark program

### Primary stack

```text
SWE-bench Pro      long-horizon professional repository work
FeatureBench       complex feature development
SWE-bench Live     fresh multilingual generalization
CodeWiki sealed    coordination, authority, recovery, graph value, learning
```

Required supporting tracks:

```text
SWE-bench Verified   stable public compatibility
SWE-Explore          repository exploration and Alignment Graph value
SWE-Cycle            environment/implementation/test full-cycle pilot
SWE-Bench-CL         chronological learning methodology
SWE-bench Multimodal later visual-input track
```

LiveCodeBench and SWE-rebench calibrate models, not CodeWiki product value. Terminal-Bench 2 and GitTaskBench are optional worker/tool supplements. SWE-EVO is a promising evolution pilot. SWE-Marathon is deferred until mature because of cost and reward-hacking risk.

### Baselines

```text
plain Pi
OpenClaw
OpenSpec or Spec Kit
CodeWiki
```

Required CodeWiki ablations:

```text
without rolling cross-Change Planning
without independent Checks
without historical retrieval
raw history instead of Repair Episodes
Repair Episodes without held-out validation
validated Repair Patterns
without Alignment Graph queries
```

Use the same model/provider/version, tools, repository snapshot, visible tests, budgets, seeds, and evaluator conditions wherever possible. Report pass@1, false passes, escaped regressions, unauthorized effects, wall time, tokens, provider cost, repair iterations, and human interventions separately.

Any false-pass or escaped-regression increase blocks promotion regardless of aggregate score. If measured benefit does not offset ceremony, latency, cost, drift, repeated repair, lost context, false acceptance, and Integration risk, reduce CodeWiki to a thin Pi/OpenClaw extension.

Paid runs, provider mutation, leaderboard submission, publication, release, and deployment require separate explicit approval.

## Current implementation drift

### Reusable foundation already present

- strict canonical JSON and SHA-256 helpers;
- Candidate admission and identity;
- Check catalog and Loop-qualified Check identity;
- Resolved Exit Policy resolution and validation;
- immutable Check Results and Exit Reports;
- immutable Evidence Records and obligations;
- Decision research citation materialization;
- deterministic research-provenance evaluation;
- isolated claim-support Model Check protocol and Pi SDK transport.

### Material gaps

- current Trace remains local-linear with singular `parentId`, local `sequence`, formatted IDs, snapshot-heavy payloads, and local rollback;
- current hot path remains `.codewiki/traces/TRACE-CHG-<id>.jsonl`;
- provider-neutral Git CAS, verified synchronization, and distributed Change/Work Item Claim mutation are proven in v1, but production coordinator paths still use legacy local state;
- production Decision Candidate still contains only disposition and rationale;
- production Decision still uses count/presence quality checks and reruns legacy evaluation;
- native Decision research and claim-support transport are not wired into production execution;
- command, Worker Report, Integration, UI, approval, delivery, and outcome Evidence producers remain incomplete;
- generic native Change intake remains absent: legacy input is restricted to `user | runtime | lab`, requires caller-authored classification, and lacks provider-neutral review findings, structured worker discoveries, regression/scanner producers, defect/security profiles, and native expected-head admission;
- no snapshot-bound shared Backlog Triage Projection/query exposes Decision readiness, impact, effort, urgency, risk of inaction, confidence, overlap, provenance, or explainable ordering to both user and agent;
- Decision security assurance now has deterministic revision-bound security-surface activation, one prerequisite boundary Code Check, and a structured security challenge mode, but exact scanner/advisory suites, full Knowledge/source augmentation, calibrated route comparison, high/critical independent authority, intake routing, and production cutover remain incomplete;
- rolling Planning, remote freshness, state-ref CAS, and Alignment Graph projection have executable v1 foundations but production cutover remains; verified archive hydration and repair retrieval are not implemented;
- OCI and real provider/auth execution remain externally unproven.

This drift is intentional and visible. Do not add parallel authority while cutting over.

## Named clean cuts

Delete only after native replacements are authoritative:

```text
src/decision/change-quality.ts
src/planning/portfolio-quality.ts
src/implementation/quality-standards.ts
src/loops/evaluator.ts
src/loops/feedback.ts
src/loops/graph.ts
src/loops/judge-prompts.ts
src/loops/judge-provider.ts
src/loops/judge.ts
src/loops/quality-pack.ts
src/loops/quality-profile.ts
src/loops/quality-standards.ts
src/loops/runner.ts
```

The planning filename above is executable legacy debt, not accepted vocabulary.

## Frozen rejection behavior

Preserve exact messages where their contracts remain applicable:

```text
wiki_decide received unsupported input field traceId.
wiki_plan received unsupported input field changeIds.
Runtime decision candidate cannot supply runtime-owned fields: changeId.
Runtime decision candidate cannot supply runtime-owned fields: runtimeJobId
Runtime decision candidate received unsupported fields: candidateId.
Trace record TRACE-CHG-pi-mutation-smoke:archive:close:6 has unknown parent TRACE-CHG-pi-mutation-smoke:implementation:checkpoint:4.
Decision quality did not exit: active_change_overlap_accounted.
Runtime did not select Planning for current WorkState.
Implementation evidence received unsupported field <field>.
Implementation change input 0 received unsupported field planning_refs.
Implementation worker proof received unsupported field changed_files.
Resolved Exit Policy received unsupported field frozenMinimum; Runtime must derive Planning minimums from canonical Planning evidence.
```

## Execution phases

### Phase 0 — Architecture and Knowledge alignment

- [x] Ratify log-canonical, graph-native, provider-neutral Git architecture.
- [x] Resolve parent arity, identity, authority, state-commit, Planning epoch, archive, OKF relationship, contention, provenance, and clean-cut decisions.
- [x] Select benchmark stack and sealed CodeWiki-native proof strategy.
- [x] Update this plan and `.codewiki/kb/**` before production implementation.
- [x] Regenerate and validate KB indexes, OKF export, links, diagrams, source ownership, and stale vocabulary.
- [x] Preserve the documentation-only boundary and stop before production source changes.

### Phase 1 — Executable protocol model

- [x] Specify exact v1 operation, Planning epoch, state manifest, and archive schemas.
- [x] Freeze canonical serialization and identity fixtures.
- [x] Implement a pure deterministic reducer.
- [x] Implement a pure versioned Alignment Graph projector.
- [x] Prove full/incremental replay equivalence.
- [x] Add adversarial and property tests for malformed bytes, hash mismatch, unknown versions, missing parents, unauthorized actors, stale bases, duplicate operations, contradictions, and projection equivalence.

### Phase 2 — Disposable two-clone Git experiment

- [x] Use two disposable clones and one bare remote.
- [x] Race independent Changes.
- [x] Race same-Change writes.
- [x] Race Change Claim acquisition.
- [x] Race Work Item Claim acquisition.
- [x] Reject stale expected-head pushes.
- [x] Prove atomic Planning batches.
- [x] Exercise offline reconnect and crash recovery.
- [x] Prove duplicate/reordered notifications converge.
- [x] Measure contention before considering ref partitioning.

### Phase 3 — Read-only remote synchronization

- [x] Fetch and verify `codewiki/state` without mutation.
- [x] Compute team snapshot identity.
- [x] Expose `fresh | stale | offline`.
- [x] Rebuild local hot materialization, WorkState, and Alignment Graph.
- [x] Add poll-based invalidation before optional webhooks.
- [x] Block unsafe distributed mutation when not fresh.

### Phase 4 — Guarded distributed mutation

- [x] Add exact expected-head state append.
- [x] Add Change Claim acquire/release/authenticated takeover.
- [x] Add Work Item Claim acquire/release/authenticated takeover.
- [x] Add stale rejection fetch/replay/reevaluation.
- [x] Add crash-safe reconciliation and idempotent acceptance.
- [x] Keep automatic expiry disabled without trusted time.

### Phase 5 — Rolling Planning

- [x] Create immutable Planning Candidate and `PlanningEpochRecord` schemas.
- [x] Bind each participating Change atomically.
- [x] Preserve safe active Work Items and Assignments.
- [x] Require explicit pause/migration/cancellation/block/route-back for invalidated work.
- [x] Derive safe execution frontier from fresh WorkState.
- [x] Replace mutable Planning/backlog assumptions with projections.

### Phase 6 — Alignment Graph and bounded queries

- [x] Implement deterministic graph facts for every operation kind.
- [x] Bind graph snapshot to state, Knowledge, source, config/policy, and projector version.
- [x] Emit per-fact provenance.
- [x] Add bounded read-only semantic query families.
- [x] Report coverage, truncation, staleness, contradictions, and underlying refs.
- [x] Complete OKF v0.2 compatibility and closed authored relationship vocabulary.
- [x] Benchmark plain search, Pi-Lens, OKF/source projection, Alignment Graph, and optional Graphify analysis.

Phase 6 uses Alignment Graph projector `1.2.0`, deterministic OKF/source augmentation, semantic/content digest distinction for inline artifacts, and six closed query families capped at four hops and 200 facts. The colocated `src/benchmarks/**` harness binds every method to one snapshot, case set, and result cap; reports recall, precision, false-positive rate, success-at-one, and wall time separately; and exposes missing or failed adapters. Graphify remains explicitly unavailable until its optional dependencies are installed, so no Graphify quality claim is made.

### Phase 7 — Native Change intake, triage, and Loop cuts

- [x] Inline bounded Candidate, Resolved Exit Policy, Evidence Record, Check Result, Exit Report, and Runtime Route artifacts directly in typed operation payloads; validate complete content and artifact-owned identities, reject dangling `state:objects/*` refs, and keep large/private bytes external.
- [x] Admit one exact native Decision operation chain through fresh synchronized expected-head Git CAS, reject stale team/WorkState bindings without blind retry, resynchronize, and verify every accepted operation identity.
- [ ] Replace legacy `src/changes/intake.ts` with the closed source-specific `ChangeIntakeMaterial` union under `src/changes/intake/**`; do not add `src/triage/**` or a compatibility alias.
- [ ] Add Runtime-owned source authentication/correlation, privacy sanitation, normalization, idempotency, deduplication, current-scope versus independent-scope routing, and exact expected-head Git admission.
- [ ] Add Change-revision defect/security profile fields that keep severity, likelihood, exposure, risk, priority, and confidence distinct and preserve qualified SARIF/CWE/CVE/GHSA/OSV/CVSS/KEV refs without trusting them as authority.
- [ ] Add user-suggestion, provider-neutral PR-review, Worker Report discovery, regression/scanner, delivery/outcome, and Knowledge-drift intake producers.
- [ ] Implement `src/changes/triage/**` as one snapshot-bound Backlog Triage Projection with provenance-bearing readiness, urgency, impact, effort, risk-of-inaction, confidence, overlap, freshness, Pareto/frontier, fairness, and explainable ordering dimensions.
- [ ] Expose one bounded user/agent triage query and Backlog list/detail view; no opaque overall score, mutable priority, arbitrary query DSL, or canonical triage store.
- [x] Add deterministic revision-bound security-surface classification, initial targeted Decision Code Check activation, and an isolated structured security challenge Model Check contract.
- [ ] Complete scanner/advisory adapters, Knowledge/source augmentation, sealed route calibration, finding intake, and stronger independent Evidence/authority for high/critical residual risk.
- [x] Ratify closed Check Types, repository-bound Custom Checks, type-specific Check Evaluators, bounded text/applicability contracts, protected-base policy safety, Dashboard-first rollout, atomic per-Check Results, and calibrated physical call topology.
- [x] Clean-cut broad `ProjectCheckRegistration` into bounded `CustomCheckProposal` and Runtime-materialized definition/revision contracts under `src/loop-exit/custom-checks/**`; persist complete definitions in project config, materialize active definitions through Check Catalog `2.0.0`, and add no alias, dual registration path, caller-authored executor, or migration shim.
- [ ] Persist bounded Custom Checks in protected Git-backed project config; implement exact digest/CAS, Runtime-owned identity/revision, deterministic applicability, draft/observe/warn/approved-require rollout, policy-change review, next-snapshot activation, and protected-base anti-self-disable behavior.
- [ ] Add Dashboard Custom Check library/editor grouped by Check Type, activation/Evidence/cost preview, generated config diff, calibration view, exact Assessment/Result history, and guarded promotion commands shared with CLI/API.
- [ ] Implement Check Evaluators with exact Candidate/Custom Check/Evidence/prerequisite/route bindings, one-to-one Assessment validation, atomic Evidence and Result materialization, bounded repair output, and no producer/worker conversational state.
- [ ] Run sealed focused-call versus per-type batch versus deterministic-shard comparisons; retain focused calls or isolate high-risk Checks unless batching preserves safety and improves measured latency/cost.
- [ ] Wire Decision research collection and claim-support transport into production Decision.
- [ ] Replace Decision count checks with native Candidate/Evidence/Result/Report path.
- [ ] Create native Planning Candidate/Evidence/Result/Report path.
- [ ] Create native Implementation Candidate/Evidence/Result/Report path.
- [ ] Cut command, Worker Report, Integration, preview, approval, delivery, and outcome observations over to closed Evidence contracts.
- [x] Add bounded Check fan-out/fan-in, cancellation, exact caching, immutable Reports, and typed repair/escalation.
- [ ] Delete legacy Quality modules only after parity and replacement tests pass.

Phase 7 runner foundation uses separate bounded Code/Model pools, explicit Check dependencies, timeout/cancellation propagation, complete active-Result fan-in, failure-dominant immutable Reports, exact in-memory cache identity, and typed repair/retry summaries. Operationally indeterminate Results are never cached, specialized closed protocols may supply only exact precomputed Results, and runner guidance cannot select Runtime Route. Catalog-declared executor-produced Evidence is now validated, bound into Results, returned for persistence, and excluded from caching until persisted Evidence is supplied.

Custom Check executable foundation now replaces broad project registration with bounded project-authored requirements under ten closed Check Types. Runtime derives stable id/revision/content digest, validates immutable lifecycle and staged rollout, persists only complete definitions in project config, materializes active definitions as project-authority Model Checks through Check Catalog `2.0.0`, applies closed loop/Change-kind/layer/path applicability, and binds exact type/evaluator/Knowledge metadata into policy. Shared and native Decision runtimes accept exact definitions; Decision Model Check protocol `1.2.0` transports their exact metadata and uses the structured challenge envelope for security/privacy types. Production config-to-runtime loading, protected-base selection, dedicated Dashboard commands/UI, type route binding, Knowledge-content resolution, batching calibration, and Planning/Implementation evaluator cuts remain pending.

The native Decision path now separates the producer's strict disposition/rationale proposal from Runtime-materialized full Candidate content, binds the exact persisted revision and WorkState, resolves the closed policy, evaluates all deterministic Decision Code Checks, runs independent tool-free general Model Check requests, preserves uncertain assessments across Evidence replay, materializes exact authenticated approval receipts, and deterministically resolves persisted Decision Evidence. Security assurance now derives a content-addressed twelve-surface classification from the exact semantic revision with explicit refs-only Knowledge/source coverage, binds it into policy activation and parameters, requires `security_surface_requirements_complete` before model execution, and uses Decision Model Check protocol `1.2.0` for exact considered-Evidence echo and optional exact Custom Check metadata, three-valued basis validation, and asserted structured security challenge findings. Runtime still derives every Check Result and Exit Report; no final model reviewer can override Code or human-authority Results. The Pi SDK general Model Check transport now uses a shared fresh-session JSON runtime with exact routes, no tools or resource discovery, bounded responses/timeouts, redacted failures, and cleanup. Activated research provenance and claim-support Checks now run in the same dependency-aware native runner, drive the closed Pi claim-support transport, preserve uncertainty in Evidence, and replay without another provider call or Report drift. Runtime now derives an immutable Candidate/Report-bound Decision route only after assurance: approval to Planning, defer or indeterminate assurance to waiting, failed assurance to repair, rejection to complete, and withdrawal to withdrawn. This route grants no effect before canonical admission. The native operation builder now emits and replay-validates the exact append-only Decision chain from attempt start through Candidate, policy, Evidence, Results, Report, Route, and attempt end, rejecting stale revision/WorkState binding, malformed full artifact identities, and unavailable Result Evidence before operation creation. Bounded artifacts live inline in operation bytes rather than dangling object refs. Synchronized Git admission now binds a fresh team snapshot, accepts the complete chain atomically under expected-head CAS, rejects stale mutation bases, and verifies all operation identities after resynchronization. The current production facade remains legacy until external research collection, native `runWikiDecide()` wiring, and old-path deletion are complete, so the remaining Decision cut checkboxes stay open.

### Phase 8 — UI assurance and Integration

- [ ] Add `ui_preview_evidence_valid`.
- [ ] Add independent `ui_experience_reviewed`.
- [ ] Add authenticated `ui_experience_approved`.
- [ ] Bind review to exact Candidate/tree/head/preview/media/bundle identity.
- [ ] Re-evaluate final assurance against exact integrated tree.
- [ ] Keep merge, push, publication, release, deployment, and outcome observation separately authorized.

### Phase 9 — Archive and repair learning

- [ ] Enforce terminal archive eligibility.
- [ ] Write immutable archive segments and manifests.
- [ ] Push, fetch, and verify archive before hot removal.
- [ ] Hydrate read-only history through provider-neutral Git.
- [ ] Reopen through a new hot segment referencing archived closure.
- [ ] Derive Repair Episodes and Repair Patterns.
- [ ] Add bounded retrieval with negative-transfer controls.
- [ ] Run no-history/summary/raw/Episode/Pattern ablations and sealed holdouts.

### Phase 10 — Clean Trace cut

- [ ] Replace `src/traces/**`, `src/changes/change-trace.ts`, and `src/changes/trace-store.ts` with v1 protocol implementation.
- [ ] Move hot canonical materialization to `.codewiki/changes/**` on `codewiki/state`.
- [ ] Delete legacy schema, parser, append, migration, alias, and dual-contract tests.
- [ ] Delete obsolete source-checkout dogfood state while preserving `.codewiki/kb/**`.
- [ ] Preserve Git history as checkpoint evidence only.

### Phase 11 — External proof and release gates

- [ ] Build and pack reviewed candidates.
- [ ] Install only in disposable external projects with isolated Pi settings.
- [ ] Verify prompts, tools, commands, dashboard, lifecycle writes, failures, and cleanup.
- [ ] Prove real provider/auth and OCI execution.
- [ ] Resolve Pi peer-range and optional dependency findings.
- [ ] Run sealed CodeWiki-native coordination/learning suite.
- [ ] Run approved external benchmark subsets, then full release gates.
- [ ] Publish or release only after explicit maintainer approval.
- [ ] Reconsider source-repository dogfood only after stable external gates pass.

## Verification requirements

Every implementation slice must satisfy relevant checks:

```text
npm test
npm run build
npm run test:pack
npm run test:readiness
npm run test:pi-sdk-package
npm run test:pi-install
npm run test:external-lifecycle
npm run test:external-failures
npm audit --omit=dev
LSP/Pi-Lens diagnostics
git diff --check
```

Use narrower tests while iterating; run full gates before each green production checkpoint. Real provider, OCI, paid benchmark, publication, release, deployment, and provider mutation require separate approval.

## Completion criteria

Refactor is complete only when:

1. exactly three semantic Loops use one native Candidate/Evidence/Policy/Check/Result/Report path;
2. every accepted Change fact is a valid content-addressed v1 operation;
3. two machines converge through provider-neutral Git expected-head CAS;
4. WorkState and Alignment Graph full/incremental replay are equivalent;
5. rolling Planning safely incorporates newly accepted Changes without silently rewriting active Assignments;
6. Change Claims and Work Item Claims prevent conflicting accepted ownership without client-clock authority;
7. final Implementation assurance evaluates exact integrated content;
8. hot/archive/hydration/reopen behavior cannot lose canonical history;
9. historical guidance improves sealed sequential work without safety regression or negative transfer;
10. external coding benchmarks and CodeWiki-native fixtures show enough value to justify Runtime ceremony and cost;
11. legacy Trace/Quality/dogfood compatibility machinery is deleted;
12. packed external projects—not this source checkout—prove extension behavior and production gates.
