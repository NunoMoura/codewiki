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
  - src/build/**
  - skills/codewiki-decision/**
  - skills/codewiki-planning/**
  - skills/codewiki-implementation/**
owners:
  - architecture
  - product
updated: "2026-06-01"
summary: Decision, planning, and implementation loops that produce source-backed build handoffs.
---

# Compiler Loop Component

## Responsibility

Compiler loops transform approved intent into the next durable handoff. A compiler does not validate its own output and does not replace canonical truth. Decision compiles approved semantic rows and KB mappings; planning compiles roadmap/task/sprint alignment; implementation compiles test, code, check, and closure evidence.

## Owned paths

- `src/build/**` writes build artifacts and shared build schemas.
- `skills/codewiki-decision/**`, `skills/codewiki-planning/**`, and `skills/codewiki-implementation/**` define agent loop workflow.
- `.codewiki/builds/**` stores transient compiler handoffs.

## Contracts

- Builds must carry consumes/produces refs, policy/isolation data, evidence mappings, assumptions, non-goals, risks, and downstream questions.
- A build is pre-gateway until validation records `pass`, `fail`, or `block`.
- Any loop can route backward to the smallest upstream loop that can resolve missing semantics, failed evidence, or policy ambiguity.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)
- [Planning to implementation](../flows/planning-to-implementation.md)
- [Implementation, validation, and close](../flows/implementation-validation-close.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
