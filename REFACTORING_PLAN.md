# Temporary CodeWiki Refactoring Plan

> **Status:** Temporary, non-authoritative working checklist.
>
> CodeWiki is intentionally not active in this source checkout. This file temporarily preserves implementation sequencing across Pi compaction and fresh sessions. The Knowledge Base remains intended product/system truth; source and tests remain executable truth; Git remains checkpoint evidence. If this file conflicts with any of those sources, it loses. Delete it when the refactoring is complete and CodeWiki Change Traces can carry this coordination role.

## Goal

Move Decision, Planning, and Implementation onto one explainable Quality Policy architecture, then add versioned CodeWiki OS and Stage Protocol resources, user model routes, worker-ready Workbench requirements, runtime-provisioned private Workbenches, deterministic Implementation tiering, repair/escalation, evaluation infrastructure, and bounded product projections.

## Target ownership and source boundaries

Keep `src/decision/**`, `src/planning/**`, and `src/implementation/**` as the three semantic stage packages. Do not move them under a generic `src/loops/**` parent.

Each stage package owns its candidate schema and normalization, mandatory Stage Protocol, stage-specific Quality Standard semantics and activation declarations, deterministic evaluator implementations, gate declarations, and exit facts. A stage may request repair, route-back, or authority intervention, but it does not choose the final runtime route or append canonical records.

Shared assurance machinery belongs under `src/quality/**`: common contracts, stage-qualified Standard identity, registry validation, deterministic policy resolution, evaluator/evidence-adapter registries, minimal admission, bounded scheduling, exact caching, deterministic gate evaluation, and immutable report construction. Shared machinery must not import stage implementations.

Runtime is the composition root. It constructs the closed built-in registry from stage-owned declarations, adds only canonically approved project Standards, derives selector and authority facts, owns candidate identity and freshness, injects exact model/evaluator routes, performs final routing, fences the elected generation, and appends canonical records. Public API facades delegate to runtime/application services instead of serving as semantic orchestration or write owners.

Views and dashboard projections read the policy resolution and Quality Report persisted with each stage event. They must not reinterpret historical events using today’s in-process Standard catalog.

Target shape:

```text
src/
  semantic-stage.ts
  quality/
    contracts.ts
    identity.ts
    registry.ts
    policy-resolver.ts
    evaluator-registry.ts
    evaluation-runner.ts
    cache.ts
    report.ts
  decision/
    candidate.ts
    iteration.ts
    exit.ts
    quality/
      standards.ts
      activation.ts
      evaluators.ts
      gates.ts
  planning/
    candidate.ts
    iteration.ts
    exit.ts
    quality/
      standards.ts
      activation.ts
      evaluators.ts
      gates.ts
  implementation/
    candidate.ts
    iteration.ts
    exit.ts
    quality/
      standards.ts
      activation.ts
      evaluators/
      evidence-adapters/
      gates.ts
  runtime/
    quality-runtime.ts

tests/
  quality/
  decision/
  planning/
  implementation/
```

Exact filenames may stay smaller where one file is clearer, but the dependency direction and ownership above are fixed.

## Invariants

- Develop CodeWiki with Pi native tools and pi-lens only; never load or dogfood CodeWiki in this checkout.
- Preserve exactly three semantic loops: Decision, Planning, and Implementation.
- Keep runtime as sole owner of scheduling, candidate identity, freshness, CAS, recovery, routing, worker lifecycle, Integration, and canonical writes.
- Keep Change Traces append-only canonical temporal truth; keep WorkState disposable.
- Keep Pi ownership of providers, credentials, sessions, tools, extensions, and ordinary Skills.
- Keep CodeWiki ownership of OS guidance, Stage Protocols, Quality Policy, Workbench scope, model tiering, authority, and progression.
- Never let Skills, candidates, workers, or verifiers grant authority, widen scope, suppress Standards, or attest acceptance.
- Keep credentials, prompts, private reasoning, Workbenches, raw tool output, and private runtime artifacts out of canonical traces.
- Preserve existing rejection text and guarded Integration, merge, push, publication, and release behavior unless a reviewed slice explicitly changes it.
- Make clean stage cuts: replace obsolete internal contracts, remove superseded source/tests/exports in the same slice, and avoid compatibility layers without real external consumers.
- Commit and push each green slice. Do not absorb unrelated worktree changes.

## Checkpoints

### Completed

