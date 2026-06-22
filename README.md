# codewiki

CodeWiki is being rebuilt as a source-first package.

The old implementation archive has been removed after the migration audit. The rebuilt product surface is Pi-native tools/commands over the core facades; the CLI remains only a temporary development harness during stabilization.

## Current posture

- Package metadata exposes the Pi extension for external Pi installs through `pi.extensions`.
- Repo-local Pi settings load pi-lens only; this checkout does not auto-load the CodeWiki extension while production readiness is being hardened.
- Project-local `.agents/skills/codewiki-*` skills are limited to semantic loop playbooks: decide, plan, and implement.
- `.codewiki/kb/**` remains source-of-truth documentation for intended product/system design.
- `.codewiki/traces/TRACE-*.jsonl` is the intended workflow/state truth model, following Pi's session JSONL pattern.
- `.codewiki/views/**` is generated/disposable projection output, not truth.
- Other `.codewiki` roots from earlier harness runs are archived migration state, not active execution truth during the rebuild.
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
  error-handling/
  cli/
  pi/
  project/
  utils/
```

The semantic loop roots are `decision`, `planning`, and `implementation`. Each loop is defined by its cycle, high-signal output, and exit conditions. `traces` owns append-only JSONL trace records. `views` owns generated projections such as status, resume, work-plan, work-queue, runtime-board, blockers, and conflicts. Runtime is the outer coordination layer for Triggers, Heartbeats, Runs, work-unit claim selection, leases, boundaries, budgets, policy, and temporary data. `error-handling` owns shared error contracts, normalization, and recovery hints.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<trace>/<loop>/`. It is cleaned on loop exit after durable trace/KB/source refs exist, preserved on continue/route-back/block when remediation needs it, replaced by superseding iterations, and removed at trace close.

The active migration record lives in `.codewiki/kb/system/migration-audit.md`. Do not restore the old implementation wholesale; recover any future idea only through a new accepted decision, targeted source changes, and tests.

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
npm run test:pi-mutation
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run test:readiness
npm run benchmark:loops
npm run benchmark:loops:gate
npm run benchmark:agent-os
npm run benchmark:agent-os:prepare -- --task polished-tetris --system codewiki
npm run benchmark:agent-os:run -- --dry-run
npm run benchmark:agent-os:gate
npm run audit:codewiki
```

Smoke command roles:

- `npm run test:pi-install`: isolated Pi install smoke with temporary Pi settings.
- `npm run test:pi-rpc`: temp-project Pi RPC smoke for `/wiki-bootstrap` and
  `/wiki-state --board` without a model turn.
- `npm run test:pi-mutation`: isolated Pi extension tool mutation smoke;
  previews first, rejects unguarded append, appends with expected bytes/sequence,
  and verifies `/wiki-state`.
- `npm run test:project-local-install`: installs the packed package under a
  fresh project's `.pi/npm/node_modules/codewiki` path and verifies bootstrap,
  config write, and guarded decision append without controlled-test overrides.
- `npm run test:external-lifecycle`: packs and installs CodeWiki into a fresh
  external project, runs `/wiki-bootstrap`, guarded lifecycle appends, runtime
  host worker-output collection, release, and archive close.
- `npm run test:external-failures`: packs and installs CodeWiki into fresh
  external projects and verifies missing/malformed/blocked worker output,
  mixed worker outcomes, and worktree prepare/cleanup failure remediation.
- `npm run test:readiness`: package, state-shape, install-gate, and stale
  wording checks.
- `npm run benchmark:loops`: runs deterministic adversarial fixtures against
  decision, planning, and implementation loop exits and reports known quality
  gaps.
- `npm run benchmark:loops:gate`: fails while any loop exit semantic gap remains.
- `npm run benchmark:agent-os`: summarizes any available reviewed benchmark
  results without enforcing the production benchmark gate.
- `npm run benchmark:agent-os:prepare`: creates a run directory with the shared
  task prompt, system notes, and result template.
- `npm run benchmark:agent-os:run`: launches isolated Pi benchmark sessions;
  `--dry-run` writes command plans without running a model.
- `npm run benchmark:agent-os:gate`: enforces the CodeWiki-vs-baseline
  quality-adjusted token/speed benchmark gate and fails until real results exist.
- `npm run audit:codewiki`: full validation/readiness/package/Pi/audit sequence
  run serially.

`src/cli/index.ts` exists only as a temporary development/test harness while the Pi adapter stabilizes. It is not the intended agent-facing CodeWiki OS, and the npm package currently does not expose a CLI binary.

## Pi usage

CodeWiki is not published to the npm registry yet. Current distribution testing uses packed/local package installs only, so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented. The future registry package name is still TBD because the unscoped `codewiki` npm name is already owned by another maintainer.

Avoid global/user installs for normal mutation workflows. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi package installation by default and point users back to a project-local packed/local package install until a registry package exists.

CodeWiki does not provide a sandbox. It writes project-local `.codewiki/**` state
and is intended to be compatible with external sandbox, worktree, container, or
agent-harness isolation.

Repo-local Pi settings load `pi-lens` only. Do not add a repo-local `.pi/extensions/codewiki.ts` shim while production readiness is being hardened; packaged install smokes exercise `dist/pi/extension.js` in temporary projects instead.

Installed package use should be through Pi-owned `/wiki-*` commands and the small model-facing `wiki_*` tool set, not through the transitional CLI or archived tools. Runtime coordination remains backend/host plumbing rather than a normal agent tool. Available slash commands are `/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`; the older grouped namespace command has been deprecated. Prefer read-only `/wiki-state` and `/wiki-explain` during early package use; mutation-capable tools still require explicit expected byte/sequence checks.

## Production readiness and automation gates

Current supported posture:

- Project-local packed/local package installation; no public npm publish yet.
- Supervised `/wiki-*` and `wiki_*` use inside the repository being documented.
- Guarded trace mutation with expected byte and sequence checks.
- Runtime worker output treated as untrusted transport until `wiki_implement`
  validates implementation evidence.
- External sandbox, worktree, container, or agent-harness isolation supplied by
  the user or host environment.

Still gated before production automation:

- Unattended runtime worker start.
- Auto-merge or auto-publish.
- Treating worker completion as semantic truth without implementation preview.
- Global/user CodeWiki installs for normal mutation workflows.
- Public claims that CodeWiki is more token- or speed-efficient than baseline
  agent workflows.

Before enabling unattended worker start or auto-merge, require: multiple successful
external package lifecycle smokes, passing failure-path package smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, archive/hydrate
validation green, explicit user approval policy for destructive or externally
visible actions, and passing agent-OS benchmark results for the Tetris and
flight-simulator workloads.
