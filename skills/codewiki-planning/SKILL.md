---
name: codewiki-planning
description: Use when a validated decision_build must become executable roadmap work, when roadmap tasks need alignment with updated knowledge, or when planning_build handoff evidence is required before implementation. Runs the planning compiler with task-boundary, tool, validation, and implementation handoff rules.
id: skill.codewiki-planning
title: CodeWiki planning compiler skill
state: active
summary: Planning-loop instructions for roadmap alignment and planning build handoffs.
owners: [maintainers]
updated: "2026-05-17"
---

# CodeWiki Planning Compiler

Use this skill after decision mode has produced a validated `decision_build`, or when validation/audit routes work to roadmap alignment. The planning loop creates or refines executable roadmap tasks and emits a `planning_build` for implementation.

For exact tool arguments and output fields, read `references/tools.md` when needed.

## Core rules

- Start from a validated `decision_build` or an explicit validation/audit route to planning.
- Start with `codewiki_state`, then read the decision build, changed knowledge refs, active tasks, and active sprint context directly.
- Decision owns semantic intent and knowledge. Planning owns roadmap alignment. Implementation owns code/tests.
- Use `codewiki_roadmap` for roadmap creation/refinement. Never hand-edit `.codewiki/roadmap/queue.json` or generated task views.
- Inspect active tasks and sprints before creating work. Refine an existing active task when paths, labels, or intent overlap.
- Create only self-contained executable tasks with direct outcomes, acceptance criteria, non-goals, verification, candidate files, independent validation evidence, and post-commit GC review when the work closes tasks/sprints or publishes artifacts.
- Reject coordination-only tasks, sprint/umbrella/container tasks, and tasks whose acceptance mainly says other tasks must close.
- Compile `codewiki_build kind="planning"` after roadmap alignment and before implementation handoff. Do not treat the planning build itself as a post-gateway compaction boundary until planning validation passes.
- Every accepted decision row and downstream planning question must have deterministic propagation evidence in the planning build: `decision_row_resolutions` / `downstream_question_resolutions` as `knowledge-only`, `roadmap-task`, `sprint`, or `deferred` with owner/trigger/rationale.
- Planning-loop compaction is safe only after accepted rows/questions are durably mapped into task, sprint, knowledge-only, deferred, or blocking-question evidence.
- Use `codewiki_roadmap action="sprint"` for accepted related executable cohorts; never create umbrella tasks or hand-edit sprint metadata.
- Validate planning-to-roadmap alignment before routing to implementation.

## Workflow

1. **Load handoff context**
   - Run `codewiki_state` for repo health, reconciliation, active work, and artifact status.
   - Read the validated `decision_build`, changed KB paths, and any validation report that routed work here.
   - Restate requirements, knowledge refs, non-goals, blockers, assumptions, and open questions.
   - If no validated decision/source route exists, return to decision mode or validation as appropriate.

2. **Analyze executable delta**
   - Identify which documented requirements need code, tests, docs, config, validation, or no executable work.
   - Read active tasks and active sprint scope before deciding whether to create or refine work.
   - Surface conflicts between requested work and task-boundary rules.

3. **Shape roadmap work**
   - For each executable unit, define outcome, acceptance criteria, non-goals, verification, candidate code/test paths, blockers, requirement refs, and any `codewiki_gc action="dry-run"`/defer evidence expected after close/publication commits.
   - Prefer refining existing active tasks when the new intent overlaps.
   - Create new tasks only when the work is independent and conflict-free.
   - If the work is a cohort, use sprint metadata through `codewiki_roadmap action="sprint"` and planning-build context instead of a task that only groups other tasks.

4. **Coordinate writes**
   - Use `codewiki_artifact_status` for narrow roadmap/build scopes when parallel sessions may overlap.
   - Release artifact status when planning writes complete.

5. **Mutate roadmap truth**
   - Call `codewiki_roadmap action="create"` for new tasks or `action="update"` for refinements.
   - Include `spec_paths`, `code_paths`, labels, `change_type`, and a complete `goal` with outcome/acceptance/non-goals/verification.
   - Add evidence when a task is refined, blocked, or intentionally not created.

6. **Compile planning build**
   - Call `codewiki_build kind="planning"` after task creation/refinement.
   - Include `source_decision_build`, `task_ids`, `task_changes`, `decision_row_resolutions`, `downstream_question_resolutions`, `tdd_plan`, `candidate_test_files`, `candidate_code_paths`, requirements, evidence mapping, assumptions, open questions, non-goals, and risks.
   - Resolve each accepted row/question as one of:
     - `knowledge-only` with knowledge/source refs;
     - `roadmap-task` with durable `TASK-###` refs;
     - `sprint` with durable `SPRINT-###` refs;
     - `deferred` with owner, trigger, rationale, and evidence.
   - Do not leave accepted work only in `open_questions`; that must block planning validation.
   - The build is the implementation handoff. It should be compact enough for a fresh implementation session to execute without reading prior chat.

7. **Validate planning**
   - Run `codewiki_audit` for task/alignment evidence when policy or risk requires it.
   - Use `codewiki_validation profile="decision"` or a planning-specific policy profile if available when validation is required, failed, blocked, or policy-required.
   - Validation checks decision-to-roadmap alignment, task atomicity, boundary quality, and planning build completeness.

8. **Route to implementation**
   - Provide the `planning_build` ref and target task id as source refs when implementation must start fresh.
   - Expected output is `implementation_build` plus validation evidence.

## Stop conditions

Stop and route back to decision when requirements are not represented in knowledge or source docs are stale.

Stop and route back to decision when task meaning, scope, or acceptance needs user approval not covered by the decision build.

Block when the requested work is coordination-only, overlaps another active task without safe refinement, lacks verifiable acceptance, or requires destructive action without approval.

## Output

End planning mode with one of:

- `planning_build` path, affected task ids, task changes, TDD/test strategy, candidate paths, and implementation handoff refs;
- a knowledge-only/no-executable-work result with evidence and no task creation;
- blocking questions or task-boundary findings routed to decision.
