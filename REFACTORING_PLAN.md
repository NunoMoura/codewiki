# CodeWiki Refactoring Plan

## Purpose

This file is temporary source-repository execution tracking. CodeWiki Runtime is not active in this checkout: there are no operational Changes, WorkState, Change Trace, or semantic Loops coordinating this refactor.

The repository uses ordinary development workflow:

- `.codewiki/kb/**` defines accepted desired Product and System state.
- `src/**` and `tests/**` define executable state.
- This file records the temporary implementation delta between them.
- Git records checkpoints and completed history.

Delete this file when the completion conditions at the end are met. It is not canonical Knowledge and must not be copied into generated views or package output.

## Current checkpoint

The native Knowledge clean cut establishes the accepted target structure and executable validation profile. Remaining source paths still reflect migration debt tracked below. The pre-cut dirty documentation diff is preserved externally at `/tmp/codewiki-kb-pre-clean-cut.diff` for review only.

The accepted target source topology is:

```text
src/
  changes/
    intake/
    triage/
    trace/
  decision/
  planning/
  implementation/
  verification/
  evidence/
  work-state/
  alignment/
  knowledge/
  runtime/
  api/
  clients/
  harnesses/
  project/
  preview/
  git/
  utils/

benchmarks/
tests/
```

Use breaking clean cuts. Do not add compatibility aliases, old-path re-exports, dual contracts, transitional writes, empty package roots, or global prose replacements. Perform moves from reviewed manifests with `git mv`, then rewrite module specifiers only.

## Deep-clean file budget

The reviewed file-level inventory is `.tmp-worktrees/deep-clean-file-budget.json`, anchored to commit `b482368`. It assigns every tracked file at that snapshot, plus the temporary inventory itself, exactly one `keep`, `move`, `merge`, or `delete` disposition and names every surviving current-file target path.

Current inventory including the temporary manifest:

| Area | Files |
| --- | ---: |
| Tracked total | 705 |
| `src/**` | 371 |
| `tests/**` | 229 |
| `lab/**` | 38 |
| Knowledge | 41 |
| Scripts | 5 |
| Temporary execution files | 6 |

Reviewed dispositions:

| Disposition | Files |
| --- | ---: |
| Keep | 392 |
| Move | 139 |
| Merge | 3 |
| Delete | 171 |

The derived target before reserved additions contains 294 source files, 178 test/support files, three benchmark files, one script, 41 Knowledge files, and 14 other tracked project files. Reserved additions cover only unfinished GitHub intake, bounded query tools, replacement lifecycle/recovery contracts, benchmark harnesses, and their tests.

Hard completion caps:

| Area | Hard cap |
| --- | ---: |
| `src/**` | 315 |
| `tests/**` | 190 |
| repository-root `benchmarks/**` | 10 |
| `scripts/**` | 1 |
| `lab/**` | 0 |
| tracked repository total | 575 |
| packed package files | 650 |

The reserved projection is 310 source files, 188 test/support files, ten benchmark files, and 564 tracked files. The difference between each projection and cap is contingency, not permission for unreviewed growth.

After the Lab and source-checkout self-dogfood clean cut, 641 tracked files remain: 369 source files, 209 test/support files, zero Lab files, and one script. The worker/trace-host process split temporarily raises the packed package to 743 files; deleting the remaining trace-host shell and later source consolidation must reduce it below 650.

Budget rules:

- A move improves ownership but does not count as file reduction.
- A merge is allowed only when one responsibility and one lifecycle remain; unrelated modules must not be combined to hit a number.
- A delete occurs only after replacement parity and importer removal are proven in the same clean cut.
- Every new file consumes the named reserve. Exceeding a reserve requires deleting or merging another file in that slice.
- Temporary manifests, this plan, Lab, self-dogfood machinery, legacy Trace/Quality/View authority, and trace-host debt have zero final budget.
- Keep `test:coordinator` as a focused developer command; `audit:codewiki` does not rerun that already-covered subset.

## Work slices

### 1. Rehome generic Runtime mechanics

