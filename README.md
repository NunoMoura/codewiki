# codewiki

CodeWiki is being rebuilt as a source-first package.

The previous Pi extension, workflow skills, scripts, and tool pipeline have been moved to `_OLD_VERSION/` for reference. They are not loaded by Pi from this checkout.

## Current posture

- Pi extension loading is disabled: `package.json` has no `pi.extensions` or `pi.skills` metadata.
- `.codewiki/kb/**` remains the source-of-truth documentation for intended product/system design.
- `.codewiki` runtime, roadmap, build, validation, and generated graph files are legacy dogfood state, not active execution truth during the rebuild.
- Pi native compaction should handle conversation compression. CodeWiki-owned refresh/compaction windows are disabled with the old extension.
- New source is scaffolded under `src/**` according to the three-loop model: decision, planning, and implementation.

## New source layout

```text
src/
  index.ts
  api/
  decision/
  planning/
  implementation/
  telemetry/
  graph/
  knowledge/
  git/
  pi/
  project/
  runtime/
  agency/
  shared/
```

`_OLD_VERSION/` is a migration reference only. Migrate code back into `src/**` one module at a time, with tests, instead of re-enabling the old extension wholesale.

## Commands

```bash
npm run typecheck
npm test
npm run test:pack
```

## Pi usage

Do not install this checkout as a Pi extension during the rebuild. If Pi was already running with an older CodeWiki extension, remove that package from Pi settings and reload Pi.

Repo-local Pi settings currently load only `pi-lens`; CodeWiki itself is unavailable to Pi until a future explicit extension reintroduction.
