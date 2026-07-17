---
type: Concept
title: Pi Extension
description: CodeWiki is developed as a normal source package and released as a Pi extension only after stable external-install gates pass.
tags:
  - codewiki
  - system
  - extension
timestamp: 2026-06-30T00:00:00Z
codewiki_component: pi
codewiki_components:
  - pi
codewiki_source_patterns:
  - src/pi/**
codewiki_test_patterns:
  - tests/runtime/pi-worker-start.test.mjs
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-install-smoke.mjs
  - tests/runtime/pi-install-scope.test.mjs
  - tests/runtime/pi-process-session.test.mjs
  - tests/runtime/pi-rpc-smoke.mjs
  - tests/runtime/pi-tool-mutation-smoke.mjs
  - tests/runtime/pi-worker-results.test.mjs
  - tests/runtime/package-install-smoke.mjs
  - tests/runtime/project-local-install-smoke.mjs
  - tests/runtime/external-package-lifecycle-smoke.mjs
  - tests/runtime/external-package-failures-smoke.mjs
codewiki_role: host_adapter
codewiki_source_map:
  - id: pi
    source_patterns:
      - src/pi/**
    test_patterns:
      - tests/runtime/pi-worker-start.test.mjs
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-install-smoke.mjs
      - tests/runtime/pi-install-scope.test.mjs
      - tests/runtime/pi-process-session.test.mjs
      - tests/runtime/pi-rpc-smoke.mjs
      - tests/runtime/pi-tool-mutation-smoke.mjs
      - tests/runtime/pi-worker-results.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-local-install-smoke.mjs
      - tests/runtime/external-package-lifecycle-smoke.mjs
      - tests/runtime/external-package-failures-smoke.mjs
    role: host_adapter
---
# Pi Extension

The CodeWiki package exposes a future Pi extension for external package installs through `package.json` `pi.extensions`. During stabilization, the CodeWiki source repository does not register, install, or load CodeWiki in project-local Pi settings. Maintainers work with Pi native coding tools and pi-lens; no `.pi/extensions/codewiki.ts` shim, local package path, pinned controller, or mutable-source autoload is allowed.

Target Pi integration lives under `src/pi/**` and exposes terminal-first commands, tools, prompt assets, and TUI views through thin adapter registrations over the core facades. Pi is the primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs a small internal model-facing `wiki_*` tool set: `wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, and `wiki_archive`. Runtime coordination is host/backend plumbing over core APIs, not a normal agent tool. The user-facing slash surface is direct `/wiki-*` commands: `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. An eligible Pi TUI session starts and opens the Work Pipeline dashboard automatically once; `/wiki-dashboard` reopens or recovers it, and `/wiki-dashboard --stop` stops its local host. The older grouped namespace command and former state alias are removed from public UX. The CLI may remain a temporary development/test harness, but normal agents should use Pi-owned tools and commands once enabled.

CodeWiki is not published to the npm registry yet. Distribution testing packs the candidate and installs it only into disposable external projects with isolated Pi settings. The source checkout contains canonical KB, source, tests, and Git history but no active dogfood trace or Changes state. The future registry package name is still TBD because the unscoped `codewiki` npm name is already owned by another maintainer. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi installation by default in consuming projects; controlled tests may opt into the explicit non-project-install override. CodeWiki does not provide a sandbox, but it remains compatible with external sandbox, worktree, container, or agent-harness isolation.

Mocked extension tests cover the intended package surface: the small `wiki_*` tool set, direct `/wiki-*` slash commands, pure TUI renderers, and a prompt-guidance hook. Prompt guidance is additive system-prompt context only; it must not create workflow truth or replace explicit tool/trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki-bootstrap` and `/wiki-dashboard --no-open`, and verifies dashboard command rendering without starting a model turn.

In a consuming project, the dashboard is owned by the active Pi session. Initial TUI `session_start` starts it and opens one browser tab; reload or session replacement restores the endpoint without opening another tab. Closing a browser tab does not stop workflow or mutate truth. Host shutdown remains a Pi command/lifecycle concern rather than a settings-menu action. `/wiki-dashboard` health-checks `/api/state` before reopening it. Stale endpoint metadata is removed after failed serving. Installing a different package version while Pi is running requires fully exiting and restarting Pi; `/reload` may reload extension registration but cannot guarantee replacement of cached imported package modules.

`npm run test:pi-mutation` is the isolated tool mutation smoke. It uses a temp
project, exercises a Pi-registered `wiki_decide` tool with preview first, rejects
unguarded append, appends only with expected byte and sequence checks, and
verifies internal `wiki_state` reflects the appended decision.

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

`npm run test:readiness` is the repo-local readiness checklist. It verifies package metadata, Pi dependency boundaries, KB/source layout, external installation expectations, and stale public wording. It must assert that the source repository does not register CodeWiki in `.pi/settings.json` or carry an active controller pin.

`npm run audit:codewiki` runs the full validation/readiness/package/Pi/mutation/audit sequence serially. Legacy self-dogfood baseline, controller, and shadow utilities remain source-covered release-engineering code only. They are not current readiness gates, do not authorize source-checkout activation, and must not install CodeWiki into this checkout. Any future self-hosting path requires a new explicit product/system decision and external release evidence.

## Production readiness gates

Supported now: project-local packed/local package installs and supervised `/wiki-*` and model-facing `wiki_*` flows in disposable external test projects, guarded expected-byte/sequence mutation, and external sandbox compatibility. Runtime backend APIs support host coordination but are not exposed
as a normal agent tool. Gated before production automation: public npm publish,
unattended runtime worker start, auto-merge, auto-publish, global/user installs
for normal mutation, and treating worker completion as truth without implementation preview.

Before enabling unattended worker start or auto-merge, require multiple successful
external package lifecycle smokes, passing package failure-path smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, green
archive/hydrate validation, and explicit user approval policy for destructive or
externally visible actions.

## Self-hosting posture

Repo-local self-hosting means using CodeWiki `wiki_*` tools inside the CodeWiki source checkout. It is disabled during stabilization because it creates a circular trust and versioning dependency between mutable source and the controller evaluating that source.

Normal development uses Pi native coding tools, pi-lens, KB updates, source/tests, and Git. The repository carries no active dogfood traces, Changes Backlog ref, controller pin, CodeWiki package entry, or project-local CodeWiki skills. Removing current dogfood state from the branch tip does not remove recoverability from Git history or the explicit ignored migration backup.

Release readiness is proved externally:

1. Build and pack a reviewed clean commit.
2. Install the package into disposable projects with isolated Pi settings.
3. Verify extension loading, prompt injection, tools, commands, dashboard behavior, guarded lifecycle writes, failures, and cleanup there.
4. Keep the source repository unmodified by those tests.
5. Publish or distribute the extension only after stable external gates and explicit release approval pass.

Self-hosting is not a release requirement. If reconsidered later, it needs a new explicit product/system decision; old controller approvals and historical traces grant no authority.

## Rebuild rules

- Develop CodeWiki with Pi native coding tools and pi-lens; do not load CodeWiki into its own source checkout.
- Keep `.pi/settings.json` free of CodeWiki package entries and do not add a `.pi/extensions/codewiki.ts` shim or mutable local path.
- Do not activate project-local `codewiki-*` skills, prompt injection, dashboards, commands, or tools during stabilization.
- Test the extension through packed installs in disposable external projects.
- Use Pi native compaction only.
- Do not rely on `_OLD_VERSION/**`; the archive has been removed after migration audit.
- Treat `.codewiki/kb/**` as current design truth, source/tests as executable truth, and Git as history. This checkout keeps no active dogfood trace or Changes state.

## Related docs

- [Source Map](source-map.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API Tool Surface](api-tools.md)
- [Migration Audit](../flows/migration-audit.md)
