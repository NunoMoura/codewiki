# Planning compiler tools

Use these tools in planning mode. Canonical writes are limited to roadmap task truth, planning builds, validation reports when required, and runtime lease evidence.

## Required sequence

1. `wiki_state`
   - First read for repo health, reconciliation, active tasks/sprints, build refs, and runtime leases.
   - Use `taskId` when refining a known task and `refresh=true` when generated state may be stale.

2. Direct reads of source refs
   - Read the validated `decision_build`, changed KB paths, and relevant roadmap task context before mutating roadmap truth.
   - Generated `.codewiki/roadmap/tasks/**` files are context views only; do not edit them.

3. `wiki_plan`
   - Use `action="create"` for independent new work.
   - Use `action="update"` to refine active overlapping work.
   - Use `action="sprint"` with `sprint` input when accepted intent forms a related executable cohort; never hand-edit sprint metadata.
   - Include concise `goal.outcome`, `goal.acceptance`, `goal.non_goals`, and `goal.verification` for task records.
   - Include `spec_paths`, `code_paths`, labels, and `change_type` so graph routing and validation can trace the work.
   - Include `evidence` to record why work was refined, blocked, or not created.

4. `wiki_plan action="build"`
   - Compile after roadmap alignment with a `planning_build` payload.
   - Required fields normally include `source_decision_build`, `task_ids`, `task_changes`, `tdd_plan`, `candidate_test_files`, `candidate_code_paths`, `requirements`, `evidence_mapping`, `assumptions`, `open_questions`, `non_goals`, and `risks`.
   - Use `lifecycle.state="accepted"` when the planning handoff is ready for validation/implementation.

## Conditional tools

- `wiki_runtime`
  - Mark narrow roadmap/build leases when overlap is possible.
  - Release leases when done.

- `wiki_gate`
  - Use for deterministic linter evidence before planning validation or implementation source handoff.
  - Common linter profiles: `task`, `alignment`, `horizontal-alignment`, `source-contract`, `generated-parity`, `changed`.
  - Use preflight/validation when planning validation is required, failed, blocked, or policy-required.
  - Rationale should cite decision build refs, changed KB paths, task ids, linter refs, and task-boundary linters/tests.

- Fresh implementation context
  - Use the accepted planning build as source ref when implementation must start from fresh context.
  - Expected output: `implementation_build` for the selected task.

## Compatibility aliases

`wiki_roadmap`, `wiki_build`, `wiki_artifact_status`, `wiki_audit`, and `wiki_gateway` remain expert compatibility aliases during migration. Do not use them as the normal planning surface.

## Task boundary checklist

Before `wiki_plan action="create"` or `action="update"`, verify:

- work has a direct executable outcome;
- acceptance proves this task itself, not other tasks closing;
- non-goals exclude adjacent or future work;
- verification is runnable or reviewable;
- candidate code/test paths are scoped;
- requirement ids map back to knowledge/build refs;
- overlap with active tasks is either absent or handled by refinement.

## Forbidden in planning mode

- Do not change `.codewiki/kb/**` except to stop and route back to decision.
- Do not change source code or tests.
- Do not hand-edit `.codewiki/roadmap/queue.json` or `.codewiki/roadmap/tasks/**`.
- Do not create tasks that only group, coordinate, sequence, or close other tasks; use sprint metadata through `wiki_plan action="sprint"` after acceptance.
- Do not duplicate full requirements briefs in roadmap tasks; keep full requirements in builds/knowledge.
- Do not route to implementation without a `planning_build` unless policy explicitly exempts the work.
