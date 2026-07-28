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
timestamp: 2026-07-28T00:00:00Z
---
# Knowledge Base Component

## Responsibility

`.codewiki/kb/**` stores accepted Product/System/Design Knowledge. `src/knowledge/**` loads Markdown/frontmatter, headings, links, diagram refs, provenance, lifecycle metadata, source ownership, and source refs for Decision, Planning, Implementation, WorkState, and bounded relationship queries.

## Contracts

- Decision owns accepted Knowledge meaning and exact Change-accounted updates.
- Planning consumes exact accepted concept revisions/digests.
- Implementation realizes accepted obligations or routes ambiguity back.
- Target emits OKF v0.2 and consumes v0.2 with v0.1 fallback while preserving unknown fields.
- Imported `sources`, `generated`, `verified`, lifecycle/freshness, and Attested Computation metadata remain advisory and inert.
- Change Traces stay outside OKF.
- CodeWiki source-ownership extension maps stable responsibilities/interfaces to source/tests; fine-grained code relationships stay derived.
- Generated indexes and Work/Alignment/Learning graphs are disposable.
- Brownfield unknown coverage remains explicit and cannot prove absence/alignment.

## Related docs

- [Knowledge](knowledge.md)
- [Decision to Planning](../flows/decision-to-planning.md)
- [Source Map](source-map.md)
- [Component Map](../diagrams/component-map.yaml)
