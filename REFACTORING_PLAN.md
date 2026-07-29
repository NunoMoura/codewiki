# Temporary CodeWiki Refactoring Plan

> **Status:** Temporary, non-authoritative working checklist.
>
> CodeWiki is intentionally not active in this source checkout. This file temporarily preserves implementation sequencing across Pi compaction and fresh work slices. `.codewiki/kb/**` remains intended product/system truth; source and tests remain executable truth; Git remains checkpoint evidence. If this file conflicts with any of those sources, it loses. Delete it when the migration is complete and CodeWiki Change Traces can carry this coordination role.

## Goal

Turn CodeWiki into a standalone intent-to-production alignment runtime whose three semantic loops produce exact candidates that may exit only through immutable Check Results and an Exit Report. Preserve Change as accountable intent and a durable dossier, then use exact Change history for project-local repair learning and optional privacy-preserving product feedback.

> **Change owns accountable intent and durable history. Runtime owns the portfolio pipeline.**

Target transition:

```text
(Kₜ, Gₜ, Pₜ) + ΔIntent
  ──CodeWiki──>
(Kₜ₊₁, Gₜ₊₁, Pₜ₊₁, Evidence)
```

`K` is accepted Knowledge, `G` is exact Git state, `P` is delivery state, and `Evidence` contains exact Check Results, Exit Reports, authority, integration proof, remote proof, and outcome observations.

## Canonical vocabulary

Use one formal term for Decision, Planning, and Implementation: **Loop**. Do not use “stage” as a parallel architecture term.

| Superseded term | Canonical term |
| --- | --- |
| Semantic Stage | Semantic Loop |
| Stage Protocol | Loop Protocol |
| Quality Standard / Exit Criterion | Check |
| Deterministic Verifier | Code Check |
| Model Evaluator | Model Check |
| Quality Assessment | Check Result |
| Quality Policy Resolution | Resolved Exit Policy |
| Quality Report | Exit Report |
| Quality Gate / Gate Result | Deterministic `ExitReport.status` |
| Failure regime | `issueClass` on a failed or indeterminate Check Result |

`Quality` may remain an adjective or measured outcome, but it is not a package, lifecycle, policy, report, or graph noun. `Assessment`, `Standard`, `Gate`, and `Criterion` are removed from the target public contract.

Core flow:

```text
Change
└── Loop attempt
    ├── Candidate
    ├── Resolved Exit Policy
    ├── Checks
    ├── Check Results
    └── Exit Report

Runtime
└── revalidates freshness and authority
    └── chooses route and guarded append/effect
```

A Check is one versioned requirement plus its execution kind, measurement contract, evidence requirements, repair target, limits, and trusted implementation identity:

```ts
type Check = CodeCheck | ModelCheck;
```

Checks have three independent dimensions:

```text
execution:   code | model
measurement: qualitative | quantitative
enforcement: observe | warn | require
```

Quantitative Checks bind exact value shape, unit, comparator, threshold, bounds, and aggregation. Runtime applies thresholds; candidates and models cannot choose them. Both measurement kinds may carry structured findings and evidence. Operational failure is always `indeterminate`, never fabricated failure evidence or score zero.

Exit Report reduction is deterministic:

```text
required failed Check Result exists        -> fail
else required indeterminate Result exists  -> indeterminate
else                                        -> pass
```

A passing Exit Report permits semantic loop exit for that exact candidate. It does not authorize append under stale state, Integration, merge, push, publication, release, or deployment.

## Product and execution boundary

The primary product is the standalone CodeWiki CLI, Project Runtime, and dashboard embedding the published Pi SDK. The Pi extension is an optional thin interactive client to the same runtime.

Pi owns providers, credentials, model transport, sessions, compaction, tools, extensions, and ordinary Skills. CodeWiki owns Change Traces, WorkState, Loop Protocols, Checks, Workbench scope, scheduling, semantic authority, workers, Integration, routing, canonical writes, and guarded effects.

Do not fork Pi, bundle its executable, copy provider/auth/session machinery, or host CodeWiki inside a competing outer runtime. A future OpenClaw integration is a client or worker adapter; CodeWiki remains canonical authority.

