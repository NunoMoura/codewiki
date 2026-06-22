# Pi Extension

The CodeWiki package exposes the Pi extension for external package installs through `package.json` `pi.extensions`. This checkout intentionally does not auto-load CodeWiki through `.pi/extensions/codewiki.ts` while production readiness is being hardened; temp-project package smokes exercise `dist/pi/extension.js` instead.

Target Pi integration lives under `src/pi/**` and exposes terminal-first commands, tools, prompt assets, and TUI views through thin adapter registrations over the core facades. Pi is the primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs a small model-facing `wiki_*` tool set: `wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, and `wiki_archive`. Runtime coordination is host/backend plumbing over core APIs, not a normal agent tool. The user-facing slash surface is direct `/wiki-*` commands: `/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. The older grouped namespace command is deprecated. The CLI may remain a temporary development/test harness, but normal agents should use Pi-owned tools and commands once enabled.

CodeWiki should be installed project-locally with `pi install -l npm:codewiki` so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented. Global/user installs are discouraged for normal use. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi installation by default; controlled tests may opt into the explicit non-project-install override. CodeWiki does not provide a sandbox, but it remains compatible with external sandbox, worktree, container, or agent-harness isolation.

Mocked extension tests cover the intended package surface: the small `wiki_*` tool set, direct `/wiki-*` slash commands, pure TUI renderers, and a prompt-guidance hook. Prompt guidance is additive system-prompt context only; it must not create workflow truth or replace explicit tool/trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki-bootstrap` and `/wiki-state --board`, and verifies the rendered notification output without starting a model turn.

`npm run test:pi-mutation` is the isolated tool mutation smoke. It uses a temp
project, exercises a Pi-registered `wiki_decide` tool with preview first, rejects
unguarded append, appends only with expected byte and sequence checks, and
verifies `/wiki-state` reflects the appended decision.

`npm run test:project-local-install` is the project-local package smoke. It
installs the packed package under a fresh project's `.pi/npm/node_modules/codewiki`
path and verifies bootstrap, config write, and guarded decision append without
controlled-test overrides.

`npm run test:external-lifecycle` is the fresh-project package lifecycle smoke. It
packs and installs CodeWiki outside this checkout, runs `/wiki-bootstrap`, drives
guarded decision/planning/runtime/implementation/archive writes, collects a real
worker output file through the runtime host runner, releases the claim, and closes
the trace.

`npm run test:external-failures` is the fresh-project package failure smoke. It
packs and installs CodeWiki outside this checkout, then verifies missing,
malformed, blocked, mixed-outcome, worktree-prepare, and worktree-cleanup runtime
failure paths through installed package artifacts.

`npm run test:readiness` is the repo-local readiness checklist. It verifies
package metadata is present, Pi is not bundled as a runtime dependency,
`.codewiki` top-level state has the target shape, repo-local Pi settings do not
load CodeWiki, CLI is absent from product host config, and docs do not contain
stale public command, CLI, legacy trace-close, or state/status command wording.
`npm run audit:codewiki` runs the full validation/readiness/package/Pi/mutation/
audit sequence serially.

## Production readiness gates

Supported now: project-local package installs, supervised `/wiki-*` and model-facing
`wiki_*` flows, guarded expected-byte/sequence mutation, and external sandbox
compatibility. Runtime backend APIs support host coordination but are not exposed
as a normal agent tool. Gated before production automation: unattended runtime
worker start, auto-merge, auto-publish, global/user installs for normal mutation,
and treating worker completion as truth without implementation preview.

Before enabling unattended worker start or auto-merge, require multiple successful
external package lifecycle smokes, passing package failure-path smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, green
archive/hydrate validation, and explicit user approval policy for destructive or
externally visible actions.

## Rebuild rules

- Repo-local CodeWiki dogfooding is disabled until production readiness gates pass; keep `.codewiki/kb/**` updated manually.
- Do not run CodeWiki-owned compaction, resume injection, or auto-pickup.
- Use Pi native compaction only.
- Do not rely on `_OLD_VERSION/**`; the archive has been removed after migration audit.
- Treat `.codewiki/kb/**` as hot design truth and `.codewiki/traces/TRACE-*.jsonl` as future workflow/state truth.

## Related docs

- [Source Map](source-map.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API Tool Surface](api-tools.md)
- [Migration Audit](migration-audit.md)
