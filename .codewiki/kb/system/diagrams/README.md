---
id: spec.system.diagrams
state: active
title: System Diagram Raw Data
summary: Agent-editable raw data contract for project diagrams rendered by CodeWiki UIs.
owners:
  - architecture
  - design
updated: "2026-05-31"
---

# System Diagram Raw Data

This folder stores canonical raw data for system diagrams. The raw data should be easy for agents to read, edit, diff, and validate. The UI can render these specs as Mermaid, Cytoscape, custom SVG, or another local renderer, but renderer output is not canonical truth unless a future task explicitly promotes it.

## Format rule

Use YAML as the default canonical format. YAML files in this folder are the source of truth for diagram contracts. Mermaid files are compatibility/export artifacts only, and generated HTML, SVG, PNG, Cytoscape JSON, or future ASCII render output is never source truth unless a later accepted decision explicitly promotes that format.

Each diagram should include:

- `schema_version`
- `id`
- `title`
- `kind`
- `purpose`
- `source_docs`
- renderer hints
- diagram-specific raw data such as nodes, edges, participants, entities, states, transitions, and UI hints

Agents should prefer small stable IDs, explicit source paths, and short labels. Long explanations belong in component Markdown docs, product docs, roadmap tasks, builds, or validation reports.

## Diagram refs

Each YAML node, entity, state, actor, adapter, artifact, policy, external system, edge, relationship, step, or transition becomes a graph/audit ref using `<diagram-file-stem>:<local-id>`; for example, `component-map:application` or `data-model:roadmap_task`. The parser also accepts `<diagram-id>:<local-id>` as an alias when docs or builds use the diagram `id` field.

System Markdown docs may declare owning diagram refs in frontmatter:

```yaml
diagram_refs:
  - component-map:application
  - key-flow:resume-task
```

Nodes can set `requires_doc: true` when at least one system doc must declare that ref. Diagram-ref migration is controlled by `codewiki.system_diagrams.diagram_refs.mode`: `off` disables missing-doc enforcement, `warn` reports migration warnings, and `error` hard-enforces missing docs and required-doc gaps.

## Core diagram set

| File | Kind | Purpose | Preferred rendering |
| --- | --- | --- | --- |
| `architecture.yaml` | `architecture_map` | Show the high-level system architecture with stable IDs and renderer hints. | Layered graph, future TUI ASCII, or Mermaid flowchart export. |
| `context-map.yaml` | `context_map` | Show users, access surfaces, external systems, and the project boundary. | Graph/SVG or Mermaid flowchart. |
| `component-map.yaml` | `component_map` | Show major runtime components, adapters, data stores, and dependency direction. | Layered graph, custom SVG, or Mermaid flowchart. |
| `key-flow.yaml` | `sequence_flow` | Show the most important user/agent workflow end to end. | Mermaid sequence diagram or custom sequence renderer. |
| `data-model.yaml` | `data_model` | Show durable entities, generated state, evidence, and ownership. | Mermaid ER/custom ER renderer. |
| `state-lifecycle.yaml` | `state_lifecycle` | Show task, compiler, validation, build, and release lifecycles. | Mermaid state diagram or custom state renderer. |
| `file-structure-map.yaml` | `file_structure_map` | Show intended repository/source ownership, current implementation shape, approved migration deltas, and drift categories. | Tree graph, layered graph, or Mermaid flowchart. |

## Rendering boundaries

- The UI may render a diagram picker from this folder.
- Selecting a node, edge, entity, state, sequence step, or file-structure node should open source-backed inspector detail.
- File-structure diagrams should show ownership and drift categories without duplicating full component docs.
- Diagram files should not duplicate full component docs.
- Generated state/graph output remains `.codewiki/index_graph.json`; diagram files are intended system knowledge.
- Generated HTML, SVG, PNG, graph JSON, Mermaid output, Unicode terminal views, ASCII diagrams, or future TUI render output must be treated as render artifacts, not source truth.
- `architecture.yaml` is the canonical architecture diagram. Hand-maintained `../architecture.mmd` was removed; future Mermaid output should be generated from YAML when needed.

## Related docs

- [Terminal UI and Agent Visual Language](../terminal-ui.md)
- [File Structure](../file-structure.md)
- [System Overview](../overview.md)
