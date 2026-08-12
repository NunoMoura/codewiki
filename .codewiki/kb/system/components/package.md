---
type: System Component
title: Package
description: Owns CodeWiki product composition, execution-port exports, Check Pack transport, and executable entry contracts.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns: ["src/index.ts"]
codewiki_test_patterns: ["tests/runtime/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies standalone Host, Client, Runtime, and Managed Execution composition.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Package transports inspectable digest-pinned Check Packs.
---
# Package

CodeWiki ships as one standalone local product package containing Host Service, first-party Clients, per-project Runtime, semantic owners, and pinned Pi Managed Execution. External Agent Hosts integrate through the Host MCP contract rather than becoming CodeWiki execution packages.

Check Packs use one content-addressed format over local, exact npm, or exact Git sources. Installation requires project trust, disables lifecycle scripts, pins immutable source and integrity in `.codewiki/check-packs.lock.json`, and materializes inspectable configuration and Check files. Discovery, recommendation, installation, and update grant no enforcement or protected capability.

Registry transport distributes definitions and digest-pinned executable closure; Verification owns applicability, policy, Observation, Result, and Exit Report semantics. Package content cannot introduce credentials, telemetry, install hooks, canonical writes, or unsandboxed execution. Benchmarks, development artifacts, private state, and source-checkout dogfood machinery do not ship. Packed candidates are tested only in disposable external projects.
