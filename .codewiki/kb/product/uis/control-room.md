---
id: spec.product.uis.control-room
title: CodeWiki UI
state: active
summary: Product expectations for the simplified ASCII-like second-screen CodeWiki UI.
owners:
  - product
  - design
updated: "2026-05-16"
---

# CodeWiki UI

The CodeWiki UI is a secondary-screen observability and navigation surface for work that is still driven from agent chat. It should help users orient around current repository state, knowledge, roadmap work, relationships, and active sessions without becoming a terminal replacement, raw file browser, build log viewer, archive browser, or graph editor.

The implementation may keep Control Room as an internal module name. User-facing titles, labels, and navigation should say CodeWiki and use simple language over backend jargon.

The UI is local by default. It runs against the current repository on `127.0.0.1`, reads and mutates CodeWiki through the same source-backed API semantics used by adapters, and must not require hosted infrastructure, accounts, or internet access.

Cold archive data should not appear by default. Closed task history, old pass validations, archive refs, restore indexes, and expanded historical graph edges should appear only when the user explicitly asks to restore, inspect archives, audit historical work, or refine past work.

## Layout model

The CodeWiki UI should use a simple ASCII-like header-and-workspace layout:

```text
header: CodeWiki / repo + top navigation: Status | KB | Board | Map | Sessions
header right: http://127.0.0.1:<port>/ + settings cog
workspace: selected section content, fast lists, cards, maps, and inline detail cards
advanced/source disclosure: collapsed source paths, raw Markdown, JSON, builds, validation, and graph records
```

The UI should not have a persistent left rail, persistent right inspector/sidebar, or bottom status line. Section content should stand on its own without repeated page titles and one-line explanatory subtitles. Breadcrumbs or compact context labels are appropriate only when they help orientation.

Top-level navigation is `Status`, `KB`, `Board`, `Map`, and `Sessions`. `Settings` is opened from the header cog. `Knowledge`, `Product`, `System`, `Graph`, `Leases`, `Builds`, `Validation`, and `Diff` are not permanent first-level navigation labels in the user UI.

Selected detail should appear inline as ASCII-like cards near the list, diagram, board, or map item that produced it. Raw source paths and backend payloads remain available in collapsed advanced/source disclosure.

## Status

`Status` is the current-state detail page. It should focus on what is true now and what needs attention next.

Status should show high-signal current state such as repository health, branch/commit when available, active task or sprint focus, next safe action, open/recent work counts, active session or lease warnings, gate/blocker counts, stale/drift count, and latest validation/check signal when available.

Status should avoid duplicating whole roadmap, graph, session, gate, build, validation, or diff-table surfaces. Health and drift are consequences of underlying work and knowledge state; detailed relationships belong in `Map`, work belongs in `Board`, and active coordination belongs in `Sessions`.

## KB

`KB` is the single top-level knowledge section. It combines Product and System knowledge behind a drilldown instead of exposing Product and System as separate top-level navigation items.

The KB landing should offer a Product/System switch or fast drilldown:

- Product KB answers what users need, which stories express those needs, and which UI surfaces support those outcomes.
- System KB answers how the project works through source-backed components, relationships, diagrams, and implementation contracts.

Raw Markdown files remain the source of truth, but raw Markdown should not be the default experience. Every displayed fact should link back to source paths through collapsed source disclosure.

### Product KB

Product KB should default to two fast selectable lists:

- Stories, with acceptance/success signals and linked UI surfaces.
- UI Surfaces, with purpose, supported stories, and current implementation evidence.

Users/personas remain important as contextual evidence, filters, and supporting cards after a story or UI surface is selected. They should not compete with Stories and UI Surfaces as primary default categories.

Focused detail should render as ASCII-like cards showing purpose, user value, related stories/surfaces, source links, and relevant roadmap/evidence connections.

### System KB

System KB should use ASCII-like diagrams and cards for source-backed system understanding. It reads component docs from `.codewiki/kb/system/*.md` and diagram raw data from `.codewiki/kb/system/diagrams/**`.

The five core project diagrams are:

