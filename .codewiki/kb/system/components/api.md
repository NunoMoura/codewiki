---
type: Concept
title: API
description: "`src/api/**` is the stable harness-neutral facade used by Project Runtime and clients; Pi client/execution adapters remain entrypoint-isolated and source-checkout dogfooding stays disabled."
tags:
  - codewiki
  - system
  - api
timestamp: 2026-06-30T00:00:00Z
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
  - standalone_client_migration
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
    role: standalone_client_migration
---
# API

`src/api/**` is the stable harness-neutral package/source facade used by Project Runtime, standalone CLI, dashboard, optional Pi client, tests, and future adapters. `src/api/index.ts` owns package-layout metadata; `src/index.ts` re-exports the API facade in one direction, and API modules never import the package root. Root exports include current `wiki_*` compatibility facades, OKF compatibility, Runtime/Loop-exit contracts, query contracts, and stable types. `src/pi/**` contains entrypoint-isolated Pi conversational/execution adapters for packed external installs; repo-local dogfooding remains disabled. `src/cli/index.ts` is current migration scaffold for approved primary standalone CLI.

Target facade roots:

- `src/api/index.ts`
- `src/api/state.ts`
- `src/api/wiki-decide.ts`
- `src/api/wiki-plan.ts`
- `src/api/wiki-implement.ts`
- `src/api/wiki-archive.ts`
- `src/api/wiki-config.ts`
- `src/api/wiki-okf.ts`
- `src/api/wiki-runtime.ts`
- `src/api/traces.ts`
- `src/api/views.ts`

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, Change-store, or validation roots. `buildWorkState()` folds Change Traces with current Knowledge, ownership, source/tests/Git, config, Integration/delivery state, and bounded Runtime observations. Target state exposes bounded Backlog, Planning, Implementation, Change, Loop-exit, Alignment, Learning, and blocker projections without treating output as truth. Project-backed state adds guarded append diagnostics and compact next-safe-action hints. Source/path explanation and bounded relationship queries belong in typed explain/query APIs.

Current API exposes reduced compatibility facades for `buildWorkState()`, `buildWikiState()`, `runWikiChange()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiArchive()`, and `runWikiConfig()`. Clean cuts replace broad Loop facade inputs and preview/append reevaluation with exact role-specific Candidates, Resolved Exit Policies, Check Results, immutable Exit Reports, and Runtime-owned append. `runWikiRuntime()` remains backend outer control plane, not a fourth semantic Loop or normal agent mega-tool. Archive handles Change Trace closure, retention stubs, and hydrate/restore. Config resolution lives in `src/project/config.ts`; host file load/save remains in `src/project/config-file.ts`.

`runWikiOkf()` is a format-compatibility facade, not a semantic Loop. `validate` and `export` actions default to CodeWiki KB scope and include only `.codewiki/kb/**/*.md`; target emits OKF v0.2. `consume` defaults to generic OKF bundle scope, accepts v0.2 with v0.1 fallback, and preserves unknown producer frontmatter during round trips. The facade does not use BigQuery, Gemini, Google Cloud Knowledge Catalog, or the Google OKF reference agent.

Pi extension package metadata is present for external installs. The current extension entry is covered by mocks, isolated Pi install smoke tests, external Pi RPC smoke tests, and repo-local read-only command smoke. `@nunomoura/codewiki/coordinator` exposes the detached project-service host/client boundary, including daemon ensure/start/stop, leased client registration, bounded cursor-based event polling, remote runtime inspection, semantic-execution capability discovery, authenticated trigger submission, peer-absent candidate fallback, runtime-owned reaction selection, typed coordinator jobs, pre-append generation fencing, and trace-backed restart recovery. `@nunomoura/codewiki/pi-sdk` exposes the optional embedded semantic-session adapter loaded by the Pi-specific daemon launcher, while the root facade and source-checkout boundary remain harness-neutral.

## Related docs

- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API Tool Surface](api-tools.md)
