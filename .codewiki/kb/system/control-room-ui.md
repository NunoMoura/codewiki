---
id: spec.system.control-room-ui
title: CodeWiki UI
state: active
summary: Standalone local web UI and hosting surface for CodeWiki.
owners:
  - architecture
  - engineering
updated: "2026-05-16"
---

# CodeWiki UI

## Responsibility

The CodeWiki UI is the standalone local web surface for CodeWiki. Its source belongs under `src/ui/web/**`, not `src/adapters/**`. The implementation may still use Control Room as an internal module name, but user-facing titles, labels, and navigation should say CodeWiki. It serves as a browser-based second-screen surface for the current repository, renders curated KB, Board, Map, Status, and Sessions views, and delegates semantic reads and writes to the CodeWiki API.

The UI is a product surface and an access surface. It must not own CodeWiki truth. Product and system intent remain in `.codewiki/kb/**`, work truth remains in roadmap state, compiler handoffs remain in builds, validation truth remains in validation reports, coordination state remains in session queue artifacts, and generated relationships remain in `.codewiki/index_graph.json`.

The UI should prioritize high-signal hot working-set navigation over exhaustive artifact browsing. Default views show current state, KB relationships, roadmap work, active sessions, drift/staleness, unconsumed handoffs, fail/block validation, current validation isolation, and publication blockers. Cold archive data, closed-task detail, old pass validation, archive refs, and restore indexes are hidden unless the user explicitly asks to restore, inspect archives, or audit historical work.

First-level navigation is header-based: `Status`, `KB`, `Board`, `Map`, and `Sessions`. `Settings` is opened from a header-right cog. `Product`, `System`, `Graph`, `Leases`, `Knowledge`, `Builds`, `Validation`, `Diff`, and `Settings` are not permanent first-level navigation labels in the user UI.

The UI should not depend on a persistent left rail, persistent right inspector/sidebar, or bottom status line. Details should appear inline as ASCII-like cards in the current workspace, with source paths, raw Markdown, roadmap JSON, build payloads, validation bodies, lease records, and graph records collapsed behind explicit advanced/source disclosure.

## Local hosting model

The default hosting model is local:

```text
codewiki ui or harness launcher
  -> local HTTP server on 127.0.0.1:<port>
    -> browser CodeWiki UI
      -> CodeWiki application tools
        -> repo-local .codewiki files, graph state, code paths, and git metadata
```

The server should bind to `127.0.0.1` by default, choose an available port, attempt to open the local URL in the system browser when launched from an interactive host, and always print a plain `http://127.0.0.1:<port>/` fallback. The browser header should show only the local URL at top right beside the settings icon; it should not add local-first marketing copy.

Optional shared LAN/server mode may be added later with an explicit flag, token authentication, and clear warnings. It must never be the default.

## Harness integration

Harnesses launch or connect to the CodeWiki UI; they do not fork UI semantics. Pi owns the current launcher and compact TUI fallback. Future CLI, MCP, Claude Code, Codex, or editor surfaces should start the same local server or call the same application tools. Web UI remains a product UI, not an agent harness adapter.

## API contract

The CodeWiki UI should use typed CodeWiki API capabilities or thin HTTP endpoints over those capabilities. Minimum read endpoints for the simplified UI are:

- repository status, health, graph/task metrics, latest check signal, and next action,
- current session/focus summary,
- roadmap summary, active task/sprint scope, gates, blockers, and closure evidence for Board,
- KB summary derived from `.codewiki/kb/product/**` and `.codewiki/kb/system/**`, including Product stories/UI surfaces and System components/diagrams,
- docs-first Map relationships from generated graph state,
- broader generated graph slices only as secondary Map controls,
- system diagram catalog and selected diagram raw data from `.codewiki/kb/system/diagrams/**`,
- active sessions derived from session queue leases, waits, focus, and task/build refs,
- contextual build, validation, diff-table, or source detail only when linked from the active view,
- repo-backed preference summary and option mapping derived from `.codewiki/config.json` for the header Settings page.

