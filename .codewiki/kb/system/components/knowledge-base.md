---
type: Concept
title: Knowledge Base Component
description: Knowledge loading exposes accepted OKF Product/System/Design concepts, provenance, source ownership, links, and diagrams to Loops and bounded relationship queries without creating workflow or graph truth.
tags:
  - codewiki
  - system
  - components
  - knowledge
  - base
timestamp: 2026-07-30T00:00:00Z
---
# Knowledge Base Component

## Responsibility

`.codewiki/kb/**` stores accepted Product/System/Design Knowledge. `src/knowledge/**` loads Markdown/frontmatter, headings, links, diagram refs, provenance, lifecycle metadata, source ownership, and source refs for Decision, Planning, Implementation, WorkState, and bounded relationship queries.

## Contracts

- Decision owns accepted Knowledge meaning and exact Change-accounted updates.
- Planning consumes exact accepted concept revisions/digests.
- Implementation realizes accepted obligations or routes ambiguity back.
- Target emits OKF v0.2; a bounded v0.1 reader remains only for imported generic bundles and preserves unknown fields.
- Imported `sources`, `generated`, `verified`, lifecycle/freshness, and Attested Computation metadata remain advisory and inert.
- Accepted Change operations, Planning epochs, Evidence, delivery, and outcomes stay outside OKF.
- Authored Knowledge relationships use only `depends_on`, `constrains`, `refines`, `realizes`, `verifies`, `supersedes`, and `derived_from`; Markdown links remain `references`.
- CodeWiki source-ownership extension maps stable responsibilities/interfaces to source/tests; fine-grained code relationships stay derived.
- The Alignment Graph is a deterministic first-class projection; generated indexes, layouts, and Work/Learning views are disposable.
- Brownfield unknown coverage remains explicit and cannot prove absence/alignment.

## Related docs

- [Knowledge](knowledge.md)
- [Decision to Planning](../flows/decision-to-planning.md)
- [Source Map](source-map.md)
- [Component Map](../diagrams/component-map.yaml)