Internally, “coordinator” names scheduling/election machinery only. Product and architecture prose names the whole control plane **Project Runtime**. Code symbol renames remain a later bounded cut.

## Target ownership and source boundaries

Keep `src/decision/**`, `src/planning/**`, and `src/implementation/**` as the three semantic Loop packages. Do not move them under a generic `src/loops/**` parent.

Each Loop package owns:

- its exact candidate schema and normalization;
- its mandatory Loop Protocol;
- Loop-specific Check semantics and deterministic activation declarations;
- trusted Code Check and Model Check definitions;
- Loop exit facts and repair/route-back context.

A Loop may return failed or indeterminate Results, repair targets, or route-back facts. It does not choose final runtime routing or append canonical records.

Shared Loop-exit machinery belongs under `src/loop-exit/**`: contracts, exact identity, catalog validation, deterministic policy resolution, minimal admission, bounded scheduling, exact caching, and immutable Exit Report construction. Shared machinery must not import Loop implementations.

Runtime is the composition root. It composes one immutable `LoopExitSuite` and closed built-in catalog from the three Loop-owned declarations, adds only canonically approved Project Checks, derives selector and authority facts, owns candidate identity and freshness, injects exact model routes, performs final routing, fences elected generation, and appends canonical records.

Views and dashboard projections read the Resolved Exit Policy and Exit Report persisted with each Loop event. They never reinterpret historical events using today’s in-process Check catalog.

Target shape:

```text
src/
  semantic-loop.ts
  loop-exit/
    contracts.ts
    identity.ts
    catalog.ts
    resolve-policy.ts
    runner.ts
    cache.ts
    report.ts
  decision/
    candidate.ts
    iteration.ts
    exit/
      checks.ts
      activation.ts
      code-checks.ts
      model-checks.ts
  planning/
    candidate.ts
    iteration.ts
    exit/
      checks.ts
      activation.ts
      code-checks.ts
      model-checks.ts
  implementation/
    candidate.ts
    iteration.ts
    exit/
      checks.ts
      activation.ts
      code-checks.ts
      model-checks.ts
  runtime/
    loop-exit-runtime.ts

tests/
  loop-exit/
  decision/
  planning/
  implementation/
```

Small Loop packages may combine files when one file is clearer. Dependency direction and authority boundaries are fixed. Do not retain old-path re-exports after clean cuts.

## Alignment and Knowledge direction

Alignment is not permanent equality. Every discrepancy must be:

1. resolved;
2. accounted for by one exact active Change; or
3. explicitly unknown and blocked from unsafe progression.

Keep vertical, horizontal, temporal, and delivery alignment distinct. A point-in-time local proof cannot guarantee remote state indefinitely; ongoing remote claims require protected branches, required checks, attestations, artifact provenance, and deployment observations.

CodeWiki moves from OKF v0.1 toward OKF v0.2:

- produce v0.2 and consume v0.1 fallback plus best-effort unknown versions;
- support `sources`, `generated`, `verified`, lifecycle, freshness, and Attested Computation definitions;
- preserve unknown frontmatter;
- use meaningful software concept types instead of universal `Concept`;
- keep Change Traces outside OKF;
- never treat OKF trust fields as CodeWiki authority;
- never execute imported computation definitions automatically.

Attested Computation remains a later closed, pinned mechanism for sanctioned production-outcome observation. It does not become arbitrary project verifier code.

## Relationship and query projections

Do not create canonical graph files or a graph database. Canonical authority remains in Change Traces, OKF Knowledge, source/tests, Git/remote evidence, and configuration.

Expose disposable bounded relationship views:

- **Work Graph:** Changes, Sprints, Work Items, dependencies, Assignments, Claims, blockers, and Integration state.
- **Alignment Graph:** OKF concepts, provenance, components, source/test ownership, Change revisions, candidates, Check Results, Git trees, remote artifacts, and outcome observations.
- **Learning View:** temporal candidate → failed Check → repair candidate → later Result/outcome relationships derived from Change Traces.

