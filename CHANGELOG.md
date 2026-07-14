# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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

- Advanced the reproducible self-dogfood controller to `v0.3.7` at commit `f3955ec`, package SHA-256 `83698ea3fe491bdab6220bbda237809a7897f9ffdff95ccdacaa4cbe09948c2b`, with corrected startup-failure classification and runtime-temp readiness evidence.
- Advanced the reproducible self-dogfood controller to `v0.3.6` at commit `f87088c`, package SHA-256 `0b1837165ab04a1433a32e9ae54c4ec06591d88be637169b4abe6440f3eb6b2e`, with reviewed execution-policy routing and accepted-Change shadow evidence.
- Migrated all production semantic-loop standards to immutable enforcing kernel packs while preserving prior graph ids, versions, node behavior, routes, diagnostics, and hashes through compatibility projections.
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
- Added trace-first runtime backend support for hosts, heartbeat cycles, trigger run planning, work-unit claim selection, leases, worker starts, worker result collection, and runtime board visibility.
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