| Diagram | Purpose | Canonical raw format | Preferred rendering |
| --- | --- | --- | --- |
| Context map | Show users, access surfaces, external systems, and project boundary. | YAML graph spec with actors, systems, and relationships. | ASCII-like graph/cards or Mermaid flowchart. |
| Component/container map | Show major runtime components, adapters, data stores, and dependency direction. | YAML graph spec with groups, nodes, edges, and source docs. | ASCII-like graph/cards or Cytoscape/custom SVG. |
| Key flow sequence | Show the most important user/agent workflow end to end. | YAML sequence spec with participants and ordered messages. | ASCII-like sequence cards or Mermaid sequence diagram. |
| Data/domain model | Show durable entities, generated state, evidence, and ownership. | YAML entity-relationship spec with entities and relationships. | ASCII-like ER cards or Mermaid ER/custom ER renderer. |
| State/lifecycle map | Show task, compiler, validation, build, or release lifecycles. | YAML state-machine spec with states, transitions, and gates. | ASCII-like state cards or Mermaid state diagram. |

YAML is canonical because it is easier for agents to read, edit, diff, and validate than dense diagram DSL. Mermaid, Cytoscape data, or SVG should be renderer targets unless a task explicitly promotes a renderer-specific file to canonical truth.

Diagram rendering must preserve readable spacing, route edges around node boxes, draw edges behind nodes, and avoid stacked or overlapping labels, arrows, and components. Selecting a component, edge, sequence step, entity, or state should open a detail card near the diagram.

## Board

`Board` shows roadmap work as a retro terminal Kanban board. It remains the primary view for active tasks, sprint scope, gates, blockers, acceptance criteria, closure evidence, and next actions.

The Board landing should group work into a small number of source-backed lanes such as `Now`, `Ready`, `Blocked`, and `Gate/Done recent`. Lane assignment must be deterministic from roadmap status, active focus, blockers, validation gates, content-proof gates, and recent closure evidence rather than UI-only state.

Cards should show outcome, status, gate/blocker cues, acceptance target, and next safe action before raw task metadata. Roadmap work is work truth, not a requirements brief; full product and system intent should live in KB docs and accepted builds.

## Map

`Map` replaces user-facing `Graph` language. It visualizes relationships from `.codewiki/index_graph.json`, but should default to decision and KB relationships rather than the entire generated graph.

The default Map should emphasize how product docs, system docs, roadmap tasks, builds, validation, tests, and code paths relate to each other for the current working set. Broader graph slices, artifact kinds, build DAGs, stale links, drift, and debug records should be secondary controls.

Selecting a node or edge should show an inline detail card with source paths, relationship reason, freshness state, and the smallest useful next reads. The Map is an inspection and navigation surface; canonical edits still flow through CodeWiki API operations and compiler loops.

## Sessions

`Sessions` is the user-facing view over runtime coordination. It should focus on active work sessions, coordination state, and conflicts instead of lease internals.

Sessions should show active agents or runs, associated task/build refs, scoped areas being touched, age/heartbeat when available, conflicts, waits, and safe resume or unblock actions. Lease ids, raw lease records, wait-entry internals, and runtime paths remain advanced/source detail.

## Settings

The header settings cog opens repo-backed user preferences. It should not appear as a primary navigation section and should not present `.codewiki/config.json` as a file map by default.

The Settings experience should group options into useful user-facing categories such as project identity, UI preferences, roadmap retention, generated views, lint/policy, gateway safety, runtime/rebuild, agency budgets, and archival behavior. Each row should show current value, short purpose, editability cue, and source-backed detail.

The first implementation may be read-only. Future edits must route through explicit API-backed actions with validation and policy checks. The UI must not create hidden browser-local durable preferences; browser state is only for temporary view state such as selected tab, collapse, zoom, or scroll.

Source paths and backend option paths may appear under advanced detail.

## Detailed expectations

Additional detailed expectations continue in [CodeWiki UI Details](control-room-details.md).

## Related docs

- [CodeWiki UI Details](control-room-details.md)
- [Board](board.md)
- [Status Panel](status-panel.md)