Check dependencies are internal runner metadata, not a public project graph or fourth loop.

Agents may query scoped semantic operations over these projections. Do not expose arbitrary Cypher, a user-authored graph DSL, or graph mutation. Results bind snapshot digest, provenance, authority class, coverage/completeness, truncation, and staleness. Runtime preloads mandatory context; queries remain supplemental. Workers receive Assignment-scoped views and Model Checks read pinned candidate snapshots.

## Change-driven learning and feedback

> **Changes improve future Changes.**

Persist reusable observations once in canonical Change Traces. Accepted implementation proof remains in Git/artifacts with exact refs. Full prompts, private reasoning, Workbenches, raw tool output, and private failed-candidate artifacts remain outside traces.

Do not introduce first-class Lesson, Memory, Todo, or Quality Issue entities. Use:

```text
issueClass
repairTarget
Repair Episode   # derived attempt/result relationship
Repair Pattern   # derived aggregate across episodes
```

Learning levels:

1. same-Change repair context;
2. project-local cross-Change retrieval;
3. offline CodeWiki Lab calibration and promotion.

Candidate producers may receive selected prior repair evidence. Independent Model Checks never share candidate-producer conversational state or learning context. Learning cannot suppress Checks, lower thresholds, mutate activation, or attest acceptance.

Canonical observations live in `.codewiki/traces/TRACE-CHG-<id>.jsonl`. Build the learning projection in memory first. Add a disposable `.codewiki/runtime/learning/**` cache only after measured need. Stable promoted guidance enters Knowledge, configuration, or source only through an accountable Change.

Persistent suspected CodeWiki failures may produce an explicit **Feedback Bundle**. Do not upload full “anonymous” traces. Generate a strict allowlisted, pseudonymized local artifact that excludes intent, Knowledge content, source/diffs, paths, repository/remotes, commits, trace ids, prompts, model responses, reasoning, raw tool output, credentials, exact timestamps, and Project Check content. Initial transport is user-reviewed local export/manual attachment only; no automatic telemetry endpoint.

Maintainers treat Feedback Bundles as untrusted data and convert useful findings into failing fixtures/tests before fixing the runtime. Project/candidate issues feed local learning; suspected runtime issues feed optional product feedback; environment and authority issues route to their proper owner.

## Invariants

- Develop CodeWiki with Pi native tools and pi-lens only; never load or dogfood CodeWiki in this checkout.
- Preserve exactly three semantic loops: Decision, Planning, and Implementation.
- Keep runtime as sole owner of scheduling, candidate identity, freshness, CAS, recovery, routing, worker lifecycle, Integration, and canonical writes.
- Keep Change Traces append-only canonical temporal truth; keep WorkState and relationship/learning indexes disposable.
- Keep credentials, prompts, private reasoning, Workbenches, raw tool output, and private runtime artifacts out of canonical traces.
- Never let Skills, candidates, workers, Checks, clients, or tools grant authority, widen scope, suppress required Checks, or attest acceptance.
- Keep Code Checks closed and CodeWiki-owned in v1; no arbitrary executable Project Checks.
- Keep Check selection deterministic and explainable through persisted `activatedBy` rule/trait/effect refs; learned activation is forbidden.
- Keep kernel Checks non-disableable and move Project Checks only through `observe` → `warn` → explicitly approved `require`.
- Keep candidate generation and Model Checks in independent sessions.
- Keep Integration, merge, push, publication, release, and deployment as separately guarded effects.
- Preserve exact rejection text and existing guarded effect behavior unless one reviewed slice explicitly changes it.
- Make clean Loop/package cuts: replace obsolete internal contracts, remove superseded source/tests/exports in the same slice, and avoid compatibility layers without real consumers.
- Commit and push each green slice without absorbing unrelated worktree changes.

## Completed checkpoints

