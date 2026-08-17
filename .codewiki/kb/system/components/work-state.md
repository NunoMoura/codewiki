---
type: System Component
title: WorkState
description: Projects deterministic current coordination state for Runtime guards, stage context, scheduling, and bounded reads.
status: stable
tags: [system, component]
codewiki_component: work-state
codewiki_source_patterns: ["src/work-state/**"]
codewiki_test_patterns: ["tests/work-state/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: WorkState supplies current stage truth for bounded Agent context and deterministic rehydration.
---
# WorkState

WorkState is the deterministic current-state projection of accepted Change operations and exact synchronized Git facts. It exposes current revisions, guards, Claims, Assignments, Decision, Planning, Implementation, and Review attempts, Integration state, Evidence obligations, Check Results, Gate Reports, atomic feedback, stopped reasons, empty-stage warnings, and pending authority. Reconstructible blocker, conflict, Gate-readiness, trace-goal, trace-board, work-plan, and work-queue reductions and their contracts live under `src/work-state/**`; they are current projection, not canonical history or Runtime authority.

Each stage view derives from the same WorkState snapshot and groups the exact subject, producer attempt, optional Pack Skills, present Checks, Gate state, feedback, pending confirmation, and permitted fixed transitions. This stage organization is a projection for Agents and User Interfaces, not another activation manifest, workflow graph, or source of truth.

WorkState supplies the current-state portion of immutable Stage Context and state-aware Backend Agent compaction rehydration. Session summaries may reference WorkState identity but cannot replace or amend it. Every consumer binds one exact snapshot digest; stale projections cannot authorize progression.
