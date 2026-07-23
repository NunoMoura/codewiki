---
type: Concept
title: API
description: "`src/api/**` is the stable harness-neutral facade used by the project control plane and clients; Pi client/execution adapters remain entrypoint-isolated and source-checkout dogfooding stays disabled."
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
  - temporary_development_harness
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
    role: temporary_development_harness
---
# API

`src/api/**` is the stable harness-neutral package/source facade used by the project control plane, dashboard, Pi clients, tests, and future adapters. Root exports include core `wiki_*` facades, OKF compatibility, runtime contracts, and stable types. `src/pi/**` contains entrypoint-isolated Pi conversational and execution adapters for packed external installs; repo-local dogfooding remains disabled. `src/cli/index.ts` remains a temporary development/test client.

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

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, Change-store, or validation roots. `buildWorkState()` folds Change Traces with current KB, ownership, source/tests/Git, config, integration state, and bounded runtime observations. `src/api/state.ts` exposes bounded Backlog, Planning, Implementation, Change, quality, and blocker projections without treating output as truth. Project-backed state adds per-Change append handles and compact next-action hints. Source/path explanation belongs in explain/source-map APIs, not `wiki_state`.

The API exposes reduced core facades for `buildWorkState()`, `buildWikiState()`, `runWikiChange()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiArchive()`, and `runWikiConfig()`. Decision, Planning, and Implementation facades accept loop-specific typed inputs, load repository context themselves, and preview or append one quality-governed iteration safely. `runWikiRuntime()` remains backend outer-loop coordination, not a fourth semantic loop or normal agent mega-tool. Archive handles Change Trace closure, retention stubs, and hydrate/restore. Config resolution lives in `src/project/config.ts`; host file load/save remains in `src/project/config-file.ts`.

`runWikiOkf()` is a format-compatibility facade, not a workflow loop. `validate` and `export` actions default to CodeWiki KB scope and only include `.codewiki/kb/**/*.md`. `consume` defaults to generic OKF bundle scope and preserves unknown producer frontmatter fields when callers round-trip imported OKF markdown. The facade does not use BigQuery, Gemini, Google Cloud Knowledge Catalog, or the Google OKF reference agent.

Pi extension package metadata is present for external installs. The current extension entry is covered by mocks, isolated Pi install smoke tests, external Pi RPC smoke tests, and repo-local read-only command smoke. `@nunomoura/codewiki/coordinator` exposes the detached project-service host/client boundary, including daemon ensure/start/stop, leased client registration, bounded cursor-based event polling, remote runtime inspection, semantic-execution capability discovery, authenticated trigger submission, peer-absent candidate fallback, runtime-owned reaction selection, typed coordinator jobs, pre-append generation fencing, and trace-backed restart recovery. `@nunomoura/codewiki/pi-sdk` exposes the optional embedded semantic-session adapter loaded by the Pi-specific daemon launcher, while the root facade and source-checkout boundary remain harness-neutral.

## Related docs

- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API Tool Surface](api-tools.md)
