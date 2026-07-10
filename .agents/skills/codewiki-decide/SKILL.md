---
name: codewiki-decide
description: Run the CodeWiki decision loop. Use when user intent, product/system direction, risk, approval, or KB/source-truth meaning must become a durable decision iteration.
---

# CodeWiki Decide

Use this skill when a change needs semantic approval before planning or implementation. In user-facing product language, this creates or updates a Sprint Proposal containing Proposed Changes for approval.

## Ground rules

- Start from `wiki_state` for current trace-backed context.
- Proposed Changes own intent, desired state, approval, risk, and knowledge impact while they are being shaped.
- A Proposed Change becomes a Decision only after validation, explicit user approval, and `decision.changes_approved` append.
- Decisions do not create Tasks or implementation evidence.
- Approved Decisions are referenced as `trace:<iteration-id>#change:<change-id>`.
- Append only with expected trace bytes and next sequence.

## Workflow

1. Identify current state, proposed change, rationale, risks, source refs, and approval status.
2. Choose the narrowest `decisionKind`: `debug`, `fix`, `harden`, `improve`, `migrate`, `docs`, or `release`.
3. Preview with `wiki_decide` and show the rendered Sprint Proposal cards to the user.
4. If blocked, fix missing refs, weak rationale, duplicate change ids, missing approval, or kind-specific quality gaps.
5. Append only after the user explicitly approves the rendered proposal and the append input carries matching rendered-proposal approval metadata/digest.
6. Route exited Decisions to `codewiki-plan` by default, or to `codewiki-implement` only when the Proposed Change explicitly uses `routeTarget: "implementation"` with low risk, narrow path scopes, implementation mode, and verification.

## Stop conditions

Stop when intent is unclear, approval is missing, the rendered Sprint Proposal has not been shown, rendered-proposal approval metadata is missing for append, destructive/public action lacks explicit approval, or the requested change contradicts current truth without user direction.
