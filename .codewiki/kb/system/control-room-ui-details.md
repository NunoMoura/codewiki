---
id: spec.system.control-room-ui.details
title: CodeWiki UI Implementation Details
state: active
summary: Detailed system expectations for CodeWiki UI Map, Sessions, Settings, source disclosure, styling, and security.
owners:
  - architecture
  - engineering
updated: "2026-05-16"
code_paths:
  - src/ui/web
  - src/adapters/pi/commands
---

# CodeWiki UI Implementation Details

This document continues [CodeWiki UI](control-room-ui.md) with lower-priority detail so the primary UI contract stays compact.


Selecting a node or edge should open an inline detail card with source paths, relationship reason, freshness state, and smallest useful next reads. The Map is generated inspection state, not canonical truth; every node or edge detail should link back to canonical files when available.

The first rich graph renderer may remain Cytoscape.js, served from the installed `cytoscape` npm package through the local CodeWiki UI server. The browser UI must not depend on a CDN. If the local vendor asset cannot be loaded, the Map should show a clear renderer-unavailable error instead of silently rendering an empty canvas.

## Sessions contract

`Sessions` is the user-facing view over runtime coordination. It should focus on active sessions and coordination status instead of lease internals.

The Sessions read model should derive from session queue leases, waits, focused task/session metadata, build refs, branch/commit data when available, and last-seen/heartbeat data when available. It should show active agents or runs, associated task/build refs, touched scopes, conflicts, waits, age, and safe resume/unblock actions.

Lease ids, wait-entry internals, raw runtime files, and coordination records remain available in advanced/source disclosure.

## Settings contract

The web CodeWiki UI exposes Settings through a header-right cog. The cog opens an in-app preferences page or panel; it does not add `Settings` back to primary navigation.

Settings should derive from `.codewiki/config.json` but present repo-backed user preferences rather than a file-path map. Options should be grouped into useful categories such as project identity, UI preferences, roadmap retention and archive policy, generated files and view roots, lint policy, gateway safety, runtime/rebuild settings, agency budgets and parallelism, and archival/garbage-collection behavior.

Each row should include current value, category, short purpose, editability cue, and source-backed advanced detail. Source path and backend option path should be available under advanced detail only. The first implementation can be read-only; future safe edits must route through explicit API use cases with validation and policy checks.

The UI must not create hidden durable browser preferences. Browser state is only for temporary view state such as selected tab, collapse state, zoom, or scroll.

## Contextual detail contract

The UI may expose detailed artifacts contextually:

- Knowledge appears through KB cards, Map nodes, inline detail cards, and source links.
- Builds appear through Board/Map evidence links and compiler handoff summaries.
- Validation appears through Board gates, Map relationships, inline warnings, and source links.
- Diff rows appear only when a pending decision needs explicit action.
- Settings appear through the header cog, command palette, or maintenance actions.

These details should not create hidden UI-only truth or permanent first-level destinations. Contextual detail should lead with user-value fields such as purpose, alignment, evidence, warnings/gates, and next safe action; source paths and raw payloads should be available but collapsed by default.

## Session and multi-computer model

Local sessions should identify their harness, machine, repository root, branch, commit, active task, lease ids, and last-seen timestamp when this information is available. The UI may display these values, but durable coordination must continue to flow through git, session queue scoped leases, task evidence, builds, and validation reports.

Multiple computers using separate clones synchronize durable truth through git. Runtime session history remains local unless it is intentionally summarized into CodeWiki artifacts.

## Boundaries

Browser UI and local web-server code under `src/ui/**` must not import Pi SDK/TUI packages, depend on hosted CDNs, hand-edit generated graph state, create hidden truth for builds/validation/diff/settings, or turn the package into a hosted service. Pi launch commands stay in the Pi adapter; future CLI/MCP launch surfaces should live in their own adapters. Domain and application layers remain browser/UI agnostic.

## Success signals

- The local browser CodeWiki UI launches from the repo and keeps rich UI semantics harness-agnostic.
- Header navigation is `Status`, `KB`, `Board`, `Map`, and `Sessions`; no persistent left rail remains.
- No persistent right inspector/sidebar or bottom status line is required for default use.
- Product and System knowledge live under KB with Product/System drilldown.
- Product KB defaults to Stories and UI Surfaces while disclosing users/personas contextually.
- System KB uses ASCII-like diagrams/cards and avoids stacked or overlapping diagram rendering.
- Board renders roadmap work as a retro terminal Kanban board backed by roadmap truth.
- Map defaults to KB/docs relationships and keeps broader graph data secondary.
- Sessions presents active-session coordination while keeping lease internals advanced.
- Settings is available through the header cog and maps repo-backed preferences without hidden UI truth.
- Detail artifacts stay contextual and do not create first-level navigation noise.

## Related docs

- [CodeWiki UI Product Spec](../product/uis/control-room.md)
- [Status Panel UI](../product/uis/status-panel.md)
- [Map Navigation UI](../product/uis/graph-navigation.md)
- [System diagram raw data](diagrams/README.md)
- [API](api.md)
- [Adapters](adapters.md)
- [Extension](extension.md)
- [Graph](graph.md)
