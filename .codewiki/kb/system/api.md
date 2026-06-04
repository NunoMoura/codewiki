---
id: spec.system.api
title: CodeWiki API
state: active
summary: API facade and tool contract for CodeWiki graph lenses, three loops, telemetry traces, gateway gates, runtime, and publication support.
owners:
  - architecture
updated: "2026-06-02"
---

# CodeWiki API

## Responsibility

The CodeWiki API is the stable semantic facade for CodeWiki operations. Adapters, scripts, UI surfaces, skills, CLI/MCP wrappers, and future harness integrations call the facade or explicit concept contracts instead of editing `.codewiki/` internals directly. Pi tools are the foundation interactive path over this API; future adapters may call the same semantics for non-Pi surfaces.

Interactive distribution is Pi-first: CodeWiki is a Pi-based software-development distribution where backend API calls, six normal `wiki_*` agent tools, skills, and a small prompt contract expose semantics to agents and users. Product UI surfaces are deprecated for now. Direct CLI access may call API capabilities for bootstrap, CI, linter, or admin automation, but it is optional and must not duplicate CodeWiki semantics.

The retained user command direction is minimal backend access plus future Pi TUI ASCII/Unicode system diagram rendering from canonical diagram YAML. `/wiki status`, `/wiki-status`, and `/wiki_status` status UI commands are deprecated; backend status should be read through `wiki_state` and graph lenses.

The target normal internal agent tool surface is `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_gate`, and `wiki_runtime`. The API exposes typed capabilities and compact result envelopes. Generated state and large payloads stay in source refs; chat and tool responses should return summaries, changed refs, artifact refs, next actions, and blocking questions.

## Capability index

| Capability | Owner detail |
| --- | --- |
| Graph lenses and generated state | [State/graph engine](components/state-engine.md), [Resume context boundary](flows/resume-context-boundary.md) |
| Decision, planning, implementation | [Compiler loops](components/compilers.md), [Decision to planning](flows/decision-to-planning.md), [Planning to implementation](flows/planning-to-implementation.md) |
| Roadmap and sprint work truth | [Roadmap work truth](components/roadmap-work-truth.md) |
| Gateway gates, criteria, linters, tests, and verdicts | [Gateway](components/validation-gateway.md) |
| Runtime, leases, agency, and daemon dispatch | [Session coordination](components/session-coordination.md), [Runtime and daemon](components/runtime-daemon.md), [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md) |
| Telemetry traces, compiler output, Git refs, publication, and retention | Compiler output and content evidence, [Publication and retention](flows/publication-gc.md) |
| Adapters and user surfaces | [Adapters and UI](components/adapters-and-ui.md) |
| Knowledge parsing and truth | [Knowledge base](components/knowledge-base.md) |

The reduced workflow-tool direction is tracked in [API vNext Tool Surface](api-vnext-tools.md). Normal agent tools use the `wiki_<name>` convention and are limited to the six target tools. Low-level primitives remain internal, compatibility, or expert/debug surfaces with deprecation/replacement metadata unless a migration task explicitly keeps direct exposure.

## Access surfaces

Pi chat with CodeWiki tools, skills, and prompt contract is the intended first-class interactive terminal surface. The legacy browser Control Room and previous status/board/map/product/system UI surfaces are deprecated. Optional CLI/MCP wrappers, Claude Code, Codex, other agents, and humans all preserve the same `.codewiki/` semantics. Host adapters translate external inputs into API calls and must fail closed when a required host capability is missing. Internal tools execute agent workflow boundaries.

## Write rules

- Product/system changes flow through decision approval.
- Code/test/doc execution flows through implementation tasks.
- Planning mutation uses CodeWiki planning tools; roadmap tasks remain compatibility work truth during migration.
- Parallel sessions mark affected scopes through artifact status before overlapping writes.
- Gate, publish, and release callers provide required fresh-context and immutable content evidence.
- Runtime/daemon job records are execution attempts, not KB or telemetry truth.
- Generated graph views are never hand-edited.
- Hot telemetry retention runs only after Git content evidence preserves recoverable history.

## API boundary

`src/api/**` re-exports stable package/tool entrypoints from target roots such as `src/decision/**`, `src/planning/**`, `src/implementation/**`, `src/telemetry/**`, `src/graph/**`, `src/runtime/**`, `src/agency/**`, `src/pi/**`, and `src/project/**`. Compatibility roots such as `src/state/**`, `src/roadmap/**`, `src/session/**`, `src/build/**`, `src/gateway/**`, `src/workflow/**`, and `src/gc/**` remain temporary until migration tasks remove or alias them. The facade stays stable while Pi integration, future adapters, and UI surfaces evolve.

## Related docs

- [Components](components/api-facade.md)
- [Flows](flows/decision-to-planning.md)
- [Adapters](adapters.md)
- [Terminal UI](terminal-ui.md)
