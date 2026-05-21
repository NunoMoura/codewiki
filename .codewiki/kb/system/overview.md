---
id: spec.system.overview
title: System Overview
state: active
summary: Main runtime areas and ownership boundaries for CodeWiki.
owners:
  - architecture
updated: "2026-05-16"
code_paths:
  - src
  - skills
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
- **Audits** produce deterministic alignment, file-structure, stale-reference, package, security, and generated-parity evidence for users and gateways.
- **CodeWiki UI** owns the standalone local browser command center for humans under `src/ui/**` while delegating all semantics to the CodeWiki API.
- **Application layer** owns harness-agnostic compilers, validation gateways, the state engine, agent-facing application tools, ports, and built-in local runtime implementations.
- **Domain layer** owns pure CodeWiki concepts, rules, entities, schemas, transitions, and invariants for agency, audits, builds, changes, project contracts, roadmap, session queue, validation, generated state, and GC.
- **Adapters** own harness-specific or protocol-specific translation. The Pi adapter owns current commands, tools, status panel, session integration, packaged skills, and resource discovery. Browser web code is UI, not an agent adapter. Adapters do not own CodeWiki semantics.
- **Shared** owns minimal cross-cutting helpers and types that are truly common; it must not become a dumping ground for domain or application behavior.

## Truth boundaries

CodeWiki separates truth by role so that agents can reason about the current state without treating every artifact as the same kind of source.

| Truth type | Lives in | Role |
| --- | --- | --- |
| Repo-local contract truth | `.codewiki/config.json` | Defines project roots, policy, generated files, and runtime settings. |
| Intent and knowledge handoff truth | accepted `decision_build` files under `.codewiki/builds/decision/**` | Temporary validated brief of user intent, KB changes, and propagation evidence for planning. |
| Product and system truth | `.codewiki/kb/**/*.md`, `.codewiki/kb/**/*.yaml`, and `.codewiki/kb/**/*.json` | Durable intended behavior, product decisions, architecture, diagram raw data, workflows, and non-goals. |
| Planning handoff truth | accepted `planning_build` files under `.codewiki/builds/planning/**` | Temporary roadmap, acceptance, verification, and TDD-strategy brief for the implementation loop. |
| Work truth | `.codewiki/roadmap/**` | Active work items, priority, ownership, progress, status, blockers, and closure state. |
| Coordination state | `.codewiki/session/queue.json` | Session queue with temporary scoped leases, waits, focus, and isolation metadata; expires/releases and never replaces durable truth. |
| State truth | `.codewiki/index_graph.json` | Generated state/graph representation for reconciliation, drift detection, derived queue order, routing, status, and freshness. |
| Audit evidence | audit reports, check logs, and build/validation embedded evidence | Deterministic evidence used by gateways; not intent truth by itself. |
| Executable truth | code and tests | Final behavior and automated proof. |
| Implementation evidence truth | accepted `implementation_build` files under `.codewiki/builds/implementation/**` | Temporary compiled evidence that changes were successfully implemented and publication payloads for Git-backed archival. |
| Validation attestation | validation gateway output, plus persisted reports when required | Records a gateway judgment over named evidence. It is not proof that content changed. |
| Content proof | Git tree/commit SHA, package digest, archive ledger, and remote refs | Immutable or externally published proof of what exists or shipped. |
| Publication truth | implementation builds, validation outcomes, content proofs, and Git/remote results | Supports commit messages, PR bodies, issue updates, release notes, and push readiness. |

Agents should not hand-edit generated graph/index files. Durable changes flow into knowledge, roadmap, code/tests, builds, validation reports, commits, or publication artifacts first; generated graph state is rebuilt afterward. Parallel coordination flows through session queue scoped leases, not graph edits. If graph state and canonical inputs disagree, canonical inputs win and the graph is stale or broken. If a validation report and content proof disagree, content proof wins and the report must be treated as stale or invalid.

Passing validation does not need a separate durable report by default when the accepted build records the validation result. Failed, blocked, policy-required, current publication, release, or audit-mode validation reports should be stored under `.codewiki/validation/**`. After safe Git archival/publication, pass validation reports are cold and should leave the hot working tree.


## Compiler model

CodeWiki's target alignment model uses four compiler loops and a pure validation gateway:

- [Alignment Model](alignment-model.md) — layer model, graph/gateway/content-proof precedence, and semantic change rules.
- [Compilers](compilers.md) — decision, planning, and implementation loops that produce cycle builds.
- [Validation Gateway](validation-gateway.md) — validates a submitted build against policy, source refs, criteria, and evidence.
- [Audits](audits.md) — deterministic audit profiles and `/audit [flags]` semantics.

```text
decision loop -> decision_build -> validation gateway
  -> planning loop -> planning_build -> validation gateway
      -> implementation loop -> implementation_build -> validation gateway/publication
```

A cycle build is one loop attempt. It contains criteria, requirement ids, source refs, evidence mapping, assumptions, risks, and non-goals for the gateway and the next fresh session. Every semantic change must trace to an accepted compiler build before it closes, validates, or publishes.

Builds compact one loop for the next; they are not permanent archives. Long-term product/system truth belongs in `.codewiki/kb/**`, work truth in roadmap state, and executable truth in code/tests.

Roadmap items reference accepted builds and knowledge paths, then track priority, state, progress, blockers, and closure. Planning creates or refines roadmap work from validated decision builds.

Implementation builds also support publication. They can recommend commit, PR, issue, release-note, and push-readiness text, but validation and policy decide whether commit, push, release, or remote updates are allowed.

Gateways check vertical and horizontal alignment, but they do not invent requirements or compile the next build.

## Ownership seams

- [Diagram Raw Data](diagrams/README.md) owns the canonical diagram families and agent-editable YAML sources for system visualizations.
- [Architecture Map](architecture.mmd) is a compatibility component diagram until System UI rendering migrates to `diagrams/component-map.yaml`.
- [File Structure](file-structure.md) owns the target repository and knowledge-base structure rules.
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

The package follows the structure owned by [File Structure](file-structure.md): adapters, UI, and skills call focused application use cases and tools, and application code uses domain concepts without placeholder wrapper seams. There is no top-level `infrastructure/` source layer. Built-in local filesystem/Git/process implementations live under `application/local/**` behind application ports. `scripts/**` is optional developer convenience only and must not enforce authoritative CodeWiki semantics.

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
