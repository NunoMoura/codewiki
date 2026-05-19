---
name: codewiki-feedback
description: Use when user intent, requirements, architecture/product/system direction, semantic change proposals, or approval decisions must be clarified before CodeWiki knowledge, roadmap, or code changes. Runs the feedback compiler with codewiki_diff_table and accepted feedback_build handoffs.
id: skill.codewiki-feedback
title: CodeWiki decision compiler compatibility skill
state: active
summary: Compatibility instructions for decision-loop semantic diff capture and accepted feedback build handoffs until decision_build is default.
owners: [maintainers]
updated: "2026-05-17"
---

# CodeWiki Decision Compiler (compatibility)

Use this skill before canonical knowledge, roadmap, or code changes when user intent is ambiguous, strategic, semantic, or requires approval. This is the compatibility surface for the decision loop: it converts discussion into approved semantic diff rows and an accepted `feedback_build` until `decision_build` is default.

For exact tool arguments and output fields, read `references/tools.md` when needed.

## Core rules

- Start with `codewiki_state` and read only the knowledge/code paths needed to ground the proposal.
- Do not edit `.codewiki/kb/**`, roadmap tasks, tests, or source code in feedback mode.
- Use `codewiki_diff_table` for semantic change proposals. A chat-only markdown table is not enough when the decision affects CodeWiki state or package behavior.
- Require explicit user action for each row: accept, reject, defer, or request an alternative/edit.
- Create `codewiki_build kind="feedback"` only from accepted diff rows.
- If another compiler or gateway finds missing/ambiguous intent, return here and create a new/superseding feedback cycle.
- If no semantic delta exists, answer normally and do not create a diff table or build.

## Workflow

1. **Load context**
   - Run `codewiki_state` with the target repo.
   - Read relevant `.codewiki/kb/**`, roadmap/build refs, or source files only when they are needed to ground the decision.
   - Surface drift between intended knowledge and current code instead of choosing silently.

2. **Prepare semantic diff rows**
   - For each independent decision, define: current state, desired state, rationale, affected layers, risk, and requested user action.
   - Prefer 3-7 high-signal rows. Split unrelated decisions into separate tables.
   - Include alternatives when the proposed direction has meaningful tradeoffs.

3. **Create the decision surface**
   - Call `codewiki_diff_table action="propose"` before asking the user to approve semantic changes.
   - Present a compact summary of the proposed rows in chat and ask for explicit acceptance, rejection, deferral, or edits.
   - If the user edits direction, call `codewiki_diff_table action="revise"` or `action="alternative"` as appropriate before acceptance.

4. **Record user decisions**
   - For accepted rows, call `codewiki_diff_table action="accept"` once per row.
   - For rejected or deferred rows, call `action="reject"` or `action="defer"` and exclude them from the build.
   - Do not infer acceptance from silence or positive sentiment. The user must approve the semantic decision.

5. **Compile the feedback build**
   - After at least one row is accepted, call `codewiki_build kind="feedback"`.
   - Include `diff_table`, `approved_diff_rows`, requirements, assumptions, open questions, non-goals, risks, affected lower layers, and evidence mapping.
   - Set `change_type` to the affected semantic layer (`product`, `system`, `task`, or `code`).
   - Leave downstream knowledge, roadmap, and code changes to later compiler loops.

6. **Validate or route**
   - Run deterministic audit evidence when risk or policy requires it, usually `codewiki_audit profiles=["alignment"]`.
   - Use `codewiki_validation profile="feedback"` for fail/block/policy-required feedback validation reports or when policy requires a persisted pass report.
   - Route accepted decisions to the documentation compiler from the compatibility `feedback_build` ref. Agents may run `new_session` or `context_refresh` first when context is noisy, stale, or token-heavy.

## Stop conditions

Stop and ask instead of compiling when intent is unclear, rows are not accepted, requested action is destructive, acceptance would contradict existing knowledge without explicit approval, or required context cannot be read.

## Output

End feedback mode with one of:

- accepted `feedback_build` path and accepted row ids;
- rejected/deferred diff rows and no build;
- blocking questions that must be answered before the decision loop can continue.
