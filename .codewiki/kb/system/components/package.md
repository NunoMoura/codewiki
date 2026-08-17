---
type: System Component
title: Package
description: Owns standalone CodeWiki Backend composition, shared error contracts, public entrypoints, Backend Plugin closure, and passive Check Pack transport.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns:
  - "src/index.ts"
  - "src/main.ts"
  - "src/pi-extension.ts"
  - "src/error-handling/codewiki-error.ts"
  - "src/error-handling/operation-errors.ts"
codewiki_test_patterns: ["tests/runtime/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies the standalone CodeWiki Backend, first-party Clients, Runtime, and isolated Agent Runner entry contracts.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Package transports inspectable npm, Git, and local Check Packs into ordinary project files.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Package transports self-contained authored Checks and their optional Pack Skills without making package installation an execution environment.
---
# Package

CodeWiki ships as one standalone local-first product whose durable service is the CodeWiki Backend. The Backend contains CodeWiki Server, one authoritative Project Runtime per governed project, semantic owners, Agent Supervisor, isolated DSH-based CodeWiki Agent Runners, Check Runners, Workbench management, and first-party App and CLI entrypoints. It may run quietly as a local daemon or later as a hosted service, but it runs behind the project rather than inside Claude Code, Codex, Pi, DSH's product shell, or another Agent product.

DSH is a pinned internal Agent engine distributed and started by CodeWiki; users do not install or operate a separate DSH product to obtain Backend Agent Runs. CodeWiki App, CLI, and optional product integrations connect as Clients. Claude Code, Codex, ACP, and future harnesses may also run as Backend-launched delegates, while independently operated Agent products participate as External Agent Clients through Server MCP. One product may occupy more than one integration role, but each run retains one explicit custody class.

The standalone `src/main.ts` entry composes Server, per-project Runtime processes, first-party Clients, Agent Supervisor, Agent Runners, and Check Runners without moving policy into Package or DSH. The broad product API remains `src/index.ts`. The supported operational Runtime surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`; Runtime's internal coordinator remains under `src/runtime/coordinator/**`. No root `coordinator.ts`, generic `composition/**` package, or public `./coordinator` compatibility export survives. `src/pi-extension.ts` is an optional external Pi Client integration, imports no Backend process-lifecycle implementation, and is not the product bootstrap or Agent engine.

Agent Runners are separate execution-plane processes inside the Backend trust boundary. They receive immutable Run Specifications and bounded service capabilities rather than canonical storage handles. A Runner or Backend Plugin cannot write Change Trace, WorkState, Knowledge, Project Configuration, Gate state, or protected refs directly. Backend upgrades pin one exact DSH and Backend Plugin closure, run conformance before activation, and never resume active sessions across an unqualified execution-engine change.

## Extension taxonomy

CodeWiki exposes four distinct extension categories:

- **Backend Plugins** are trusted executable capabilities admitted into Agent Runners through narrow CodeWiki contracts. V1 ships first-party Backend Plugins only. Raw DSH or Cordis packages are not CodeWiki Plugins and cannot be loaded from project files.
- **Check Packs** are project-owned policy files containing direct Checks and at most one optional Pack Skill. Installation is passive; later Check or Skill execution occurs only through its separately admitted boundary.
- **Core Adapters** implement trusted Backend infrastructure ports such as repository, Workbench, persistence, transport, authentication, or delivery access. They are release- or operator-owned infrastructure, not project policy.
- **Client Integrations** are App, CLI, Agent-product, channel, or collaboration endpoints speaking CodeWiki protocol. They own presentation or transport, never Runtime authority.

Runtime's policy kernel is not extensible by plugins. No extension can add a lifecycle stage, alter fixed transitions, authenticate itself, grant authority, bypass expected-head compare-and-swap, create a Check Result outside Checks, or apply a protected effect outside Runtime. DSH's reversible plugin lifecycle applies only to Runner resources and registrations; it does not reverse committed history or external effects.

Shared error handling stays lean under `src/error-handling/**`: the CodeWiki error envelope, serialization, type guards, and stable cross-owner operation-failure contract belong to Package. Configuration and Change Trace define specialized errors with their owners rather than growing a cross-domain error catalog.

## Check Pack transport

Discovery searches npm packages carrying the `codewiki-check-pack` keyword. Installation accepts an exact npm version, Git source and revision, or local package path. Each source uses either a `package.json` `codewiki.checkPacks` resource declaration or conventional `check-packs/` directories, and one package may transport Packs for multiple stages. `package.json` is transport metadata and never replaces a Check's `check.json`. A CodeWiki Pack contains direct Check directories plus at most one optional standard Agent Skill under `skill/<skill-name>/`; Backend Plugins, DSH profiles, Cordis plugins, prompt templates, themes, harness settings, and lifecycle hooks are outside the Pack contract.

The App resolves the selected source without lifecycle scripts, validates only declared Pack content, and vendors the optional Skill subtree and runtime Check files into `.codewiki/check-packs/<stage>/<pack-name>/`. Author source, tests, fixtures, package dependencies, and build tooling are not installed into the active project Pack. `.codewiki/check-packs.lock.json` records source kind and location, resolved version or revision, integrity, separate Skill and Check base digests, complete installed-package digest, and local divergence for update diffs; it does not make installed files immutable.

Package sources are transport rather than execution environments. Installation runs no package, Skill, Check, Backend Plugin, or Cordis code, imports no credentials, and grants no lifecycle or effect authority. Skill scripts and setup instructions may run later only when an admitted work-producing Agent invokes them through capabilities already admitted for that exact attempt or Assignment. Marketplace Code Checks are prebundled and later run only in the admitted sandbox; Model Checks later run only through isolated configured routes. Users may edit or delete installed files immediately. Updates are explicit and never overwrite local changes silently. Default Packs are materialized only once at project bootstrap; deleting them is supported and upgrades do not restore them.

Package installation cannot introduce credentials, telemetry, install hooks, canonical writes, unsandboxed execution, protected Check floors, fixed lifecycle changes, or Agent Runner code. Benchmarks, private state, and source-checkout dogfood machinery do not ship. Packed candidates are tested only in disposable external projects.
