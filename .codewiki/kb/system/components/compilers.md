---
id: spec.system.components.compilers
title: Compiler Loop Component
state: active
component_id: compilers
diagram_refs:
  - component-map:compilers
  - key-flow:decision_compiler
  - key-flow:planning_compiler
  - key-flow:implementation_compiler
source_roots:
  - src/decision/**
  - src/planning/**
  - src/implementation/**
  - src/build/**
  - skills/codewiki-decision/**
  - skills/codewiki-planning/**
  - skills/codewiki-implementation/**
owners:
  - architecture
  - product
updated: "2026-06-03"
summary: Decision, planning, and implementation loop engines that emit compact compiler output into JSONL traces.
---

# Compiler Loop Component

## Responsibility

Compiler loops transform approved intent into the next loop's source-backed evidence. A compiler does not validate its own output and does not replace canonical truth. Decision compiles approved semantic rows and KB/diagram mappings; planning compiles work alignment and verification strategy; implementation compiles source/test/docs evidence and Git proof readiness.

## Owned paths

- Target source roots are `src/decision/**`, `src/planning/**`, and `src/implementation/**`.
- Each loop root owns `compiler.ts`, loop-specific gate behavior, tool orchestration, and local types/helpers.
- Top-level `src/build/**` is compatibility infrastructure until compiler output writing moves into `src/traces/**` and loop roots.
- `skills/codewiki-decision/**`, `skills/codewiki-planning/**`, and `skills/codewiki-implementation/**` define agent loop workflow.
- Target state stores compiler output inside `.codewiki/traces/TRACE-*.jsonl`.

## Contracts

- Compiler output must carry input refs, requirement refs, compact summaries, evidence mappings, assumptions, non-goals, risks, and downstream questions.
- Compiler output is pre-gate until the matching loop gate records `pass`, `fail`, or `block`.
- Any loop can route backward to the smallest upstream loop that can resolve missing semantics, failed evidence, or policy ambiguity.
- Gate pass, not compiler output, is the promotion boundary.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)
- [Planning to implementation](../flows/planning-to-implementation.md)
- [Implementation, validation, and close](../flows/implementation-validation-close.md)

## Related docs

- [System overview](../overview.md)
- [Compilers](../compilers.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
