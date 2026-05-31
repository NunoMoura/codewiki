---
id: spec.system.components.knowledge-base
title: Knowledge Base Component
state: active
component_id: knowledge
diagram_refs:
  - component-map:knowledge
  - file-structure-map:knowledge_concept_root_boundary
source_roots:
  - src/knowledge/**
  - .codewiki/kb/**
owners:
  - architecture
  - product
updated: "2026-06-01"
summary: Canonical product and system intent plus parsers that load docs, links, diagrams, and frontmatter.
---

# Knowledge Base Component

## Responsibility

The knowledge base stores intended product and system truth. Parser code loads Markdown, diagram refs, links, frontmatter, and source refs so state, audits, and compilers can reason about the project.

## Owned paths

- `.codewiki/kb/**` is canonical repo-local knowledge.
- `src/knowledge/**` owns parser and document-loading behavior.

## Contracts

- Product/system intent changes flow through decision approval.
- Knowledge docs should link to generated or source-owned detail rather than duplicating raw history.
- Diagram-backed docs should keep stable diagram ids and source refs aligned.

## Flow links

- [Decision to planning](../flows/decision-to-planning.md)

## Related docs

- [System overview](../overview.md)
- [File structure](../file-structure.md)
- [Component map](../diagrams/component-map.yaml)