- [x] Preserve and remove the pre-existing formatter-only worktree residue after external backup.
- [x] Freeze CodeWiki OS, Stage Protocol, Quality Policy, Worker Workbench, Skill, model-route, and asynchronous evaluation architecture in the KB and diagrams. Commit `4d833f7`.
- [x] Add common `QualityStandard`, `QualityStandardBinding`, `QualityAssessment`, deterministic gate, `QualityPolicyResolution`, and `QualityReport` contracts without changing current loop behavior. Commit `0f2f0f1`.
- [x] Explore a compatibility adapter in commit `d538092`; reject it before stage adoption because CodeWiki has no production compatibility burden.
- [x] Remove the unused adapter and its tests. Commit `48a1ff8`.
- [x] Implement the first native closed Standard registry and deterministic typed Quality Policy activation, including protected kernel Standards, project rollout progression, sparse overlays, approved additions/exclusions, frozen Planning minimums, and explainable policy digests. Commit `b72f81a`.
- [x] Complete a bounded pre-evaluator architecture and repository audit; classify durable actions below and keep the detailed report in chat.

### Current — Quality package boundary cut

- [ ] Move the three unused native Quality foundation modules from `src/loops/**` to `src/quality/**`, with mirrored `tests/quality/**`; update imports, `sourceLayout`, and ownership docs without retaining old-path re-exports.
- [ ] Keep stage-specific Standard declarations out of the shared package; establish stage Quality directories and a runtime composition root without changing current production stage behavior.
- [ ] Add a shared semantic-stage type so Quality contracts do not depend on trace persistence types.
- [ ] Remove the `src/index.ts` ↔ `src/api/index.ts` barrel cycle.
- [x] Add tracked pi-lens configuration that disables out-of-band automatic formatting until the repository adopts an explicit formatter contract.
- [ ] Update `loop-contracts.md`, `quality-policy.md`, `lab.md`, and `overview.md` so the KB names `src/quality/**` as shared machinery and stage packages as semantic owners.

### Next — Quality identity and authority hardening

- [ ] Replace global-by-id Standard registration with stage-qualified identity and bind every active Standard to a content digest, exact evaluator id/version, evidence-adapter ids/versions, and registry digest.
- [ ] Add runtime-owned candidate id plus digest to policy/report identity; define immutable, versioned Decision, Planning, and Implementation candidate contracts before evaluation scheduling exists.
- [ ] Replace broad `Omit<RunWiki*Input, ...>` semantic candidate types and the SDK’s arbitrary-record submission schema with exact role-specific allowlists. Candidates cannot provide Decision authority or canonical actor/time, Quality/review/TDD controls, snapshot/proof scope, aggregate content proof, runtime identity, or append/routing fields.
- [ ] Replace generic per-kind verifier metadata with stage-specific criteria, evaluator identities, evidence requirements, measurement contracts, repair targets, costs, and timeouts.
- [ ] Separate internal kernel/official registration from project registration so caller-supplied data cannot self-claim authority; derive approved additions, exclusions, rollout approval, and frozen Planning minimums only from canonical runtime observations.
- [ ] Make frozen Planning minimums independently digest-verifiable and bind Implementation to the exact persisted Planning policy/minimum rather than trusting supplied bindings plus an arbitrary digest.
- [ ] Strictly validate stages, authority and rollout enums, verifier-kind compatibility, nonblank criteria and repair targets, JSON values, measurement bounds, finite costs/timeouts, dependency applicability, and activation-rule references.
- [ ] Add registry startup validation for unique rule identities, known stage-qualified Standards, baseline/KB agreement, valid evaluator/evidence-adapter references, and dependency acyclicity.
- [ ] Add `ui_preview_targets_valid` to the Planning catalog and replace ambiguous cross-stage conditional criteria—especially release, security/privacy, accessibility, and dependency safety—with stage-specific semantics. Effect authority remains separately guarded at the effect boundary.
- [ ] Add canonical JSON/digest utilities for new Quality identity instead of adding more local stable-stringify implementations.
- [ ] Add constructors and validators that derive, rather than trust, Quality Assessment, gate, and Quality Report status; reject missing, duplicate, contradictory, wrong-candidate, wrong-policy, and wrong-measurement results.
- [ ] Resolve the two optional Pi SDK development advisories without widening the supported Pi peer range: `brace-expansion >=5.0.8` and `protobufjs >=7.6.5`.

