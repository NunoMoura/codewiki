---
type: System Component
title: WorkState
description: Projects deterministic current coordination state for Project Server guards, Work Graph scheduling, stage context, and bounded reads.
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

WorkState is the deterministic current-state projection of accepted Change operations and exact synchronized Git facts. It exposes current Change revisions and relationships, accepted Change-scoped Planning deltas, the canonical global Work Graph, Work Unit dependency and readiness state, Claims, Assignments, Decision, Planning, Work Unit Implementation, aggregate Review attempts, private integration lineages, Evidence obligations, Check Results, Gate Reports, atomic feedback, stopped reasons, empty-stage warnings, and pending authority. Reconstructible blocker, conflict, Gate-readiness, trace-board, work-graph, and execution-queue reductions live under `src/work-state/**`; they are current projection, not canonical history or Project Server authority.

Each stage view derives from one exact WorkState snapshot. Decision groups the proposed Change and accepted active Changes compatibility. Planning groups one ratified Change and its proposed Work Graph delta. Implementation groups one Work Unit Candidate while preserving its owning Change and aggregate lineage status. Review groups one exact aggregate Change head and all contributing Work Units. This organization is a projection for Agents and Clients, not another workflow graph or source of truth.

WorkState supplies canonical inputs to Project Material Generations, Gate Evaluation Packages, deterministic DSH rehydration, scheduler readiness, and completion reducers. Session summaries may reference WorkState identity but cannot replace or amend it. Every consumer binds one exact snapshot digest; stale projections cannot authorize graph application, Assignment, Candidate admission, integration, progression, or delivery.
