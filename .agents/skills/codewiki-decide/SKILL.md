---
name: codewiki-decide
description: Run the CodeWiki decision loop. Use when user intent, product/system direction, risk, approval, or KB/source-truth meaning must become a durable decision iteration.
---

# CodeWiki Decide

Use this skill when a change needs semantic approval before planning or implementation.

## Ground rules

- Start from `wiki_state` for current trace-backed context.
- Decision owns intent, desired state, approval, risk, and knowledge impact.
- Decision does not create work units or implementation evidence.
- Output rows are referenced as `trace:<iteration-id>#row:<row-id>`.
- Append only with expected trace bytes and next sequence.

## Workflow

1. Identify current state, desired state, rationale, risks, source refs, and approval status.
2. Choose the narrowest `decisionKind`: `debug`, `fix`, `harden`, `improve`, `migrate`, `docs`, or `release`.
3. Preview with `wiki_decide` and show the full rendered decision table to the user.
4. If blocked, fix missing refs, weak rationale, duplicate rows, missing approval, or kind-specific quality gaps.
5. Append only after the user explicitly approves the rendered table and the append input carries matching rendered-table approval metadata/digest.
6. Route exited decision rows to `codewiki-plan` by default, or to `codewiki-implement` only when the row explicitly uses `routeTarget: "implementation"` with low risk, narrow path scopes, implementation mode, and verification.

## Stop conditions

Stop when intent is unclear, approval is missing, the rendered decision table has not been shown, rendered-table approval metadata is missing for append, destructive/public action lacks explicit approval, or the requested change contradicts current truth without user direction.
