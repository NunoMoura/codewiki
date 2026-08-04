---
type: Concept
title: API
description: "`src/api/**` is the stable harness-neutral facade used by Project Runtime and clients; Pi adapters remain entrypoint-isolated and source-checkout dogfood stays disabled."
tags:
  - codewiki
  - system
  - api
timestamp: 2026-07-30T00:00:00Z
codewiki_components:
  - api
  - cli
codewiki_source_patterns:
  - src/api/**
  - src/cli/**
codewiki_test_patterns:
  - tests/scaffold-core.test.mjs
  - tests/views/wiki-state.test.mjs
  - tests/decision/wiki-decide.test.mjs
  - tests/planning/wiki-plan.test.mjs
  - tests/implementation/repo-proof.test.mjs
  - tests/implementation/wiki-implement.test.mjs
  - tests/runtime/wiki-runtime.test.mjs
  - tests/runtime/wiki-config.test.mjs
  - tests/traces/wiki-archive.test.mjs
  - tests/runtime/cli.test.mjs
codewiki_roles:
  - public_facade
  - standalone_client_cutover
codewiki_source_map:
  - id: api
    source_patterns:
      - src/api/**
    test_patterns:
      - tests/scaffold-core.test.mjs
      - tests/views/wiki-state.test.mjs
      - tests/decision/wiki-decide.test.mjs
      - tests/planning/wiki-plan.test.mjs
      - tests/implementation/repo-proof.test.mjs
      - tests/implementation/wiki-implement.test.mjs
      - tests/runtime/wiki-runtime.test.mjs
      - tests/runtime/wiki-config.test.mjs
      - tests/traces/wiki-archive.test.mjs
    role: public_facade
  - id: cli
    source_patterns:
      - src/cli/**
    test_patterns:
      - tests/runtime/cli.test.mjs
    role: standalone_client_cutover
---
# API

`src/api/**` is the harness-neutral facade used by Project Runtime, standalone CLI, dashboard, optional thin Pi client, tests, and future adapters. `src/index.ts` re-exports the facade in one direction. API modules never import the package root or Pi SDK types.

## Target surface

The clean target groups capabilities by authority rather than preserving `wiki_*` command history:

```text
Change intent and revision commands
Decision / Planning / Implementation Candidate submission
Evidence material submission
Runtime inspection and supervision
fresh WorkState reads
bounded Alignment Graph queries
expected-head canonical state commands
archive / hydrate / reopen
configuration proposals
separately authorized effects
```

Every write distinguishes preview/proposal from explicit apply. Passing Exit Report does not grant canonical append or effect authority.

## Runtime-owned fields

Client input cannot supply:

- operation, Candidate, Evidence Record, Result, Report, request, policy, job, or effect identity;
- actor role/authority beyond authenticated material Runtime validates;
- remote state head, source head, Knowledge/config/policy digest, or state digest;
- canonical observation time;
- Change Claim or Work Item Claim acceptance;
- Check activation, threshold, implementation/model route, cache identity, or Runtime Route;
- expected-head success, Integration proof, publication proof, or outcome authority.

Unsupported fields fail closed before execution.

## Reads and queries

State reads bind one exact team WorkState snapshot and report `fresh | stale | offline`, provenance, coverage, truncation, and current held reason.

Alignment queries are bounded, read-only, snapshot-bound, and per-fact provenance-bearing. No arbitrary Cypher, graph mutation, canonical graph file, or graph database API is exposed.

Generated Backlog, Planning, Implementation, Change dossier, dashboard, and repair views remain projections.

## Canonical writes

Target append protocol is Runtime-owned:

```text
bounded proposal
→ exact base/authority admission
→ canonical operation batch and StateCommitManifest
→ expected-head Git push to codewiki/state
→ shared acceptance or stale rejection
```

A stale rejection causes fetch, deterministic replay, and semantic reevaluation. APIs must not offer blind rebase/retry.

Archive APIs fetch/verify `codewiki/archive`, hydrate read-only cache, and create authorized `trace.reopened` operations for new hot segments. Archive manifests and segments remain immutable.

## Current executable drift

Current API still exposes `buildWorkState()`, `buildWikiState()`, `runWikiChange()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiArchive()`, `runWikiConfig()`, and `runWikiRuntime()` over local Trace contracts. They remain executable truth until clean cuts replace broad inputs, preview/append reevaluation, local byte/sequence guards, and legacy projections.

`runWikiOkf()` remains a format facade, not a semantic Loop. Target emits OKF v0.2; a bounded v0.1 reader is allowed only for imported generic bundles and preserves unknown fields.

`@nunomoura/codewiki/coordinator` currently exposes detached local service host/client behavior plus `decisionAttention()` for bounded current/projection-bound triage queries and `selectDecision()` for dedicated authenticated exact-revision selection. Its strict `codewiki.decision-attention-selection@2.0.0` command carries one principal-scoped idempotency key, exact Change/revision identity, and the projection digest that already commits WorkState, triage Candidates, graph, protected config, and policy. Runtime resolves trusted caller authority, appends canonical `loop.attempt_started`, and returns only its operation ID; that same ID keys the coordinator job. Generic trigger and semantic-candidate endpoints cannot select Decision work. When mandatory trusted project inputs configure `codewiki.pi-native-decision-host@2.0.0`, the daemon resolves approved local Pi caller authority, loads the exact Git-backed projection, appends and executes the attempt, installs any explicit trusted-host research collector and isolated claim-support route, persists collected Evidence with the continuation, and recovers canonical completion after restart; raw caller authority and caller-owned research freshness remain impossible. `@nunomoura/codewiki/pi-sdk` exposes optional embedded semantic sessions. Local generation fencing remains process safety; provider-neutral Git state acceptance becomes shared team authority.

## Boundaries

- no generic mega-tool or arbitrary Candidate object;
- no direct `.codewiki/**` mutation by clients;
- no user-authored Loop or operation DSL;
- no arbitrary shell/model prompt/graph mutation endpoint;
- no credentials or provider authentication outside Pi/host adapters;
- no source-checkout CodeWiki activation during stabilization.

## Related docs

- [API and Client Surface](api-tools.md)
- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Change Traces](traces.md)
- [Runtime](runtime.md)
- [Remote State Synchronization](../flows/remote-state-synchronization.md)
