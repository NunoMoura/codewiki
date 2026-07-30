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

## Change Trace Protocol v1

### Canonical identity

Use a versioned strict canonical JSON profile and SHA-256 for every authority-bearing identity.

Conceptual Change-scoped envelope:

```ts
interface CanonicalChangeOperation {
  operationId: string; // sha256(canonical_json(body))
  body: ChangeOperationBody;
}

interface ChangeOperationBody {
  protocol: {
    id: "codewiki.change-trace";
    version: "1.0.0";
  };
  changeId: string;
  kind: ChangeOperationKind;
  kindVersion: string;
  parents: string[];
  baseSnapshot: BaseSnapshot;
  authorityBinding: AuthorityBinding;
  preStateDigest: string;
  postStateDigest: string;
  payload: ClosedTypedPayload;
}
```

`operationId` is excluded from its own hash input. Runtime derives all canonical fields. Unknown required versions, missing parents, invalid canonical bytes, digest mismatch, or unauthorized actors remain visible and block dependent progression.

Use separate private attempt/job identity and accepted operation identity. A stale base can preserve private work correlation, but reevaluation creates a new canonical operation identity. Never alias two canonical IDs.

### Base and authority binding

```ts
interface BaseSnapshot {
  remoteStateHead: string;
  sourceHead: string;
  knowledgeDigest: string;
  configDigest: string;
  policyDigest: string;
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
initial Trace root                     0 parents
ordinary accepted Change operation    exactly 1 current Change tail
explicit same-Change causal merge     2 or more parents
cross-Change relationship             exact typed payload bindings
```

Multiple parents are not generic conflict resolution. Cross-Change merge, split, relationship, and Planning semantics use exact revision bindings and atomic accepted batches.

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
  previousStateHead: string;
  operationIds: string[];
  changedTraceTails: {
    changeId: string;
    previousTail: string;
    nextTail: string;
  }[];
  batchDigest: string;
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
  .codewiki/changes/**
  immutable current objects
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
- separate clones cannot see shared Change Claims or Work Item Claims;
- production Decision Candidate still contains only disposition and rationale;
- production Decision still uses count/presence quality checks and reruns legacy evaluation;
- native Decision research and claim-support transport are not wired into production execution;
- command, Worker Report, Integration, UI, approval, delivery, and outcome Evidence producers remain incomplete;
- rolling Planning, remote freshness, state-ref CAS, archive hydration, graph projection, and repair retrieval are not implemented;
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

- [ ] Specify exact v1 operation, Planning epoch, state manifest, and archive schemas.
- [ ] Freeze canonical serialization and identity fixtures.
- [ ] Implement a pure deterministic reducer.
- [ ] Implement a pure versioned Alignment Graph projector.
- [ ] Prove full/incremental replay equivalence.
- [ ] Add adversarial and property tests for malformed bytes, hash mismatch, unknown versions, missing parents, unauthorized actors, stale bases, duplicate operations, contradictions, and projection equivalence.

### Phase 2 — Disposable two-clone Git experiment

- [ ] Use two disposable clones and one bare remote.
- [ ] Race independent Changes.
- [ ] Race same-Change writes.
- [ ] Race Change Claim acquisition.
- [ ] Race Work Item Claim acquisition.
- [ ] Reject stale expected-head pushes.
- [ ] Prove atomic Planning batches.
- [ ] Exercise offline reconnect and crash recovery.
- [ ] Prove duplicate/reordered notifications converge.
- [ ] Measure contention before considering ref partitioning.

### Phase 3 — Read-only remote synchronization

- [ ] Fetch and verify `codewiki/state` without mutation.
- [ ] Compute team snapshot identity.
- [ ] Expose `fresh | stale | offline`.
- [ ] Rebuild local hot materialization, WorkState, and Alignment Graph.
- [ ] Add poll-based invalidation before optional webhooks.
- [ ] Block unsafe distributed mutation when not fresh.

### Phase 4 — Guarded distributed mutation

- [ ] Add exact expected-head state append.
- [ ] Add Change Claim acquire/release/authenticated takeover.
- [ ] Add Work Item Claim acquire/release/authenticated takeover.
- [ ] Add stale rejection fetch/replay/reevaluation.
- [ ] Add crash-safe reconciliation and idempotent acceptance.
- [ ] Keep automatic expiry disabled without trusted time.

### Phase 5 — Rolling Planning

- [ ] Create immutable Planning Candidate and `PlanningEpochRecord` schemas.
- [ ] Bind each participating Change atomically.
- [ ] Preserve safe active Work Items and Assignments.
- [ ] Require explicit pause/migration/cancellation/block/route-back for invalidated work.
- [ ] Derive safe execution frontier from fresh WorkState.
- [ ] Replace mutable Planning/backlog assumptions with projections.

### Phase 6 — Alignment Graph and bounded queries

- [ ] Implement deterministic graph facts for every operation kind.
- [ ] Bind graph snapshot to state, Knowledge, source, config/policy, and projector version.
- [ ] Emit per-fact provenance.
- [ ] Add bounded read-only semantic query families.
- [ ] Report coverage, truncation, staleness, contradictions, and underlying refs.
- [ ] Complete OKF v0.2 compatibility and closed authored relationship vocabulary.
- [ ] Benchmark plain search, Pi-Lens, OKF/source projection, Alignment Graph, and optional Graphify analysis.

### Phase 7 — Native Loop cuts

- [ ] Wire Decision research collection and claim-support transport into production Decision.
- [ ] Replace Decision count checks with native Candidate/Evidence/Result/Report path.
- [ ] Create native Planning Candidate/Evidence/Result/Report path.
- [ ] Create native Implementation Candidate/Evidence/Result/Report path.
- [ ] Cut command, Worker Report, Integration, preview, approval, delivery, and outcome observations over to closed Evidence contracts.
- [ ] Add bounded Check fan-out/fan-in, cancellation, exact caching, immutable Reports, and typed repair/escalation.
- [ ] Delete legacy Quality modules only after parity and replacement tests pass.

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
