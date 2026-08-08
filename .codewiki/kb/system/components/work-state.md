---
type: System Component
title: WorkState
description: Projects deterministic current coordination state for Runtime guards, scheduling, and bounded reads.
status: stable
tags: [system, component]
codewiki_component: work-state
codewiki_source_patterns: ["src/work-state/**"]
codewiki_test_patterns: ["tests/work-state/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: WorkState supplies the System responsibility required by this Story.
---
# WorkState

WorkState is the deterministic current-state projection of accepted Change operations and exact synchronized Git facts. It exposes current revisions, guards, claims, assignments, Loop attempts, Integration state, Evidence obligations, Exit state, and pending authority.

WorkState is reconstructible and cannot become a second history store. Every consumer binds one exact snapshot digest; stale projections cannot authorize progression.
