# Pi Extension

The CodeWiki package now exposes the Pi extension for external package installs through `package.json` `pi.extensions`. Repo-local Pi settings still must not install or enable CodeWiki until the external smoke/dogfood step is explicit.

Target Pi integration lives under `src/pi/**` and exposes terminal-first commands, tools, prompt assets, and TUI views through thin adapter registrations over the core facades. Pi is the primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs `wiki_*` tools. They should return as thin Pi adapter registrations over the harness-agnostic core APIs, not as a restoration of the old extension internals. The user-facing slash namespace is `/wiki`. The CLI may remain a temporary development/test harness, but normal agents should use Pi-owned tools and commands once enabled.

Mocked extension tests cover the intended package surface before repo-local dogfooding: `wiki_*` tools, `/wiki` commands, pure TUI renderers, and a prompt-guidance hook. Prompt guidance is additive system-prompt context only; it must not create workflow truth or replace explicit tool/trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki bootstrap` and `/wiki state --board`, and verifies the rendered notification output without starting a model turn.

`npm run test:readiness` is the final repo-local readiness checklist. It verifies package metadata is present, Pi is not bundled as a runtime dependency, `.codewiki` top-level state has the target shape, repo-local Pi settings do not enable CodeWiki, CLI is absent from product host config, and docs do not contain stale public command, CLI, legacy trace-close, or state/status command wording.

## Rebuild rules

- Do not use CodeWiki `wiki_*` tools in this repository until repo-local dogfooding is explicitly enabled; use normal source edits/tests and Pi-native compaction during the rebuild.
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
