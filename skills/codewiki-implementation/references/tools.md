# Implementation compiler tools

Use these tools while executing one atomic roadmap task. Implementation produces evidence; validation decides pass/fail/block; task-close requires policy proof.

## Required sequence

1. `wiki_state`
   - First read for repo health, task routing, graph/build refs, generated freshness, and artifact status.
   - Use `taskId` for the selected task and `refresh=true` near start/end when generated views may be stale.

2. `wiki_resume_context`
   - Use when starting from scratch, after a fresh session, or when current chat is noisy/stale/token-heavy.
   - Treat it as bounded routing context; expand exact source refs only as needed.

3. Direct reads of source refs
   - Read the selected roadmap task, source `planning_build`, linked knowledge/build refs, validation refs, and candidate code/test paths.
   - Do not rely on chat history for requirements.

4. `wiki_session`
   - Set focus when starting/resuming work.
   - Record current loop, source refs, expected output, exit gate, and task id.

5. `wiki_artifact_status`
   - Mark narrow write scopes for paths/build refs/task evidence when parallel sessions may overlap.
   - Release when implementation evidence is recorded.
   - Runtime artifact status is coordination evidence, not roadmap truth.

6. Tests, edits, and checks
   - Use ordinary file/edit/test tools for source changes.
   - Prefer tests before behavior changes when practical.
   - Record exact commands and outcomes.

7. `wiki_build kind="implementation"`
   - Compile after implementation checks and before gateway validation.
   - Include `source_planning_build`, `task_id`, `test_files`, `code_files`, `checks_run`, `acceptance_mapping`, `test_design_evidence`, `code_change_evidence`, `tester_notes`, `builder_notes`, `risks`, and `closure_brief`.
   - Include traceability metadata: `change_type`, upstream/accepted build refs, or a valid generated/runtime/mechanical exemption.
   - For commit-ready work, include publication/commit title/body or closure proof text required by policy.

8. Fresh validation context
   - Use the implementation build ref as the validator source when fresh validation is required.
   - Expected validator output: `wiki_gateway profile="implementation"` pass/fail/block with `fresh_context=true`, clean-state value, checked content proof (`tree_sha`, `validated_sha`, or `working_tree_digest`), audit refs, and rationale.

9. `wiki_roadmap`
   - Use `action="update"` to append builder evidence and validation source refs.
   - Use `action="close"` only after required passing validation/task-close proof exists.
   - Do not patch status directly for final closure.

10. `wiki_gc`
   - Use after the close/publication/archive commit exists, not before.
   - Start with `action="dry-run"`.
   - For tracked purge, pass `archive_sha` and `tree_sha` for the commit that still contains deleted artifacts so the tool can write restore-ledger commands before deletion.
   - If GC cannot safely run, record defer/block evidence instead of leaving purgeable artifacts hot silently.

## Acceptance mapping checklist

For every acceptance criterion, record:

- requirement/build/source refs;
- test or review evidence;
- code/doc paths touched;
- checks that prove it;
- any justified exception or residual risk.

## Fresh validation gate

Implementation validation must happen after the `implementation_build` exists. A passing implementation validation requires fresh-context evidence and checked content proof. Task-close/publication validation is stricter: it needs clean committed/published/archive proof, not only builder confidence.

If validation fails or blocks:

- do not close the task;
- record the verdict or blocking issue;
- route back to implementation, planning, or decision according to the failed criterion;
- create a superseding implementation build after fixes.

## Forbidden in implementation mode

- Do not implement more than the selected task.
- Do not create or reshape roadmap tasks except to append evidence or route a blocker.
- Do not change accepted requirements without decision/planning routing.
- Do not compile validation before the `implementation_build` exists.
- Do not close a task from builder context when policy requires fresh validation/content proof.
- Do not pre-commit purge tracked `.codewiki` builds, validation reports, or roadmap artifacts; post-commit GC needs archive proof and a restore ledger.
- Do not use legacy claim wording; use artifact status.
