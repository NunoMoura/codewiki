# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added bounded inline semantic artifacts and synchronized native Decision admission. Candidate, Resolved Exit Policy, Evidence Record, Check Result, Exit Report, and Runtime Route bytes now live in their typed Change operations with complete-content digests, artifact-owned identity checks, a 262,144-byte canonical limit, no dangling `state:objects/*` refs, and large/private bytes retained externally. Native Decision commits now bind a fresh team snapshot and WorkState, admit the complete parent chain under expected-head Git CAS, reject stale reruns, resynchronize, and verify every accepted operation identity.
- Added guarded provider-neutral product release after canonical publication proof. Elected-host `ProductReleasePlan` binds one exact publication operation/revision, immutable artifact id/version/digest, release target/channel/destination, expected current channel revision/digest, adapter identity, and explicit user authority. Deterministic serialized effect jobs freeze scheduled identity, revalidate canonical publication and provider artifact state, require provider-key idempotency plus release-channel CAS, and re-observe exact operation/revision/digest before appending `runtime.product.released`. Digest-bound prepared/released manifests recover persisted promotions without attributing preexisting matching channels; ambiguous acceptance remains fail-closed. Adapter errors are redacted, credentials remain provider-owned, and release grants no rebuild, republish, deployment, Git tag, announcement, adoption, runtime-health, rollback, or business-outcome authority. Source tests use an injected fake provider; package metadata remains `"private": true` and no real release occurs.
- Added guarded provider-neutral product publication after canonical project-branch push proof. Elected-host `ProductPublicationPlan` binds one closed target, bounded private artifact, exact source commit/tree and SHA-256 digest, expected destination revision/digest, adapter identity, and explicit user authority. Deterministic serialized effect jobs freeze scheduled identity, reject symbolic or escaped artifact paths, revalidate canonical push proof and artifact bytes, require provider-key adapter idempotency on the deterministic job id plus adapter-enforced destination CAS, and re-observe exact provider operation, revision, and artifact digest before appending `runtime.product.published`. Digest-bound prepared/published manifests recover persisted operations without attributing preexisting matching artifacts; ambiguous acceptance before local operation evidence remains fail-closed. Adapter failures are redacted, credentials remain provider-owned, and publication grants no deployment, release, Git, tag, channel-promotion, registry-release, or business-outcome authority. Source-repository tests use an injected fake provider; package metadata remains `"private": true` and no real publication occurs.
- Added guarded project-branch push after canonical local merge proof. Only elected-host `ProjectBranchPushAuthority` with explicit user authority may bind one configured remote, exact local branch, and expected remote commit or branch absence. Deterministic serialized external-effect jobs revalidate canonical merge event/job identity, local commit/tree, coordinator generation, checked-out branch, CodeWiki-only dirtiness, safe credential-free configured remote URL, and exact remote head before issuing a structured normal non-force push with repository pre-push hooks disabled. Canonical `runtime.project_branch.pushed` events bind prior remote state, pushed commit/tree, merge identity, authority, and runtime job. Digest-bound private prepared/pushed manifests plus exact remote-state recovery cover the persisted-push-to-append window without attributing preexisting matching remote commits; abrupt death before the `pushed` phase persists remains fail-closed and unattributed. Remote drift, divergence, force options, embedded credentials, malformed output, policy-only authority, and unrelated dirtiness fail closed. Push proof grants no product publication, deployment, package release, registry, or business-outcome authority.
- Added guarded project-branch promotion after canonical Integration proof. An elected host may supply exact user or policy `ProjectBranchMergeAuthority` for one checked-out local branch; deterministic serialized effect jobs revalidate canonical Integration event/job identity, commit trailer, parent, tree, changed paths, patch digest, coordinator generation, checkout branch, allowed CodeWiki-only dirtiness, and current target commit before executing structured hook-disabled `git merge --ff-only`. Canonical `runtime.project_branch.merged` events bind prior commit, promoted commit/tree, Integration identity, authority, and runtime job. Exact-target recovery closes the merge-to-append crash window. Stale/non-fast-forward branches, unrelated dirty paths, detached/wrong branches, absent authority, and malformed Git results fail closed. Merge proof grants no push, publication, release, or remote authority.
- Added an opt-in OCI implementation-worker adapter behind the existing harness-neutral Assignment contract. Container-only hosts now receive exact `container` Assignments only after a bounded runtime availability probe; mutable image tags and unavailable runtimes are rejected before Claim append. The adapter uses structured Docker/Podman arguments, digest-pinned images, no implicit pulls, a read-only root, dropped capabilities, no privilege escalation, bounded memory/CPU/PIDs/output/time, explicit numeric identity, exact source/outcome mounts, canonical Git common metadata mounted read-only with fixed no-lock Git environment, no network by default, optional named restricted networks, and an explicit environment allowlist. Worktree Git admin metadata must resolve to the canonical repository before container start. The runtime client receives only a minimal local environment so ambient Docker/Podman remote-context variables cannot redirect execution. Cancellation terminates the foreground runtime client, force-removes the exact deterministic container, verifies that exact name is absent, waits for exit, and only then persists the same immutable recoverable Worker report used by process workers. Malformed, failed, timed-out, or cancelled outcomes cannot become Implementation acceptance; abrupt-death outcome scratch follows active-Claim and Integration-proof sanitation rules.
- Added guarded post-acceptance worker integration and exact Git proof. Deterministic target/base Integration jobs revalidate canonical Claim-bound Assignment packets, immutable Worker reports, Implementation acceptance, Planning path scopes, coordinator generation, and trace bytes; capture committed and untracked worker changes as bounded binary patches; apply them to private integration worktrees; run `git diff --check`; and create local no-GPG commits without moving the project checkout. Canonical `runtime.integration.proven` events bind exact job, Claim, Assignment, report, target, base/parent/commit/tree, changed paths, patch digest, and check evidence. Commit-trailer and in-progress-manifest recovery close pre-append crash windows, WorkState projects exact proof, and completed worker artifacts become cleanup-eligible only after matching proof.
- Added idempotent implementation-worker artifact sanitation. Reconciliation now matches private Assignment packets and Worker reports against canonical Claims, preserves active-Claim and unintegrated completed evidence, removes pre-Claim or terminal unsuccessful packet/report/output scratch, deletes runtime-local partial worktrees, and runs structured `git worktree prune`. Exact Integration proof authorizes completed packet/report/output/worktree cleanup; unknown, external-path, or cleanup-failed artifacts remain fail-safe instead of being deleted.
- Added cancellation-aware implementation worker draining. Graceful coordinator shutdown now aborts active Assignment jobs, propagates the exact abort signal into foreground Pi processes, sends `SIGTERM`, escalates to bounded `SIGKILL`, waits for child exit, persists an immutable `cancelled` Worker report, and routes the active Claim through the guarded terminal release path without creating Implementation acceptance.
- Added Product / Dictionary as the source-backed user-facing projection of `.codewiki/kb/lexicon.md`, with exact-term search, alphabetical navigation, stable contextual links, aliases, and deprecated-term guidance specified without creating a copied glossary. Expanded the canonical vocabulary contract to distinguish Work Items, Claims, Assignments, Assignment packets, Worker reports, and claim release by authority and lifecycle.
- Added automatic WorkState-to-claim-to-Assignment dispatch inside the elected project service. Authenticated bounded triggers cause the daemon to derive ready Work Items, enforce automation, agency, supervision, capacity, Git-base, dirty-path, and worktree-isolation policy, append exact claims with CAS, persist canonically digest-bound private Assignment packets, prepare explicit worktrees, and schedule non-conflicting workers without waiting for their completion. Replacement generations recover active claims through canonical packet digests and immutable Worker reports without trusting runtime scratch as authority. Exact matched reports are filtered to selected Work Items, bound into deterministic Implementation-review job identity, and supplied as candidate evidence only. Completed claims release after canonical Implementation acceptance; failed, blocked, or cancelled reports release without becoming implementation truth. Deterministic release jobs recheck active Assignment identity, generation ownership, and trace-byte CAS before append. Reconciliation removes safe pre-Claim and terminal unsuccessful artifacts while preserving active, unintegrated completed, and ambiguous evidence. Accepted completed output now enters guarded Integration scheduling, exact Git-proof-authorized cleanup, and separately authorized fast-forward project-branch promotion. Abrupt-death process observation, push/publication/release authority, trusted worker-image distribution, and external real-container/provider-auth proof remain gated.
- Added coordinator-scheduled implementation worker Assignments. A harness-neutral contract binds exact Assignment/claim/Work Item identity, Planning and trace refs, WorkState/source/context digests, scoped paths/components, prompt digest, report path, execution policy, and explicit worktree or container isolation. Typed coordinator jobs enforce one lane per Work Item, serialize hierarchical path overlap, run independent Assignments concurrently, and recover immutable Worker reports without reinvocation. The Pi daemon installs a compatibility process adapter over the existing worker path; it requires explicit worktrees, rejects report paths outside private runtime scratch or through symlinks, normalizes output, and atomically writes digest-bound reports.
- Added bounded generation-aware coordinator event delivery. Each elected service keeps a capped operational journal with monotonic cursors, authenticated leased long polling, bounded replay, explicit reset after retention gaps, and exact runtime-observed WorkState digests. Pi clients reconnect, compare generations, refresh routing after resets, and continue completed semantic work without trusting event payloads as truth. Dashboard observers reconnect to replacement generations and bridge coordinator invalidations into the browser state stream. Packed two-Pi/dashboard proof now observes cross-process disconnect delivery; peer-absent package smoke covers the same client API. Canonical Change Traces and project sources remain authoritative; the event journal is disposable.
- Added coordinator-owned Pi SDK semantic dispatch. The executable Pi daemon dynamically loads the optional entrypoint-isolated SDK adapter, advertises service-owned versus client-candidate execution, and runs exact Decision, Planning, or Implementation-review sessions behind authenticated trigger requests. Thin Pi clients hide semantic candidate tools when daemon execution is available; peer-absent packed installs remain operational with only the runtime-selected candidate fallback. Focused gates prove adapter loading, daemon-owned append execution, fallback capability, and clean shutdown without moving Pi SDK imports into harness-neutral runtime modules; the packed two-Pi/dashboard gate additionally proves discovery of the host Pi SDK across the installed package boundary.
- Added the detached project coordinator daemon and thin Pi/dashboard service clients. Pi sessions now use leased authenticated connections for runtime inspection, active semantic-tool routing, candidate-only submission to exact coordinator jobs, heartbeat, generation failover, and clean `session_shutdown`; dashboard runtimes register distinct observers. Removed the process-local reactor registry. A packed disposable gate starts two real Pi RPC processes plus one dashboard, proves all three share one coordinator generation with two approved supervisors, verifies execution pauses after both Pi clients exit, and confirms explicit shutdown leaves no daemon.
- Added exact semantic execution to the elected project coordinator service. Authenticated clients submit bounded triggers only; runtime derives compatible Decision, Planning, and Implementation-review invariants, maps each to a typed lane and deterministic idempotency identity, revalidates fresh WorkState, executes one invariant without crossing lanes, and rechecks coordinator generation ownership before append. Successful semantic events carry the runtime-owned job id, allowing a replacement generation to recover exact trace event evidence without reinvoking the adapter. Focused and packed-package gates prove stale-selection rejection, pre-append fencing, remote execution, all-loop evidence binding, and no-reinvoke restart recovery.
- Added `@nunomoura/codewiki/coordinator`, a cross-process project-service host/client boundary around the coordinator kernel. It elects one live owner through an exclusive project lock, binds only to `127.0.0.1`, stores bearer endpoint metadata with current-user permissions, requires exact-generation request capabilities, rechecks ownership on every request, leases remote client registrations, rejects query-token access and unknown fields, replaces dead owners under new generations, and fences stale live sockets. Disposable multi-process and packed-package gates prove live-owner exclusion, two-client shared supervision, lease expiry/heartbeat, stale-generation rejection, unclean-process takeover, and cleanup.
- Added a transport-neutral `ProjectCoordinator` scheduling kernel with concurrent Pi/dashboard/CLI client registration, explicit supervised/unattended admission, deterministic typed lanes, resource-conflict holds, one Planning writer, one writer per integration target, bounded idempotency memory, mandatory durable recovery for canonical writes, and restart-safe recovery hooks. `RuntimeReactor.selectRuntimeReactions()` now derives bounded compatible Decision, Planning, and Implementation horizons while preserving the singular executor as one job primitive. Focused and packed-package tests prove unrelated Decision and Work Item concurrency, overlapping-work holds, Planning/integration/effect serialization, supervision pause, duplicate suppression, and no duplicate durable write after restart.
- Added an entrypoint-isolated `@nunomoura/codewiki/pi-sdk` semantic-session adapter for bounded read-only Decision, Planning, and Implementation review. It accepts exactly one closed object candidate, limits invocation/candidate size and wall time, emits bounded lifecycle observations, disables discovered Pi resources, and blocks read-tool paths, globs, and symlinks that escape the project root. Unit and packed disposable-project gates prove the adapter without a model turn. Pi SDK remains an optional peer during the real model/auth architecture spike; process workers remain separate.
- Added canonical Product/System direction for one project-scoped CodeWiki control plane, purpose-built Work / Backlog / Planning / Implementation surfaces, Product / Users / Stories, canonical System diagrams, Design / Guidelines / UIs, and Change dossiers instead of per-Change pipelines.
- Added canonical JSONL Change Traces from first explicit persistence, with one stable Change-to-trace binding, Decision-loop intake/revision/status events, exact store/revision guards, and deterministic multi-Change batch identities. No hidden Git-ref store or compatibility importer remains.
- Added `WorkState`, a deterministic disposable project-wide projection over Change Traces that joins approved Changes, global Planning epochs, many-to-many Sprint membership, one owning Change per Work Item, Assignments, realization, blockers, incomplete multi-trace commits, next actions, and stable snapshot digests without creating another truth store.
- Added Pi-inspired streaming JSONL reads, incremental `WorkStateSession` tail refresh, and deterministic `RuntimeReactor` selection with trigger-local priority, bounded linked/overlapping Planning horizons, and quiescence when no eligible semantic work exists. Pi active-tool routing now keeps archive and unrelated semantic-loop schemas out of model context, activating at most the runtime-selected loop adapter.
- Added digest-bound Live Preview profiles and canonical `uiPreviewTargets[]` with exact package-script and target content guards, Planning-owned target/profile bindings, Change/Sprint/Work Item correlation, profile-deduplicated native server supervision across routes, exact integration Git/tree/working-state digests, loopback readiness and attach behavior, automatic Implementation-stage startup, system/Playwright browser adapters, Pi-session cleanup, bounded redacted logs, source-harness reuse, and target-specific dashboard Open/Capture/Restart/Stop controls without adding a `/wiki-preview` command. Side-effect-free Playwright CLI preflight and verified browser-session state disable unsupported actions and provide explicit install/restart guidance without silently installing software. Explicit Playwright Capture writes accepted desktop/mobile screenshots plus bounded redacted console/network observations to a digest-correlated operational manifest tied to canonical UI target, contributing Changes, Sprint, Work Items, relevant Implementation iterations, and exact integration checkout state.
- Added a Google DESIGN.md-compatible `.codewiki/kb/product/DESIGN.md` to bootstrap output, with machine-readable visual tokens plus branding, typography, iconography, component, accessibility, and durable visual-reference guidance that remains valid CodeWiki OKF knowledge.
- Added a source-only `dashboard:dev` harness that requires a disposable external project, serves live-reloading dashboard assets without loading the CodeWiki extension, and opens the loopback dashboard through bounded system-browser or optional Playwright CLI adapters.
- Added deterministic quality-first execution policy with explicit provider/model/thinking propagation, pricing snapshots, tool and quality floors, bounded higher-quality escalation, token/cost/latency budgets, immutable autonomy ceilings, dashboard policy visibility, and fail-closed completion spend checks.
- Added guarded dashboard trace execution controls plus a supervised Trace Host result bridge that consumes Pi JSON events, retains only bounded sanitized outcomes, exposes approval digests without granting approval authority, captures resumable session identity and model/usage telemetry, resumes exact Pi sessions only through state/session guards and external-action acknowledgement, and fails closed on malformed, secret-shaped, or missing result envelopes.
- Added one strict declarative quality-pack schema for production and lab standards, with closed graph/evaluator/evidence identifiers, protected kernel standards, deterministic composition, and `observe`/`warn`/`enforce` rollout modes.
- Added Implementation Trace Detail worker-attempt observability, separate aggregate Integration and Exit Review, a deterministic human Activity Feed, and a bounded redacted Dev Log with failure retention and successful-close cleanup.
- Added dashboard runtime identity and endpoint health checks so stale loaded controllers and state-serving failures produce actionable restart/retry guidance instead of an unexplained blank shell.
- Added the CodeWiki lab for Decision, Planning, and Implementation exit
  condition scores (DEC, PEC, IEC), weighted quality standards, and candidate
  loop-exit experiments.
