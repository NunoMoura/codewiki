---
type: System Component
title: Package
description: Owns CodeWiki package composition, harness-neutral exports, Check Pack transport, distribution boundaries, and executable entry contracts.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns: ["src/index.ts", "src/semantic-loop.ts"]
codewiki_test_patterns: ["tests/runtime/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies the System responsibility required by this Story.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Package transports inspectable digest-pinned Check Packs required by this Story.
---
# Package

CodeWiki ships as one source package until a second real harness requires independent publication. Harness-neutral roots expose semantic contracts and Runtime composition without importing Pi-specific implementations.

Check Packs use the same content-addressed format over local, exact npm, or exact Git sources. Installation requires project trust, disables lifecycle scripts, resolves immutable version, ref, and integrity, records origin in `.codewiki/check-packs.lock.json`, and materializes inspectable project-owned Pack configuration and Check files under `.codewiki/check-packs/**`. A local independent Check is a one-Check Pack.

Default, imported, and Custom Checks are open and editable after materialization. A local edit creates a new project digest without mutating publisher history. Update is an explicit reviewed import that shows file and configuration differences, preserves local conflict visibility, and never changes an existing Candidate policy. Marketplace discovery, publisher recommendations, package installation, and updates grant no blocking authority or protected capability.

Registry and package transport distribute definitions and digest-pinned executable dependency closure; Verification owns applicability, policy, Observation, Result, and Exit Report semantics. Package content cannot introduce credentials, automatic telemetry, install hooks, canonical writes, or unsandboxed execution.

Repository-root benchmarks, review artifacts, private runtime state, and source-development scaffolding do not ship. Packed extension candidates and Check Pack lifecycle behavior are tested only in disposable external projects with isolated settings.
