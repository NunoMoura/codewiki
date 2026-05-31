---
id: spec.system.flows.decision-to-planning
title: Decision to Planning Flow
state: active
owners:
  - architecture
flow_id: decision_to_planning
participants:
  - user
  - decision_compiler
  - knowledge
  - decision_build
  - validation_gateway
  - planning_compiler
component_ids:
  - compilers
  - knowledge
  - validation_gateway
  - roadmap
diagram_refs:
  - key-flow:capture_intent
  - key-flow:compile_decision
  - key-flow:plan_work
source_refs:
  - .codewiki/kb/system/compilers.md
  - .codewiki/kb/system/validation-gateway.md
  - .codewiki/kb/system/roadmap.md
code_paths:
  - src/change/**
  - src/build/**
  - src/gateway/**
  - src/roadmap/**
updated: "2026-06-01"
summary: Approved semantic rows become KB evidence, decision builds, and validated planning input.
---

# Decision to Planning Flow

1. The user provides intent, constraints, and risk tolerance.
2. The decision compiler proposes rows that describe current state, desired state, affected layers, risk, and user action.
3. Approved rows update product/system knowledge and diagram impact evidence; rejected or not-applicable rows stay out of downstream requirements.
4. The decision compiler writes a `decision_build` with row-to-KB mappings, approved rows, propagation evidence, risks, non-goals, and downstream planning questions.
5. The decision gateway validates that promoted semantics were approved and mapped.
6. Planning consumes only passed decision evidence or a documented mechanical/runtime exemption.

Planning must not guess at unapproved requirements. If a decision row is executable, the planning loop must map it to a roadmap task or sprint id. If it is knowledge-only, rejected, or non-executable, the durable KB or roadmap evidence must say so.