- Added the lab holdout runner for sealed external evaluation bundles that live
  outside the repository and are not visible to candidate agents.
- Added the pipeline carryover lab (PCE) for testing decision-to-planning-to-
  implementation trace handoff fidelity with production-shaped trace events.
- Added `lab/program.md` and `npm run lab:objective` as the optimizer-facing
  quality-network program and scalar objective for visible/sealed lab scoring.
- Added versioned production loop quality graphs in `src/<loop>/loop.ts` and
  aligned lab candidates around graph ids, versions, layers, costs, and repair
  targets.
- Added `npm run lab:graph` for inspecting production/candidate graph shape,
  hashes, layers, and node deltas.
- Added `npm run lab:forge` for reducing trace JSONL into sanitized,
  human-labeled draft case material without treating raw traces as truth.
- Expanded visible DEC, PEC, and IEC seed corpora from 3 to 5 cases per loop.
- Hardened trace append helpers to validate records before writing, preventing
  stale generic semantic event names from corrupting hot trace files.
- Fixed trace-derived view projections to ignore superseded non-exit decision
  and planning attempts plus conflicts from already completed work units.
- Changed the `wiki_state` tool summary to report active work items rather than
  total historical work items.
- Added shared loop route metadata plus a direct implementation route for
  explicitly scoped, tiny/small low-risk decisions.