- [x] Implement core Change Traces, WorkState, Decision, global Planning, Claims, Assignments, isolated workers, immutable Worker Reports, semantic acceptance, and guarded Integration/effects.
- [x] Implement elected ownership, generation fencing, authentication, semantic jobs, worker reconciliation, cancellation, recovery, and draining foundations.
- [x] Add OCI worker, Integration, branch merge/push, publication, and release boundaries.
- [x] Freeze the earlier CodeWiki OS, Stage Protocol, Quality Policy, Workbench, model-route, and asynchronous evaluation design. Commit `4d833f7`.
- [x] Add common legacy Quality contracts. Commit `0f2f0f1`.
- [x] Explore then remove an unnecessary compatibility adapter. Commits `d538092` and `48a1ff8`.
- [x] Add the first native closed Standard registry and deterministic resolver. Commit `b72f81a`.
- [x] Complete the bounded pre-evaluator audit and record durable actions. Commit `bce76e6`.
- [x] Disable out-of-band pi-lens formatting through tracked `.pi-lens.json`.
- [x] Research Pi/Pi-Lens/OpenClaw/SDD/OKF/ActiveGraph boundaries and ratify the standalone Runtime, alignment, Check, learning, graph-query, and Feedback Bundle direction.
- [x] Back up the current four-file native-foundation working tree before the terminology/KB cut at `/home/nunoc/.cache/codewiki-baselines/2026-07-28-pre-loop-exit-kb/quality-foundation-working-tree.patch` (SHA-256 `3a3cffd609102b979218b518e01f06a7520d08aea6c8897c36fb6de6500587f9`).

## Current — terminology and Knowledge cut

- [x] Replace the target Quality/Standard/Assessment/Gate vocabulary with Loop/Check/Check Result/Exit Report vocabulary in canonical Knowledge.
- [x] Replace formal Stage terminology with Loop terminology and rename the Quality Policy concept to Loop Exit.
- [x] Record the standalone Project Runtime, accountable alignment, OKF v0.2, relationship-query, Change-learning, and Feedback Bundle direction.
- [x] Rewrite this plan around `src/loop-exit/**` and the revised implementation order.
- [x] Validate all KB links, diagrams, OKF boundaries, stale terminology, generated indexes, full tests, build, diagnostics, and production dependency audit.
- [x] Commit and push the green documentation checkpoint without absorbing the four unrelated native-foundation files.

## Next — Loop-exit package boundary cut

- [x] Preserve, validate, and checkpoint the four native-foundation files before moving them (`7763173`).
- [x] Move and rename the unused native foundation from `src/loops/**` directly to `src/loop-exit/**`, with mirrored `tests/loop-exit/**`; no superseded `src/quality/**` target or old-path re-exports.
- [x] Add shared `SemanticLoop` type independent of trace persistence types and retain `TraceLoop` as the persistence alias during trace migration.
- [x] Establish identity-only Loop-owned `exit/**` declarations and `src/runtime/loop-exit-runtime.ts`, composing one frozen `LoopExitSuite` and closed catalog without changing current production behavior.
- [x] Replace the moved foundation's Registry API with one Catalog surface, internal kernel registration, catalog-assigned project authority, closed verifier/adapter identities, and no resolver-injected catalog.
- [x] Remove the `src/index.ts` ↔ `src/api/index.ts` barrel cycle by moving layout metadata into `src/api/index.ts` and keeping root re-export direction one-way.
- [x] Update source ownership mappings for `src/semantic-loop.ts`, `src/loop-exit/**`, and `tests/loop-exit/**` after those paths exist.

## Next — exact identity and authority hardening

