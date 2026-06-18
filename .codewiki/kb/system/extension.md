# Pi Extension

The CodeWiki package exposes the Pi extension for external package installs through `package.json` `pi.extensions`. Repo-local Pi settings now enable this checkout for initial CodeWiki dogfooding after external install/RPC smoke passed.

Target Pi integration lives under `src/pi/**` and exposes terminal-first commands, tools, prompt assets, and TUI views through thin adapter registrations over the core facades. Pi is the primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs `wiki_*` tools. They should return as thin Pi adapter registrations over the harness-agnostic core APIs, not as a restoration of the old extension internals. The user-facing slash namespace is `/wiki`. The CLI may remain a temporary development/test harness, but normal agents should use Pi-owned tools and commands once enabled.

Mocked extension tests cover the intended package surface: `wiki_*` tools, `/wiki` commands, pure TUI renderers, and a prompt-guidance hook. Prompt guidance is additive system-prompt context only; it must not create workflow truth or replace explicit tool/trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki bootstrap` and `/wiki state --board`, and verifies the rendered notification output without starting a model turn.

`npm run test:pi-mutation` is the isolated tool mutation smoke. It uses a temp
project, exercises a Pi-registered `wiki_decide` tool with preview first, rejects
unguarded append, appends only with expected byte and sequence checks, and
verifies `/wiki state` reflects the appended decision.

`npm run test:pi-dogfood` is the repo-local dogfood smoke. It builds `dist/**`,
starts Pi RPC mode from this checkout using `.pi/settings.json`, runs
`/wiki state --board`, and verifies rendered output without starting a model turn.

`npm run test:external-dogfood` is the fresh-project package dogfood smoke. It
packs and installs CodeWiki outside this checkout, runs `/wiki bootstrap`, drives
guarded decision/planning/runtime/implementation/archive writes, collects a real
worker output file through the runtime host runner, releases the claim, and closes
the trace.

`npm run test:external-failures` is the fresh-project package failure smoke. It
packs and installs CodeWiki outside this checkout, then verifies missing,
malformed, blocked, mixed-outcome, worktree-prepare, and worktree-cleanup runtime
failure paths through installed package artifacts.

`npm run test:readiness` is the repo-local readiness checklist. It verifies
package metadata is present, Pi is not bundled as a runtime dependency,
`.codewiki` top-level state has the target shape, repo-local Pi settings enable
this checkout, CLI is absent from product host config, and docs do not contain
stale public command, CLI, legacy trace-close, or state/status command wording.
`npm run audit:codewiki` runs the full validation/readiness/package/Pi/mutation/
audit sequence serially.

## Rebuild rules

- Repo-local CodeWiki dogfooding is enabled; prefer read-only `/wiki state` and `/wiki explain` until mutation workflows have fresh expected byte/sequence evidence.
- Do not run CodeWiki-owned compaction, resume injection, or auto-pickup.
- Use Pi native compaction only.
- Treat `_OLD_VERSION/**` as migration reference.
- Treat `.codewiki/kb/**` as hot design truth and `.codewiki/traces/TRACE-*.jsonl` as future workflow/state truth.

## Related docs

- [File Structure](file-structure.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API Tool Surface](api-tools.md)
- [Migration Audit](migration-audit.md)
