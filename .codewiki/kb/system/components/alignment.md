---
type: System Component
title: Alignment
description: Projects bounded relationship, impact, provenance, and realization views from accepted project truth.
status: stable
tags: [system, component]
codewiki_component: alignment
codewiki_source_patterns: ["src/alignment/**"]
codewiki_test_patterns: ["tests/alignment/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/account-for-drift.md
    rationale: Alignment supplies the System responsibility required by this Story.
---
# Alignment

Alignment deterministically projects relationships among accepted Knowledge, Changes, WorkState, source, tests, Git, Evidence, Results, and delivery observations. The graph is a disposable read model; it cannot admit operations, mutate project state, or grant authority.

Queries are bounded, read-only, and snapshot-bound. Every response reports provenance, coverage, truncation, and staleness. Unknown relationships remain unknown, and required uncertainty blocks affected unsafe routes.
