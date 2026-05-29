---
name: codewiki-decision
description: "Use when user intent, requirements, product/system direction, KB changes, architecture decisions, risk approval, or semantic change proposals must be clarified and compiled into a decision_build before planning or implementation. Runs the merged decision compiler: approved rows + product/system KB updates + propagation evidence."
id: skill.codewiki-decision
title: CodeWiki decision compiler skill
state: active
summary: Decision-loop instructions for merged semantic approval and knowledge-update handoffs.
owners: [maintainers]
updated: "2026-05-19"
---

# CodeWiki Decision Compiler

Use this skill before canonical knowledge, roadmap, or code changes when user intent is ambiguous, strategic, semantic, architectural, product-facing, system-facing, or requires approval.

The decision loop replaces the old split intent/knowledge handoff. It turns discussion, grounded reads, approved semantic rows, product/system KB edits, and propagation checks into one accepted `decision_build` consumed directly by planning.

For exact tool arguments and output fields, read `references/tools.md` when needed.

## Core rules

- Start with `codewiki_state` and read only the knowledge/code paths needed to ground the proposal.
- Do not create roadmap tasks or edit source code in decision mode.
- Use `codewiki_diff_table` for semantic change proposals when the decision affects CodeWiki state or package behavior.
- Require explicit user action for each row: approve, edit, reject, or defer.
- Apply only approved rows to product/system KB.
- Compile `codewiki_build kind="decision"` after approved rows and KB edits are complete.
- The `decision_build` must include approved rows, changed KB refs, row-to-KB mappings, propagation evidence, assumptions, open questions, non-goals, risks, and downstream planning questions.
- Do not compact or reset while important intent only exists in chat. Decision-loop compaction is safe only after intent is externalized into pending/approved rows, KB/build/session evidence, or explicit blocking questions.
- If no semantic delta exists, answer normally and do not create a diff table or build.

## Product/system routing

Classify every decision by entrypoint:

- Product-first: user-visible behavior, users, stories, UI expectations, value, or non-goals change first. Update `.codewiki/kb/product/**`, then record system impact or explicit no-system-impact evidence.
- System-first: architecture, compiler/gateway/graph behavior, adapters/API, file ownership, or runtime policy changes first. Update `.codewiki/kb/system/**` and system diagrams when needed, then record product impact or explicit no-product-impact evidence.
- Mixed: both product and system truth change in the same decision; record both impacts.
- No-op: decision records no canonical KB change; explain why.

## System diagrams

System diagrams under `.codewiki/kb/system/diagrams/**` are canonical YAML source, not generated render output. Use them as the system navigation spine when system knowledge changes:

- `context-map.yaml` — users, access surfaces, external systems, and boundary.
- `component-map.yaml` — runtime components, adapters, stores, and dependency direction.
- `key-flow.yaml` — main user/agent workflow sequence.
- `data-model.yaml` — durable entities, generated state, and evidence ownership.
- `state-lifecycle.yaml` — task, build, validation, and release lifecycles.

When system docs change, include relevant `diagram_refs` or explain why no diagram impact exists. Diagram-rendered Mermaid/SVG/Cytoscape output is not canonical unless a later task promotes it.

## Workflow

1. **Load context**
   - Run `codewiki_state`.
   - Read relevant product/system KB, roadmap/build refs, validations, or source files only when needed.
   - Surface drift between product and system truth instead of silently choosing one.

2. **Prepare semantic diff rows**
   - For each independent decision, define current state, desired state, rationale, affected layers, risk, and requested action.
   - Include alternatives when tradeoffs matter.
   - Prefer 3-7 high-signal rows.

3. **Create decision surface**
   - Call `codewiki_diff_table action="propose"` before asking user approval.
   - Present compact row summary and ask for approve/edit/reject/defer.

4. **Apply approved rows**
   - Record row approvals with `codewiki_diff_table action="accept"`.
   - Edit only product/system KB clauses covered by approved rows.
   - Record row-to-KB and diagram mappings.

5. **Compile decision build**
   - Call `codewiki_build kind="decision"`.
   - Include `decision_mode="accepted"`, `diff_table`, `approved_diff_rows`, `knowledge_changes`, `row_to_kb_mappings`, `propagation`, `diagram_refs`, `downstream_planning_questions`, requirements, assumptions, open questions, non-goals, and risks.

6. **Validate or route**
   - Run audits when policy/risk requires.
   - Use `codewiki_validation profile="decision"` for fail/block/policy-required reports.
   - Route executable work to planning from the accepted `decision_build`.

## Stop conditions

Stop and ask when intent is unclear, rows are not approved, requested action is destructive, acceptance would contradict existing truth without explicit approval, or required context cannot be read.

## Output

End decision mode with one of:

- accepted `decision_build` path and approved row ids;
- rejected/deferred rows and no build;
- blocking questions or drift findings.
