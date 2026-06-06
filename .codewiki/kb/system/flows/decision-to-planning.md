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
  - src/change
  - src/build
  - src/gateway
  - src/roadmap
code_paths_mode: explicit_override
updated: "2026-06-06"
summary: Approved semantic rows become KB evidence, decision builds, and validated planning input.
---

# Decision to Planning Flow

1. The user provides intent, constraints, and risk tolerance.
2. The decision compiler proposes rows that describe current state, desired state, affected layers, risk, and user action.
3. Approved rows update product/system knowledge and diagram impact evidence; rejected or not-applicable rows stay out of downstream requirements.
4. The decision compiler writes a `decision_build` with row-to-KB mappings, approved rows, propagation evidence, risks, non-goals, and downstream planning questions.
5. The decision gateway validates that promoted semantics were approved and mapped.
6. Planning consumes only passed decision evidence or a documented mechanical/runtime exemption.
7. Planning assigns requirement ids from approved rows/questions to work units, tasks, sprint scope, deferrals, no-work rationale, or implementation evidence.
8. Planning re-evaluates existing roadmap work before creating new work. It refines, splits, reopens, cancels, supersedes, reorders, or updates sprint scope when previous tasks no longer match the accepted target state.
9. The planning gate verifies complete row/question coverage and existing-roadmap reconciliation. Missing coverage produces findings/remediation; the planning loop continues with a superseding planning output rather than treating the issue as an automation stop.

Planning must not guess at unapproved requirements. If a decision row is executable, the planning loop must map it to a roadmap task or sprint id. If it is knowledge-only, rejected, non-executable, deferred, superseded, or already implemented, the durable KB, trace, roadmap, or gate evidence must say so with owner refs and triggers where relevant. Roadmap `open=0` is not proof that accepted target state is complete.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