- Routed Planning and Implementation user-clarification/validation uncertainty
  back to Decision instead of blocking directly.
- Added a CodeWiki-owned loop graph runner with parallel node execution,
  hard-gate skip/fail-fast behavior, timeout diagnostics, and no Pi extension
  dependency.
- Added loop quality graph contract tests covering node method, gate,
  timeout, and per-node failure feedback across Decision, Planning, and
  Implementation.
- Added explicit hard-gate policy tests for binary semantic contracts in all
  three loop quality graphs.
- Added loop quality method policy tests for deterministic, agent-assessed,
  human-authority, and external-evidence standards.
- Added compact `qualityDiagnostics` repair feedback to loop results and trace
  outputs, sorted so hard-gate blockers appear before softer guidance.
- Added `npm run lab:promotion` to report promotion eligibility across visible
  gates, PCE, sealed holdout status, objective threshold, graph diff, and human
  review.
- Split loop graph identity from graph evaluation, added shared
  `src/loops/quality-standards.ts`, and routed production loop quality-standard
  evaluation through the per-loop `quality-standards.ts` modules.
- Wired `wiki_decide`, `wiki_plan`, and `wiki_implement` through the
  CodeWiki-owned loop runner for production quality-standard evaluation while
  preserving existing verdict and diagnostic semantics.