- [x] Move guarded branch merge/push, publication, and release effects into `src/runtime/effects/**`.
- [x] Move generic claim events, lease expiry, and Work Unit claim selection into `src/runtime/claims/**`.
- [x] Move project coordinator authority, service, process, endpoint, event journal, daemon launcher, and package entrypoint into `src/runtime/coordinator/**`.
- [x] Move worker assignment/report contracts, start/report orchestration, artifact custody, report persistence, observations, and execution policy into `src/runtime/workers/**`.
- [x] Remove all Runtime-to-Pi imports by making concrete Pi sessions depend inward on generic worker contracts.
- [x] Port packed failure coverage to current worker/worktree contracts and delete legacy `src/runtime/host-runner.ts`.
- [x] Partition Runtime-owned worker dispatch/job scheduling, Integration, and claim release into responsibility directories.
- [x] Partition authenticated Decision admission, attempt scheduling, and canonical writes into generic Runtime responsibility directories.
- [x] Partition Change admission, bounded research collection, and worker handoff into generic Runtime responsibility directories.
- [x] Partition reaction selection, reaction scheduling, and semantic job identity into Runtime Coordinator.
- [x] Invert concrete Loop API imports through injected execution ports and relocate the semantic executor to `src/runtime/coordinator/executor.ts`.
- [x] Remove repeated responsibility prefixes from Coordinator, Worker, and Container filenames.
- [x] Move Runtime scratch paths, bounded Dev Log storage, and canonical trace append mechanics into `src/runtime/persistence/**`.
- [x] Split mixed Runtime policy ownership into Claims and Coordinator policy modules, centralize protected automation blockers under Runtime admission, and delete unused generic policy exports.
- [x] Move User Standard distillation composition and tests from Runtime into Verification Custom Checks with no compatibility export.
- [ ] Move generic scheduling, remaining persistence, synchronization, remaining worker mechanics, Integration, recovery, and lifecycle into responsibility-named Runtime subdirectories.
- [x] Remove `src/runtime/loop-exit-runtime.ts`; Loop declarations remain owner-local and generic composition lives in Verification.
- [x] Move Decision research Evidence, claim-support Checks, and executor composition from Runtime to `src/decision/exit/**`.
- [x] Enforce that Decision, Planning, and Implementation cannot import Runtime implementations.
- [x] Do not create `runtime/decision`, `runtime/planning`, `runtime/implementation`, `runtime/verification`, or `runtime/loop-exit`.
- [ ] Preserve exact identity, freshness, expected-head CAS, replay, recovery, and guarded-effect behavior.
- [ ] Update callers and tests atomically; leave no old-path re-export.

### 2. Split Pi client and harness ownership

- [x] Move OCI/container execution transport and public coordinator composition to `src/harnesses/**`.
- [x] Move the concrete Pi process worker adapter to `src/harnesses/pi/**` without moving legacy trace-host session debt.
- [x] Move user-facing Pi commands, tools, prompts, TUI, rendering, and coordinator clients to `src/clients/pi/**`.
- [x] Move isolated Model Check, research-claim, and User Standard distillation sessions to `src/harnesses/pi/**`.
- [x] Move native Candidate production, Decision research, and semantic SDK execution to `src/harnesses/pi/**`.
- [x] Split Pi process worker execution from trace-host lifecycle debt and keep worker transport under `src/harnesses/pi/**`.
- [ ] Delete the remaining Pi/Dashboard trace-host shell after removing its UI and lifecycle callers.
- [ ] Remove hidden semantic-loop tools from the main conversational client registration.
- [ ] Ensure conversational clients cannot double as Candidate producers, Model Checks, Planning sessions, or workers.
- [x] Eliminate the frozen Runtime-to-Pi imports through injected ports.
- [ ] Narrow package exports and update packed-install tests.

### 3. Replace Lab with external paired benchmarks

- [ ] Move supported measurement code from `src/benchmarks/**` to repository-root `benchmarks/**`.
- [ ] Preserve only externally-oracled paired harness trials in `alone` and `codewiki` modes.
- [x] Delete `lab/**`, `tests/lab/**`, Lab commands, optimizer/promotion machinery, trace-forge, and source-checkout self-dogfood source, tests, and scripts.
- [ ] Delete remaining obsolete Quality schemas with their legacy Loop consumers.
- [ ] Ensure `src/**` cannot import `benchmarks/**` and benchmark files do not ship.
- [ ] Benchmark every supported executable harness with controlled task, repository, model/provider, tools, network, budget, timeout, concurrency, retries, environment, and trial count.
- [ ] Block release on false exits, unauthorized effects, or escaped critical defects regardless of aggregate score.

### 4. Add explicit GitHub issue intake

- [ ] Extend `user_suggestion` with a digest-bound provider-issue binding.
- [ ] Implement explicit authenticated `codewiki change import-github-issue owner/repository#123` for the configured repository only.
- [ ] Limit intake to bounded title, body, and labels; exclude comments and attachments.
- [ ] Treat issue content as untrusted, reject secret-like material, and preserve exact snapshot digest and idempotent re-import.
- [ ] Do not automatically select imported material for Decision.

### 5. Cut Change Trace, WorkState, and Alignment paths