### Next — Native evaluator

- [ ] Implement native minimal admission plus bounded asynchronous verifier fan-out, required-result fan-in, deterministic gates, and immutable `QualityReport` output.
- [ ] Pass `AbortSignal` through semantic adapters and evaluator work; timeouts must cancel underlying work where supported and yield `indeterminate`, not fabricated failure.
- [ ] Use separate bounded pools for model/provider, CPU, test/build, and external-service work. Do not use unbounded `Promise.all` over an arbitrary ready layer.
- [ ] Run independent Standards despite another failed gate; skip only invalid/stale input, genuine evaluation dependencies, cancellation, or explicit budget policy.
- [ ] Bind exact cache identity to candidate, policy, Standard, evaluator, evidence adapter, model, configuration, trial, and aggregation identity. TTL or path overlap may control eviction or hints, never authoritative reuse.
- [ ] Keep Quality Policy resolution, Quality Report, canonical trace, and telemetry as separate authority planes while recording compact latency/token/cache summaries needed for evaluation.

### Named stage cuts

- [ ] **Decision cut:** move semantic candidate/report/exit construction out of `src/api/wiki-decide.ts`; evaluate one immutable candidate once; pass the observed WorkState instead of rebuilding it; fence immediately before appending the exact evaluated report; update Lab/views/dashboard consumers; delete `src/decision/change-quality.ts` and superseded Decision tests/types/exports.
- [ ] **Planning cut:** move semantic candidate/report/exit construction out of `src/api/wiki-plan.ts`; evaluate once; reuse the runtime-selected WorkState and participant snapshots; make multi-trace Planning append idempotently recoverable after partial process failure and generation change; update Lab/views/dashboard consumers; delete `src/planning/portfolio-quality.ts` and superseded Planning tests/types/exports.
- [ ] **Implementation cut:** split `src/implementation/loop.ts` into stage-owned candidate facts, focused deterministic evaluators, gates, and exit facts; move useful language/check sensors under Implementation Quality evidence adapters; eliminate duplicate synchronous/asynchronous iteration bodies; replace path/TTL review-evidence reuse with exact Quality cache identity; remove legacy review activation authority from project config; update Lab/views/dashboard consumers.
- [ ] **Legacy shared cut after Implementation:** delete `src/loops/evaluator.ts`, `feedback.ts`, `graph.ts`, `judge-prompts.ts`, `judge-provider.ts`, `judge.ts`, `quality-pack.ts`, `quality-profile.ts`, `quality-standards.ts`, and `runner.ts`, plus their superseded tests and aliases. Remove `src/loops/**` and `tests/loops/**` when empty.
- [ ] **Trace/projection cut:** replace legacy `LoopQuality*`, graph, runner, diagnostics, and `qualityStandards` trace fields with versioned policy/report contracts. Project sparse active bindings from persisted events only; remove current-catalog fallback logic from `src/views/quality.ts`, `src/dashboard/state.ts`, and dashboard asset metadata.
- [ ] **Legacy config cut:** remove custom HTTP judge configuration and the independent `quality.review` enable/disable/required-pack authority. Pi model routes supply model execution; resolved Standards determine required evidence adapters. Fast feedback may remain non-authoritative and reuse the same adapters/cache identities.

## Audit-derived efficiency work

### Include in the Quality and stage cuts

- Evaluate Decision and Planning once. Current preview-then-append execution rebuilds WorkState and reruns Quality; stochastic native evaluation would duplicate latency/tokens and could produce a different result.
- Move elected-generation checking to immediately before each canonical append. Current semantic paths check before work that can become long once model evaluation is added.
- Reuse the runtime-observed WorkState and trace snapshots throughout one candidate attempt; do not reread and reproject the full portfolio in API facades.
- Replace whole-repository Implementation path scans with candidate-scoped shared facts where possible. If full inventory remains necessary, cache it by exact repository state and use bounded traversal.
- Persist self-describing policy/report data. Current views and dashboard maintain multiple copies of “required” Standards and can reinterpret old events when code changes.
- Keep the default registry immutable and runtime-owned rather than reconstructing/cloning it for every resolution. Do not spend a separate optimization slice on the current sub-millisecond resolver cost.
- Keep sparse policy output bounded. Measure policy/report trace bytes before deciding whether inactive-selector explanations need compaction.
- Consolidate language-review command/parsing scaffolding only while moving those sensors into evidence adapters; do not perform an unrelated generic abstraction pass.

