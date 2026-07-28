---
type: Concept
title: Migration Audit
description: Historical source reduction is complete; active migration now replaces legacy Loop-exit contracts with exact Candidate, Check, Result, Policy, and Report identity while preserving Runtime, trace, worker, and effect foundations.
tags:
  - codewiki
  - system
  - migration
  - audit
timestamp: 2026-07-28T00:00:00Z
---
# Migration Audit

CodeWiki completed its earlier reduction from `_OLD_VERSION/**` into a TypeScript-first source package. That archive is removed. Old graph/roadmap/artifact/validation/session/telemetry roots, CodeWiki-owned compaction, and monolithic Pi extension must not return wholesale.

Active migration is the ratified Loop-exit and standalone Runtime cut. `REFACTORING_PLAN.md` carries ordered mechanical continuity; canonical intended behavior lives in current KB.

## Foundations to preserve

- one append-only JSONL Change Trace per accountable Change;
- disposable WorkState and generated Work/Alignment/Learning views;
- exactly three semantic Loops: Decision, Planning, Implementation;
- global Planning with Sprints and worker-ready Work Items;
- elected Project Runtime generation, authentication, lanes, CAS, idempotency, and recovery;
- guarded Claims, private Workbenches, isolated process/OCI workers, and immutable Worker Reports;
- guarded Integration and separately authorized merge, push, publication, and release;
- OKF Knowledge/source ownership and exact source/test/Git proof;
- package/build/external-smoke boundaries;
- source-checkout non-dogfood rule;
- Pi-owned providers/auth/sessions/compaction/tools/extensions/Skills.

## Active clean cuts

| Cut | Current migration state | Target |
| --- | --- | --- |
| Product boundary | Pi extension and coordinator service dominate current executable surface; CLI is scaffold. | Standalone CLI + Project Runtime + dashboard + embedded published Pi SDK; optional thin Pi client. |
| Loop vocabulary | Source/tests retain superseded checking and stage-era names. | Semantic Loop, Loop Protocol, Candidate, Check, Code Check, Model Check, Check Result, Resolved Exit Policy, Exit Report. |
| Shared exit package | Unused foundation and production legacy paths remain under `src/loops/**` plus Loop-specific legacy modules. | `src/loop-exit/**`, Loop-owned `exit/**`, and `src/runtime/loop-exit-runtime.ts`; no old-path exports. |
| Candidate authority | Broad candidate inputs and SDK arbitrary-record submission leak Runtime-owned controls. | Exact role-specific schemas; Runtime owns identity, actor/time, snapshots, activation, thresholds, proof scope, routes, and CAS. |
| Exit identity | Existing interfaces cannot prove exact candidate/policy/Result consistency. | Validated constructors for Candidate, Check, Result, Policy, and Report identities. |
| Execution | Existing synchronous graphs/judges/review paths suppress work and use weak caches. | Minimal admission, bounded resource-specific fan-out, cancellation, exact cache identity, complete required-result fan-in, immutable Report. |
| Decision | Preview/append may reevaluate and authority fields leak into candidate. | One immutable candidate/Report; authenticated Runtime approval receipt. |
| Planning | Global semantics exist but partial multi-trace crash recovery and minimum authority need hardening. | Exact epoch identity, full recovery before Claims, validated frozen Check minimums. |
| Implementation | Candidate may control review/evidence/proof behavior; current loop mixes concerns. | Runtime-observed proof, exact worker/Integration evidence, Loop-owned Checks, clean repair/route boundaries. |
| Trace/views | Legacy fields and current-catalog historical interpretation remain. | Persisted candidate/policy/Result/Report identity; historical meaning independent of current catalog. |
| OKF | Source currently produces/validates v0.1 only. | Produce v0.2, consume v0.2 plus v0.1 fallback, preserve unknown fields, keep imported trust metadata advisory. |
| Relationships | Existing WorkState/source map/topic digest projections are partial. | Bounded snapshot-bound Work/Alignment/Learning queries with provenance, authority, coverage, truncation, and staleness. |
| Learning | No governed project-local repair retrieval. | Passive Repair Episode projection and metrics first; ablation before advisory retrieval. |
| Feedback | No privacy-preserving product feedback artifact. | Local allowlisted user-reviewed Feedback Bundle; no automatic upload. |

## Authority defects that must not survive

- candidate-supplied authority, actor/time, identity, runtime job id, snapshot/proof scope, activation, threshold, or final route;
- caller-declared kernel/built-in registration or fabricated frozen minimums;
- missing Loop-qualified Check identity/validation;
- candidate-supplied aggregate content proof overriding observed proof;
- missing required evidence producing no issue;
- global cache reuse without exact age/config/candidate/evidence identity;
- preview/append stochastic reevaluation;
- historical projections through today's catalog;
- early generation fencing without final pre-append guard;
- partial Planning epoch appearing accepted;
- unrelated Check suppression after one failure.

## Intentional non-migrations

Do not add:

- canonical graph files/database, roadmap, artifact, lesson/memory, Todo, validation, telemetry, or session stores;
- fourth semantic, Knowledge, checking, learning, recovery, publication, or review Loop;
- user-authored Loop DSL or arbitrary third-party executable Checks;
- generic code-intelligence engine, agent runtime, workflow engine, CI/CD, issue board, ontology platform, or messaging layer;
- CodeWiki-owned provider/auth/session/compaction/Skill systems;
- Pi-Lens as authoritative Check evidence in v1;
- learned Check activation or threshold changes;
- automatic full-trace telemetry;
- compatibility adapters or old-path re-exports without real production burden;
- source-checkout self-hosting during stabilization.

## Revised migration order

1. preserve and inspect unrelated current working-tree changes;
2. ratify/update KB, diagrams, README, and `REFACTORING_PLAN.md`;
3. perform mechanical `src/loop-exit/**` boundary cut without behavior change;
4. implement exact identity/constructors;
5. remove candidate authority leaks and broad schemas;
6. migrate OKF v0.2 compatibility/profile;
7. implement bounded Code/Model Check runner and immutable Reports;
8. cut Decision, Planning, and Implementation in that order;
9. delete obsolete shared/Loop/config/trace/view source and tests;
10. add relationship queries;
11. add passive Repair Episode projection/metrics;
12. run learning ablations, then add advisory retrieval only if justified;
13. add Feedback Bundle generation;
14. complete external Pi/provider/OCI/release proof.

Every slice updates intended KB and executable source/tests together, runs proactive diagnostics and focused/full validation, commits and pushes only its own changes, and performs no publication/release/provider mutation without separate approval.

## Distribution direction

```text
standalone CodeWiki CLI / dashboard
→ Project Runtime
→ published Pi SDK execution adapter
→ optional thin Pi client
→ future client or worker adapters
```

Harness adapters reuse Runtime semantics. No host may choose candidate identity, policy, exit, route, append, or effect authority.

## Stop condition

Do not add another subsystem before exact Candidate→Check→Result→Report path works end to end for all three Loops and legacy machinery is deleted. If benchmarks fail to offset ceremony/latency with materially lower drift, false acceptance, repeated repair, lost context, and Integration errors, shrink CodeWiki to thin Pi/OpenClaw extension.

## Related docs

- [System Overview](../components/overview.md)
- [Loop Exit](../components/loop-exit.md)
- [Runtime](../components/runtime.md)
- [Production Readiness Audit](production-readiness-audit.md)
