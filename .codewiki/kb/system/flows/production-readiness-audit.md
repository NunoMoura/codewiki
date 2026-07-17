---
type: Concept
title: Production readiness audit
description: "Status: external package, Pi install, lifecycle, and failure gates define readiness; the source repository does not load CodeWiki."
tags:
  - codewiki
  - system
  - production
  - readiness
  - audit
timestamp: 2026-06-30T00:00:00Z
---
# Production readiness audit

Status: package readiness is evaluated through packed installs in disposable external projects. The source repository does not register, install, or load CodeWiki during stabilization.

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
- Production loop quality graphs live in `src/<loop>/loop.ts` as immutable enforcing kernel quality packs and persist graph identity in semantic events and tail checkpoints. Compatibility projections preserve the pre-migration graph ids, versions, nodes, routes, diagnostics, and hashes.
- Lab candidates use the same strict pack schema with `authority: lab` and `rollout: observe`; graph reports expose pack identity while locked tests prevent candidate-owned evaluator authority.
- `.pi/settings.json` loads pi-lens only. No CodeWiki controller pin, local package registration, project-local CodeWiki skills, Changes Backlog ref, or dogfood trace state is active in this source checkout.
- Packed candidate artifacts are installed only into disposable external projects with isolated Pi settings. Install, RPC, guarded mutation, lifecycle, failure, dashboard, and cleanup smokes exercise extension behavior without granting candidate code authority over its own source.
- Historical pinned-controller evidence remains recoverable from Git and the ignored migration backup, but it grants no current activation or release authority.
- `npm run lab:forge` can reduce hot trace JSONL into sanitized draft case
  material while requiring human labels.
- Loop exits expose compact `qualityDiagnostics` repair feedback in trace output
  so agents see hard-gate blockers before softer guidance.
- `npm run lab:promotion` reports promotion eligibility across visible gates,
  PCE, sealed holdout, objective threshold, graph diff, and human review; the
  current state is correctly blocked until sealed holdout and review evidence
  exist.

## Fixed during this audit

- Removed repo-local CodeWiki package registration, controller pin, project-local CodeWiki skills, Changes Backlog ref, and dogfood traces after preserving recovery artifacts and migrating accepted intent into the Knowledge Base.
- Updated readiness, docs, and drift checks so package readiness is proved externally while source-repository self-hosting stays disabled.
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

- External test use remains supervised: every append requires preview and expected byte/sequence guards; unattended workers, auto-merge, and auto-publish remain disabled.
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
- Project-composed semantic policies and the Quality Designer remain deferred. Current packs cannot add arbitrary JavaScript/shell evaluators, custom semantic loops, automatic merge, automatic publication, or controller advancement.

## Risks / follow-up work

- Fully restart Pi in a disposable consuming project after installing a different packed CodeWiki build; an already-running session can keep stale registered modules. The source repository itself must continue loading pi-lens only.
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

Current validation set:

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
npm run lab:graph
npm run lab:objective
npm run lab:promotion
npm run lab:forge -- --json
npm audit --omit=dev
git diff --check
```

Quality-pack equivalence evidence:

- Production Decision, Planning, and Implementation graph hashes remain byte-for-byte equivalent to their pre-migration identities.
- Public facade suites, strict kernel-override tests, all lab tests, package/Pi/readiness gates, and typecheck must pass before any release review.
- Rollback remains a normal Git revert of production or lab migration commits followed by the same external package gates; no source migration may silently replace an already reviewed release artifact.

Current lab evidence:

- DEC: 100 on 5 visible cases.
- PEC: 100 on 5 visible cases.
- IEC: 100 on 5 visible cases.
- PCE: 100 on 3 visible cases.
- Objective: 90 visible-only; no sealed holdout cases.
- Promotion: blocked until sealed holdout evidence and human review exist.
