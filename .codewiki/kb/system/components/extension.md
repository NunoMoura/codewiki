---
type: Concept
title: Pi Extension
description: The package exposes the Pi extension for external installs and supervised repo-local use through a reviewed, reproducibly installed pinned controller; mutable source is never autoloaded.
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

The CodeWiki package exposes the Pi extension for external package installs through `package.json` `pi.extensions`. Repo-local Pi autoload now uses only the reviewed controller installed at `.pi/npm/node_modules/codewiki`; mutable source is never loaded through `..`. `.pi/settings.json` loads that controller beside pi-lens. No `.pi/extensions/codewiki.ts` shim is allowed.

Target Pi integration lives under `src/pi/**` and exposes terminal-first commands, tools, prompt assets, and TUI views through thin adapter registrations over the core facades. Pi is the primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs a small internal model-facing `wiki_*` tool set: `wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, and `wiki_archive`. Runtime coordination is host/backend plumbing over core APIs, not a normal agent tool. The user-facing slash surface is direct `/wiki-*` commands: `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. `/wiki-dashboard` is the read-only Sprints Queue browser surface. The older grouped namespace command and former state alias are removed from public UX. The CLI may remain a temporary development/test harness, but normal agents should use Pi-owned tools and commands once enabled.

CodeWiki is not published to the npm registry yet. Current distribution testing uses packed/local package installs only, so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented. The future registry package name is still TBD because the unscoped `codewiki` npm name is already owned by another maintainer. Global/user installs are discouraged for normal use. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi installation by default; controlled tests may opt into the explicit non-project-install override. CodeWiki does not provide a sandbox, but it remains compatible with external sandbox, worktree, container, or agent-harness isolation.

