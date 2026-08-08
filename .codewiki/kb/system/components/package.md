---
type: System Component
title: Package
description: Owns package composition, harness-neutral exports, distribution boundaries, and executable entry contracts.
status: stable
tags: [system, component]
codewiki_component: package
codewiki_source_patterns: ["src/index.ts", "src/semantic-loop.ts"]
codewiki_test_patterns: ["tests/runtime/package-*.mjs", "tests/scaffold*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Package supplies the System responsibility required by this Story.
---
# Package

CodeWiki ships as one source package until a second real harness requires independent publication. Harness-neutral roots expose semantic contracts and Runtime composition without importing Pi-specific implementations.

Repository-root benchmarks, review artifacts, private runtime state, and source-development scaffolding do not ship. Packed extension candidates are tested only in disposable external projects with isolated settings.