Write endpoints should be added only when the view needs a real action. They must route through existing application use cases such as decision diff-table actions, roadmap task actions, session queue coordination actions, build writing, validation writing, graph rebuilds, and safe config mutations. Decision and planning approval controls should render row/task cards with approve, edit, reject, and defer actions, then write through `codewiki_diff_table` or roadmap planning use cases rather than treating chat prose as canonical approval.

## Status contract

`Status` is the current-state detail page. It should show high-signal current state and next safe action without duplicating the full Board, Map, Sessions, validation, or build surfaces.

Status can include repository health, branch/commit, active task or sprint focus, next safe action, open/recent work counts, active session or lease warnings, gate/blocker counts, stale/drift count, and latest validation/check signal when available.

## KB contract

`KB` is the single top-level knowledge section. It combines Product and System knowledge behind a drilldown or switch rather than exposing Product and System as separate top-level navigation items.

### Product KB contract

Product KB reads `.codewiki/kb/product/**` and presents a curated product model rather than raw Markdown as the default UI. The default workspace should show fast selectable lists for Stories and UI Surfaces. Users/personas are available as context, filters, and supporting evidence after a story or UI surface is selected.

The Product read model should extract:

- stories and acceptance/success signals,
- visual UI surfaces and their purpose,
- related stories for each UI surface,
- contextual users and jobs when relevant,
- links between users, stories, UIs, roadmap tasks, builds, validation reports, and evidence when graph data exposes them,
- source paths for every displayed fact.

### System KB contract

System KB reads component docs from `.codewiki/kb/system/*.md` and diagram raw data from `.codewiki/kb/system/diagrams/**`.

The UI should expose a diagram picker for the five core diagram families:

| Diagram kind | Canonical source | Renderer target |
| --- | --- | --- |
| Context map | YAML graph spec with actors, systems, and relationships. | ASCII-like graph/cards or Mermaid flowchart. |
| Component/container map | YAML graph spec with groups, nodes, edges, and source docs. | ASCII-like graph/cards or Cytoscape/custom SVG. |
| Key flow sequence | YAML sequence spec with participants and ordered messages. | ASCII-like sequence cards or Mermaid sequence diagram. |
| Data/domain model | YAML entity-relationship spec with entities and relationships. | ASCII-like ER cards or Mermaid ER/custom ER renderer. |
| State/lifecycle map | YAML state-machine spec with states, transitions, and gates. | ASCII-like state cards or Mermaid state diagram. |

YAML is canonical for diagram raw data because agents can maintain it safely and the UI can transform it into renderer-specific structures. Mermaid, Cytoscape element JSON, and SVG are renderer targets unless a later task explicitly promotes a renderer-specific file to source truth.

The renderer should arrange diagrams with readable spacing, route edges around node boxes, draw edges behind nodes, and avoid overlapping arrows, labels, and components. Selecting a node, edge, sequence step, entity relationship, or state transition should open an inline detail card that explains the selected item and links to source docs.

## Board contract

`Board` reads roadmap work truth and related graph/build/validation/evidence links. It should show active tasks, sprint scope, gates, blockers, acceptance criteria, next actions, and closure evidence without duplicating full requirements prose.

Board is a retro terminal Kanban board with deterministic lanes such as `Now`, `Ready`, `Blocked`, and `Gate/Done recent`. Lane assignment comes from roadmap status, active focus, blockers, validation gates, content-proof gates, and recent closure evidence; the browser must not invent hidden workflow state.

Detailed builds, validation reports, pending decisions, and task-candidate approval surfaces appear through Board/evidence links and value-first source disclosure rather than their own permanent top-level sections. Pending decision rows or task candidates should be actionable inline cards when user approval is required.

## Map contract

`Map` is the user-facing name for generated graph navigation. It reads `.codewiki/index_graph.json` but defaults to docs/KB relationships and current working-set links rather than the entire graph.

The default Map should emphasize relationships among product docs, system docs, roadmap tasks, builds, validation reports, tests, and code paths. Broader graph data, artifact-kind filters, build DAGs, stale links, drift, and debug records are secondary controls.

## Detailed expectations

Additional detailed contracts continue in [CodeWiki UI Implementation Details](control-room-ui-details.md).

## Related docs

- [CodeWiki UI Implementation Details](control-room-ui-details.md)
- [Adapters](adapters.md)
- [API](api.md)
