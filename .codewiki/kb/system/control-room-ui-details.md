---
id: spec.system.control-room-ui.details
title: Deprecated Browser UI Implementation Details
state: deprecated
summary: Deprecated browser UI implementation details retained temporarily during terminal-first migration.
owners:
  - architecture
  - engineering
updated: "2026-05-31"
---

# Deprecated Browser UI Implementation Details

This document is deprecated with the standalone browser CodeWiki UI. Active terminal-first UX detail belongs in [Terminal UI and Agent Visual Language](terminal-ui.md).

The previous browser-specific requirements for graph rendering, local server assets, browser Settings, browser Sessions, and header navigation should not guide new implementation work. They remain only as migration evidence after removal of `src/ui/web/**`, browser tests, and browser-only dependencies.

## Principles retained for terminal UX

The following principles remain valid:

- views are source-backed and do not create hidden truth,
- raw payloads and source paths are available as advanced detail,
- sessions/runtime state is presented in user-friendly language,
- settings/config changes route through explicit API use cases,
- visual outputs complement agent chat and compiler loops,
- renderer output is never canonical truth.

## Related docs

- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Deprecated Browser UI](control-room-ui.md)
- [Terminal UI Product Spec](../product/uis/terminal.md)
- [API](api.md)
- [Adapters](adapters.md)
- [Extension](extension.md)
- [Graph](graph.md)
