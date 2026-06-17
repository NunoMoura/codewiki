# API

`src/api/**` is the stable package/source facade. Root exports are reduced to the core `wiki_*` facades and stable types. `src/pi/**` contains the Pi-native tool/command adapter exposed by package metadata for external installs. Repo-local Pi settings still do not enable CodeWiki in this checkout. `src/cli/index.ts` remains a temporary development/test harness, not the normal product surface.

Target facade roots:

- `src/api/decision.ts`
- `src/api/planning.ts`
- `src/api/implementation.ts`
- `src/api/traces.ts`
- `src/api/views.ts`
- `src/api/state.ts`
- `src/api/index.ts`

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, or validation roots. Read-only state is exposed as `src/api/state.ts`, which folds traces and source-map input into view-shaped projections without treating stored views as truth.

The API exposes reduced core facades for the target `wiki_*` surface: `buildWikiState()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiRuntime()`, `runWikiArchive()`, and `runWikiConfig()`. Decision, planning, and implementation facades preview or append one semantic loop iteration safely. Runtime appends coordination claim events only; it is not a fourth semantic loop. Archive previews retention stubs, appends `trace_close` lifecycle records, and plans hydrate/restore from retained trace refs. Config resolution lives in `src/project/config.ts` and is exposed through the API facade; config file load/save lives in `src/project/config-file.ts` for host adapters.

Pi extension package metadata is now present for external installs. The extension entry remains covered by mocks and isolated Pi install smoke tests, but it must not be installed into this repository until repo-local dogfooding is explicitly approved.

## Related docs

- [File Structure](file-structure.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API Tool Surface](api-tools.md)
