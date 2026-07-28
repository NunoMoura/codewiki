---
type: Concept
title: Production Readiness Audit
description: CodeWiki remains private pre-production software; release requires clean Loop-exit migration, exact authority/identity, OKF v0.2, external Pi/provider/OCI proof, and separately approved publication.
tags:
  - codewiki
  - system
  - production
  - readiness
  - audit
timestamp: 2026-07-28T00:00:00Z
---
# Production Readiness Audit

Status: **not production-ready**. Package readiness is evaluated through source/tests and packed installs in disposable external projects. Source repository does not register, install, or load CodeWiki.

## Proven foundations

Current executable source/tests cover:

- append-only Change Traces, guarded expected-byte/sequence writes, and WorkState projections;
- Decision, global Planning, Work Items, Claims, Assignments, isolated workers, Worker Reports, semantic acceptance, and guarded Integration;
- elected coordinator generation, authentication, fencing, leased clients, scheduling lanes, recovery, draining, cancellation for foreground process workers, and private runtime artifacts;
- opt-in OCI adapter contract with digest-pinned/preinstalled image, strict mounts/resources/capabilities/network bounds, and pre-Claim availability probe;
- separately guarded local branch merge, remote push, product publication, and release with exact predecessor proof, authority, CAS/idempotency, and post-operation observation;
- packed external install, RPC, mutation, lifecycle, failure, dashboard, coordinator, Pi SDK, and project-local package smokes;
- source-checkout non-dogfood boundary and repo-local Pi-Lens-only configuration;
- private package metadata preventing accidental npm publication.

These proofs establish local contract behavior under tests. They do not establish semantic perfection, real provider/auth operation, real OCI execution, remote policy enforcement, deployment, or user outcomes.

## Ratified target not yet implemented

Documentation defines target architecture:

```text
Change
→ Loop
→ Candidate
→ Resolved Exit Policy
→ Code Checks + Model Checks
→ Check Results
→ Exit Report
→ Runtime route
```

Current source still contains legacy checking, graph, judge, review-pack, broad candidate, trace, and view contracts. They are migration state, not target authority.

Required clean cuts:

1. move shared foundation to `src/loop-exit/**` without old-path re-exports;
2. add validated exact Candidate/Check/Result/Policy/Report identity;
3. remove caller/candidate control of authority, actor/time, snapshots, activation, thresholds, proof scope, aggregate proof, and Runtime identity;
4. implement bounded cancellation-aware Code/Model Check fan-out, required-result fan-in, exact caching, and immutable Reports;
5. cut Decision, Planning, and Implementation individually;
6. persist policy/Report history instead of interpreting old attempts through current catalog;
7. remove obsolete legacy machinery/config/exports/tests;
8. migrate Knowledge production/consumption to OKF v0.2 with v0.1 fallback and software-alignment extensions;
9. add bounded Work/Alignment/Learning query views;
10. validate passive Repair Episode projection before any learning-context injection;
11. add local user-reviewed Feedback Bundle generation.

Exact order and deletion map live in `REFACTORING_PLAN.md`.

## Blocking authority and correctness defects

Production remains blocked until tests prove:

- role-specific candidate schemas reject all runtime-owned fields;
- runtime alone creates candidate, Result, Report, job, actor/time, generation, and route identity;
- candidate-supplied aggregate proof can never override observed proof;
- missing required review/evidence cannot silently produce no issue;
- built-in/kernel Check registration is internal and project/caller cannot claim protected authority;
- Check constructors reject unknown Loop, mismatched execution kind, blank criterion/repair target, invalid cost/timeout/bounds, and fabricated Planning minimums;
- Loop-qualified Check identity prevents duplicate global ids from inheriting wrong criterion/repair target;
- Planning-specific UI preview validation activates when required;
- release/effect Checks activate only from relevant accepted traits/effects;
- independent Checks continue after unrelated failure;
- preview/append use same immutable candidate/Report;
- multi-trace Planning crash recovery completes before Claims;
- stale/global cached evidence cannot authorize reuse;
- exact rejection behavior at public authority boundaries remains stable where required.

## External blockers

- Real Docker/Podman OCI execution is unproven on current host.
- Real model/provider authentication and cancellation/cleanup proof remains required.
- Current Pi peer range excludes active Pi `0.82.1`; packed compatibility must pass before widening.
- Optional Pi SDK development dependency audit includes unresolved transitive vulnerabilities until upstream/fixed versions are available and validated.
- Trusted worker image distribution is not defined.
- Remote guarantees need protected branches, required status checks, commit-bound attestations, artifact provenance, and observations.
- Generic deployment remains deferred until real hosted target exists.
- Public npm publication, product release, or provider mutation requires separate maintainer approval.

## Learning and Lab gates

No project-learning feature may ship merely because traces exist. Before advisory retrieval:

- establish passive candidate-bound Repair Episode projection;
- measure false passes, escaped regressions, false blocks, repair iterations, interventions, first useful feedback, authoritative-exit latency, tokens/cost, and first-pass Check success;
- compare current feedback, raw history, scoped Repair Episodes, and issue-class-routed validated Repair Patterns;
- use temporal/component holdouts and fixed Check identities;
- prove no worsening of false passes or escaped regressions;
- keep Model Checks isolated from producer repair context;
- promote stable guidance only through accountable Change.

Feedback Bundles must be local, allowlisted, pseudonymized, previewed/redacted by user, and exported only under separate approval. Full traces and project content/identity remain excluded.

## Release gates

A release candidate requires:

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

- zero blocking LSP/pi-lens errors in changed source;
- exact Loop-exit identity/authority fixtures;
- OKF v0.2 upstream bundle fixture;
- real provider/auth proof;
- real OCI proof where OCI is claimed;
- external dashboard/runtime lifecycle, recovery, cleanup, and guarded-effect proof;
- competitive fixtures against plain Pi, OpenClaw where applicable, and at least one specification-driven system;
- human review of package contents, security, privacy, latency, and authority;
- explicit publication/release approval.

## Survival rule

If benchmarks do not show materially lower drift, false acceptance, lost context, repeated repair, and Integration errors enough to offset latency and ceremony, CodeWiki should shrink into a thin Pi/OpenClaw extension rather than maintain separate Runtime.

## Related docs

- [Product](../../product/overview.md)
- [Loop Exit](../components/loop-exit.md)
- [Runtime](../components/runtime.md)
- [Lab](../components/lab.md)
- [Package Boundary](../components/package.md)
