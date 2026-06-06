---
id: spec.system.terminal-ui
title: Pi TUI Diagram Rendering
state: active
summary: Narrow system contract for future Pi TUI ASCII/Unicode rendering of canonical system diagrams.
owners:
  - architecture
  - design
updated: "2026-06-06"
diagram_refs:
  - component-map:extension
  - component-map:api
---

# Pi TUI Diagram Rendering

CodeWiki is backend-first for the current architecture wave. Previous product UI surfaces are deprecated, including status panels/docks, Board, Map, Product/System navigation panels, and browser Control Room concepts.

The only retained UI direction is future Pi TUI rendering of canonical system diagrams as ASCII/Unicode. Backend state remains available through `wiki_state`, graph lenses, roadmap/task state, lifecycle traces, validation reports, and source refs.

## Command-triggered surfaces

Active command direction is limited to backend actions and future diagram rendering:

| Command family | Purpose |
| --- | --- |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield repository through command-adapter backend setup/bootstrap calls. |
| `/wiki resume` | Continue from the last known stable state using CodeWiki source refs and context-boundary evidence. |
| `/wiki config` | Apply CodeWiki preferences/configuration through backend command-adapter calls. |
| `/wiki system <diagram type>` | Future Pi TUI rendering of canonical system diagram YAML as ASCII/Unicode. |

`/wiki status`, `/wiki-status`, and `/wiki_status` are deprecated status UI commands. Product/Board/Map navigation commands are not active target surfaces.

## Diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated graph lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- file-structure maps render as trees,
- data models render as entity cards plus relation lists.

The renderer should use Unicode box drawing by default and ASCII fallback when needed. Renderer output is not canonical truth and must not create hidden UI-only state.

## Non-goals

- No browser dashboard.
- No status panel or dock UI.
- No Board or Map product UI.
- No Product/System navigation panel work.
- No full generated graph renderer by default.
- No hidden terminal-only workflow state.

## Related docs

- [Product TUI Diagram Rendering](../product/uis/terminal.md)
- [Deprecated Status UI](../product/uis/status-dock.md)
- [Graph](graph.md)
