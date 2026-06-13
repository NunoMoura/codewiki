# codewiki

CodeWiki is being rebuilt as a source-first package.

The previous Pi extension, workflow skills, scripts, and tool pipeline have been moved to `_OLD_VERSION/` for reference. New project-local skills under `.agents/skills/` teach the CLI-backed core facade only.

## Current posture

- Pi extension loading is disabled: `package.json` has no `pi.extensions` or `pi.skills` metadata.
- Project-local `.agents/skills/codewiki-*` skills are CLI guidance only; they do not enable archived tools.
- `.codewiki/kb/**` remains source-of-truth documentation for intended product/system design.
- `.codewiki/traces/TRACE-*.jsonl` is the intended workflow/state truth model, following Pi's session JSONL pattern.
- `.codewiki/views/**` is generated/disposable projection output, not truth.
- Other `.codewiki` roots from earlier dogfood runs are archived migration state, not active execution truth during the rebuild.
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
  cli/
  pi/
  project/
  utils/
```

The semantic loop roots are `decision`, `planning`, and `implementation`. Each loop is defined by its cycle, high-signal output, and exit conditions. `traces` owns append-only JSONL trace records. `views` owns generated projections such as status, resume, work-plan, work-queue, blockers, and conflicts. Runtime is the outer control loop for scheduling, claims, boundaries, budgets, policy, and temporary data.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<trace>/<loop>/`. It is cleaned on loop exit after durable trace/KB/source refs exist, preserved on continue/route-back/block when remediation needs it, replaced by superseding iterations, and removed at trace close.

`_OLD_VERSION/` is a migration reference only. Migrate code back into `src/**` one module at a time, with tests, instead of re-enabling the old extension wholesale. The active migration inventory lives in `.codewiki/kb/system/migration-audit.md`.

## Commands

```bash
npm run typecheck
npm test
npm run test:pack
node --experimental-strip-types src/cli/index.ts state --repo .
node --experimental-strip-types src/cli/index.ts config
node --experimental-strip-types src/cli/index.ts decide --input decision.json
```

## Pi usage

Do not install this checkout as a Pi extension during the rebuild. If Pi was already running with an older CodeWiki extension, remove that package from Pi settings and reload Pi.

Repo-local Pi settings currently load only `pi-lens`; CodeWiki itself is unavailable as a Pi extension until a future explicit reintroduction. Use the CLI as the first host adapter over the root core facades. Project-local CodeWiki skills may guide agents to that CLI, but they must not call archived tools.