- Added independent quality-judge infrastructure for `agent_self_assessment` and
  `model_judge` standards with fake-judge tests, one batched call per loop
  attempt, graph/prompt/input-evidence cache keys, hard-gate skip behavior,
  versioned prompts, optional HTTP provider injection through config/env,
  `npm run lab:judge-calibration` for sealed judge calibration bundles,
  judge-calibration promotion gating in `npm run lab:promotion`, and
  `npm run lab:experiment` for isolated candidate worktree evaluation.
- Added `npm run lab:auto-experiment` for budgeted lab-only candidate sweeps with
  run, wall-clock, candidate-file, and diff-byte limits; score-only sealed
  feedback; best-candidate reporting; and no production graph mutation or
  automatic promotion.
- Added loop-level batched judge prompts for enabled production quality judges,
  including structured loop evidence, per-standard verdicts for semantic
  `model_judge` standards, prompt version `loop-quality-judge.v3`, and
  deterministic hard-gate prechecks before judge calls.
- Added quality-network judge-node metadata so each non-deterministic standard
  has its own specialized rubric and 0-100 judge score while still allowing
  batched transport per loop attempt.
- Added `npm run lab:judge-smoke` to validate a configured judge endpoint with
  synthetic non-private loop packets before sealed judge calibration.
- Added `npm run lab:sealed-template` to create off-repo starter templates for
  private holdout and judge calibration bundles without treating templates as
  sealed evidence.
