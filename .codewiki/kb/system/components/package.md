---
type: System Component
title: Package
description: Owns CodeWiki product composition, shared error contracts, execution-port exports, Check Pack transport, and executable entry contracts.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns:
  - "src/index.ts"
  - "src/pi-extension.ts"
  - "src/error-handling/codewiki-error.ts"
  - "src/error-handling/operation-errors.ts"
codewiki_test_patterns: ["tests/runtime/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies standalone Server, Client, Project Runtime, and Managed Execution entry contracts.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Package transports inspectable npm, Git, and local Check Packs into ordinary project files.
---
# Package

CodeWiki ships as one standalone local product package containing CodeWiki Server, first-party Clients, per-project Runtime, semantic owners, and pinned Pi Managed Execution. Claude Code, Codex, and other external applications connect as Clients and may accept bounded Worker Assignments through Server MCP; they do not become CodeWiki execution packages.

The broad product API remains `src/index.ts`. The supported operational Runtime surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`; Runtime's internal coordinator remains under `src/runtime/coordinator/**`. No root `coordinator.ts`, `composition/**` package, or public `./coordinator` compatibility export survives the clean cut. The shipped `src/pi-extension.ts` entry is a neutral Package bootstrap: it injects narrow dashboard and project-service ports into Pi Client registration, then composes Server App and Preview lifecycle, the Runtime gateway, and the concrete Execution-owned daemon spawner. Client code imports none of those process lifecycle implementations. A neutral `src/main.ts` may later construct Server and Runtime siblings only when a standalone process genuinely needs that bootstrap.

Shared error handling stays lean and centralized under `src/error-handling/**`: the CodeWiki error envelope, serialization, type guards, and stable cross-owner operation-failure contract belong to Package. Configuration and Change Trace semantics define their specialized errors with those owners rather than growing a cross-domain error catalog.

CodeWiki follows Pi Package source ergonomics for marketplace Packs. Discovery searches npm packages carrying the `codewiki-check-pack` keyword. Installation accepts an exact npm version, Git source and revision, or local package path. Each source uses either a `package.json` `codewiki.checkPacks` resource declaration or conventional `check-packs/` directories, and one package may transport Packs for multiple stages. The App resolves the selected source without lifecycle scripts, validates only declared Check resources, and vendors them into `.codewiki/check-packs/<stage>/<pack-name>/`. `.codewiki/check-packs.lock.json` records source kind and location, resolved version or revision, integrity, installed base digest, and local divergence for update diffs; it does not make installed files immutable.

Package sources are transport rather than execution environments. Installation runs no Check code, imports no credentials, and grants no lifecycle or effect authority. Marketplace Code Checks are prebundled and later run only in the admitted sandbox; Model Checks later run only through isolated configured routes. Users may edit or delete installed files immediately. Updates are explicit and never overwrite local changes silently. Default Packs ship as package resources and are materialized only once at project bootstrap; deleting them is supported and upgrades do not restore them.

Package content cannot introduce credentials, telemetry, install hooks, canonical writes, unsandboxed execution, protected Check floors, or fixed lifecycle changes. Benchmarks, development artifacts, private state, and source-checkout dogfood machinery do not ship. Packed candidates are tested only in disposable external projects.
