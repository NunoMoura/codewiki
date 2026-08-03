---
type: Concept
title: Production Readiness Audit
description: CodeWiki remains private pre-production software; release requires the current Change Trace Protocol, Git-synchronized coordination, native exact Loop exit, deterministic Alignment Graph projection, archive/learning safety, and external proof.
tags:
  - codewiki
  - system
  - production
  - readiness
  - audit
timestamp: 2026-07-30T00:00:00Z
---
# Production Readiness Audit

Status: **not production-ready**.

This repository does not register, install, load, or dogfood CodeWiki. Package behavior is tested through packed installs in disposable external projects with isolated Pi settings.

## Current green foundation

Latest synchronized checkpoint before this architecture cut:

```text
f7b01fa feat: transport decision claim checks through pi
836 tests across 137 suites
836 passed, 0 failed
```

Current executable source/tests cover:

- local append-only Change history and WorkState projections;
- Decision, Planning, Work Items, local Work Item ownership, Assignments, workers, Worker Reports, Integration, and guarded effects;
- detached local coordinator generation, authentication, fencing, leased clients, lanes, recovery, draining, and foreground cancellation;
- opt-in OCI adapter contract with strict image/mount/resource/capability/network controls;
- guarded branch merge, push, product publication, and release contracts;
- immutable Candidate/Check/Result/Exit Report foundation and closed Evidence Records/obligations;
- Decision research citation/provenance and isolated claim-support Model Check transport;
- packed install, RPC, mutation, lifecycle, failure, dashboard, coordinator, and Pi SDK smokes;
- source-checkout non-dogfood boundary and private package metadata.

These prove bounded local contracts under tests. They do not prove distributed coordination, real provider/auth execution, real OCI execution, production delivery, or user outcomes.

## Ratified target not yet implemented

```text
typed Change operations
→ accepted Git-backed history
→ deterministic WorkState
→ rolling global Planning
→ first-class Alignment Graph
→ local views and bounded agent queries
```

Exact Loop exit:

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

Required architecture cuts:

1. exact Change Trace Protocol `2.0.0` schemas and canonical fixtures;
2. pure deterministic reducer and versioned Alignment Graph projector;
3. full/incremental replay equivalence and adversarial/property tests;
4. two-clone provider-neutral Git expected-head CAS experiment;
5. read-only remote synchronization and `fresh | stale | offline`;
6. distributed Change Claims and Work Item Claims with explicit release/authenticated takeover;
7. rolling atomic Planning epochs that preserve safe active Assignments;
8. native Decision, Planning, and Implementation Candidate/Evidence/Policy/Check/Result/Report paths;
9. exact final integrated-tree assurance and UI approval binding;
10. immutable archive, hydration, reopening, and bounded repair retrieval;
11. deletion of legacy Trace, Quality, compatibility, and source-checkout dogfood machinery.

Exact order lives in `REFACTORING_PLAN.md` and [Clean-Cut Audit](clean-cut-audit.md).

## Blocking correctness requirements

Production remains blocked until tests prove:

- strict canonical serialization and SHA-256 identity;
- unknown required versions and missing parents block dependent progression;
- unauthorized operations cannot affect WorkState or Alignment Graph;
- stale expected-head push causes fetch/replay/semantic reevaluation, never blind retry;
- independent Change operations converge across two clones;
- Change Claim and Work Item Claim races select at most one accepted owner;
- client and Git timestamps cannot grant ownership or progression;
- multi-Change Planning epoch is accepted entirely or not at all;
- new Planning preserves or explicitly dispositions active Assignments;
- role-specific Candidate schemas reject Runtime-owned fields;
- Runtime alone creates operation, Candidate, Evidence, Result, Report, policy, job, actor/time, snapshot, and route identity;
- every considered Evidence identity remains bound into Results;
- missing/stale/partial/unavailable/contradictory required Evidence yields repair/wait/`indeterminate`;
- independent Checks continue when useful after unrelated failure;
- exact cache identity includes Candidate, policy, Check implementation/model/config, Evidence, and freshness;
- final Implementation assurance evaluates exact integrated content;
- review/approval binds exact Candidate/tree/head/preview/media/bundle identity;
- archive cannot lose canonical operations across crash/retry;
- full replay equals incremental WorkState and Alignment Graph projection;
- bounded queries preserve per-fact source provenance and partial coverage;
- repair retrieval cannot weaken Checks, authority, or independent Model Check isolation.

