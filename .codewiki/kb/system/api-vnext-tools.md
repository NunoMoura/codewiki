---
id: spec.system.api-vnext-tools
title: API vNext Tool Surface
state: active
summary: Preferred reduced public commands and agent workflow tools for the CodeWiki API.
owners:
  - architecture
updated: "2026-05-31"
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
| `/wiki plan` | Align accepted decisions with roadmap tasks, sprint scope, execution graph metadata, and planning builds. |
| `/wiki implement` | Run one bounded implementation step for an executable roadmap item under gates. |
| `/wiki gate` | Run deterministic audits, validation gateways, and proof preflights. |
| `/wiki runtime` | Operate approved runtime/daemon scheduling, worker jobs, Brain leases, and block/unblock flows. |
| `/wiki board` | Render roadmap lanes/cards from roadmap truth, gates, blockers, and closure evidence. |
| `/wiki diagram <name>` | Render canonical YAML diagrams as focused terminal views. |
| `/wiki trace <ref>` | Render decision, planning, implementation, validation, and Git proof chains. |

There is no generic maintenance command or fix-all maintenance tool. Deterministic generated-state repair is part of state reads and write postconditions. Semantic drift routes to decision, planning, implementation, or validation gates. Runtime cleanup belongs to runtime. Archive and retention cleanup remain targeted lifecycle operations such as `wiki_gc` after archive proof exists.

Preferred agent workflow capabilities:

| Capability | Responsibility |
| --- | --- |
| State | Graph-indexed state, resume, trace, execution, audit, daemon-context, and source-ref lenses. |
| Decide | Decision proposal, batch row approve/edit/reject/defer, KB mapping, and decision-build orchestration. |
| Plan | Planning-build creation, roadmap refinement, sprint/task propagation, execution graph metadata, and model policy proposals. |
| Implement | Bounded implementation evidence, checks, changed refs, and implementation-build preparation for one executable item. |
| Gate | Audits, validation gateways, proof preflights, and pass/fail/block reports. |
| Runtime | Brain lease, daemon jobs/runs, worker scheduling, artifact claims, durable questions/block/unblock, model allocation, retries, and worker lifecycle. |

These capabilities use `wiki_<name>` tool names when implemented and exposed. Low-level primitives such as diff-table mutation, raw build writing, validation report writing, artifact status mutation, task mutation, session-boundary staging, graph rebuild, and GC ledger writes should become internal implementation details for these workflow tools unless a compatibility, audit, or expert/debug surface explicitly needs them. Targeted lifecycle tools such as `wiki_gc` may remain available for explicit archive/retention work, but they are not a generic repair surface.

Each workflow tool owns one user-level phase, supports batched common operations, exposes source refs, policy outcomes, and recovery steps, and avoids becoming an opaque do-everything API.

## Related docs

- [CodeWiki API](api.md)
- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Adapters](adapters.md)
- [Agency Controller](agency.md)
