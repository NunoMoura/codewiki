---
type: Concept
title: Production readiness audit
description: "Status: package, pinned-baseline, shadow, and reproducible controller-install gates are green; supervised repo-local Pi autoload uses only the reviewed controller."
tags:
  - codewiki
  - system
  - production
  - readiness
  - audit
timestamp: 2026-06-30T00:00:00Z
---
# Production readiness audit

Status: package readiness, reviewed pinned-baseline shadow, and reproducible controller-install gates are green. Supervised repo-local Pi autoload uses only the reviewed controller.

## Ready now

- Public Pi command surface is bounded to `/wiki-dashboard`, `/wiki-resume`,
  `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`.
- Model-facing tool surface is bounded to `wiki_state`, `wiki_config`,
  `wiki_decide`, `wiki_plan`, `wiki_implement`, and `wiki_archive`.
- No runtime model-facing tool is exposed; runtime coordination remains
  backend/host plumbing.
- `lab/**` is outside package files and Pi extension registration.
- Package metadata keeps `private: true`; public npm publish remains gated.
- Trace append paths use expected byte/sequence checks in mutation smokes.
- Production loop quality graphs live in `src/<loop>/loop.ts` and persist graph
  identity in semantic events and tail checkpoints.
- Supervised repo-local self-dogfood is enabled: `.pi/settings.json` loads the
  verified `.pi/npm/node_modules/codewiki` controller beside pi-lens,
  `.codewiki/config.json` enables the Pi host, and no extension shim is present.
- Baseline tooling refuses dirty source, pins reviewed commit/tree/package
  integrity in host-owned ignored evidence under `.pi/npm/codewiki-baselines/**`,
  and verifies that pin independently. The tracked
  `.pi/codewiki-controller.json` pin plus
  `npm run self-dogfood:controller:install` can reconstruct the exact reviewed
  tarball from Git history for fresh clones before local installation.
- Reviewed commit `6c7d77ebd5c2fdcc83bb26dcf5ca616969dbe65f`, tree
  `de82d060cd0a6bade47d77c00b3fe2f68e3f6f57`, and package SHA-256
  `0114a16df6426ccea97858b6d284698ceb4f0ba7102e3d235965948ef9153336`
  passed the full candidate gate and disposable shadow state/config reads plus a
  decision preview. Source config and trace digests remained unchanged.
- `npm run lab:forge` can reduce hot trace JSONL into sanitized draft case
  material while requiring human labels.
- Loop exits expose compact `qualityDiagnostics` repair feedback in trace output
  so agents see hard-gate blockers before softer guidance.
- `npm run lab:promotion` reports promotion eligibility across visible gates,
  PCE, sealed holdout, objective threshold, graph diff, and human review; the
  current state is correctly blocked until sealed holdout and review evidence
  exist.

## Fixed during this audit

- An earlier audit enabled controlled repo-local dogfood through `..`; the
  current refactor superseded that operating state and kept repo-local loading
  disabled through pinned-baseline and shadow validation. Those gates now pass;
  reproducible controller deployment remains separate.
- Updated readiness/docs/drift checks to treat package readiness and repo-local
  self-dogfood activation as separate decisions.
- Made `lab/**` and `.codewiki/config.json` canonical trace refs so audit and
  lab evidence can be cited without false trace-fidelity failures.
- Added tests for canonical lab/config refs and the dogfood boundary.
- Added the trace-derived draft case forge and tests so real traces can become
  reviewable case material without becoming automatic truth.
- Expanded visible DEC, PEC, and IEC seed corpora from 3 to 5 cases per loop.
- Added low-level trace append validation so invalid semantic event names are
  rejected before any write reaches hot trace files.
- Fixed view projections so superseded decision/planning attempts, superseded
  blockers, and conflicts from already completed work no longer keep finished
  traces blocked or queued.
- Updated the `wiki_state` tool summary to report active work items instead of
  total historical work items.
- Added the shared AX route contract and direct implementation route for tiny or
  small low-risk decisions, while routing planning/implementation ambiguity back
  to Decision.
- Renamed the canonical production and lab quality-graph files to `loop.ts` and
  added a standalone CodeWiki loop graph runner with parallel node execution,
  hard-gate skips, timeout diagnostics, and node contract coverage tests.
- Added compact loop quality diagnostics and a lab promotion eligibility report
  so repair guidance and candidate promotion gates are explicit.

## Remaining blockers before production release

- Repo-local use remains supervised: every append requires preview and expected
  byte/sequence guards; unattended workers, auto-merge, and auto-publish remain
  disabled.
- Public npm publish is still blocked: package is private and the registry name
  is unresolved.
- Objective evidence is visible-only: sealed holdout has zero cases and the
  objective remains capped at 90.
- Visible DEC/PEC/IEC/PCE corpora are tiny seed sets; they are regression smoke
  evidence, not release confidence.
- Trace-derived case curation is not complete yet; the forge now creates drafts,
  but humans must label downstream outcomes before cases join visible or sealed
  evals.
- Isolated experiment runner/worktree loop is not built yet, so lab candidates
  cannot be safely optimized autonomously. The semantic loop graph runner exists,
  but the isolated experiment runner remains separate follow-up work.
- Promotion from `lab/<loop>/loop.ts` to `src/<loop>/loop.ts` is now guarded by
  an explicit report, but actual promotion remains blocked until sealed holdout
  evidence and human review are available.

## Risks / follow-up work

- Restart/reload Pi after enabling repo-local dogfood or rebuilding `dist/**`;
  an already-running Pi session can keep stale registered tool code. If a stale
  tool surface emits legacy event names, `npm run test:readiness` catches the
  invalid hot trace and current append helpers reject those records before write.
- Package contents include runtime/backend APIs and the temporary CLI harness in
  `dist/**`. This is acceptable for current smokes, but release review should
  decide whether to narrow `files` before public publish.
- `lens_diagnostics` still reports stale TypeScript findings that contradict
  `tsc --noEmit`; keep using `npm run typecheck`, `npm test`, and package smokes
  as authoritative until the lens cache issue is resolved.
- Pi-lens quality warnings highlight complexity/noise in several source and lab
  files. They are not blocking tests today, but they should be triaged after
  release-critical gates.

## Validation evidence

Passed during this audit:

```bash
npm run typecheck
npm test
npm run build
npm run test:readiness
npm run test:pack
npm run test:pi-install
npm run test:pi-rpc
npm run test:pi-mutation
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run lab:gate
npm run lab:pipeline -- --gate
CODEWIKI_BASELINE_MANIFEST=<path> npm run test:self-dogfood-ready
npm run lab:graph
npm run lab:objective
npm run lab:promotion
npm run lab:forge -- --json
npm audit --omit=dev
git diff --check
```

Current lab evidence:

- DEC: 100 on 5 visible cases.
- PEC: 100 on 5 visible cases.
- IEC: 100 on 5 visible cases.
- PCE: 100 on 3 visible cases.
- Objective: 90 visible-only; no sealed holdout cases.
- Promotion: blocked until sealed holdout evidence and human review exist.
