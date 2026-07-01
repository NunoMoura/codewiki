---
type: Concept
title: Knowledge
description: Knowledge is the durable intended truth for product and system design. It is not a log, generated view, task archive, trace archive, or code artifact store.
tags:
  - codewiki
  - system
  - knowledge
timestamp: 2026-06-30T00:00:00Z
codewiki_component: knowledge
codewiki_components:
  - knowledge
codewiki_source_patterns:
  - src/knowledge/**
  - .codewiki/kb/**
codewiki_test_patterns:
  - tests/knowledge/**
  - tests/scaffold.test.mjs
codewiki_role: hot_knowledge
codewiki_source_map:
  - id: knowledge
    source_patterns:
      - src/knowledge/**
      - .codewiki/kb/**
    test_patterns:
      - tests/knowledge/**
      - tests/scaffold.test.mjs
    role: hot_knowledge
---
# Knowledge

## Responsibility

Knowledge is the durable intended truth for product and system design. It is not a log, generated view, task archive, trace archive, or code artifact store.

Hot knowledge lives in:

```text
.codewiki/kb/**
```

Cold history and restore detail live in Git.

## Product structure

Product knowledge defines users, user stories, product behavior, and visual user interfaces:

```text
.codewiki/kb/product/
  overview.md
  users/
  stories/
  uis/
```

Product docs should avoid technical implementation detail unless it affects user value, user constraints, UI behavior, or a system constraint that changes what users can expect.

## System structure

System knowledge defines technical architecture that implements product intent:

```text
.codewiki/kb/system/
  overview.md
  loop-model.md
  decision-loop.md
  planning-loop.md
  implementation-loop.md
  source-map.md
  source-map.yaml
  <component>.md
  diagrams/
```

System diagrams are the navigation spine for system knowledge. Diagram raw data lives under `system/diagrams/**` as YAML so agents can edit it safely and renderers can transform it into Mermaid, Cytoscape, ASCII/Unicode, or custom views.

## Decision-owned propagation

The decision loop owns knowledge propagation. There is no separate knowledge loop.

A change can originate in any layer:

- product changes can require system and code changes;
- system changes can require product documentation updates when user-visible;
- implementation discoveries can route back to planning or decision;
- source drift can create a decision question.

The decision loop records accepted intent, KB impact, and diagram impact in decision output. It cannot exit unless required KB/diagram updates are made, explicitly not needed, blocked, or routed with owner and rationale.

Planning starts only from exited decision output and current KB refs.

## Links and generated relationships

Knowledge docs should use sparse intentional Markdown links for human navigation and semantic dependencies. They should not try to manually encode every relationship.

Generated views derive machine relationships from explicit refs, curated Markdown links, trace iteration data, source-map ownership, source/test facts, and Git refs. If a relationship is mainly needed for routing, drift detection, freshness, backlinks, doc-code mapping, or current-state views, it belongs in generated views rather than hand-maintained prose.

CodeWiki is migrating hot knowledge toward OKF v0.1 markdown/frontmatter concepts. During migration, `system/source-map.yaml` remains the canonical KB-code-test ownership source; generated OKF extension fields will project that ownership into concept frontmatter before source-map deprecation is considered. Conceptual diagram relationships belong in diagram YAML files. Loop outputs and implementation evidence carry trace-local refs. Reusable drift lint rules live in source so readiness checks, future commands, and tests share one terminology contract instead of duplicating stale-wording scans.

## OKF and Sprint workflow boundary

CodeWiki product concepts such as Sprint Proposal, Decision, Sprint,
Sprint Record, Sprint Queue, Sprint Card, Task, Assignment, Ready Checks, and
Needs Review are defined in `.codewiki/kb/**/*.md` as OKF-compatible knowledge.

Actual Sprint instances are not KB documents. Their durable workflow truth
remains trace JSONL under `.codewiki/traces/TRACE-*.jsonl`. Generated
Sprint Queue and Sprint Card output is a projection/widget over traces, work
queues, source refs, and Git proof; it must not become a second state root.

A Sprint Record is the product-facing bridge to trace persistence. Use
Sprint/Sprint Record in product-facing docs and renderers, but keep `trace`,
trace event ids, row ids, work item ids, and claim ids where storage, recovery,
tests, or runtime coordination require exact technical refs.

## Rules

- Keep current intended truth in knowledge; do not accumulate old decisions as raw history.
- Use Git for historical recovery.
- Use traces for workflow/state truth.
- Use generated views for status, resume, routing, freshness, backlinks, and doc-code mapping.
- Use code/tests for executable truth.
- Prefer sparse intentional links over exhaustive wiki-link meshes.
- Store canonical diagram source as readable YAML specs under `system/diagrams/**`; treat Mermaid, Cytoscape element JSON, SVG, or ASCII renderings as renderer targets unless explicitly promoted.
- Do not use historical roadmap, graph, artifact, validation, or telemetry roots as target truth.

## Related docs

- [Product](../product/overview.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Traces](traces.md)
- [Source Map](source-map.md)
- [Source Map](source-map.md)