- [ ] Complete Loop-owned immutable Decision, Planning, and Implementation content schemas plus Runtime-owned candidate envelope and content identities.
- [x] Replace broad `Omit<RunWiki*Input, ...>` candidate types and SDK arbitrary-record submission with explicit role-specific top-level allowlists; parse direct adapters, Pi SDK submissions, and remote coordinator candidates through the same admission functions.
- [x] Reject candidate control over authority, actor/time, review/TDD activation, snapshot/proof scope, aggregate content proof, runtime job identity, append guards, routing, and Check selection.
  - [x] Replace broad Implementation evidence `Omit` input with one normalized allowlist; reject caller proof, approval authority, runtime routing, and deprecated aliases.
  - [x] Delete duplicate `archiveDispositionInput` and its snake-case aliases; retain one exact normalized archive disposition contract.
  - [x] Delete snake-case fields from canonical `ImplementationChangeInput`, its normalizers, worker-proof projection, and historical path explanation; reject unknown nested fields.
  - [x] Collapse canonical `ImplementationWorkerReportInput` and `ImplementationWorkerProofInput` to camel-case-only contracts, one `changeInputs` collection, and one nested `proof`; delete flattened proof fields and recursive wrappers.
  - [x] Move role-specific admission into Loop-owned `DecisionCandidateContent`, `PlanningCandidateContent`, and `ImplementationCandidateContent`; reserve Runtime for identity, context, freshness, and routing.
  - [x] Rename the active Pi SDK role and coordinator lane from `implementation_review` to `implementation`; retain no standalone Implementation reviewer concept.
  - [x] Replace broad nested Planning/Implementation candidate records and SDK tool schemas with exact Loop-owned camel-case contracts, recursive unknown-field rejection, and closed enum/value checks; name non-authoritative Implementation observations `commands`/`commandResults` so canonical Check Results remain Runtime-owned.
- [x] Replace the moved foundation's transitional `Quality*`, Standard, Assessment, Gate, `stage`, and `enforce` symbols under `src/loop-exit/**` with final Check, Check Result, Resolved Exit Policy, Exit Report, `loop`, and `require` contracts; retain no aliases.
- [x] Correct formal Criterion drift: atomic Checks expose one `requirement`; Planning candidates expose `acceptanceRequirements`; Implementation candidate evidence uses `acceptanceRequirementId`; only explicit adapters into legacy production facades retain old field names pending those clean cuts.
- [x] Replace global-by-id registration with Loop-qualified Check identity binding exact requirement digest, `code|model` kind, implementation/protocol identity, measurement schema, evidence contract, configuration, and Catalog digest; allow independent same-id definitions only across disjoint Loops.
- [x] Keep kernel registration internal and make the Catalog assign project authority so caller data cannot self-claim authority.
- [ ] Derive approved additions/exclusions, rollout progression, and frozen Planning minimums only from canonical runtime observations.
- [ ] Make frozen Planning minimums independently digest-verifiable and bind Implementation to persisted Planning minimums.
- [ ] Strictly validate loop, authority/enforcement, method-kind compatibility, requirements, repair targets, measurement bounds, thresholds, costs/timeouts, dependencies, and activation-rule refs.
- [ ] Add startup validation for unique rule identities, known Loop-qualified Checks, KB/catalog agreement, implementation refs, and dependency acyclicity.
- [ ] Add `ui_preview_targets_valid` to Planning and replace ambiguous cross-Loop release/security/accessibility/dependency semantics with Loop-specific Checks.
- [x] Add strict shared canonical JSON/digest utilities and migrate the native policy identity off its local stable-stringify implementation.
- [ ] Add constructors that derive and validate Check Result and Exit Report status; reject missing, duplicate, contradictory, wrong-candidate, wrong-policy, and wrong-measurement data.

## Next — OKF v0.2 cut

- [ ] Produce OKF v0.2 while consuming v0.1 fallback and best-effort unknown versions.
- [ ] Parse and validate `sources`, `generated`, `verified`, `status`, `stale_after`, and Attested Computation shape without granting execution authority.
- [ ] Migrate `timestamp` to truthful `generated` data and introduce meaningful software concept types without fabricating provenance or verification.
- [ ] Preserve unknown fields and Change Trace boundary; add upstream v0.2 reference-bundle fixtures.
- [ ] Keep standard provenance separate from CodeWiki authority and realization mappings.

## Next — native Check runner