- [ ] Move canonical Change protocol, encoding, manifests, reduction, and replay to `src/changes/trace/**`.
- [ ] Move Alignment Graph and bounded queries to `src/alignment/**`.
- [ ] Keep canonical current projection in `src/work-state/**`.
- [ ] Delete intermediate `src/change-trace/**`, legacy `src/traces/**`, legacy ChangeRecord paths, obsolete WorkState paths, and generic `src/views/**` after callers move.
- [ ] Preserve append-only history, deterministic replay, projection provenance, and synchronization behavior.

### 6. Finish semantic Loop clean cuts

- [ ] Replace legacy Decision count/Quality paths with native Candidate, Evidence, Result, Exit Report, and route semantics under `src/decision/**`.
- [ ] Complete native Planning semantics under `src/planning/**` without a Runtime Planning policy package.
- [ ] Complete native Implementation semantics under `src/implementation/**` while generic worker mechanics remain Runtime-owned.
- [ ] Delete `src/loops/**` and all remaining legacy Quality modules only after replacement tests pass.
- [ ] Preserve exactly three semantic Loops.

### 7. Expose bounded agent query tools

- [ ] Stabilize `wiki_state`, `wiki_context`, `wiki_attention`, `wiki_explain`, and `wiki_change` over completed owner paths.
- [ ] Make every query read-only, bounded, snapshot-bound, and provenance-bearing, with explicit coverage, truncation, and staleness.
- [ ] Do not expose arbitrary Cypher, traversal DSL, graph dump, graph mutation, or generic Knowledge mutation.

### 8. Complete UI assurance and Dashboard last

- [ ] Freeze Dashboard query, command, freshness, idempotency, and authority contracts over completed Runtime projections.
- [ ] Remove dashboard-local workflow truth and legacy Trace/session assumptions.
- [ ] Implement responsive Work, Product, System, Design, Standards, Checks, Evidence, Integration, delivery, outcome, and history surfaces from exact projections.
- [ ] Add Candidate-bound preview Evidence, independent experience review, and authenticated approval where policy requires it.
- [ ] Validate keyboard, assistive technology, reduced motion, contrast, bounded rendering, reconnect, reset, and actionable failure states.

### 9. External proof and release gates

- [ ] Run real Gitleaks, Semgrep, and offline Trivy profiles with exact production receipts.
- [ ] Run sealed scanner/evaluator calibration against off-repository human-labeled cases.
- [ ] Run focused-call versus batching calibration; keep batching unavailable unless it preserves safety and improves measured cost or latency.
- [ ] Prove real provider authentication, user authority, expected-head mutation, and OCI execution externally.
- [ ] Build and pack reviewed candidates, then install only in disposable external projects with isolated Pi settings.
- [ ] Verify prompts, tools, commands, Dashboard behavior, guarded writes, failure paths, and cleanup.
- [ ] Resolve optional Pi SDK dependency advisories or document accepted external constraints.
- [ ] Publish or release only with explicit maintainer approval.
- [ ] Consider source-repository dogfooding only through an externally installed immutable digest-pinned stable release after separate approval.

## Per-slice gates

Every source slice must pass the applicable subset before commit:

```text
focused tests
Knowledge profile and diagram validation
TypeScript LSP diagnostics
typecheck
full test suite
build
packed-package smoke
npm audit --omit=dev
git diff --check
pi-lens diagnostics
```

Commit and push each green work slice unless explicitly held for review. Publication, release, deployment, provider mutation, and paid external proof always require separate approval.

## External blockers

These do not block local refactoring:

- Real Gitleaks, Semgrep, and Trivy binaries are unavailable locally.
- Docker/OCI execution is unavailable while Docker WSL integration is disabled.
- Sealed security and evaluator calibration require off-repository fixtures and receipts.
- Real provider authentication and external user-authority proof remain pending.
- Automatic distributed expiry remains unavailable without trusted remote time.
- Graphify remains optional and unavailable without its dependencies.

## Completion and deletion condition

Delete this file in the final refactoring commit when all of the following are true:

- target source topology and dependency boundaries are realized;
- legacy Lab, Quality, Trace, ChangeRecord, generic View, and self-dogfood paths are gone;
- native Decision, Planning, Implementation, Verification, Runtime, client, and harness ownership is complete;
- bounded query tools and final Dashboard use only target projections and contracts;
- `.codewiki/kb/**`, source, tests, package output, and external packed-install gates agree;
- no remaining local task needs this temporary tracker.

After deletion, accepted desired state remains in `.codewiki/kb/**`, executable truth remains in source and tests, and Git remains the development history until CodeWiki Runtime is deliberately activated for this repository in the future.
