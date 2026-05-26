---
id: spec.system.knowledge
title: Knowledge
state: active
summary: Durable product and system knowledge structure for CodeWiki projects.
owners:
  - architecture
  - product
updated: "2026-05-26"
code_paths:
  - .codewiki/kb
  - src/knowledge
---

# Knowledge

## Responsibility

Knowledge is the durable intended truth for product and system design. It is not a log, generated view, task archive, or code artifact store.

## Product structure

Product knowledge should define users, user stories, and visual user interfaces:

```text
.codewiki/kb/product/
  overview.md
  users/
  stories/
  uis/
```

Product docs should avoid technical implementation detail unless it affects user value, user constraints, visual UI behavior, or a system constraint that changes what users can expect.

Product-oriented decisions enter through product knowledge first. The decision compiler then records system-impact evidence and routes architecture, planning, or implementation work only when product intent requires lower-layer change.

## System structure

System knowledge should define the technical architecture that implements product intent:

```text
.codewiki/kb/system/
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

System-oriented decisions enter through system diagrams and system knowledge first. The decision compiler then records product-impact evidence and updates product knowledge when architecture constraints or workflow changes are user-visible.

System diagrams are the navigation spine for system knowledge. Each system `.md` file, except `system/overview.md` and `system/diagrams/README.md`, should map to at least one diagram ref once the vNext diagram-ref migration is enabled. Primary refs use `<diagram-file-stem>:<local-id>` with `<diagram-id>:<local-id>` accepted as an alias. Valid refs may target components, adapters, flows, domain entities, lifecycles, policy boundaries, artifacts, actors, or external systems. Diagram nodes can set `requires_doc` when a detail doc is mandatory; not every diagram node needs a prose doc.

Each major system component should have one matching `.md` file under `system/`. Each component doc should map to code, data, adapters, or generated artifacts in `file-structure.md`. Diagram raw data lives under `system/diagrams/**` as YAML so agents can edit it safely and renderers can transform it into Mermaid, Cytoscape, or custom SVG views. Diagrams may include external artifacts such as users, code/tests, or publication outputs when needed for context; those are not system component docs unless ownership moves into CodeWiki.

## Links and graph relationships

Knowledge docs should use minimal curated Markdown links for human navigation and intentional semantic dependencies. They should not try to manually encode the full relationship graph.

The generated graph derives machine relationships from frontmatter, explicit references, curated Markdown links, build metadata, roadmap links, validation reports, code/test facts, and source fingerprints. If a relationship is mainly needed for routing, drift detection, freshness, or backlinks, it belongs in generated graph state rather than in hand-maintained prose links.

## Rules

- Avoid nested `overview.md` files except `product/overview.md`, `system/overview.md`, and the diagram contract `system/diagrams/README.md`.
- Avoid a folder per system component; `system/diagrams/**` is the intended nested system exception for diagram raw data.
- Keep current intended truth in knowledge; do not accumulate old decisions as raw history.
- Use Git for historical recovery.
- Use builds for temporary loop handoff briefs.
- Use roadmap for active work truth.
- Use graph state for generated reconciliation, routing, freshness, backlinks, and drift detection.
- Use code/tests for executable truth.
- Prefer sparse intentional links over exhaustive wiki-link meshes.
- Store canonical diagram source as readable YAML specs under `system/diagrams/**`; treat Mermaid, Cytoscape element JSON, or SVG as renderer targets unless explicitly promoted.

## Change propagation

A change can originate in any layer. Code changes can create decision drift. Refactoring ideas can start in decision and become implementation work. Product changes can require system and code changes.

The decision compiler routes by abstraction entrypoint:

- product-first changes update product truth, then preflight system/roadmap/code impact;
- system-first changes update system diagrams and system truth, then preflight user-visible product impact;
- mixed changes must name both owning docs and the propagation direction for each requirement.

The decision loop should expose change proposals with diff tables before canonical knowledge edits are applied. Accepted decision rows and knowledge edits compile together into a decision build with row-to-KB and diagram-ref evidence. Decision builds are the semantic intent-to-knowledge handoff.

## Related docs

- [Product](../product/overview.md)
- [Graph](graph.md)
- [Roadmap](roadmap.md)
