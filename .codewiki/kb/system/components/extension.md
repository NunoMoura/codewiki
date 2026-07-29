---
type: Concept
title: Pi Extension
description: CodeWiki's optional Pi extension is a thin client/execution adapter to standalone Project Runtime; source-checkout self-hosting remains disabled until external gates pass.
tags:
  - codewiki
  - system
  - extension
timestamp: 2026-07-29T21:24:38.000Z
codewiki_component: pi
codewiki_components:
  - pi
codewiki_source_patterns:
  - src/pi/**
codewiki_test_patterns:
  - tests/helpers/pi-project-services.mjs
  - tests/runtime/pi-worker-start.test.mjs
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-install-smoke.mjs
  - tests/runtime/pi-install-scope.test.mjs
  - tests/runtime/pi-process-session.test.mjs
  - tests/runtime/pi-decision-research-claims-session.test.mjs
  - tests/runtime/process-worker-adapter.test.mjs
  - tests/runtime/pi-project-service-client.test.mjs
  - tests/runtime/pi-project-coordinator-daemon.test.mjs
  - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
  - tests/runtime/pi-rpc-smoke.mjs
  - tests/runtime/pi-tool-mutation-smoke.mjs
  - tests/runtime/pi-worker-reports.test.mjs
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
      - tests/helpers/pi-project-services.mjs
      - tests/runtime/pi-worker-start.test.mjs
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-install-smoke.mjs
      - tests/runtime/pi-install-scope.test.mjs
      - tests/runtime/pi-process-session.test.mjs
      - tests/runtime/pi-decision-research-claims-session.test.mjs
      - tests/runtime/process-worker-adapter.test.mjs
      - tests/runtime/pi-project-service-client.test.mjs
      - tests/runtime/pi-project-coordinator-daemon.test.mjs
      - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
      - tests/runtime/pi-rpc-smoke.mjs
      - tests/runtime/pi-tool-mutation-smoke.mjs
      - tests/runtime/pi-worker-reports.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-local-install-smoke.mjs
      - tests/runtime/external-package-lifecycle-smoke.mjs
      - tests/runtime/external-package-failures-smoke.mjs
    role: host_adapter
---
# Pi Extension

CodeWiki's approved primary boundary is the standalone CLI, Project Runtime, dashboard, and embedded published Pi SDK. The package retains `package.json` `pi.extensions` for an optional thin client. During stabilization, the CodeWiki source repository does not register, install, or load CodeWiki in project-local Pi settings. Maintainers work with Pi native coding tools and Pi-Lens; no `.pi/extensions/codewiki.ts` shim, local package path, pinned controller, or mutable-source autoload is allowed.

Pi integration lives under `src/pi/**` and has two distinct roles. The extension is a thin conversational client of one project-scoped CodeWiki Runtime. The Pi execution adapter creates bounded agent sessions on Runtime request. Pi remains the provider/auth/session/tool/Skill engine, not CodeWiki core; harness-neutral runtime code must not import Pi SDK types.

CodeWiki OS keeps bounded state, Change, and configuration capabilities available to clients while Project Runtime owns semantic selection and scheduling. Decision, Planning, and Implementation candidate sessions use isolated Pi SDK sessions with read-only repository tools and closed role-specific submission tools. Independent Model Checks never reuse producer sessions. The Decision research claim-support transport uses one stricter in-memory session with all tools and resource discovery disabled, an exact Runtime-selected route, and strict bounded JSON output. Runtime injects versioned CodeWiki OS guidance plus the exact mandatory Loop Protocol. Normal Pi Skill discovery and progressive loading remain available to candidate Workbenches unless Planning narrows Skill scope. Implementation Assignments use a separate harness-neutral worker contract. The default Pi adapter executes foreground child processes in explicit worktrees. An opt-in core OCI adapter executes the same contract through a host-selected digest-pinned Docker/Podman image and preserves the same Claim, Assignment, cancellation, immutable Worker report, recovery, review, Integration, and cleanup semantics. The executable Pi daemon does not select or provision that image automatically. Runtime supplies exact context, freshness, budgets, and append authority; sessions return judgment or evidence only.

Current compatibility slash surface remains `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. An eligible Pi session ensures or connects to detached local Project Runtime and may open its dashboard once. `/wiki-dashboard` reopens, discovers, or explicitly stops the dashboard/Runtime service according to policy. Target standalone CLI becomes primary host; Pi commands remain thin client conveniences.

CodeWiki is not published to the npm registry yet. Its selected registry identity is `@nunomoura/codewiki`, while package metadata keeps `"private": true` so npm refuses publication during stabilization. Distribution testing packs the candidate and installs it only into disposable external projects with isolated Pi settings. The source checkout contains canonical KB, source, tests, and Git history but no active dogfood trace or Changes state. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi installation by default in consuming projects; controlled tests may opt into the explicit non-project-install override. CodeWiki exposes a hardened OCI adapter seam but does not ship a trusted worker image or treat containerization alone as complete sandbox authority. It remains compatible with external sandbox, worktree, container, or agent-harness isolation.

Mocked extension tests cover registered capabilities, service-owned semantic dispatch, peer-absent Runtime-selected candidate fallback, Runtime-owned semantic invocation, direct `/wiki-*` slash commands, pure TUI renderers, CodeWiki OS guidance, Loop Protocol binding, and normal Skill discovery. Prompt resources constrain candidate behavior but cannot choose routing, create workflow truth, grant tools/authority, suppress required Checks, alter thresholds, attest acceptance, or replace explicit trace evidence.

`npm run test:pi-install` is the reproducible install smoke. It packs CodeWiki, installs the tarball into a temp npm prefix, installs that package through Pi with temp `PI_CODING_AGENT_DIR`/session dirs, and verifies Pi can resolve the package without writing repo-local or global Pi settings.

`npm run test:pi-rpc` is the external command smoke. It uses a temp project and temp Pi settings, installs the packed package, starts Pi RPC mode, runs `/wiki-bootstrap` and `/wiki-dashboard --no-open`, and verifies dashboard command rendering without starting a model turn.

In a consuming project, one detached local project daemon owns the runtime coordinator. Pi sessions discover and connect as leased clients; no individual session owns its lifetime. Dashboard runtimes connect as separate observers while their existing HTTP endpoint remains a transitional process. Initial TUI `session_start` may ensure the coordinator and open one browser tab. Reload or session replacement reuses the endpoint without opening another tab. Closing a browser tab or Pi session does not mutate workflow truth. Under supervised policy, loss of all approved supervisors prevents new execution starts while preserving deterministic recovery. `/wiki-dashboard` health-checks project service state before reopening it. Stale endpoint metadata is removed after failed serving. Installing a different package version while Pi is running requires fully exiting and restarting Pi; `/reload` may reload extension registration but cannot guarantee replacement of cached imported package modules.

`npm run test:pi-multiprocess` packs CodeWiki into a disposable external project, starts two real Pi RPC processes plus the dashboard, verifies three leased clients share one coordinator generation with two approved supervisors, proves the installed extension resolves the host Pi SDK and advertises service-owned semantic execution, observes a Pi disconnect through bounded cross-process event replay, then verifies supervisor loss pauses execution and explicit shutdown leaves no daemon.

`npm run test:pi-mutation` is the isolated tool mutation smoke. It uses a temp
project, exercises a Pi-registered `wiki_decide` tool with preview first, rejects
unguarded append, appends only with expected byte and sequence checks, and
verifies internal `wiki_state` reflects the appended decision.

`npm run test:project-local-install` is the project-local package smoke. It
installs the packed package under a fresh project's `.pi/npm/node_modules/@nunomoura/codewiki`
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

Supported now: project-local packed/local package installs, guarded expected-byte/sequence mutation, process worker primitives, external sandbox compatibility, and a detached elected project coordinator service with authenticated loopback clients. Pi sessions use leased service clients for runtime inspection and bounded trigger submission; when the optional Pi SDK peer is available, the daemon owns semantic-session dispatch and removes semantic candidate tools from the main conversation. Peer-absent installs retain only the runtime-selected candidate fallback. Dashboard runtimes register separate observers. Runtime selects exact invariants, schedules typed jobs, binds successful writes to deterministic job ids in canonical Change Trace events, rechecks generation ownership before append, and recovers completion evidence after restart without reinvoking adapters. Bounded cursor-based event replay carries coordinator transitions and runtime-confirmed WorkState digests; Pi and dashboard clients resubscribe after generation loss and refresh canonical snapshots after gaps. A packed external spike proves two real Pi RPC processes plus one dashboard share one generation, receive cross-process events, and pause supervision after both Pi clients exit. The elected service now derives ready Work Items from canonical WorkState, appends exact Assignment claims under CAS, binds private dispatch packets to canonical digests, prepares explicit worktrees, schedules process workers through typed lanes, recovers exact Worker Reports into selected Implementation candidates, and releases claims only after acceptance or explicit failed, blocked, or cancelled handling. Graceful shutdown propagates cancellation into foreground Pi workers, terminates bounded child processes, persists cancelled reports, and drains coordinator jobs before releasing ownership. Reconciliation removes pre-Claim and terminal unsuccessful private artifacts while preserving active-Claim, unintegrated completed, and ambiguous evidence; runtime-local orphan worktrees are removed and pruned only through the structured runner. Accepted completed output enters deterministic target/base Integration lanes, produces a private local commit plus canonical exact Git/tree proof, and becomes cleanup-eligible only after that proof matches the Claim, Assignment, and Worker report. Abrupt-death process observation, project-branch merge/publication, dashboard-service consolidation, trusted worker-image distribution, and real container/provider-auth execution still require external gates before production use. Public npm publish, unattended worker start, auto-merge, auto-publish, global/user installs for normal mutation, and treating worker completion as truth without Implementation acceptance remain gated.

Before enabling unattended worker start or auto-merge, require multiple successful
external package lifecycle smokes, passing package failure-path smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, green
archive/hydrate validation, and explicit user approval policy for destructive or
externally visible actions.

## Self-hosting posture

Repo-local self-hosting means using CodeWiki `wiki_*` tools inside the CodeWiki source checkout. It is disabled during stabilization because it creates a circular trust and versioning dependency between mutable source and the controller evaluating that source.

Normal development uses Pi native coding tools, pi-lens, KB updates, source/tests, and Git. The repository carries no active dogfood traces, Changes Backlog ref, controller pin, CodeWiki package entry, or project-local CodeWiki Skills. CodeWiki OS and Loop Protocol package resources are product source tested through packed external installs; they are not activated in this checkout. Removing current dogfood state from the branch tip does not remove recoverability from Git history or the explicit ignored migration backup.

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

- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Source Map](source-map.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Adapters and UI](adapters-and-ui.md)
- [API Tool Surface](api-tools.md)
- [Migration Audit](../flows/migration-audit.md)
