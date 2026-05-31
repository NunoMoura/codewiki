---
id: spec.system.api
title: CodeWiki API
state: active
summary: Harness-independent API facade and tool contract for CodeWiki state, compilers, builds, validation, session queue, runtime, and publication support.
owners:
  - architecture
updated: "2026-06-01"
---

# CodeWiki API

## Responsibility

The CodeWiki API is the stable semantic facade for CodeWiki operations. Adapters, scripts, UI surfaces, skills, CLI/MCP wrappers, and future harness integrations call the facade or explicit concept contracts instead of editing `.codewiki/` internals directly. Pi tools are one adapter over this API, not the only access path.

Interactive distribution is Pi-first: CodeWiki is a Pi-based software-development distribution where `/wiki-*` commands, `wiki_*` tools, TUI panels, skills, and a small prompt contract expose the API to agents and users. Direct CLI access may call API capabilities for bootstrap, CI, audit, or admin automation, but it is optional and must not duplicate CodeWiki semantics.

The API exposes typed capabilities and compact result envelopes. Generated state and large payloads stay in source refs; chat and tool responses should return summaries, changed refs, artifact refs, next actions, and blocking questions.

## Capability index

| Capability | Owner detail |
| --- | --- |
| State and resume context | [State engine](components/state-engine.md), [Resume context boundary](flows/resume-context-boundary.md) |
| Decision, planning, implementation | [Compiler loops](components/compilers.md), [Decision to planning](flows/decision-to-planning.md), [Planning to implementation](flows/planning-to-implementation.md) |
| Roadmap and sprint work truth | [Roadmap work truth](components/roadmap-work-truth.md) |
| Session queue and artifact status | [Session coordination](components/session-coordination.md), [Artifact claim wait/wake](flows/artifact-claim-wait-wake.md) |
| Runtime and daemon dispatch | [Runtime and daemon](components/runtime-daemon.md), [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md) |
| Builds, validation, publication, GC | [Builds and proof](components/builds-and-proof.md), [Validation gateway](components/validation-gateway.md), [Publication and GC](flows/publication-gc.md) |
| Adapters and user surfaces | [Adapters and UI](components/adapters-and-ui.md) |
| Knowledge parsing and truth | [Knowledge base](components/knowledge-base.md) |

The reduced workflow-tool direction is tracked in [API vNext Tool Surface](api-vnext-tools.md). Public agent tools use the `wiki_<name>` convention. Low-level primitives remain internal, compatibility, audit, or expert/debug surfaces unless a workflow requires direct exposure.

## Access surfaces

Pi TUI/chat with CodeWiki commands, tools, status panels, skills, and prompt contract is the intended first-class interactive terminal surface. The legacy browser Control Room, optional CLI/MCP wrappers, Claude Code, Codex, other agents, and humans all preserve the same `.codewiki/` semantics. Host adapters translate external inputs into API calls and must fail closed when a required host capability is missing.

## Write rules

- Product/system changes flow through decision approval.
- Code/test/doc execution flows through implementation tasks.
- Roadmap mutation uses CodeWiki roadmap tools; roadmap tasks track work truth rather than full requirements briefs.
- Parallel sessions mark affected scopes through artifact status before overlapping writes.
- Validation, task-close, ship-ready, publish, and release callers provide required fresh-context and content-proof evidence.
- Runtime/daemon job records are execution attempts, not roadmap truth.
- Generated graph and task views are never hand-edited.
- Tracked CodeWiki GC runs only after archive/close/publication proof exists.

## API boundary

`src/api/**` re-exports stable package/tool entrypoints from concept roots such as `src/state/**`, `src/roadmap/**`, `src/session/**`, `src/build/**`, `src/gateway/**`, `src/runtime/**`, and `src/gc/**`. The facade stays stable while adapter protocols and UI surfaces evolve.

## Related docs

- [Components](components/api-facade.md)
- [Flows](flows/decision-to-planning.md)
- [Adapters](adapters.md)
- [Terminal UI](terminal-ui.md)