- Added `npm run lab:sealed-check` to validate filled sealed bundles are
  off-repo, placeholder-free, and contain pass controls plus fail/block traps.
- Added lab loss v2 reason labels: fail/block cases can declare expected
  standard failures plus failure classes, so route-correct wrong-reason exits
  still lose score.
- Added reviewed self-dogfood baseline creation and verification with clean Git
  enforcement, Git tree content proof, package SHA-256 pinning, reviewer refs,
  and disposable state/config/decision-preview shadow execution that verifies
  source config and trace bytes remain unchanged.
- Added a tracked controller pin and fresh-clone installer that rebuilds the
  reviewed baseline commit in a detached worktree, requires an exact tarball
  byte count and SHA-256 match, and installs only that artifact under `.pi/npm`.

### Changed

- Collapsed the pre-release Worker receipt / Worker result split into one immutable Worker report with explicit attempt status. Runtime now persists, recovers, validates, and submits the same report through `workerReports`, `reportPath`, `reportRef`, and `runtime-worker-report:*` contracts while keeping canonical Implementation acceptance separate.
- Reframed Pi ownership: CodeWiki owns project orchestration and client projections; Pi provides conversational clients plus entrypoint-isolated semantic-session and process-worker execution adapters. Compatible independent invariants may run concurrently while Decision revision, project Planning, Work Item claim, integration, commit, and publication lanes remain explicitly serialized where required.
- Replaced the intended Change-rooted dashboard pipeline with separate Backlog intake, project Planning graph, Implementation execution cockpit, Product, System, Design, and cross-cutting Change dossier contracts. The existing production dashboard remains implementation drift pending the control-plane and multi-session external spike.
- Moved semantic-loop invocation behind `runRuntimeSemanticExecutor()`. Runtime now selects one eligible owner, injects canonical entity and append authority, enforces iteration/wall-clock/CAS budgets, reruns stale observations, stops on route-back, and repeats committed progress to quiescence. Pi semantic tools now submit judgment or evidence candidates instead of calling loop facades with caller-marshalled repository facts.
- Removed caller-marshalled Implementation authority. `runWikiImplement()` now resolves runtime-selected Sprint, Work Items, owning Change, Planning events, Assignments, source ownership, trace parent, sequence, and byte guards from canonical project state; host runners group worker evidence by canonical Work Item ownership.
- Reframed CodeWiki as one supervised event-driven runtime outer loop around exactly three quality-governed semantic loops. Change is now the accountable intent carrier; Decision is approval of an exact Change revision rather than a separate entity; Planning owns Sprint creation across the relevant approved-Change portfolio; one Change may span several Sprints and one Sprint may coordinate several Changes; Sprint and Backlog state are views rather than separate truth roots.
- Cut Change APIs, feedback intake, dashboard Change reads, and Decision acceptance over to JSONL Change Traces, then removed the hidden Git-ref constants, readers, migration adapters, fixtures, and compatibility tests in a clean pre-release cut.
- Selected `@nunomoura/codewiki` as the eventual npm identity while retaining `"private": true` so npm publication remains blocked during stabilization.
- Advanced the reproducible self-dogfood controller to `v0.3.9` at commit `a04aca6`, package SHA-256 `b13f58bb48715af3ef9bb1c60f67da73c3ee0f8c6072a554b505f145c50ae5dd`, with bounded model-visible focused state and direct closure sequencing.
- Advanced the reproducible self-dogfood controller to `v0.3.8` at commit `0c003d9`, package SHA-256 `48a07c29b86c759d63745cdab58ed54bac18944e8f588d7ffc5cc2665c342d29`, with guarded trace-id archive closure and exact budget-stop attribution.
- Advanced the reproducible self-dogfood controller to `v0.3.7` at commit `f3955ec`, package SHA-256 `83698ea3fe491bdab6220bbda237809a7897f9ffdff95ccdacaa4cbe09948c2b`, with corrected startup-failure classification and runtime-temp readiness evidence.
- Advanced the reproducible self-dogfood controller to `v0.3.6` at commit `f87088c`, package SHA-256 `0b1837165ab04a1433a32e9ae54c4ec06591d88be637169b4abe6440f3eb6b2e`, with reviewed execution-policy routing and accepted-Change shadow evidence.
- Migrated all production semantic-loop standards to immutable enforcing kernel packs. Current graph identities version with current contracts; stale pre-release contracts receive no compatibility projection.
- Migrated all lab candidates to observe-only lab packs and exposed pack identity in graph reports without granting candidates production or controller authority.
- Hardened the Decision lab candidate with a deterministic specificity standard,
  raising DEC to 100 against the locked seed cases.
