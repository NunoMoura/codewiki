---
id: spec.system.overview
title: System Overview
state: active
summary: Main runtime areas and ownership boundaries for CodeWiki.
owners:
  - architecture
updated: "2026-06-03"
---

# System Overview

## Main boundaries

CodeWiki is a Pi-based software-development distribution that maintains the repository-local `.codewiki/` contract and exposes it through backend API calls, internal agent tools, and minimal command surfaces. Pi is the runtime foundation, not a mere adapter. Adapter language is reserved for future/non-Pi protocol translation or compatibility paths.

- **Knowledge base semantics** own product specs, visual UI specs, system access-surface specs, system specs, architecture rules, and workflow vocabulary under `.codewiki/kb/**`.
- **Agency controller** owns bounded automation through agency cycles and explicit token, time, risk, gate, model, and approval boundaries.
- **Three compiler loops** own decision, planning, and implementation engines. Compiler output is emitted into loop trace files, not a standalone source architecture layer.
- **Telemetry traces** own compact lifecycle traceability under `.codewiki/telemetry/TRACE-*.json`, with cold trace metadata in `.codewiki/telemetry/catalog.json`.
- **Gateway gates** validate loop outputs against criteria, source refs, gate evidence, generated graph context, KB/diagram freshness, and content proof. Gate pass is the promotion boundary.
- **Graph engine** owns generated reconciliation state in `.codewiki/index_graph.json`: drift detection, routing, traceability, status, and freshness checks. The graph is required gate context but never overrides canonical sources or immutable content proof.
- **File-structure ownership map** owns human-readable intended source/tree ownership, current implementation shape, approved migration deltas, and drift categories through [File Structure](file-structure.md) and `diagrams/file-structure-map.yaml`.
- **Linters/gate criteria** produce deterministic alignment, file-structure, stale-reference, package, security, generated-parity, and source-contract evidence for users and gateways.
- **Pi TUI diagram rendering** is the only retained future UI direction: source-backed system diagram YAML may render as ASCII/Unicode while delegating all semantics to the CodeWiki API. The browser Control Room and status/board/map/product/system UI surfaces are deprecated.
- **API facade** owns stable package/tool use-case entrypoints under `src/api/**` so adapters, scripts, UI, CLI/MCP wrappers, and future harnesses do not depend on old layer-first internals.
- **Loop-first source roots** own pure CodeWiki loop engines, gates, tools, schemas, transitions, and invariants for decision, planning, implementation, telemetry, graph, knowledge, Git proof, Pi integration, project contracts, runtime, agency, and shared primitives.
- **Pi integration** owns backend commands, tools, session integration, packaged skills, and resource discovery. Future adapters may translate other protocol surfaces, but adapters do not own CodeWiki semantics.
- **Shared** owns minimal cross-cutting helpers and types that are truly common; it must not become a dumping ground for domain or application behavior.

## Truth boundaries and compiler model

Detailed truth-boundary and compiler-loop tables live in [System Truth and Compilers](system-truth-and-compilers.md). This overview keeps the main runtime boundaries and ownership seams compact.

## Ownership seams

- [Diagram Raw Data](diagrams/README.md) owns the canonical diagram families and agent-editable YAML sources for system visualizations.
- [Architecture Map](diagrams/architecture.yaml) is the canonical architecture diagram source; generated render/export files are non-canonical artifacts.
- [File Structure](file-structure.md) owns the target repository and knowledge-base structure rules, including the concept-root source migration target and intended-vs-current drift categories.
- [API](api.md) owns the harness-independent CodeWiki access contract.
- [Terminal UI](terminal-ui.md) owns Pi-hosted command-triggered views and agent visual language semantics; richer TUI design remains future work.
- [Extension](extension.md) owns packaged distribution and the current Pi extension surface.
- [Adapters](adapters.md) owns harness translation boundaries for Pi today and CLI/MCP/future harnesses later.
- [Agency Controller](agency.md) owns bounded roadmap automation through agency cycles and explicit gates.
- [Compilers](compilers.md) owns the decision, planning, and implementation loops.
- [Validation Gateway](validation-gateway.md) owns loop gate semantics and structured gate diagnostics/remediation.
- [Audits](audits.md) owns compatibility deterministic evidence semantics until gate criteria naming fully replaces audit/check wording.
- [Builds](builds.md) owns compatibility compiler-output artifact semantics during telemetry migration.
- [Graph](graph.md) owns the generated state/graph representation contract.
- [Alignment Model](alignment-model.md) owns cross-layer precedence and propagation semantics.
- [Knowledge](knowledge.md) owns product/system knowledge-base structure and persistence semantics.
- [Roadmap](roadmap.md) owns work truth: queue, priority, status, blockers, progress, and closure semantics.

CodeWiki should not implement a general sandbox, hosted SaaS, duplicate Pi observability/eval packages, or standalone browser Control Room. It defines `.codewiki/` semantics and exposes them through a stable API and Pi-first distribution surface.

## Target package architecture

The package target moves from broad concept-root ownership to loop-first source ownership with a stable `src/api/**` facade and primitive-only `src/shared/**` helpers. Decision, planning, and implementation roots own loop compilers/gates/tools; telemetry, graph, knowledge, Git proof, Pi integration, project contracts, runtime, and agency own shared supporting concerns. Pi UI and skills call API/loop entrypoints and do not own semantics. No top-level `infrastructure/`, `src/domain/**`, or `src/application/**` layer should exist; `scripts/**` remains optional developer convenience.

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

Semantic work starts in the Decision Loop, propagates through Planning Loop and Implementation Loop, and exits each loop only through its gateway gate. Publication or release proof is implementation/content evidence, not a fourth loop. The detailed review and propagation rules live in [Change Lifecycle](change-lifecycle.md).

## Related docs

- [Product](../product/overview.md)
- [Lexicon](../lexicon.md)
- [Architecture Map](diagrams/architecture.yaml)
- [File Structure](file-structure.md)
- [Alignment Model](alignment-model.md)
- [Change Lifecycle](change-lifecycle.md)
- [Audits](audits.md)
- [API](api.md)
- [Extension](extension.md)
- [Agency Controller](agency.md)
