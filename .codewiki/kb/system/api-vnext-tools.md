---
id: spec.system.api-vnext-tools
title: API vNext Tool Surface
state: active
summary: Preferred reduced public commands and agent workflow tools for the CodeWiki API.
owners:
  - architecture
updated: "2026-05-27"
diagram_refs:
  - component-map:api
---

# API vNext Tool Surface

This focused companion to [CodeWiki API](api.md) keeps the reduced workflow-tool direction reachable without making `api.md` too large. Source-facing API facade code lives in `src/api/tools.ts`.

## vNext tool surface

The vNext API should reduce the common public and agent tool surface. Low-level primitives may stay internal, but deprecated public aliases and shim tools are removed instead of preserved.

Preferred public/user-facing commands:

| Command | Responsibility |
| --- | --- |
| `/wiki status` | Read current project state, health, next action, and active blockers. |
| `/wiki decide` | Capture or approve semantic decisions at the right abstraction layer. |
| `/wiki work` | Run one bounded planning/implementation/closure step under gates. |
| `/wiki audit` | Run deterministic audits or validation-ready checks. |
| `/wiki maintain` | Refresh generated state, run safe GC planning, or repair non-semantic drift. |

Preferred agent workflow tools:

| Tool | Responsibility |
| --- | --- |
| `codewiki_state` | Compact state/graph/task/session read. |
| `codewiki_resume_context` | High-signal continuation packet for current sessions, CodeWiki-owned compaction, or fresh sessions. |
| `codewiki_decision` | Decision proposal, approval, KB update, and decision-build orchestration. |
| `codewiki_work` | Planning/implementation/closure orchestration for one bounded work item. |
| `codewiki_gate` | Preflight, audit, validation, and policy checks. |
| `codewiki_maintenance` | Generated-state refresh, GC, archive, and non-semantic repair. |
| `codewiki_coordination` | Artifact status, waits/wakes, context boundaries, handoffs, and isolation coordination. |

Low-level primitives such as diff-table mutation, raw build writing, validation report writing, artifact status mutation, task mutation, session-boundary staging, graph rebuild, and GC ledger writes should become internal implementation details for these workflow tools unless a compatibility, audit, or expert/debug surface explicitly needs them.

Each workflow tool owns one user-level phase and exposes source refs, policy outcomes, and recovery steps; no opaque do-everything API.

## Related docs

- [CodeWiki API](api.md)
- [Adapters](adapters.md)
- [Agency Controller](agency.md)