### Remove during named cuts

- Remove legacy hard-gate fail-fast tests and behavior that suppress independent model/external feedback.
- Remove the global in-memory review cache whose Implementation-exit query is only trace/path overlap, does not apply the configured maximum age, and does not bind repository, candidate content, command, adapter, or configuration identity.
- Remove custom HTTP judge transport and its incomplete graph/prompt/evidence-only cache key.
- Remove duplicate current-Standard catalogs in stage evaluators, views, dashboard state, and dashboard assets.
- Remove legacy graph/profile/pack compatibility aliases and stale public exports with their owning implementation slice.

### Defer with explicit reason

- Break the `implementation/types.ts` ↔ review-evidence type cycle during the Implementation cut, when the evidence contracts move.
- Break the `git/worktrees.ts` ↔ runtime claim-selection type cycle during Workbench/Claim contract work.
- Break the Pi process-session ↔ trace-host-process type cycle during Stage Protocol and semantic-session work.
- Split very large dashboard, host-runner, coordinator, worker-dispatch/integration, preview, project-config, and WorkState projector modules only when their owning behavior changes. Their complexity is real, but broad restructuring before native Quality would expand risk without improving the evaluator boundary.
- Add incremental trace-tail WorkState projection after semantic stage cuts remove repeated facade rebuilds; measure portfolio-scale traces before selecting a cache design.
- Rework generic JSON/object parsing duplication outside Quality only in owning feature slices.

### Keep — intentional

- Keep ignored `node_modules`, `.pi-lens`, `.tmp-worktrees`, `dist`, `.codewiki/runtime`, and Lab-run state untracked and disposable.
- Keep dynamic dashboard daemon resolution and source-covered release-engineering/self-dogfood utilities; do not activate self-dogfood in this checkout.
- Keep sequential operations where ordering is semantic—Git effects, canonical multi-step effects, browser capture, cleanup, and rollback—unless a measured safe concurrency design replaces them.

## Later product/runtime checkpoints

- [ ] Add versioned CodeWiki OS and Decision/Planning/Implementation Stage Protocol package resources; restore normal Pi Skill discovery while preserving read-only semantic-session boundaries.
- [ ] Add user model bindings for Decision, Planning, and Implementation `routine`, `standard`, and `complex`; do not add an Implementation review model slot.
- [ ] Extend Planning Work Items with worker-ready Workbench requirements and readiness Standards.
- [ ] Provision exact private Worker Workbench manifests before Claim, including fresh source, context, scoped Skills/tools, selected route, Quality minimums, isolation, budgets, and report contract.
- [ ] Add deterministic Implementation tier selection, Quality-feedback repair, fresh-attempt identity, and typed escalation/route-back behavior.
- [ ] Add visible and sealed evaluation cases, calibration, latency/token/false-pass/false-block metrics, and optional offline DSPy/GEPA experiments without runtime authority.
- [ ] Project active Quality Policy, activation rationale, Assessment progress, Quality Reports, bounded Workbench summary, model tier, latency, and token summaries into WorkState and product surfaces.
- [ ] Add bounded Worker Report discoveries and runtime-owned sanitation/deduplication into pending Change intake after Workbench contracts stabilize.
- [ ] Consolidate Lab only after equivalent normal-pipeline evaluation gates exist.
- [ ] Add cancellation-aware draining for active semantic SDK jobs.
- [ ] Run full package, Pi, coordinator, readiness, security, packed external-project, and real provider/auth gates before promotion.

## Current baseline

- Branch: `main`
- Latest recorded commit: `b72f81a`
- Core suite: 763/763
- Typecheck: passing
- LSP errors in audited Quality/stage files: 0
- Source checkout Pi packages: `npm:pi-lens` only
- Production dependency vulnerabilities: 0
- Optional Pi SDK development dependency vulnerabilities: one high and one moderate, listed in the hardening checkpoint

## Update protocol

After each green slice:

1. Mark the completed checkpoint and record its commit id on the next update; use the exact checkpoint subject for the commit that contains the update.
2. Move exactly one bounded next slice into **Current**.
3. Record changed baseline counts only when they materially change.
4. Commit and push source, tests, KB updates, and this checklist together.
5. Keep failed experiments and command logs out of this file; use disposable `/tmp` output.
6. Delete this file after the final migration and external gates complete.
