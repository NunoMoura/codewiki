---
type: Concept
title: Clean-Cut Audit
description: The pre-production cut replaces local-linear Trace and legacy Quality contracts with the versioned Change Trace Protocol, Git-synchronized acceptance, deterministic projections, and native Loop exit without migration or compatibility layers.
tags:
  - codewiki
  - system
  - clean-cut
  - audit
timestamp: 2026-07-30T00:00:00Z
---
# Clean-Cut Audit

CodeWiki is pre-production. The approved architecture replaces obsolete contracts directly rather than migrating historical dogfood state or maintaining old/new behavior.

## Preserve

- exactly three semantic Loops: Decision, Planning, Implementation;
- Change as accountable intent and durable dossier;
- native Candidate/Evidence/Policy/Check/Result/Report foundation;
- OKF Knowledge and source ownership;
- standalone CLI/Runtime/dashboard boundary with optional thin Pi client;
- isolated process/OCI workers, Worker Reports, Integration, and guarded effects;
- external packed-install proof and source-checkout non-dogfood rule;
- Pi-owned providers, authentication, sessions, compaction, tools, extensions, and Skills.

## Replace

| Current executable drift | Intended contract |
| --- | --- |
| local `.codewiki/traces/**` files | hot `.codewiki/changes/**` accepted through `codewiki/state` |
| singular `parentId`, local `sequence`, formatted IDs | strict canonical JSON, SHA-256, typed parents, exact state/base/authority binding |
| local expected-byte mutation | remote expected-head Git CAS |
| local multi-file Planning recovery | one atomic state commit containing Planning epoch and participant bindings |
| local coordinator ownership only | Git-synchronized Change Claims and Work Item Claims |
| client/Git time-based expiry | explicit release and authenticated takeover; trusted-time expiry deferred |
| count/presence Quality checks | immutable Candidate/Evidence/Policy/Check/Result/Report chain |
| worker-local confidence/proof | asserted Worker Report plus exact integrated Candidate assurance |
| mutable/local relationship views | versioned deterministic Alignment Graph with per-fact provenance |
| hot history forever | verified immutable archive plus hydration/reopen |
| raw or generic history context | scoped Repair Episodes and held-out-validated Repair Patterns |

## Delete

- legacy Trace schemas, parsers, appenders, aliases, and migration tests;
- obsolete source-checkout dogfood Traces, generated state, controller pins, local CodeWiki Skills, and trace refs;
- legacy Quality/judge/graph/runner modules after native replacement reaches parity;
- duplicate candidate contracts, broad arbitrary-record inputs, and preview/append reevaluation;
- mutable backlog/current-plan truth and provider-specific semantic projections.

Git history remains checkpoint evidence. It is not converted into synthetic v1 Change operations.

## Do not add

- compatibility parser or dual-write path;
- canonical database, graph database, message broker, blockchain, hosted relay, or required self-hosted service;
- arbitrary graph mutation or user-authored operation/Loop DSL;
- fourth semantic, checking, learning, review, archive, or recovery Loop;
- automatic self-modification or first-class Lesson/Memory/Todo entities;
- automatic distributed ownership expiry without trusted time.

## Order

1. align `REFACTORING_PLAN.md` and `.codewiki/kb/**`;
2. specify exact v1 schemas and fixtures;
3. build pure reducer and Alignment Graph projector;
4. prove full/incremental equivalence with adversarial/property tests;
5. run two-clone bare-Git concurrency experiment;
6. add read-only synchronization and `fresh | stale | offline`;
7. add guarded expected-head mutation, Change Claims, and Work Item Claims;
8. add rolling Planning and bounded graph queries;
9. cut native Decision, Planning, and Implementation exit paths;
10. add archive/hydration and measured repair retrieval;
11. delete legacy Trace/Quality/dogfood machinery;
12. prove packed external Runtime, provider/auth, OCI, and benchmark gates.

Each production slice updates intended Knowledge and executable source/tests together. Publication, release, deployment, provider mutation, paid benchmark execution, and leaderboard submission require separate approval.

## Stop conditions

Stop before production implementation after this documentation cut. Stop again if the pure model cannot prove deterministic replay or if two clones cannot converge safely through Git CAS.

If benchmarks fail to show enough reduction in drift, false acceptance, repeated repair, lost context, coordination failure, and Integration error to offset latency/cost/ceremony, reduce CodeWiki to a thin Pi/OpenClaw extension.

## Related docs

- [System Overview](../components/overview.md)
- [Change Traces](../components/traces.md)
- [Runtime](../components/runtime.md)
- [Production Readiness Audit](production-readiness-audit.md)
- [Remote State Synchronization](remote-state-synchronization.md)
