---
type: Concept
title: API
description: "`src/api/**` is the stable package/source facade. Root exports include the core `wiki_*` facades, OKF compatibility facade, and stable types. `src/pi/**` contains the Pi-native tool/command adapter exposed by package metadata for external installs and repo-local dogfooding. `src/cli/index.ts` remains a temporary development/test harness, not the normal product surface."
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
  - tests/scaffold.test.mjs
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
      - tests/scaffold.test.mjs
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

`src/api/**` is the stable package/source facade. Root exports include the core `wiki_*` facades, OKF compatibility facade, and stable types. `src/pi/**` contains the Pi-native tool/command adapter exposed by package metadata for external installs and repo-local dogfooding. `src/cli/index.ts` remains a temporary development/test harness, not the normal product surface.

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

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, or validation roots. Read-only state is exposed as `src/api/state.ts`, which folds active trace records into view-shaped projections without treating stored views as truth. Project-backed state adds append handles (`expectedBytes` and `nextSequence`) and a compact `next` action hint so agents can call the right semantic loop tool safely. Source-map/path explanation belongs in explain/source-map APIs, not `wiki_state`.

The API exposes reduced core facades for the target model-facing `wiki_*` surface: `buildWikiState()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiArchive()`, and `runWikiConfig()`. Decision, planning, and implementation facades preview or append one semantic loop iteration safely. `runWikiRuntime()` remains a backend/host facade for coordination claim events, lease expiry, and Run trace starts; it is not a fourth semantic loop and is not a normal agent tool. Archive previews retention stubs, appends `trace_close` lifecycle records, and plans hydrate/restore from retained trace refs. Config resolution lives in `src/project/config.ts` and is exposed through the API facade; config file load/save lives in `src/project/config-file.ts` for host adapters.

`runWikiOkf()` is a format-compatibility facade, not a workflow loop. `validate` and `export` actions default to CodeWiki KB scope and only include `.codewiki/kb/**/*.md`. `consume` defaults to generic OKF bundle scope and preserves unknown producer frontmatter fields when callers round-trip imported OKF markdown. The facade does not use BigQuery, Gemini, Google Cloud Knowledge Catalog, or the Google OKF reference agent.

Pi extension package metadata is now present for external installs. The extension entry is covered by mocks, isolated Pi install smoke tests, external Pi RPC smoke tests, and repo-local read-only command smoke.

## Related docs

- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API Tool Surface](api-tools.md)