## External blockers

- Real Docker/Podman OCI execution is unproven on current host.
- Real model/provider authentication, cancellation, and cleanup proof remains required.
- Active Pi is `0.82.1`; package peer range still excludes it (`>=0.80.10 <0.82.0`).
- Optional Pi SDK dependency findings remain `brace-expansion@5.0.7` high severity and `protobufjs@7.6.4` moderate severity until fixed versions are validated.
- Trusted worker image distribution is not defined.
- Automatic distributed ownership expiry is blocked without trusted time.
- Required pre-exit pull-request review is blocked until guarded publication/provider correlation is production-proven.
- Generic deployment remains deferred until a concrete hosted target exists.
- Public npm publication, product release, provider mutation, paid benchmark execution, and leaderboard submission require separate maintainer approval.

## Benchmark gates

### Primary stack

```text
SWE-bench Pro      long-horizon professional repository work
FeatureBench       complex feature development
SWE-bench Live     fresh multilingual generalization
CodeWiki sealed    coordination, authority, recovery, graph value, learning
```

Supporting tracks:

```text
SWE-bench Verified   stable public compatibility
SWE-Explore          repository exploration and Alignment Graph value
SWE-Cycle            environment/implementation/test pilot
SWE-Bench-CL         chronological learning methodology
SWE-bench Multimodal later visual track
```

Competitive baselines:

```text
plain Pi
OpenClaw
OpenSpec or Spec Kit
CodeWiki
```

Required ablations:

```text
without rolling cross-Change Planning
without independent Checks
without repair retrieval
raw history instead of Repair Episodes
Repair Episodes without held-out validation
validated Repair Patterns
without Alignment Graph queries
```

Use equal model/provider/version, tools, repository snapshot, visible tests, budgets, seeds, and evaluator conditions wherever possible. Report pass@1, false passes, escaped regressions, unauthorized effects, wall time, tokens, provider cost, repair iterations, and human interventions separately.

Any false-pass or escaped-regression increase blocks promotion regardless of aggregate score.

## Sealed CodeWiki fixture families

- ambiguous or contradictory intent;
- missing, stale, contradictory, partial, or unavailable Evidence;
- Change B accepted while Change A executes;
- overlapping source/Knowledge boundaries;
- safe active-work preservation and explicit invalidation disposition;
- two-machine Change Claim and Work Item Claim races;
- independent concurrent Changes;
- stale CAS and atomic Planning batches;
- worker crash, cancellation, Integration conflict, and recovery;
- notification loss/duplication/reordering and offline reconnect;
- archive interruption, hydration, and reopening;
- exact UI preview/review/approval;
- unauthorized branch/publication/release/delivery attempt;
- Knowledge/source drift in both directions;
- useful Repair Episode transfer and harmful-history negative transfer;
- helpful and misleading Alignment Graph query results;
- delivery outcome contradicting earlier passing implementation Evidence.

## Release validation

A release candidate runs applicable repository gates:

```bash
npm run typecheck
npm run build
npm test
npm run test:readiness
npm run test:pack
npm run test:pi-install
npm run test:pi-rpc
npm run test:pi-multiprocess
npm run test:pi-mutation
npm run test:coordinator
npm run test:pi-sdk
npm run test:pi-sdk-package
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run lab:gate
npm run lab:pipeline -- --gate
npm audit --omit=dev
git diff --check
```

Plus:

- zero blocking LSP/Pi-Lens diagnostics in changed files;
- exact protocol/authority fixtures and replay equivalence;
- OKF v0.2 Software Alignment Profile fixture;
- real provider/auth and claimed OCI proof;
- external dashboard/Runtime lifecycle, recovery, cleanup, and guarded-effect proof;
- sealed CodeWiki-native suite;
- approved external benchmark evidence;
- human review of package contents, security, privacy, latency, cost, and authority;
- explicit publication/release approval.

## Survival rule

If benchmarks do not show materially lower drift, false acceptance, lost context, repeated repair, coordination failure, and Integration error enough to offset latency, cost, and ceremony, reduce CodeWiki to a thin Pi/OpenClaw extension.

## Related docs

- [Product](../../product/overview.md)
- [Clean-Cut Audit](clean-cut-audit.md)
- [Change Traces](../components/traces.md)
- [Runtime](../components/runtime.md)
- [Lab](../components/lab.md)
- [Package Boundary](../components/package.md)
