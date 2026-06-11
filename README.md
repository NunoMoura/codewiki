# codewiki

CodeWiki is being rebuilt as a source-first package.

The previous Pi extension, workflow skills, scripts, and tool pipeline have been moved to `_OLD_VERSION/` for reference. They are not loaded by Pi from this checkout.

## Current posture

- Pi extension loading is disabled: `package.json` has no `pi.extensions` or `pi.skills` metadata.
- `.codewiki/kb/**` remains source-of-truth documentation for intended product/system design.
- `.codewiki/traces/TRACE-*.jsonl` is the intended workflow/state truth model, following Pi's session JSONL pattern.
- `.codewiki/views/**` is generated/disposable projection output, not truth.
- Other `.codewiki` runtime, roadmap, build, validation, telemetry, and generated graph files are legacy dogfood state, not active execution truth during the rebuild.
- Pi native compaction should handle conversation compression. CodeWiki-owned refresh/compaction windows are disabled with the old extension.

## New source layout

```text
src/
  index.ts
  api/
  decision/
  planning/
  implementation/
  traces/
  views/
  knowledge/
  git/
  runtime/
  pi/
  project/
  utils/
```

The loop roots are `decision`, `planning`, and `implementation`. Gates are loop exits, not a fourth validation loop. `traces` owns append-only JSONL trace records. `views` owns generated projections such as status, resume, work-plan, blockers, and conflicts. Runtime owns scheduling, claims, boundaries, budgets, policy, and temporary data.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<trace>/<loop>/`. It is cleaned on loop gate pass after durable trace/KB/source refs exist, preserved on fail/block for remediation, replaced by superseding runs, and removed at trace close.

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
