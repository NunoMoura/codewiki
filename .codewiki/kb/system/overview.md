---
id: spec.system.overview
title: System Overview
state: active
summary: Main runtime areas and ownership boundaries for CodeWiki.
owners:
  - architecture
updated: "2026-05-22"
---

# System Overview

## Main boundaries

CodeWiki maintains the repository-local `.codewiki/` contract and exposes it through agent-harness adapters and a standalone local CodeWiki UI. Pi is the only implemented harness adapter for now; the architecture keeps future Claude Code, Codex, CLI, MCP, or other harness adapters possible without making them immediate product commitments.

- **Knowledge base semantics** own product specs, visual UI specs, system access-surface specs, system specs, architecture rules, and workflow vocabulary under `.codewiki/kb/**`.
- **Agency controller** owns bounded roadmap automation through agency cycles and explicit token, time, risk, validation, policy, and approval gates.
- **Compiler builds** own cycle handoffs for validated intent, knowledge, planning, and implementation evidence under `.codewiki/builds/**`.
- **Roadmap semantics** own work truth: priorities, active work items, status, progress, blockers, and closure state under `.codewiki/roadmap/**`.
- **Validation gateways** validate submitted cycle builds against policy, source refs, criteria, audit evidence, generated-state context, and content proofs. Hot failed, blocked, policy-kept, current-publication, or audit-required validation reports live under `.codewiki/validation/**`; cold pass reports rely on Git history/archive refs after publication.
- **State engine** owns generated reconciliation state in `.codewiki/index_graph.json`: drift detection, routing, derived queue order, loop selection, status, and freshness checks. Domain language calls this state; the graph is the generated representation. It is required validation context but never overrides canonical sources or immutable content proof.
- **File-structure ownership map** owns human-readable intended source/tree ownership, current implementation shape, approved migration deltas, and drift categories through [File Structure](file-structure.md) and `diagrams/file-structure-map.yaml`.
- **Audits** produce deterministic alignment, file-structure, stale-reference, package, security, and generated-parity evidence for users and gateways.
- **CodeWiki UI** owns the standalone local browser command center for humans under `src/ui/**` while delegating all semantics to the CodeWiki API.
- **API facade** owns stable package/tool use-case entrypoints under `src/api/**` so adapters, scripts, UI, CLI/MCP wrappers, and future harnesses do not depend on old layer-first internals.
- **Concept roots** own pure CodeWiki concepts, rules, use cases, local runtime implementations, tool entrypoints, schemas, transitions, and invariants for agency, audits, builds, changes, project contracts, roadmap, session queue, validation, generated state, and GC.
- **Adapters** own harness-specific or protocol-specific translation. The Pi adapter owns current commands, tools, status panel, session integration, packaged skills, and resource discovery. Browser web code is UI, not an agent adapter. Adapters do not own CodeWiki semantics.
- **Shared** owns minimal cross-cutting helpers and types that are truly common; it must not become a dumping ground for domain or application behavior.

## Truth boundaries and compiler model

Detailed truth-boundary and compiler-loop tables live in [System Truth and Compilers](system-truth-and-compilers.md). This overview keeps the main runtime boundaries and ownership seams compact.

## Ownership seams

- [Diagram Raw Data](diagrams/README.md) owns the canonical diagram families and agent-editable YAML sources for system visualizations.
- [Architecture Map](architecture.mmd) is a compatibility component diagram until System UI rendering migrates to `diagrams/component-map.yaml`.
- [File Structure](file-structure.md) owns the target repository and knowledge-base structure rules, including the concept-root source migration target and intended-vs-current drift categories.
- [API](api.md) owns the harness-independent CodeWiki access contract.
- [CodeWiki UI](control-room-ui.md) owns standalone local web UI hosting and launch semantics.
- [Extension](extension.md) owns packaged distribution and the current Pi extension surface.
- [Adapters](adapters.md) owns harness translation boundaries for Pi today and CLI/MCP/future harnesses later.
- [Agency Controller](agency.md) owns bounded roadmap automation through agency cycles and explicit gates.
- [Compilers](compilers.md) owns the decision, planning, and implementation loops.
- [Validation Gateway](validation-gateway.md) owns pure build-validation semantics.
- [Audits](audits.md) owns deterministic audit evidence semantics.
- [Builds](builds.md) owns temporary handoff brief semantics.
- [Graph](graph.md) owns the generated state/graph representation contract.
- [Alignment Model](alignment-model.md) owns cross-layer precedence and propagation semantics.
- [Knowledge](knowledge.md) owns product/system knowledge-base structure and persistence semantics.
- [Roadmap](roadmap.md) owns work truth: queue, priority, status, blockers, progress, and closure semantics.

CodeWiki should not implement a general sandbox, hosted SaaS, or duplicate Pi observability/eval packages. It defines `.codewiki/` semantics and exposes them through a stable API and local CodeWiki UI that Pi, CLI, MCP, or future harness adapters can use safely.

## Target package architecture

The package has moved from layer-first `src/domain/**` plus `src/application/**` ownership to concept-root `src/<concept>/**` ownership with a stable `src/api/**` facade and primitive-only `src/shared/**` helpers. Session, state, roadmap, build, validation, audit, agency, project, knowledge, gateway, and GC are navigable from the source root with model, use cases, tool/API entrypoints, and concept-local runtime code nearby. Adapters, UI, and skills call API/concept entrypoints and do not own semantics. No top-level `infrastructure/`, `src/domain/**`, or `src/application/**` layer should exist; `scripts/**` remains optional developer convenience.

Recreating layer-first owner paths now requires a new accepted decision with explicit temporary shim owner, expiry, and guard coverage.

## Knowledge-base organization rule

Every CodeWiki knowledge base should use the same high-level structure:

```text
.codewiki/kb/
  product/
    overview.md
    users/
    stories/
    uis/
  system/
    overview.md
    file-structure.md
    <component>.md
    diagrams/
      README.md
      context-map.yaml
      component-map.yaml
      key-flow.yaml
      data-model.yaml
      state-lifecycle.yaml
```

Product docs define users, user stories, and visual user interfaces. System docs define the technical architecture, API, adapters, distribution mechanisms, component ownership, and diagram raw data that implement product intent.

System component docs should stay flat. Each major component should have one matching `.md` file under `system/`, and each component should map to the project file structure. Diagram raw data is the intended nested system exception and lives under `system/diagrams/**`. Avoid nested component folders and avoid `overview.md` files except `product/overview.md`, `system/overview.md`, and `system/diagrams/README.md`.

## Change lifecycle

Semantic work starts in the decision classification path, then propagates through decision, planning, implementation, validation, and publication as needed. The detailed review and propagation rules live in [Change Lifecycle](change-lifecycle.md).

## Related docs

- [Product](../product/overview.md)
- [Lexicon](../lexicon.md)
- [Architecture Map](architecture.mmd)
- [File Structure](file-structure.md)
- [Alignment Model](alignment-model.md)
- [Change Lifecycle](change-lifecycle.md)
- [Audits](audits.md)
- [API](api.md)
- [CodeWiki UI](control-room-ui.md)
- [Extension](extension.md)
- [Agency Controller](agency.md)
