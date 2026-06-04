---
id: spec.system.api-vnext-tools
title: API vNext Tool Surface
state: active
summary: Preferred reduced user command and internal agent tool surface for CodeWiki.
owners:
  - architecture
updated: "2026-06-02"
diagram_refs:
  - component-map:api
---

# API vNext Tool Surface

This focused companion to [CodeWiki API](api.md) keeps the reduced command and workflow-tool direction reachable without making `api.md` too large. Source-facing API facade code lives in `src/api/tools.ts`; normal workflow-tool wrapper execution lives in `src/workflow/tool.ts`.

## Target user commands

The vNext user command surface is backend-first. User commands trigger backend actions or future Pi TUI diagram rendering; they do not define workflow semantics by themselves.

| Command | Responsibility |
| --- | --- |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield repository. The command adapter calls bootstrap/setup backend functions directly; this does not require a dedicated normal agent tool. |
| `/wiki resume` | Let the agent continue from the last known stable state using CodeWiki source refs, not chat history. |
| `/wiki config` | Apply user CodeWiki preferences/configuration through command-adapter backend calls. |
| `/wiki system <diagram type>` | Future Pi TUI rendering of canonical system diagram YAML as ASCII/Unicode. |

Status UI commands such as `/wiki status`, `/wiki-status`, and `/wiki_status` are deprecated. Product/Board/Map navigation commands are not active target surfaces. Backend state is read through `wiki_state`, graph lenses, roadmap state, lifecycle traces, validation reports, and source refs.

Legacy `/wiki-*` hyphen commands and standalone compatibility commands such as `/audit` may remain during migration as shims with deprecation metadata. They are not canonical user vocabulary.

Workflow verbs such as decide, plan, implement, gate, and runtime are agent/tool phases. Users may ask for those actions in chat, but they are not primary slash-command names in the target surface.

## Target internal agent tools

The normal internal agent tool surface is exactly six tools. The Pi adapter exposes these as normal workflow tools and marks low-level primitives as compatibility/expert aliases during migration. The shared wrapper implementation is owned by `src/workflow/**` so adapters can route normal tools through one orchestration layer:

| Tool | Responsibility |
| --- | --- |
| `wiki_state` | Graph-indexed state and query entrypoint. Supports `view`/`lens` plus optional focus/ref/include filters for status, resume context, trace, system/product navigation, task/sprint, validation, runtime, and automation-readiness subsets. |
| `wiki_decide` | Decision rows, row approval/edit/reject/defer, knowledge mapping, propagation evidence, and decision-build orchestration. |
| `wiki_plan` | Roadmap and sprint alignment, task shaping, planning-build orchestration, implementation handoff, and planning-owned execution metadata. |
| `wiki_implement` | One executable task boundary: TDD-aligned test/code evidence, linter execution summaries, changed refs, acceptance mapping, and implementation-build orchestration. |
| `wiki_gate` | Gateway preflight and validation for named gates, including required linters, executable code tests when relevant, isolation, content evidence, and pass/fail/block verdicts. |
| `wiki_runtime` | Session focus, leases, daemon jobs/runs, block/unblock state, context boundaries, agency scheduling, lifecycle/archive coordination, and platform-limited runtime evidence. |

Existing low-level primitives such as raw decision-table mutation, raw build writing, validation report writing, roadmap mutation, session focus, lease mutation, linter execution, generated-state refresh, and archive ledger writes are compatibility/expert aliases or internal implementation details of these six workflow tools. Compatibility aliases must carry deprecation metadata and a normal-tool replacement so source-contract validation can prevent accidental normal use.

Each workflow tool owns one phase boundary, supports batched common operations, exposes source refs, validation outcomes, and recovery steps, and avoids becoming an opaque do-everything API.

## State query lenses

`wiki_state` is the preferred read surface for agents and automation. It should accept a compact lens request instead of forcing callers to consume broad status payloads. Initial lens families should include:

- `status`: health, active focus, blockers, next action, latest validation signal;
- `resume`: stable continuation packet refs and context-boundary metadata;
- `trace`: decision → planning → task/sprint → implementation → validation → content evidence;
- `system`: diagram refs, selected component/flow neighbors, and linked component/flow docs;
- `product`: overview, users, stories, and linked product docs;
- `task` / `sprint`: executable work boundary, acceptance, gates, blockers, and candidate files;
- `validation`: gate requirements, linter/test status, recent pass/fail/block reports;
- `runtime`: leases, jobs/runs, waits, wake signals, context boundaries, and agency readiness;
- `automation-readiness`: whether a task/sprint can be safely scheduled, blocked, retried, or promoted.

A lens result should return omitted-count metadata and source refs for expansion instead of dumping the full graph.

## Related docs

- [CodeWiki API](api.md)
- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Adapters](adapters.md)
- [Agency Controller](agency.md)
- [Graph](graph.md)
