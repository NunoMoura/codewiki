---
type: Concept
title: System Diagram Raw Data
description: This folder stores canonical raw data for system diagrams. The raw data should be easy for agents to read, edit, diff, and validate. The UI can render these specs as Mermaid, Cytoscape, custom SVG, or another local renderer, but renderer output is not canonical truth unless a future task explicitly promotes it.
tags:
  - codewiki
  - system
  - diagrams
  - readme
timestamp: 2026-06-30T00:00:00Z
---
# System Diagram Raw Data

This folder stores canonical raw data for system diagrams. The raw data should be easy for agents to read, edit, diff, and validate. The UI can render these specs as Mermaid, Cytoscape, custom SVG, or another local renderer, but renderer output is not canonical truth unless a future task explicitly promotes it.

## Format rule

Use YAML as the default canonical format. YAML files in this folder are the source of truth for diagram contracts. Mermaid files are render/export artifacts only, and generated HTML, SVG, PNG, Cytoscape JSON, or future ASCII render output is never source truth unless a later accepted decision explicitly promotes that format.

Each diagram should include:

- `schema_version`
- `id`
- `title`
- `kind`
- `purpose`
- `source_docs`
- renderer hints
- diagram-specific raw data such as nodes, edges, participants, entities, states, transitions, and UI hints

Agents should prefer small stable IDs, explicit source paths, and short labels. Long explanations belong in component Markdown docs, product docs, loop outputs, trace iteration data, or runtime temp while active.

## Diagram refs

Each YAML node, entity, state, actor, adapter, artifact, policy, external system, edge, relationship, step, or transition becomes a diagram ref using `<diagram-file-stem>:<local-id>`; for example, `component-map:application` or `data-model:trace_iteration`. The parser also accepts `<diagram-id>:<local-id>` as an alternate ref when docs or trace data use the diagram `id` field.

System Markdown must not use frontmatter. Diagram refs belong in diagram YAML, trace data, source-map ownership notes, or prose links when a human-readable relation is useful.

Nodes can set `requires_doc: true` when a diagram concept requires an owning Markdown doc. The owning-doc relation should be validated through source-map or diagram YAML, not duplicated in Markdown metadata.

## Core diagram set

| File | Kind | Purpose | Preferred rendering |
| --- | --- | --- | --- |
| `architecture.yaml` | `architecture_map` | Show the high-level system architecture with stable IDs and renderer hints. | Layered graph, future TUI ASCII, or Mermaid flowchart export. |
| `context-map.yaml` | `context_map` | Show users, access surfaces, external systems, and the project boundary. | Graph/SVG or Mermaid flowchart. |
| `component-map.yaml` | `component_map` | Show major runtime components, adapters, data stores, and dependency direction. | Layered graph, custom SVG, or Mermaid flowchart. |
| `key-flow.yaml` | `sequence_flow` | Show the most important user/agent workflow end to end. | Mermaid sequence diagram or custom sequence renderer. |
| `data-model.yaml` | `data_model` | Show durable entities, generated state, evidence, and ownership. | Mermaid ER/custom ER renderer. |
| `state-lifecycle.yaml` | `state_lifecycle` | Show semantic loop iteration, exit-condition, runtime coordination, retention, and release lifecycles. | Mermaid state diagram or custom state renderer. |

## Rendering boundaries

- The UI may render a diagram picker from this folder.
- Selecting a node, edge, entity, state, sequence step, or source ownership node should open source-backed inspector detail.
- Source ownership renderers should read `../source-map.yaml` directly instead of duplicating ownership in diagram YAML.
- Diagram files should not duplicate full component docs.
- Generated view output remains `.codewiki/views/**`; diagram files are intended system knowledge.
- Generated HTML, SVG, PNG, graph JSON, Mermaid output, Unicode terminal views, ASCII diagrams, or future TUI render output must be treated as render artifacts, not source truth.
- `architecture.yaml` is the canonical architecture diagram. Hand-maintained `../architecture.mmd` was removed; future Mermaid output should be generated from YAML when needed.

## Related docs

- [Terminal UI and Agent Visual Language](../terminal-ui.md)
- [Source Map](../source-map.md)
- [System Overview](../overview.md)
