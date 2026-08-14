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
    rationale: Package transports inspectable digest-pinned Check Packs.
---
# Package

CodeWiki ships as one standalone local product package containing CodeWiki Server, first-party Clients, per-project Runtime, semantic owners, and pinned Pi Managed Execution. Claude Code, Codex, and other external applications connect as Clients and may accept bounded Worker Assignments through Server MCP; they do not become CodeWiki execution packages.

The broad product API remains `src/index.ts`. The supported operational Runtime surface lives at `src/runtime/index.ts` and publishes as `@nunomoura/codewiki/runtime`; Runtime's internal coordinator remains under `src/runtime/coordinator/**`. No root `coordinator.ts`, `composition/**` package, or public `./coordinator` compatibility export survives the clean cut. The shipped `src/pi-extension.ts` entry is a neutral Package bootstrap: it wires Pi Client registration to a Runtime connection request and the concrete Execution-owned daemon spawner, while Client code imports neither lifecycle implementation. A neutral `src/main.ts` may later construct Server and Runtime siblings only when a standalone process genuinely needs that bootstrap.

Shared error handling stays lean and centralized under `src/error-handling/**`: the CodeWiki error envelope, serialization, type guards, and stable cross-owner operation-failure contract belong to Package. Configuration and Change Trace semantics define their specialized errors with those owners rather than growing a cross-domain error catalog.

Check Packs use one content-addressed format over local, exact npm, or exact Git sources. Installation requires project trust, disables lifecycle scripts, pins immutable source and integrity in `.codewiki/check-packs.lock.json`, and materializes inspectable configuration and Check files. Discovery, recommendation, installation, and update grant no enforcement or protected capability.

Registry transport distributes definitions and digest-pinned executable closure; Verification owns applicability, policy, Observation, Result, and Exit Report semantics. Package content cannot introduce credentials, telemetry, install hooks, canonical writes, or unsandboxed execution. Benchmarks, development artifacts, private state, and source-checkout dogfood machinery do not ship. Packed candidates are tested only in disposable external projects.
