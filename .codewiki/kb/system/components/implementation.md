---
type: System Component
title: Implementation
description: Owns realization Candidate semantics, Implementation Checks, worker interpretation, and route recommendations.
status: stable
tags: [system, component]
codewiki_component: implementation
codewiki_source_patterns: ["src/implementation/**"]
codewiki_test_patterns: ["tests/implementation/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Implementation supplies the System responsibility required by this Story.
---
# Implementation

Implementation realizes accepted Planning obligations in isolated workbenches and produces a Candidate bound to exact source, tests, Knowledge, configuration, and expected Git bases. Workers report bounded results but cannot schedule work or write canonical state.

Implementation owns realization semantics, Checks, attempt composition, interpretation, and route recommendation. Runtime owns claims, worker dispatch, Integration, persistence, expected-head synchronization, recovery, and final effects.
