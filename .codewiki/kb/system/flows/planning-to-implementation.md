---
id: spec.system.flows.planning-to-implementation
title: Planning to Implementation Flow
state: active
owners:
  - architecture
flow_id: planning_to_implementation
participants:
  - planning_compiler
  - roadmap
  - validation_gateway
  - implementation_compiler
component_ids:
  - compilers
  - roadmap
  - validation_gateway
  - state_engine
diagram_refs:
  - key-flow:open_work
  - key-flow:agency_gate
  - key-flow:resume_context
source_refs:
  - .codewiki/kb/system/compilers.md
  - .codewiki/kb/system/roadmap.md
  - .codewiki/kb/system/graph.md
code_paths:
  - src/roadmap/**
  - src/state/**
  - src/build/**
updated: "2026-06-01"
summary: Planning turns accepted intent into executable roadmap tasks, sprint metadata, and implementation handoff evidence.
---

# Planning to Implementation Flow

1. Planning reads a passed decision build, current knowledge, roadmap state, and active sprint scope.
2. It creates or refines executable tasks with outcome, acceptance, non-goals, verification, candidate paths, and test strategy.
3. It records row-to-roadmap propagation in a `planning_build` and uses sprint metadata for related executable cohorts.
4. The planning gateway validates task boundaries and decision-row propagation.
5. Implementation starts from the planning build, generated task context shard, and linked source refs.

A roadmap task must be one independently executable unit. A sprint groups related work; it is not an umbrella task. Roadmap order, task status, blockers, dependencies, and sprint metadata encode sequencing.
