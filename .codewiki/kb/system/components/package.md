---
type: System Component
title: Package
description: Owns CodeWiki composition, shared error contracts, public entrypoints, Runtime Build closure, and passive Check Pack transport.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns:
  - "src/index.ts"
  - "src/main.ts"
  - "src/pi-extension.ts"
  - "src/error-handling/codewiki-error.ts"
  - "src/error-handling/operation-errors.ts"
codewiki_test_patterns: ["tests/project-server/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies CodeWiki, Project Servers, Runtime, first-party Clients, and isolated Run Process entry contracts.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Package transports inspectable npm, Git, and local Check Packs into ordinary project files.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Package transports self-contained authored Checks and optional Pack Skills without making installation an execution environment.
---
# Package

CodeWiki is one standalone local-first product. One CodeWiki process may host several authoritative Project Servers, each owning one governed project and one subordinate Runtime. CodeWiki also ships first-party App and CLI Clients, optional Client integrations, shared package assets, and release-managed Runtime Builds. It may run quietly as a local daemon or later as a hosted product, but it runs behind projects rather than inside Claude Code, Codex, Pi, DSH's product shell, or another Agent product.

DSH is an exact pinned upstream library inside Runtime Builds. Users do not install or operate a separate DSH product to obtain Runs. The CodeWiki DSH Adapter composes DSH Agent, AgentLoop, Agent Session, Runtime Plugins, model adapters, and delegate adapters inside isolated Run Processes. DSH owns no Project Server, Client, Check Result, Gate, transition, or effect authority.

The broad product API remains `src/index.ts`. Project Server publishes at `@nunomoura/codewiki/project-server` from `src/project-server/index.ts`. Runtime publishes at `@nunomoura/codewiki/runtime` from `src/runtime/index.ts`. Internal Project Server coordination remains under `src/project-server/coordinator/**`; Run Process protocol and process management remain under `src/runtime/processes/**`. No legacy `src/server/**`, `src/execution/**`, `./coordinator`, or old `./runtime` Project Server compatibility surface survives.

`src/pi-extension.ts` is an optional Pi Client integration, not CodeWiki bootstrap or Runtime. The temporary Pi executor under `src/runtime/pi/**` remains migration evidence only until DSH parity, after which it is deleted without a backend selector or fallback.

## Extension taxonomy

CodeWiki exposes four distinct categories:

- **Runtime Plugins** are trusted first-party executable capabilities admitted into Run Processes through the CodeWiki DSH Adapter. Raw DSH or Cordis packages are not Runtime Plugins and cannot load from project files.
- **Check Packs** are project-owned policy files containing direct Checks and at most one optional Pack Skill. Installation is passive; later Check or Skill execution occurs only through separately admitted boundaries.
- **Core Adapters** implement trusted CodeWiki infrastructure ports such as repository, Workbench, persistence, transport, AuthN, provider, or delivery access. They are release- or operator-owned infrastructure, not project policy.
- **Client Integrations** are App, CLI, Agent-product, channel, or collaboration endpoints speaking CodeWiki protocol. They own presentation or transport, never Project Server authority.

Project Server policy is not extensible by plugins. No extension can add a stage, alter fixed transitions, authenticate itself, grant authority, bypass expected-head compare-and-swap, create a Check Result outside Checks, or apply a protected effect outside Project Server. DSH's reversible plugin lifecycle applies only to in-process resources and registrations; it cannot reverse committed history or external effects.

Runtime Builds are release artifacts, not project extensions. Every build binds exact CodeWiki DSH Adapter, DSH and Cordis package closure, Runtime Plugins, model/delegate adapters, protocol, Node version, executable bytes, and qualification Evidence. Project files cannot install or select Runtime code. Activation uses CodeWiki-owned expected-generation compare-and-swap and affects new Runs only.

Shared error handling stays lean under `src/error-handling/**`: CodeWiki error envelope, serialization, type guards, and stable cross-owner operation-failure contracts belong to Package. Configuration and Change Trace define specialized errors with their owners rather than growing a cross-domain error catalog.

## Check Pack transport

Discovery searches npm packages carrying the `codewiki-check-pack` keyword. Installation accepts an exact npm version, Git source and revision, or local package path. Each source uses either `package.json` `codewiki.checkPacks` resources or conventional `check-packs/` directories, and one package may transport Packs for several stages. `package.json` is transport metadata and never replaces a Check's `check.json`.

A Pack contains direct Check directories plus at most one optional standard Agent Skill under `skill/<skill-name>/`. Runtime Plugins, Runtime Builds, DSH profiles, Cordis plugins, prompt templates, themes, harness settings, and lifecycle hooks are outside Pack contract.

CodeWiki resolves selected source without lifecycle scripts, validates declared Pack content, and vendors optional Skill and Check files into `.codewiki/check-packs/<stage>/<pack-name>/`. Author source, dependencies, and build tooling do not enter active project Pack. `.codewiki/check-packs.lock.json` records source, resolved version or revision, integrity, separate Skill and Check digests, complete installed-package digest, and local divergence; it does not make files immutable.

Package sources are transport, not execution environments. Installation runs no package, Skill, Check, Runtime Plugin, Cordis code, or Runtime Build; imports no credentials; and grants no lifecycle or effect authority. Skill scripts may run later only through capabilities admitted for one exact producer Run or Implementation Assignment. Code Checks later run only in admitted sandboxes; Model Checks run only through isolated configured routes.

Users may edit or delete installed Check Pack files immediately. Updates are explicit and never overwrite local changes silently. Default Packs materialize only once at project bootstrap; deleting them is supported and upgrades do not restore them. Package installation cannot introduce credentials, telemetry, install hooks, canonical writes, unsandboxed execution, protected Check floors, lifecycle changes, or Run Process code. Benchmarks, private state, and source-checkout dogfood machinery do not ship. Packed candidates are tested only in disposable external projects.