- [ ] Implement minimal admission plus bounded asynchronous Code/Model Check fan-out, required-result fan-in, and immutable Exit Report construction.
- [ ] Pass `AbortSignal` through semantic adapters and Check work; normalize timeout/provider/tool failure to `indeterminate`.
- [ ] Use separate bounded pools for model/provider, CPU, test/build, and external-service work.
- [ ] Continue independent Checks despite unrelated failure; skip only invalid/stale input, real dependencies, cancellation, or budget policy.
- [ ] Bind exact cache identity to candidate, policy, Check, implementation/model, evidence, configuration, trial, aggregation, and threshold identity. TTL is eviction only.
- [ ] Keep Resolved Exit Policy, Exit Report, canonical trace, private artifacts, and telemetry as separate planes.
- [ ] Evaluate each immutable candidate once; preview and append must use the same candidate and exact evaluated Exit Report with no stochastic reevaluation.
- [ ] Move elected-generation checks immediately before each canonical append.

## Named Loop cuts

- [ ] **Decision cut:** move candidate/report/exit construction out of `src/api/wiki-decide.ts`; reuse one observed WorkState; append exact report; delete `src/decision/change-quality.ts` and superseded types/tests/exports.
- [ ] **Planning cut:** move candidate/report/exit construction out of `src/api/wiki-plan.ts`; reuse participant snapshots; make multi-trace append idempotently recoverable; delete `src/planning/portfolio-quality.ts` and superseded types/tests/exports.
- [ ] **Implementation cut:** split `src/implementation/loop.ts` into candidate facts, focused Code/Model Checks, and exit facts; remove caller-owned review/TDD authority; eliminate duplicate sync/async iteration paths; replace path/TTL evidence reuse with exact cache identity.
- [ ] **Legacy shared cut:** delete superseded `src/loops/evaluator.ts`, `feedback.ts`, `graph.ts`, `judge-prompts.ts`, `judge-provider.ts`, `judge.ts`, `quality-pack.ts`, `quality-profile.ts`, `quality-standards.ts`, and `runner.ts`, plus tests/aliases. Remove `src/loops/**` and `tests/loops/**` when empty.
- [ ] **Trace/projection cut:** replace legacy `LoopQuality*`, graph, runner, diagnostics, `qualityStandards`, and assessment/gate fields with persisted Resolved Exit Policy, Check Result, and Exit Report contracts. Remove current-catalog fallback logic.
- [ ] **Legacy config cut:** remove custom HTTP judge and independent `quality.review` authority. Pi model routes supply Model Check execution; resolved Checks determine evidence obligations. Fast feedback remains non-authoritative.

## Relationship query and learning checkpoints

- [ ] Add one bounded Project relationship projector/query service over Work and Alignment views without creating another truth store.
- [ ] Bind query results to snapshot, provenance, authority class, coverage, truncation, and staleness; enforce Assignment scope and pinned Model Check reads.
- [ ] Add runtime-owned candidate repair lineage and passive Repair Episode projection from persisted Results.
- [ ] Measure project-scale trace projection before adding any durable warm index; keep first implementation in memory.
- [ ] Add fixed metrics and ablations comparing current feedback, raw history, retrieved episodes, and issue-class-routed patterns.
- [ ] Add same-Change advisory repair context first; add cross-Change retrieval only after held-out benefit and non-regression proof.
- [ ] Compile repeatedly validated patterns into deterministic mechanisms only through an accountable Change and sealed Lab evidence.
- [ ] Add local allowlisted Feedback Bundle preview/export; no automatic network transport.

## Later product/runtime checkpoints

- [ ] Add versioned CodeWiki OS and Decision/Planning/Implementation Loop Protocol package resources; restore normal Pi Skill discovery while preserving read-only semantic-session boundaries.
- [ ] Add model bindings for Decision, Planning, and Implementation `routine`, `standard`, and `complex`; do not add an Implementation review slot.
- [ ] Extend Planning Work Items with worker-ready Workbench requirements and minimum required Checks.
- [ ] Provision exact private Worker Workbench manifests before Claim, including fresh source, context, Skills/tools, selected route, Check minimums, isolation, budgets, and report contract.
- [ ] Add deterministic Implementation tier selection, Exit-Report repair, fresh-attempt identity, and typed escalation/route-back.
- [ ] Add visible and sealed cases, calibration, latency/token/false-pass/false-block metrics, and optional offline DSPy/GEPA experiments without runtime authority.
- [ ] Project active Exit Policy, activation rationale, Check progress, Exit Reports, bounded Workbench summary, model tier, latency, and token summaries into WorkState and product surfaces.
- [ ] Add bounded Worker Report discoveries with runtime sanitation/deduplication into pending Change intake after Workbench contracts stabilize.
- [ ] Consolidate Lab after equivalent normal-pipeline gates exist.
- [ ] Add cancellation-aware draining for active semantic SDK jobs.
- [ ] Run packed external compatibility against Pi `0.82.1`; widen peer range only after proof.
- [ ] Complete external real-provider/auth, trusted OCI image, release, and broader product gates.