- Hardened the Planning lab candidate with deterministic work-unit specificity
  and path-scope overlap standards, raising PEC to 100 against the locked seed
  cases.
- Hardened the Implementation lab candidate with a deterministic evidence
  specificity standard, raising IEC to 100 against the locked seed cases and
  making `npm run lab:gate` pass.
- Renamed the canonical production and lab quality-graph files to
  `loop.ts`.
- Upgraded loop quality graph schema metadata to include explicit methods,
  binary/soft gates, and timeout budgets.
- Hardened Decision, Planning, and Implementation graph gate classification so
  core route, coverage, authority, traceability, scope, and evidence failures are
  hard gates.
- Classified Implementation check, TDD, and content-proof standards as
  `external_evidence` instead of deterministic semantic checks.
- Changed deterministic production quality nodes from binary-only scores to
  partial 0-100 scores based on activated issue coverage while preserving
  fail-closed route status and hard-gate behavior.
- Changed generated Git worktree operations from shell command strings to
  structured executable-and-argument commands, with runtime handoff schema v2.
  Explicit project setup commands remain host-approved shell commands.
- Upgraded quality graph schema to v3 with validated node dependencies, cycle
  rejection, and dependency-aware runner scheduling.
- Disabled mutable-source CodeWiki loading; after packed external, shadow,
  reproducible installer, and explicit approval gates passed, supervised
  repo-local autoload now targets only the reviewed controller under `.pi/npm`.

