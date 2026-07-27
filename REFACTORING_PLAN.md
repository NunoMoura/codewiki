# Temporary CodeWiki Refactoring Plan

> **Status:** Temporary, non-authoritative working checklist.
>
> CodeWiki is intentionally not active in this source checkout. This file temporarily preserves implementation sequencing across Pi compaction and fresh sessions. The Knowledge Base remains intended product/system truth; source and tests remain executable truth; Git remains checkpoint evidence. If this file conflicts with any of those sources, it loses. Delete it when the refactoring is complete and CodeWiki Change Traces can carry this coordination role.

## Goal

Move Decision, Planning, and Implementation onto one explainable Quality Policy architecture, then add versioned CodeWiki OS and Stage Protocol resources, user model routes, worker-ready Workbench requirements, runtime-provisioned private Workbenches, deterministic Implementation tiering, repair/escalation, evaluation infrastructure, and bounded product projections.

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
- [x] Remove the unused adapter and its tests. Checkpoint subject: `refactor: remove quality compatibility layer`.

### Current

- [ ] Implement the native CodeWiki Standard registry and deterministic Quality Policy activation from stage, Change kind/risk/layers, project traits, technologies, paths, and approved additions/exclusions. Protect kernel Standards, stage project Standards through `observe` → `warn` → approved `enforce`, and produce explainable policy digests.

### Next

- [ ] Implement native minimal admission plus bounded asynchronous verifier fan-out, required-result fan-in, deterministic gates, and immutable `QualityReport` output.
- [ ] Cut Decision directly from its legacy quality internals to native Quality contracts; remove superseded Decision source, tests, types, and exports in the same slice.
- [ ] Cut Planning directly from its legacy quality internals to native Quality contracts; remove superseded Planning source, tests, types, and exports in the same slice.
- [ ] Cut Implementation directly from its legacy quality internals to native Quality contracts; remove superseded graph/profile/pack/evaluator paths once no stage references them.
- [ ] Replace hard-gate short-circuiting with independent feedback except for invalid/stale input, genuine evaluation dependencies, cancellation, and budget policy.
- [ ] Add resource-specific concurrency pools, streamed Assessments, coherent model batching, shared facts, exact cache identity, incremental invalidation, stale-candidate cancellation, and efficiency metrics.
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
- Latest recorded commit: `d538092`; compatibility source is removed by the commit containing this checklist update.
- Core suite: 752/752
- Typecheck: passing
- LSP/lens errors: 0
- Source checkout Pi packages: `npm:pi-lens` only
- Production dependency vulnerabilities at last release audit: 0

## Update protocol

After each green slice:

1. Mark the completed checkpoint and record its commit id on the next update; use the exact checkpoint subject for the commit that contains the update.
2. Move exactly one bounded next slice into **Current**.
3. Record changed baseline counts only when they materially change.
4. Commit and push source, tests, KB updates, and this checklist together.
5. Keep failed experiments and command logs out of this file; use disposable `/tmp` output.
6. Delete this file after the final migration and external gates complete.
