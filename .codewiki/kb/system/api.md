# API

`src/api/**` is the stable package/source facade. Root exports are reduced to the core `wiki_*` facades and stable types. `src/pi/**` contains the Pi-native tool/command adapter exposed by package metadata for external installs and repo-local dogfooding. `src/cli/index.ts` remains a temporary development/test harness, not the normal product surface.

Target facade roots:

- `src/api/decision.ts`
- `src/api/planning.ts`
- `src/api/implementation.ts`
- `src/api/traces.ts`
- `src/api/views.ts`
- `src/api/state.ts`
- `src/api/index.ts`

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, or validation roots. Read-only state is exposed as `src/api/state.ts`, which folds active trace records into view-shaped projections without treating stored views as truth. Project-backed state adds append handles (`expectedBytes` and `nextSequence`) and a compact `next` action hint so agents can call the right semantic loop tool safely. Source-map/path explanation belongs in explain/source-map APIs, not `wiki_state`.

The API exposes reduced core facades for the target model-facing `wiki_*` surface: `buildWikiState()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiArchive()`, and `runWikiConfig()`. Decision, planning, and implementation facades preview or append one semantic loop iteration safely. `runWikiRuntime()` remains a backend/host facade for coordination claim events, lease expiry, and Run trace starts; it is not a fourth semantic loop and is not a normal agent tool. Archive previews retention stubs, appends `trace_close` lifecycle records, and plans hydrate/restore from retained trace refs. Config resolution lives in `src/project/config.ts` and is exposed through the API facade; config file load/save lives in `src/project/config-file.ts` for host adapters.

Pi extension package metadata is now present for external installs. The extension entry is covered by mocks, isolated Pi install smoke tests, external Pi RPC smoke tests, and repo-local read-only command smoke.

## Related docs

- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API Tool Surface](api-tools.md)