### Fixed

- Added bounded model-visible focused `wiki_state` data and a direct closure sequence so Trace Hosts receive closability and append guards without reconstructing state through repository searches.
- Added guarded `traceId`-based archive close resolution and closure-host guidance so agents no longer consume entire raw trace files before calling `wiki_archive`.
- Reported the exact elapsed-time, latency, route-timeout, token, or monetary limit that stopped a supervised Trace Host instead of labeling every budget stop as elapsed-time exhaustion.
- Allowed the documented ignored `.codewiki/runtime/tmp/**` operational root in readiness checks without treating it as active workflow truth or permitting other runtime roots.
- Preserved authoritative Trace Host process failures when economic budgets are configured instead of masking missing-credential or startup failures as missing-usage budget blockers.
- Migrated the pinned-controller shadow gate to seed and preview an exact validated Change acceptance instead of calling the removed authored-proposal Decision input.
- Cleared loop-standard timeout handles after node settlement and attributed
  skipped standards to their actual failed dependency.
- Restricted dashboard endpoint metadata, bearer tokens, and daemon logs to the
  current OS user on POSIX hosts.
- Prevented dashboard keyboard shortcuts and trace toggles from interfering with
  nested controls, while adding keyboard focus and expansion state to trace cards.
- Updated the packed-package smoke contract for the dashboard shutdown hook.
- Rejected unknown config keys at every nested config boundary instead of
  silently discarding misspelled policy fields.