## Audit-derived work retained for owning cuts

### Efficiency

- Reuse runtime-observed WorkState and trace snapshots throughout one candidate attempt.
- Replace whole-repository Implementation scans with candidate-scoped shared facts or exact-repository-state caches.
- Persist self-describing policy/report data; never project history from current catalog.
- Keep default catalog immutable/runtime-owned rather than rebuilding it per resolution.
- Keep sparse policy/report output bounded and measure trace bytes before compaction changes.
- Consolidate language command/parsing scaffolding only while moving useful sensors into trusted Code Checks.

### Remove during named cuts

- Legacy hard-gate fail-fast behavior that suppresses independent feedback.
- Global path/TTL review cache without exact repository/candidate/command/config identity.
- Custom HTTP judge transport and incomplete cache identity.
- Duplicate current-Check catalogs in Loop evaluators, views, dashboard state, and assets.
- Legacy graph/profile/pack aliases and stale exports.

### Defer with explicit owner

- Break `implementation/types.ts` ↔ review-evidence type cycle during Implementation cut.
- Break `git/worktrees.ts` ↔ runtime claim-selection type cycle during Workbench/Claim work.
- Break Pi process-session ↔ trace-host-process type cycle during Loop Protocol/session work.
- Split large dashboard/runtime/preview/config/WorkState modules only with their owning behavior change.
- Add incremental trace-tail WorkState projection after Loop cuts and portfolio-scale measurement.
- Rework unrelated JSON/object parsing duplication only in owning slices.
- Rename coordinator code symbols during a dedicated runtime naming cut; do not mix with Loop-exit migration.

### Keep — intentional

- Keep ignored `node_modules`, `.pi-lens`, `.tmp-worktrees`, `dist`, `.codewiki/runtime`, and Lab-run state untracked/disposable.
- Keep dynamic dashboard daemon resolution and source-covered release-engineering utilities without activating self-dogfood.
- Keep sequential operations where ordering is semantic: Git effects, canonical effects, browser capture, cleanup, and rollback.
- Keep Pi-Lens independent and optional in Workbenches/repair; do not add a Pi-Lens Check adapter in v1.

## Competitive survival rule

If CodeWiki does not materially reduce intent drift, false acceptance, lost context, repeated repair, and integration errors enough to offset latency and ceremony, shrink it into a thin Pi/OpenClaw extension instead of maintaining a separate runtime.

## Current baseline

- Branch: `main`
- Latest pre-cut synchronized checkpoint: `bce76e6bae368bcc7621d839750e1719d309d2d9`
- Current checkpoint: consolidated architecture Knowledge and migration plan (this documentation commit)
- Existing unrelated working tree: four native resolver/registry source/test files, backed up above
- Core suite at checkpoint: 763/763 across 126 suites
- Typecheck/build: passing
- Source checkout Pi packages: `npm:pi-lens` only
- Production dependency vulnerabilities: 0
- Active Pi: `0.82.1`; CodeWiki peer range remains `<0.82.0` pending packed proof

## Update protocol

After each green slice:

1. Record completed checkpoint and commit id on the next update.
2. Move exactly one bounded next slice into **Current**.
3. Update baseline counts only when materially changed.
4. Commit and push source, tests, KB, and this checklist together when they belong to one behavior slice.
5. Keep failed experiments and command logs out of this file; use disposable `/tmp` output.
6. Delete this file after final migration and external gates complete.
