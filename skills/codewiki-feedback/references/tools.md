# Feedback compiler tools

Use these tools in feedback mode. Keep canonical writes out of feedback except runtime diff-table state and the accepted feedback build.

## Required sequence

1. `codewiki_state`
   - First read for repo health, roadmap/build context, active artifact status, and relevant refs.
   - Use `refresh=true` when graph/state may be stale.

2. `codewiki_diff_table action="propose"`
   - Required before asking the user to accept semantic changes.
   - Rows must include `current_state`, `desired_state`, `rationale`, `affected_layers`, `risk`, and `user_action`.
   - Use stable `table_id` when the feedback topic may continue across turns.

3. `codewiki_diff_table action="accept" | "reject" | "defer" | "alternative" | "revise"`
   - Use `accept` only after explicit user approval for a row.
   - Use `reject` or `defer` for rows not entering the build.
   - Use `alternative` or `revise` when the user changes the proposal.

4. `codewiki_build kind="feedback"`
   - Compile only accepted rows.
   - Include `diff_table`, `approved_diff_rows`, `requirements`, `evidence_mapping`, `assumptions`, `open_questions`, `non_goals`, `risks`, and likely lower-layer deltas.
   - Use `lifecycle.state="accepted"` when user approval is complete.

## Conditional tools

- `codewiki_audit`
  - Use for deterministic evidence before validation, high-risk semantic decisions, or when graph/roadmap health is uncertain.
  - Common feedback profile set: `profiles=["alignment"]`.

- `codewiki_validation profile="feedback"`
  - Use when feedback policy requires validation or when verdict is fail/block/policy-required.
  - Persist fail/block reports; pass reports can be transient unless policy requires storage.

- `codewiki_session_handoff` (compatibility session-boundary tool)
  - Use only when policy requires a boundary or the agent chooses `new_session`/`context_refresh` for context hygiene before the next loop starts from the accepted `feedback_build`.

- `codewiki_artifact_status`
  - Mark narrow scopes only when feedback work overlaps with other active semantic edits.
  - Runtime artifact status is coordination evidence, not roadmap truth.

## Forbidden in feedback mode

- Do not edit `.codewiki/kb/**` to implement the accepted direction.
- Do not create or mutate roadmap tasks from unaccepted feedback.
- Do not change source code or tests to satisfy feedback rows.
- Do not invent a user-decision tool; ask in chat and record decisions with `codewiki_diff_table`.
- Do not create a `feedback_build` from chat-only approval if no accepted diff-table rows exist.
