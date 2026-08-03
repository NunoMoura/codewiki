# CodeWiki Refactoring Plan

## Status

Architecture review approved on 2026-07-30. This plan replaces the earlier local-linear Trace and partial multi-file recovery direction with a versioned clean-cut Change Trace Protocol, provider-neutral Git synchronization, rolling Planning, deterministic Alignment Graph projection, hot/archive handling, and measured repair learning.

Latest synchronized executable checkpoint before this documentation cut:

```text
2710de5 refactor: simplify decision selection admission
979 tests across 171 suites
979 passed, 0 failed
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

Backlog triage is a snapshot-bound disposable projection over pending/deferred Changes, WorkState, Alignment Graph facts, source observations, config, and policy. It exposes provenance-bearing Decision readiness, urgency, expected impact/improvement, estimated effort, risk of inaction, change risk, confidence, overlap, freshness, work unblocked, and explainable ordering. Unknown remains unknown. Evidence authority (`asserted | observed | verified | approved`) remains distinct from graph/projection provenance (`canonical_binding | observed_binding | deterministic_analysis | inferred_analysis`). No opaque overall score may hide safety or uncertainty. Accepted User Standard preferences may add protected deterministic ordering clauses, but models may only materialize source-bound dimensions/relationships and never final rank.

Backlog ordering recommends Decision attention only. An authenticated user selects any eligible exact Change revision and binds the current triage/policy snapshot to start one independent Decision attempt; selection grants no disposition. Decision accepts exact Change meaning independently; rolling Planning decomposes approved Changes and alone owns Work Item execution ordering across current accepted work.

Target source placement keeps this inside the Change domain rather than creating a fourth top-level subsystem:

```text
src/changes/intake/**
src/changes/triage/**
```

Runtime orchestration remains under `src/runtime/**`. The clean cut replaces legacy `src/changes/intake.ts`; no `src/triage/**`, compatibility alias, dual contract, or separate triage authority is added.

## Change Trace Protocol

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
    version: "2.0.0";
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
resource_usage
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

## User Standards, Checks, and Check Evaluators

Users provide source-backed Standards as bounded inline text or exact user-selected source snapshots. Company policy, execution guidance, quality criteria, resource instructions, design-system rules, API conventions, accessibility expectations, compatibility promises, and delivery requirements describe Standard content rather than separate artifact types. Direct requirement entry is an inline User Standard, not a parallel manual-Check path. Runtime owns source retrieval, sanitation, exact snapshot/content identity, freshness, credential isolation, and privacy handling.

CodeWiki supplies Default Checks and distills accepted User Standards into atomic Custom Checks. Default/custom requirement origin, CodeWiki/project authority, `code | model` evaluation, Check Type, Loop applicability, and qualitative/quantitative measurement remain independent. Check Types own eligible Loops, deterministic applicability, prerequisite Code Checks, Evidence profile, Model Check protocol/schema, approved deterministic templates, route capability, limits, and repair shape. Initial families cover intent/Product, research/claims, architecture/API, security/privacy, accessibility, design system, library compatibility, Implementation quality, delivery/release, and organization policy.

Every Custom Check binds exact accepted Standard snapshots and passages. Custom Model Checks use bounded independent Check Evaluators. Custom Code Checks instantiate only approved deterministic templates/adapters with structured parameters; projects and distillation models never inject JavaScript, shell, executable policy, arbitrary prompts, tools, response schemas, dependencies, or verdict logic. Hard resource Custom Code Checks may derive matching Runtime preflight, metering, and cancellation guards from the same exact Check/policy binding before usage Evidence yields the final Result. Missing required measurement or enforcement capability blocks the route or remains `indeterminate`; a model cannot attest quantitative usage.

Distillation produces a protected review bundle containing Default Check coverage, proposed atomic Custom Model/Code Checks, exact source passages, closed applicability, Evidence/guard needs, and unsupported, ambiguous, contradictory, stale, or excluded clauses. Distillation cannot activate Standards or Checks, choose authority, assign Results, or mutate protected config. The distillation session shares no conversation with later Check Evaluators. Accepted Standard snapshots and generated Check configuration remain protected Git-backed `.codewiki/config.json` truth. A policy-changing Candidate remains evaluated under the protected base and cannot weaken its own assurance; accepted changes become authoritative only from the next protected snapshot.

A Standard preference may compile into protected deterministic Backlog Triage behavior without becoming a Check: lower priority is not failure. Planning does not independently reinterpret broad company sources; it verifies approved Change meaning and exact policy-derived execution requirements. If decomposition exposes an impossible invariant, Runtime routes the semantic conflict to Decision rather than allowing Planning to waive policy.

Each Model Check receives one separate `supported | unsupported | uncertain` Assessment through a CodeWiki-owned type-specific Check Evaluator; Runtime derives one separate `pass | fail | indeterminate` Result. Physical execution may use one focused call per Check, one type-level call, or deterministic bounded batches without merging semantic identity. Per-type batching is promoted only after fair sealed comparison against focused calls shows no safety regression across false passes, escaped critical defects, false failures, `indeterminate`, repair usefulness, prompt-injection resistance, latency, tokens/cost, retries, and intervention. One focused call per logical Model Check remains baseline until then.

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
- [x] Admit authenticated canonical Decision attempt start, then its exact Candidate-to-attempt-end continuation through fresh synchronized expected-head Git CAS; reject stale team/WorkState bindings without blind retry, resynchronize, and verify every accepted operation identity.
- [x] Replace legacy `src/changes/intake.ts` with the closed source-specific `ChangeIntakeMaterial` union under `src/changes/intake/**`; do not add `src/triage/**` or a compatibility alias.
- [x] Add Runtime-owned source authentication/correlation, privacy sanitation, normalization, idempotency, deduplication, current-scope versus independent-scope routing, and exact expected-head Git admission.
- [x] Clean-cut Change Trace Protocol `2.0.0` to a complete normalized semantic revision covering intent, alternatives, classification, impact, Knowledge propagation, outcomes, delivery constraints, Evidence expectations, safety, acceptance requirements, and optional defect/security profile fields; keep severity, likelihood, exposure, risk, priority, and confidence distinct and preserve qualified SARIF/CWE/CVE/GHSA/OSV/CVSS/KEV refs without trusting them as authority.
- [x] Add user-suggestion, provider-neutral PR-review, Worker Report discovery, regression/scanner, delivery/outcome, and Knowledge-drift intake producers.
- [x] Implement `src/changes/triage/**` as one snapshot-bound Backlog Triage Projection with provenance-bearing readiness, urgency, impact, effort, risk-of-inaction, confidence, overlap, freshness, Pareto/frontier, fairness, and explainable ordering dimensions.
- [x] Expose one bounded user/agent triage query contract through authenticated coordinator/Pi clients, read-only `wiki_attention`, `/wiki-attention`, and explicit user-only `/wiki-select`; no opaque overall score, mutable priority, arbitrary query DSL, model-callable selection, or canonical triage store. Defer Backlog list/detail rendering to the final Dashboard phase.
- [x] Add authenticated exact-revision user selection through one projection digest, append canonical `loop.attempt_started`, and use its operation ID as the sole Decision job key; remove automatic pending-Change Decision selection without an alias, receipt store, or second queue.
- [x] Add deterministic revision-bound security-surface classification, initial targeted Decision Code Check activation, and an isolated structured security challenge Model Check contract.
- [x] Add a closed scanner/advisory adapter protocol, deterministic surface-to-scanner selection, exact Candidate/source/tree/environment/config/advisory Evidence, stale or unavailable `indeterminate` outcomes, dependency-bound Model Check input, and sanitized scanner-finding intake.
- [x] Add executable `codewiki.verification-capability-matrix@1.0.0` over every Loop-qualified Check, exact Catalog/config identity, execution availability, Evidence obligations, trusted-producer/capability gaps, and potential standard formats. Formats remain Evidence-only and cannot grant Results; all standard adapters are explicitly missing until implemented.
- [x] Add bounded `codewiki.evidence-adapter.sarif@1.0.0`: exact raw-byte/tool/source/request/invocation/environment/configuration/advisory/execution binding, project-relative location sanitation, message digests, bounded compact findings, partial/unknown preservation, canonical command/source Evidence material, and no authority or verdict input.
- [x] Add bounded `codewiki.evidence-adapter.junit@1.0.0`: safe common-dialect XML validation, exact runner/source/test-selection/expected-count/request/invocation/environment/configuration/execution binding, bounded aggregate/non-passing diagnostics, private-detail digests, incomplete-run preservation, canonical command Evidence material, and no authority or verdict input.
- [x] Add bounded `codewiki.evidence-adapter.lcov@1.0.0` and `codewiki.evidence-adapter.cobertura@1.0.0`: exact source/scope/required-path/tool/request/invocation/environment/configuration/execution binding, detailed count derivation, declared-total cross-checks, private-identity digests, incomplete-report preservation, canonical command/source Evidence material, and no threshold or verdict authority.
- [x] Add bounded `codewiki.evidence-adapter.provider-check-receipt@1.0.0`: trusted-connector canonical JSON, exact provider/repository/source/head/Check/config/authentication/retrieval binding, digest-only provider facts, complete/pending/unavailable preservation, verified authority ceiling, canonical command Evidence material, and no Result, approval, Integration, or delivery authority.
- [x] Add bounded `codewiki.evidence-adapter.cyclonedx@1.0.0`, `codewiki.evidence-adapter.spdx@1.0.0`, `codewiki.evidence-adapter.pact@1.0.0`, and `codewiki.evidence-adapter.openapi@1.0.0`: exact source/scope/path/required-identity/tool/request/invocation/environment/configuration/execution binding, safe JSON/YAML admission, digest-only inventory/contract facts, incomplete-reference/truncation preservation, observed authority ceilings, and no Result authority. Clean-cut Verification Capability Matrix to `2.0.0` with nine implemented core formats; keep Playwright on JUnit plus UI capture and axe on SARIF rather than adding tool-native core schemas.
- [x] Add closed `codewiki.evidence-adapter.materialization@1.0.0` to verify accepted adapter receipts, fix Runtime-owned producer/authority/coverage/freshness/sensitivity/provenance, materialize exact command/source Evidence Records, and reduce exact accepted protocols through declarative obligations without granting Results. Preserve complete failing observations as ready Check input and partial, unavailable, drifted, tampered, wrong-protocol, or duplicate Evidence as missing or `indeterminate`.
- [x] Add closed `codewiki.standard-evidence-check-evaluation@1.0.0` for exact complete JUnit test policy, LCOV/Cobertura basis-point thresholds, SARIF blocked levels, provider accepted conclusions, and SBOM/contract required-identity presence. Reject partial-permitting obligations, wrong adapter families, selector/bundle drift, and empty denominators; emit only digest-bound Check observations while Runtime retains Result authority.
- [x] Add `codewiki.standard-evidence-check-executor@1.0.0`, advance it to `1.1.0`, clean-cut Check Catalog to `7.0.0`, and install report-bound capabilities into native Loop Exit Runtime. Require protected policy selector equality, exact Candidate/source identity, complete ownership of artifact-required obligations, no duplicate Check capability, no report-bound caching, and Runtime-only Result construction. Loop Exit Runner `1.2.0` permits byte-identical shared bundle fan-out within one Loop, records each Evidence identity once, preserves independent obligation resolution and Results, reuses exact supplied records during replay, and rejects inconsistent bindings or same-id content conflicts without adding an Evidence store.
- [x] Add CodeWiki-owned `codewiki.production-security-collector@1.0.0` profiles for fixed Semgrep SARIF static analysis and offline Trivy filesystem/advisory SARIF. Bind exact executable bytes/version, Semgrep configuration or Trivy database, source snapshot/tree/environment, fixed invocation, bounded output/time, pre/post-run identity checks, credential-free environment, structured no-shell arguments, sanitized finding intake, and explicit unavailable/partial behavior without exposing an arbitrary command or plugin boundary.
- [x] Fan one exact `codewiki.security-scanner-suite@2.0.0` Evidence substrate into independent protected `static_analysis_findings_absent`, `dependency_advisories_absent`, `credential_exposure_absent`, `authorization_controls_verified`, and `persistence_safety_verified` Decision Code Checks through `codewiki.atomic-security-scanner-check@1.0.0`. Each Check depends on `security_scanners_valid`, filters only its exact scanner-family/request Evidence, resolves separate command/source obligations, and receives its own Runtime-created Result; complete families may pass while another fails or remains `indeterminate`, and scanner adapters still grant no Result.
- [ ] Add closed scanner families only for distinct measured Check needs and advance scanner-suite protocol identity whenever the vocabulary changes.
- [ ] Run sealed scanner/evaluator route calibration with measured false pass/failure, escaped critical defects, `indeterminate`, latency, and cost.
- [ ] Add stronger independent Evidence and separately authenticated authority for high/critical residual risk.
- [x] Ratify closed Check Types, repository-bound Custom Checks, type-specific Check Evaluators, bounded text/applicability contracts, protected-base policy safety, Dashboard-first lifecycle management, required active Checks, atomic per-Check Results, and calibrated physical call topology.
- [x] Ratify source-backed User Standards as the only project-specific assurance input; Default versus Custom origin and Code versus Model evaluation remain orthogonal, company/execution/quality policy names only Standard content, ordering preferences remain non-Check triage behavior, and hard resource Code Checks may derive matching Runtime guards.
- [x] Clean-cut broad `ProjectCheckRegistration` into bounded `CustomCheckProposal` and Runtime-materialized stable-id/definition-digest contracts under `src/loop-exit/custom-checks/**`; persist complete definitions in project config, materialize active definitions as required through Check Catalog `4.0.0`, and add no alias, dual registration path, caller-authored executor, or migration shim.
- [x] Add guarded Custom Check create/update/activate/disable Runtime commands, complete-project expected-config-digest CAS, exact protected Git-head loading, authenticated authority verification, content-addressed mutation receipts, next-protected-snapshot activation, and protected-base anti-self-disable bindings.
- [x] Complete accepted protected-branch Git mutation and required policy-change review orchestration around the guarded command receipt: exact authenticated review `pass`, separate acceptance authority, repository/ref/config identity, deterministic config-only child commit, expected-head Git CAS, exact post-push verification, stale rejection, and idempotent exact replay.
- [x] Clean-cut direct source-unbound `CustomCheckProposal` into bounded User Standard source snapshots, stable source/Standard identity, exact passage bindings, and Standard-derived Custom Check definitions; advance schema/protocol identities with no alias or dual path.
- [x] Add isolated source distillation with Runtime-owned read-only retrieval/sanitation, Default Check coverage, atomic Model/Code Check proposals, unsupported/conflict preservation, and exact distillation receipts; keep policy activation behind the separately tracked guarded bundle review/acceptance cut.
- [x] Add approved deterministic Custom Code Check templates with closed structured parameters, exact template/config identity, executor capability admission, quantitative telemetry, and matching preflight/meter/cancellation guards.
- [x] Compile accepted non-pass/fail Standard preferences into exact protected Backlog Triage policy bindings without model-authored rank, opaque score, canonical queue mutation, or Planning priority.
- [x] Extend guarded mutation, policy review, protected Git acceptance, config snapshot, and Decision Model Check request bindings from source-unbound Custom Checks to atomic User Standard plus generated-Check bundles.
- [ ] Implement Check Evaluators with exact Candidate/User Standard/Custom Check/Evidence/prerequisite/route bindings, one-to-one Assessment validation, atomic Evidence and Result materialization, bounded repair output, and no distiller/producer/worker conversational state.
- [ ] Run sealed focused-call versus per-type batch versus deterministic-shard comparisons; retain focused calls or isolate high-risk Checks unless batching preserves safety and improves measured latency/cost.
- [ ] Wire Decision research collection and claim-support transport into production Decision.
- [ ] Replace Decision count checks with native Candidate/Evidence/Result/Report path.
- [ ] Create native Planning Candidate/Evidence/Result/Report path.
- [ ] Create native Implementation Candidate/Evidence/Result/Report path.
- [ ] Cut command, Worker Report, Integration, preview, approval, delivery, and outcome observations over to closed Evidence contracts.
- [x] Add bounded Check fan-out/fan-in, cancellation, exact caching, immutable Reports, and typed repair/escalation.
- [ ] Delete legacy Quality modules only after parity and replacement tests pass.

Native intake now clean-cuts the legacy single-file `user | runtime | lab` feedback path into `codewiki.change-intake-material@1.1.0` under `src/changes/intake/**`. Eight strict source members carry normalized bounded semantic content and exact source bindings without caller-owned authority fields. Change Trace Protocol `2.0.0` persists the complete normalized material as an identity-checked inline artifact on proposal or feedback operations and clean-cuts skeletal revision fields to one immutable semantic revision containing intent/alternatives, Runtime-owned source-family classification, impact, Knowledge propagation, outcomes, delivery constraints, Evidence expectations, safety, acceptance requirements, and optional normalized defect/security profile identity. The public Runtime factory verifies source authentication Evidence, validates fresh-state correlation, records durable request/source/semantic fingerprints, replays exact accepted requests, reinforces deterministic matches, routes current feedback or linked independent discovery, pushes under expected-head Git CAS, and verifies accepted operation identities. Closed user-suggestion, provider-neutral pull-request review, Worker Report discovery, regression, scanner, delivery/outcome Evidence, and Knowledge-drift producer adapters now emit only normalized intake material; Pi process Worker Reports preserve up to sixteen bounded discovery proposals while Runtime injects exact Assignment/Claim/tree bindings before admission. `codewiki.backlog-triage-projection@2.0.0` now rebuilds one content-addressed Decision-attention view from exact pending/deferred Change revisions, WorkState, Alignment Graph, intake provenance, optional snapshot-bound estimates, and `codewiki.backlog-triage-policy@1.0.0`. It preserves unknown dimensions, Evidence authority, graph provenance classes, exact overlap/blocking facts, freshness, Pareto membership, bounded age fairness, protected source-bound preference reasons, and tiered ordering without producing an overall score or priority. `codewiki.backlog-triage-query@2.0.0` provides one strict shared user/agent filter and ordering contract capped at 100 results; unsupported DSL/priority fields, stale identity, policy/candidate tampering, and unsafe bounds fail closed. `codewiki.decision-attention-selection@2.0.0` now carries only one principal-scoped idempotency key, exact Change/revision identity, and the projection digest that already commits native WorkState, triage Candidates, graph, protected config, and compiled policy. Runtime resolves authority from trusted caller metadata, revalidates context after authorization, and appends canonical `loop.attempt_started` before scheduling. Its authority/base/revision/private-digest fields are the durable selection record and its operation ID is the sole coordinator job key. Same principal/key and revision replay that operation; changed semantic input conflicts. Revision-derived Change/Knowledge/source/component refs preserve overlap serialization and canonical attempt state drives recovery. The prior standalone receipt, repeated nested command/binding digests, process-local receipt memory, duplicate job identity, and broad selection adapter were removed without aliases. Generic triggers and candidate submission cannot impersonate selection; pending Changes leave Decision quiescent. Native Candidate/evaluator/continuation contracts now consume exact ProjectWorkState, and a host-configured executor runs the selected attempt through synchronized Git admission and canonical recovery. `createDecisionGitAdmission()` now supplies fresh protected-config-bound triage context loading, short-lived projection identity reuse across authorization, exact expected-WorkState attempt append, stale rejection, and canonical post-push verification. The native Pi producer now validates the closed authority-free request, runs exactly one isolated read-only bounded session, and propagates cancellation through abort/disposal. `codewiki.pi-native-decision-host@1.0.0` now composes those pieces from mandatory trusted repository/project/replay/Runtime-authority inputs, resolves only approved project-local Pi connections to hashed principals, supports additional project denial, and recovers terminal work across daemon restart without reinvocation. Authenticated `/v1/runtime/decision-attention` now bootstraps the current bounded query result and validates strict projection-bound follow-ups; coordinator/Pi clients, read-only `wiki_attention`, and `/wiki-attention` expose it. Explicit user `/wiki-select` alone submits one exact command with a fresh idempotency key; no model-callable selection tool or caller authority exists. External identity and provider collection remain pending. Fixed Semgrep and offline Trivy production scanner collection is now implemented; trusted host installation/path selection and external real-tool proof remain separate deployment gates.

Phase 7 runner foundation uses separate bounded Code/Model pools, explicit Check dependencies, timeout/cancellation propagation, complete active-Result fan-in, failure-dominant immutable Reports, exact in-memory cache identity, and typed repair/retry summaries. Operationally indeterminate Results are never cached, executors whose results depend on external Runtime state may disable generic Result caching, specialized closed protocols may supply only exact precomputed Results, and runner guidance cannot select Runtime Route. Catalog-declared executor-produced Evidence is now validated, bound into Results, and returned for canonical recording. Runner `1.2.0` de-duplicates only byte-identical content-addressed records across independent Checks or exact replay input; conflicting content fails closed, while every Check retains its own obligation resolution and Result. This is run-level coordination over caller-supplied or newly produced records, not a central Evidence store.

User Standard schema `1.0.0` now materializes immutable bounded inline or HTTPS source snapshots with exact observed time, normalized content digest, atomic passage ids, stable identity, credential/control/URI rejection, canonical limits, and tamper validation. Project config persists complete `userStandards[]`, protected `triagePreferences[]`, and `customChecks[]`. Custom Check schema `4.0.0` rejects every source-unbound proposal, requires exact accepted Standard id/digest/passage refs, and binds either Model evaluation or one approved deterministic Code template. Protected configuration schema `2.0.0` binds both arrays into one digest/snapshot; Check Catalog `8.0.0`, Resolved Exit Policy, and Decision Model Check Request Protocol `4.0.0` preserve those refs through activation and independent model input. Guarded `codewiki.custom-check-mutation@1.0.0` commands now create, update, activate, and disable under complete-project config CAS, exact current/protected config and source-head bindings, authenticated authority verification, idempotency, and content-addressed receipts. The project adapter writes and verifies the next working-tree config under an exclusive lock and loads authoritative policy from an exact protected Git commit. `codewiki.custom-check-policy-review@1.0.0` binds required three-valued review to that exact mutation and proposed config; `codewiki.custom-check-policy-acceptance@1.0.0` requires review `pass` plus separate authenticated acceptance authority, builds a deterministic config-only child commit, pushes the configured protected ref under exact expected-head Git CAS, re-observes accepted bytes, rejects drift/stale races without retry, and replays an already accepted exact commit. Shared and native Decision runtimes reject raw definitions and accept only a validated protected-base snapshot; active policy and Decision Model Check Request Protocol `3.0.0` bind exact protected source/config, Custom Check config, id, and `definitionDigest` identities. Failing or indeterminate active Custom Checks block exit and feed bounded repair output. Guarded Custom Check mutation, review, and protected acceptance protocols advance to `2.0.0` and preserve complete User Standards in exact config identity, but current commands can mutate only Checks whose accepted Standards already exist. User Standard Source Retrieval Protocol `1.0.0` and Distillation Protocol `1.0.0` now bind sanitized inline or adapter-collected HTTPS snapshots, explicit unavailable states, exact kernel Default Check coverage, closed Check Types, one configured route, source-exact clauses, Custom Model proposals, inert Custom Code intents, quantitative guard requirements, triage preferences, unresolved clauses, and tamper-checked receipts. The Pi adapter runs one fresh tool-free JSON session without source credentials. Guarded Mutation, Policy Review, and Protected Acceptance Protocols `3.0.0` now admit one exact completed distillation receipt plus an authenticated bounded generated-proposal selection, add the immutable Standard and selected draft Checks through one complete-config CAS, bind full source-to-Check/unresolved review context into receipts, and accept only the reviewed config-only child commit under exact protected-head Git CAS. Standard-only bundles are valid; distillation never activates generated Checks. Mutation, Policy Review, and Protected Acceptance Protocols `4.0.0` carry exact selected Custom Code proposal-to-template bindings and activation capability snapshot digests. `codewiki.custom-code-template@1.0.0` provides only `resource_usage_limit` for closed token, cost, latency, changed-file, and trace-byte metrics over exact Decision, Planning, or Implementation scopes. Capability Snapshot Protocol `1.0.0` admits exact model-usage, Git-change, or trace-size meters; Evidence schema `1.2.0` adds exact candidate-bound complete-window `resource_usage`; Check Catalog `8.0.0` retains the deterministic executor; and Runtime derives matching fail-closed preflight, meter, cancellation, and route-admission guards. Distillation Protocol `2.0.0`, protected configuration schema `3.0.0`, and guarded Mutation, Policy Review, and Protected Acceptance Protocols `5.0.0` now compile every accepted source-bound `triage_preference` clause into immutable config bindings. `codewiki.backlog-triage-policy@1.0.0` validates exact Standard/source/passage identity, merges repeated dimensions without weight, and derives one fixed lexicographic comparator after protected safety tiers; models cannot author direction, precedence, rank, score, canonical queue state, or Planning priority. Standard replacement/redistillation remains pending, as do production public-HTTPS and private connectors, production meter collectors/full Loop scheduling, external Decision identity/provider proof, CLI/API source transport, type route binding, Knowledge/source-content resolution, batching calibration, and Planning/Implementation evaluator cuts. Dashboard transport and review UI are deferred to the final Dashboard phase after Runtime and projection contracts stabilize.

The native deterministic scanner cut now uses `codewiki.security-scanner-suite@2.0.0` and protected `security_scanners_valid` under Check Catalog `8.0.0`. Exact classified surfaces select a static-analysis baseline plus required dependency, secret, authorization, configuration, or migration adapters. Strict bounded requests bind Candidate, source snapshot/tree, environment, adapter/configuration, source/Knowledge/ownership refs, and advisory snapshots. Runtime materializes observed command/source Evidence with exact scanner-family/request and outcome provenance, fails on findings, preserves missing/malformed/partial/stale/error execution as `indeterminate`, and emits bounded sanitized scanner intake without accepting scanner-owned authority or Results. `codewiki.atomic-security-scanner-check@1.0.0` then fans that one immutable substrate into independent static-analysis, dependency-advisory, credential-exposure, authorization-control, and persistence-safety Check obligations and Runtime Results. A clean family can pass while another fails or is unavailable; replay uses the same exact Evidence identities without re-recording. Fixed Semgrep SARIF and offline Trivy advisory collectors implement current production scanner execution under `codewiki.production-security-collector@1.0.0`. Other justified scanner families, sealed calibration, deeper source/Knowledge analysis, and high/critical residual-risk authority remain pending.

Current checklist inventory after atomic scanner Check fan-out: **80 complete, 46 remaining**.

The native Decision path now separates the producer's strict disposition/rationale proposal from Runtime-materialized Decision Candidate schema `2.0.0`. Candidate construction accepts only native ProjectWorkState, derives the current non-withdrawn revision, active unsuperseded relationships, overlap accounting, and WorkState/Knowledge/source/config/policy bindings, and removes legacy ChangeRecord, caller-supplied observed bases, copied validation/provenance/estimate fields, duplicate grounding refs, and unresolved summaries without aliases. Native continuation admission reconstructs that exact Candidate and rejects stale or caller-expanded content. The path resolves the closed policy, evaluates all deterministic Decision Code Checks, runs independent tool-free general Model Check requests, preserves uncertain assessments across Evidence replay, materializes exact authenticated approval receipts, and deterministically resolves persisted Decision Evidence. Security assurance now derives a content-addressed twelve-surface classification from the exact semantic revision with explicit refs-only Knowledge/source coverage, binds it into policy activation and parameters, requires `security_surface_requirements_complete` before model execution, and uses Decision Model Check Request Protocol `4.0.0` for exact considered-Evidence echo and exact User Standard/Custom Check metadata, three-valued basis validation, and asserted structured security challenge findings. Runtime still derives every Check Result and Exit Report; no final model reviewer can override Code or human-authority Results. The Pi SDK general Model Check transport now uses a shared fresh-session JSON runtime with exact routes, no tools or resource discovery, bounded responses/timeouts, redacted failures, and cleanup. Activated research provenance and claim-support Checks now run in the same dependency-aware native runner, drive the closed Pi claim-support transport, preserve uncertainty in Evidence, and replay without another provider call or Report drift. Runtime now derives an immutable Candidate/Report-bound Decision route only after assurance: approval to Planning, defer or indeterminate assurance to waiting, failed assurance to repair, rejection to complete, and withdrawal to withdrawn. This route grants no effect before canonical admission. The native operation builder now requires the exact active canonical attempt operation created by selection and emits/replay-validates only its append-only continuation from Candidate through policy, Evidence, Results, Report, Route, and attempt end, rejecting stale revision/WorkState binding, malformed full artifact identities, and unavailable Result Evidence before operation creation. Bounded artifacts live inline in operation bytes rather than dangling object refs. Synchronized Git admission now binds a fresh team snapshot, accepts the complete chain atomically under expected-head CAS, rejects stale mutation bases, and verifies all operation identities after resynchronization. `createNativeDecisionAttemptExecutor()` now reloads fresh synchronized Git state, validates the exact authenticated attempt and a protected-source/config-bound Exit Runtime before producer invocation, issues one versioned producer request without authority or Evidence, runs Candidate through independent evaluation, commits supplied and produced Evidence through attempt end under exact team/WorkState CAS, and recovers canonical terminal attempts without producer/evaluator reinvocation. `createDecisionGitAdmission()` now supplies fresh exact protected-config triage context loading and canonical attempt append under expected-head Git CAS, while requiring trusted repository identity, project authority snapshot, and replay policy inputs. Pi daemon startup accepts an injected complete Decision-start bundle. `createPiSdkNativeDecisionCandidateProducer()` now validates exact protocol/revision/relationship shape before creating one isolated read-only bounded session, admits exactly one strict proposal, rejects authority-bearing fields, and propagates cancellation through abort and disposal. `codewiki.pi-native-decision-host@1.0.0` now supplies approved project-local Pi authority resolution and final daemon assembly from mandatory trusted project inputs, with denial and restart recovery proof. External identity/provider proof, external research collection, native `runWikiDecide()` replacement, and old-path deletion remain incomplete, so the remaining Decision cut checkboxes stay open.

### Phase 8 — UI assurance and Integration

This phase builds backend assurance contracts and exact Integration bindings, not the final dashboard presentation. Final dashboard implementation consumes these stable contracts in Phase 11.

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

### Phase 11 — Final Dashboard refactor

- [ ] Freeze bounded Dashboard query, command, event, freshness, idempotency, and authority contracts over completed Runtime projections; remove dashboard-local workflow truth and legacy Trace/session assumptions.
- [ ] Refactor the complete information architecture for maintainers, package authors, and agents around Backlog, Planning, Implementation, Product, System, Design, and cross-cutting Change dossiers.
- [ ] Build Backlog intake/triage, rolling Planning, Implementation/Integration, Claims, synchronization, intervention, delivery, outcome, and history views from exact snapshot-bound projections.
- [ ] Add the Standards and Checks library grouped by source Standard and Check Type, source-to-clause/default-coverage review, Model/Code evaluator and guard preview, activation/Evidence/agent-feedback/cost preview, generated config diff, calibration view, exact Assessment/Result history, and guarded lifecycle actions shared with CLI/API.
- [ ] Rebuild Knowledge, source, relationship, assurance, configuration, health, and audit surfaces without creating a dashboard database, queue, graph truth, or mutation authority.
- [ ] Complete responsive desktop/mobile composition, keyboard and assistive semantics, reduced motion, high contrast, bounded rendering, reconnect/reset behavior, and actionable failure states.
- [ ] Validate the exact final Dashboard candidate through preview Evidence, independent experience review, authenticated approval where required, final integrated-tree assurance, and disposable-package browser tests.

### Phase 12 — External proof and release gates

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
