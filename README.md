# codewiki

CodeWiki is being rebuilt as a source-first package.

The previous Pi extension, workflow skills, scripts, and tool pipeline have been moved to `_OLD_VERSION/` for reference. The rebuilt product surface is Pi-native tools/commands over the core facades; the CLI remains only a temporary development harness during stabilization.

## Current posture

- Package metadata exposes the Pi extension for external Pi installs through `pi.extensions`.
- Repo-local Pi settings do not enable CodeWiki in this checkout yet; do not dogfood it here until the external smoke passes.
- Project-local `.agents/skills/codewiki-*` skills are migration guidance only; they do not enable archived tools.
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

## Requirements

CodeWiki source remains TypeScript-first during the rebuild. Npm packages are built to `dist/**` before packing because Node does not strip TypeScript inside `node_modules`; installed packages target Node.js `>=20.6.0`. Local source commands and tests still use `node --experimental-strip-types`, so use Node.js `>=22.6.0` for development on this scaffold.

## Development commands

```bash
npm run typecheck
npm run build
npm test
npm run test:pack
npm run test:pi-install
npm run test:pi-rpc
npm run test:readiness
```

`npm run test:pi-install` performs an isolated Pi install smoke using temporary Pi settings. It must not mutate repo-local or global Pi settings. `npm run test:pi-rpc` performs an external temp-project Pi RPC smoke, runs `/wiki bootstrap` and `/wiki state --board`, and verifies rendered notification output without starting a model turn. `npm run test:readiness` checks package enablement, CodeWiki state shape, repo-local Pi settings, and stale public wording before repo dogfooding.

`src/cli/index.ts` exists only as a temporary development/test harness while the Pi adapter stabilizes. It is not the intended agent-facing CodeWiki OS, and the npm package currently does not expose a CLI binary.

## Pi usage

Do not install or enable this checkout in repo-local Pi settings yet. If Pi was already running with an older CodeWiki extension, remove that package from Pi settings and reload Pi.

Repo-local Pi settings currently load only `pi-lens`; CodeWiki itself remains unavailable in this checkout until a future explicit dogfood step. Installed package use should be through Pi-owned `/wiki ...` commands and `wiki_*` tools, not through the transitional CLI or archived tools.
