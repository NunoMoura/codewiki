# API

`src/api/**` is the stable package/source facade. It should re-export public contracts from target roots without owning business behavior.

Target facade roots:

- `src/api/decision.ts`
- `src/api/planning.ts`
- `src/api/implementation.ts`
- `src/api/traces.ts`
- `src/api/views.ts`
- `src/api/state.ts`
- `src/api/index.ts`

The API layer must not recreate old graph, telemetry, agency, roadmap, artifact, or validation roots. Read-only state is exposed as `src/api/state.ts`, which folds traces and source-map input into view-shaped projections without treating stored views as truth.

The API exposes reduced core facades for the target `wiki_*` surface: `buildWikiState()`, `runWikiDecide()`, `runWikiPlan()`, `runWikiImplement()`, `runWikiRuntime()`, `runWikiArchive()`, and `runWikiConfig()`. Decision, planning, and implementation facades preview or append one semantic loop iteration safely. Runtime appends coordination claim events only; it is not a fourth semantic loop. Implementation support also exposes repository snapshots and working-tree content proof helpers so callers can supply `existingPaths` and aggregate proof consistently.

Pi extension entrypoints remain disabled until a future explicit decision reintroduces them.

## Related docs

- [File Structure](file-structure.md)
- [Loop Model](loop-model.md)
- [Traces](traces.md)
- [API vNext Tool Surface](api-vnext-tools.md)
