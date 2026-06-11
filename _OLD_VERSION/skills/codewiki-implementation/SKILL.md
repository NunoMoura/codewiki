---
name: codewiki-implementation
description: Use when executing one atomic roadmap task from a validated planning_build, /wiki-resume task context, or accepted implementation boundary. Runs the implementation compiler with artifact-status coordination, test-design/TDD evidence, implementation_build creation before validation, fresh validation boundary, and task-close gate rules.
id: skill.codewiki-implementation
title: CodeWiki implementation compiler skill
state: active
summary: Implementation-loop instructions for executing one roadmap task and producing implementation build evidence.
owners: [maintainers]
updated: "2026-05-17"
---

# CodeWiki Implementation Compiler

Use this skill for one selected roadmap task after planning has produced a validated `planning_build`, or when `/wiki-resume` provides a task context with equivalent source refs. The implementation loop changes tests/code/docs only as needed for that task, compiles an `implementation_build`, then requests fresh validation before task closure.

For exact tool arguments and output fields, read `references/tools.md` when needed.

## Core rules

- Execute one self-contained roadmap task at a time, but do not treat task completion as the automation boundary by default.
- Read `.codewiki/config.json` through project context or source refs before continuation decisions. Use `codewiki.agency.level`, `approval_cadence`, `budgets`, `parallelism`, `context_reset`, and `stop_gates` to decide whether to stop after the task or continue to the next scoped task/sprint/roadmap item.
- After task-close, continue only when the configured agency level/cadence permits it, budget/context bounds remain safe, and no configured stop gate is active (`semantic_decision`, `validation_block`, `artifact_conflict`, `risk_escalation`, `publication`, `destructive_action`, `unsafe_reset_boundary`, or project-specific gates).
- Start from `wiki_state` and, when context is noisy/stale/token-heavy, `/wiki resume`, CodeWiki-owned compaction, or source refs from `wiki_state`; then read the selected task, source `planning_build`, linked knowledge/build refs, validation refs, and candidate code/test paths.
- If the task is an umbrella/container/sprint coordinator, or its acceptance mainly says other tasks must close, stop and route back to planning.
- If task meaning, product intent, or acceptance needs user approval, stop and route back to decision.
- If knowledge or planning is stale/wrong, stop and route back to decision or planning.
- Use `wiki_runtime` to record focus and coordinate narrow write scopes before non-trivial edits when parallel overlap is possible.
- Use TDD/test-design first where practical. If tests cannot be added, record why in tester evidence.
- Change only files required by task acceptance and non-goals.
- Compile the implementation build through `wiki_implement` after edits and linters/tests, before implementation validation. Do not treat the build itself as a compaction boundary; post-gateway compaction is allowed only after the validation pass records source refs.
- Start validation from CodeWiki refs and a fresh/independent context when policy requires content evidence; do not close the task from builder context when independent evidence is required.
- After implementation validation passes, use the validation report's local-only checkpoint metadata when a checkpoint commit is useful; task-close or publication metadata belongs in a separate close/publication commit.
- Close only after passing task-close validation/content evidence when policy requires it.
- After any task-close, sprint-close, publication, or roadmap-end commit exists, use `wiki_runtime` for GC dry-run/lifecycle/archive coordination; purge eligible artifacts only with archive commit/tree evidence or record defer/block evidence.

## Workflow

1. **Start or resume task**
   - Run `wiki_state` with the task id.
   - Use `wiki_runtime action="focus"` for task focus and current loop metadata.
   - Use `/wiki resume`, `wiki_state`, or CodeWiki-owned soft context refresh if the current chat is not already a clean task-start context.
   - Read the selected task, source `planning_build`, linked knowledge refs, validation refs, and listed code/test paths.
   - Confirm task boundary quality and source alignment before editing.

2. **Coordinate write scopes**
   - Mark narrow `wiki_runtime` lease scopes for code, tests, docs, roadmap evidence, build refs, or validation refs that this task will touch.
   - Do not force through write/write conflicts unless user/policy explicitly allows it.

3. **Derive tests or test design**
   - Map each acceptance criterion to tests, review linters, or test-design evidence.
   - Add or update tests before behavior changes when practical.
   - For documentation-only, generated-only, runtime-only, or non-testable changes, record the justified exception.

4. **Build surgically**
   - Edit only files needed for the selected task.
   - Preserve existing style and avoid unrelated refactors.
   - Keep requirement ids, task id, and accepted upstream build refs traceable in evidence.

5. **Run linters/tests**
   - Run relevant targeted tests first, then broader linters required by task policy.
   - Record exact commands and outcomes.
   - Stop on failed linters/tests unless the failure is unrelated and clearly documented.

6. **Compile implementation build**
   - Call `wiki_implement action="build"` after linters/tests pass or after a documented blocked attempt.
   - Include `source_planning_build`, `task_id`, `test_files`, `code_files`, `checks_run`, `acceptance_mapping`, `test_design_evidence`, `code_change_evidence`, `tester_notes`, `builder_notes`, `risks`, and a closure brief.
   - Include publication/commit recommendation text when policy or task-close validation requires commit readiness.

7. **Request fresh validation**
   - Provide the implementation build ref, task id, changed files, linters/tests, and expected validator output to a fresh validation context.
   - The validator must start from artifacts, not builder chat context, and record `fresh_context=true` plus checked content evidence.

8. **Record task evidence and continuation decision**
   - Use `wiki_implement` to append builder evidence and staged validation handoff.
   - Use `wiki_plan action="close"` only after the required passing validation/task-close evidence exists.
   - After the close/publication commit captures revive context, use `wiki_runtime` for GC dry-run; if tracked candidates exist, purge only with `archive_sha`/`tree_sha` and keep the restore ledger, otherwise record why GC is deferred or blocked.
   - Read the effective agency policy from `.codewiki/config.json` before summarizing. If the policy boundary is sprint/roadmap and no stop gate is active, route directly to the next scoped task instead of stopping at the task boundary. If stopping, cite the configured stop gate, budget/context limit, or approval cadence reason.
   - Release runtime leases when done.

## Output

End implementation mode with:

- changed files and why they changed;
- tests/linters run with outcomes;
- `implementation_build` path;
- fresh validation source refs and required evidence;
- post-commit GC review status: purged with ledger, deferred, blocked, or not yet eligible;
- task status recommendation: `in_progress`, `blocked`, or `done after validation`;
- config-derived continuation decision: next scoped task when allowed, or exact configured stop gate/budget/context/approval reason when stopping;
- remaining risks or follow-up routing.

## Stop conditions

Stop and route back when:

- selected task is not self-contained executable work;
- source planning build is missing, stale, or inconsistent with task acceptance;
- requirements need user approval not present in accepted builds;
- implementation would violate non-goals or overlap another active task unsafely;
- linters/tests fail and no scoped fix is available;
- validation requires fresh context and no independent validation path is available.
