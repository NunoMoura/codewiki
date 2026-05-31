---
id: spec.system.flows.implementation-validation-close
title: Implementation, Validation, and Close Flow
state: active
owners:
  - architecture
flow_id: implementation_validation_close
participants:
  - implementation_compiler
  - code_tests
  - validation_gateway
  - implementation_build
  - roadmap
component_ids:
  - compilers
  - validation_gateway
  - roadmap
  - builds_proof
  - state_engine
diagram_refs:
  - key-flow:build_code
  - key-flow:validate
  - key-flow:record_evidence
  - key-flow:close_task
source_refs:
  - .codewiki/kb/system/compilers.md
  - .codewiki/kb/system/validation-gateway.md
  - .codewiki/kb/system/roadmap.md
code_paths:
  - src/build
  - src/gateway
  - src/roadmap
  - src/state
code_paths_mode: explicit_override
updated: "2026-06-01"
summary: Implementation changes scoped files, emits a build, validates independently, and closes only with proof.
---

# Implementation, Validation, and Close Flow

1. Implementation derives tests or test-design evidence from the planned task.
2. It changes only scoped docs, code, or tests and records exact checks.
3. It writes an `implementation_build` with acceptance mapping, code/test refs, checks, risks, and a closure brief.
4. Implementation validation starts from source refs, not builder chat memory, and records fresh-context plus content proof.
5. Task-close validation checks the full chain from decision/planning through implementation, validation, generated semantic closure evidence, and Git proof when required.
6. Roadmap closure archives the task only after the close gate passes.

Dirty implementation validation may use a working-tree digest. Task-close requires clean immutable commit/tree proof when source, tests, release state, or closure metadata changed.

## Related docs

- [Compilers](../compilers.md)
- [Runtime](../runtime.md)
- [Validation Gateway](../validation-gateway.md)
- [Key flow diagram](../diagrams/key-flow.yaml)
