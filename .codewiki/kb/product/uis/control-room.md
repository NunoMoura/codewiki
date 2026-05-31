---
id: spec.product.uis.control-room
title: Deprecated Browser CodeWiki UI
state: deprecated
summary: Deprecated browser Control Room product contract retained temporarily during terminal-first migration.
owners:
  - product
  - design
updated: "2026-05-31"
---

# Deprecated Browser CodeWiki UI

The standalone browser CodeWiki UI / Control Room is deprecated. Product UX direction is now terminal-first: agent chat, Pi TUI panels, and focused `/wiki-*` commands.

The active replacement contract is [Terminal UI](terminal.md). Browser-specific Board, Map, KB, Sessions, local server, and URL launcher expectations should be removed or archived through a validated cleanup task.

## Retained intent

Some product intent from the browser UI remains valid in terminal form:

- users need compact current state,
- views should be source-backed,
- roadmap work should render as board/cards,
- graph relationships should appear as focused maps/traces,
- sessions/runtime state should use user-friendly language,
- source paths and raw payloads should be available as advanced detail.

The implementation target changes from browser pages to terminal panels and command output.

## Non-goals

- Do not add new browser UI features.
- Do not migrate deprecated web UI rendering to new diagram contracts unless needed for safe removal.
- Do not make browser-local state part of CodeWiki truth.

## Related docs

- [Terminal UI](terminal.md)
- [Status Panel](status-panel.md)
- [Board](board.md)
- [Map Navigation](graph-navigation.md)
- [Terminal UI System Contract](../../system/terminal-ui.md)