- Moved the dashboard launch token from the request URL into a fragment-backed
  session capability, added restrictive browser headers, and removed duplicate
  trace-file reads from dashboard refreshes.
- Kept open blocked traces visible in the dashboard Active facet while preserving
  their simultaneous visibility in Blocked.
- Made open dashboards stream trace appends immediately and recover through
  bounded one-second polling when event delivery is missed or disconnected, then
  advanced the reviewed pinned controller baseline to serve both fixes.

### Notes

- Visible lab 100% is no longer treated as meaningful proof by itself; promotion
  requires PCE coverage, objective scoring, an external holdout gate, and review.
- App benchmarks remain deferred until the lab-proven standards are reviewed and
  promoted into production loop exits.

## [0.3.0] - 2026-06-22

### Added

- Added the production-readiness gate for the Pi package: package install smoke, Pi RPC smoke, Pi mutation smoke, project-local install smoke, external lifecycle smoke, external failure smoke, readiness checklist, npm audit, and diff hygiene.
- Added trace-first runtime backend support for hosts, heartbeat cycles, trigger run planning, work-unit claim selection, leases, worker starts, worker report collection, and runtime board visibility.
- Added exact Pi extension surfaces for direct slash commands (`/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, `/wiki-bootstrap`) and model-facing tools (`wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_archive`).
- Added private pre-release package metadata and local pack/install gates for future npm distribution readiness.

### Changed

- Kept the package private and documented that the future npm registry package name is TBD because the unscoped `codewiki` name is already owned by another maintainer.
- Changed semantic trace output events from generic loop iteration names to split `loop` plus specific `event` facts such as `decision.rows_approved`, `planning.work_units_created`, and `implementation.evidence_accepted`.
- Kept runtime coordination events under `runtime.*` without semantic `loop` fields.
- Made `wiki_state` trace-derived only and kept source ownership in the KB source map and `/wiki-explain` path.
- Updated package documentation to avoid advertising a public npm install before the package is ready to publish.

### Removed

- Removed the repo-local CodeWiki extension shim and repo-local dogfood gate.
- Removed the grouped `/wiki ...` slash namespace in favor of direct `/wiki-*` commands.
- Removed the `_OLD_VERSION/**` archive after completing migration audit and production-readiness cleanup.

### Validation

- `npm run audit:codewiki` passed before this release preparation.
- `npm view codewiki` showed the unscoped package name belongs to another maintainer; no public publish target is selected yet.

## [0.1.2] - 2026-05-28

### Added

- Initial changelog baseline for the early scaffold package line.

### Notes

- Earlier development occurred before this changelog was introduced.
- The package remains private during current distribution-readiness work.