Mocked extension tests cover the intended package surface: the small `wiki_*` tool set, direct `/wiki-*` slash commands, pure TUI renderers, and a prompt-guidance hook. Prompt guidance is additive system-prompt context only; it must not create workflow truth or replace explicit tool/trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki-bootstrap` and `/wiki-dashboard --no-open`, and verifies dashboard command rendering without starting a model turn.

The dashboard is owned by the active Pi session. Its command health-checks `/api/state` before returning a URL, removes stale endpoint metadata after failed serving, and distinguishes the pinned runtime captured when package modules loaded from the currently installed pin. Advancing the installed controller while Pi is running requires fully exiting and restarting Pi; `/reload` may reload extension registration but cannot guarantee replacement of cached imported package modules. A mismatch returns actionable restart guidance instead of a known-dead or stale URL.

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

`npm run test:readiness` is the repo-local readiness checklist. It verifies
package metadata is present, Pi is not bundled as a runtime dependency,
`.codewiki` top-level state has the target shape, repo-local Pi settings load
only the pinned project-local controller, CLI is absent from product host config,
and docs do not contain stale public command, CLI, legacy trace-close, or
state/status command wording.
`npm run audit:codewiki` runs the full validation/readiness/package/Pi/mutation/
audit sequence serially.
`.pi/codewiki-controller.json` is the tracked controller pin. It records the
reviewed tag, commit, tree, package byte count and SHA-256, and approval identity.
`npm run self-dogfood:controller:install` rebuilds that commit in a detached
temporary worktree, requires an exact package match, and installs only the
verified artifact under `.pi/npm/node_modules/codewiki`.

`npm run test:self-dogfood-candidate` runs the full CodeWiki audit and loop lab
gates without granting the candidate authority over itself.
`npm run self-dogfood:baseline:create -- --review-ref <ref> --approved-by
<name>` refuses a dirty checkout, reruns those gates, and writes a host-owned
ignored manifest beside the packed tarball under
`.pi/npm/codewiki-baselines/**`. The manifest pins the reviewed
commit, Git tree content proof, package byte count and SHA-256, reviewer, and
gate results. With `CODEWIKI_BASELINE_MANIFEST` pointing at that manifest,
`npm run test:self-dogfood-ready` verifies the Git and package pin, requires a
clean candidate checkout, reruns candidate gates, and executes the disposable
shadow smoke. Explicit approval then permits only the pinned controller installer
and supervised activation path.

## Production readiness gates

Supported now: project-local packed/local package installs, supervised `/wiki-*` and model-facing
`wiki_*` flows in external, controlled test, and this pinned-controller project,
guarded expected-byte/sequence mutation, and external sandbox
compatibility. Runtime backend APIs support host coordination but are not exposed
as a normal agent tool. Gated before production automation: public npm publish,
unattended runtime worker start, auto-merge, auto-publish, global/user installs
for normal mutation, and treating worker completion as truth without implementation preview.

Before enabling unattended worker start or auto-merge, require multiple successful
external package lifecycle smokes, passing package failure-path smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, green
archive/hydrate validation, and explicit user approval policy for destructive or
externally visible actions.

## Self-dogfood re-enable gate

Repo-local self-dogfood means using CodeWiki `wiki_*` tools inside the CodeWiki
source checkout itself. This is stricter than using the package in a temporary or
external project because bad tool behavior could mutate CodeWiki's own workflow
truth. Self-dogfood is not re-enabled by build success alone.

Self-dogfood status: supervised pinned-controller autoload is enabled for
reviewed commit `f3955ec3caa09206459e91507fc6622fb1e392cf`, Git tree
`120326cceeabbfef3cc542043db083586b741829`, and package SHA-256
`83698ea3fe491bdab6220bbda237809a7897f9ffdff95ccdacaa4cbe09948c2b`.
The tracked pin reproduced the exact package under stable-baseline governance;
`.pi/settings.json` loads only that installed controller. The earlier
`trace:TRACE-self-dogfood-reenabled-v1#change:CHG-self-dogfood-reenable-approved`
remains historical evidence, not approval for another controller.

The re-enable gate is:

1. A reviewed clean commit is packed with
   `npm run self-dogfood:baseline:create -- --review-ref <ref> --approved-by
   <name>`. Its host-owned ignored manifest under
   `.pi/npm/codewiki-baselines/**` pins matching Git tree content proof, package
   integrity, review identity, and passing candidate gates.
2. With `CODEWIKI_BASELINE_MANIFEST` pointing at that manifest,
   `npm run test:self-dogfood-ready` verifies the immutable controller, requires
   a clean candidate checkout, reruns candidate gates, and executes shadow
   reads/previews; mutable candidate source cannot grade itself.
3. `npm run self-dogfood:controller:install` rebuilds the pinned commit in a
   detached worktree, verifies exact bytes and SHA-256, and installs only that
   package under `.pi/npm`.
4. Disposable external dogfood covers successful lifecycle runs, append
   conflicts, malformed worker output, worktree failures, and cleanup.
5. The pinned baseline produces acceptable read-only and preview results in
   shadow mode before any real-repo trace append.
6. `.codewiki/traces/TRACE-*.jsonl` files validate, and no central trace index or
   legacy generated root becomes active truth.
7. Explicit approval enables only supervised use with preview-before-append,
   expected-byte/sequence guards, no unattended worker start, no auto-merge, and
   no auto-publish.

Current repo operating guidance permits supervised CodeWiki use through the
pinned controller while retaining normal Git and test verification. The first
real-repo use after re-enable must be a read-only `wiki_state` check, followed by
preview-mode loop calls before any guarded append. Changes to the quality
evaluator remain governed by the stable baseline while the candidate evaluator
runs as non-authoritative evidence.

## Rebuild rules

- Repo-local CodeWiki dogfooding is supervised and pinned; `.pi/settings.json` loads `.pi/npm/node_modules/codewiki` beside pi-lens. Do not add a `.pi/extensions/codewiki.ts` shim or load mutable source through `..`.
- Do not run CodeWiki-owned compaction, resume injection, or auto-pickup.
- Use Pi native compaction only.
- Do not rely on `_OLD_VERSION/**`; the archive has been removed after migration audit.
- Treat `.codewiki/kb/**` as hot design truth and `.codewiki/traces/TRACE-*.jsonl` as future workflow/state truth.

## Related docs

- [Source Map](source-map.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API Tool Surface](api-tools.md)
- [Migration Audit](../flows/migration-audit.md)
