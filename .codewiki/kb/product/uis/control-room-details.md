---
id: spec.product.uis.control-room.details
title: Deprecated Browser UI Details
state: deprecated
summary: Deprecated detailed browser UI expectations retained temporarily during terminal-first migration.
owners:
  - product
  - design
updated: "2026-05-31"
code_paths:
  - src/ui/web
  - src/adapters/pi/commands
code_paths_mode: explicit_override
---

# Deprecated Browser UI Details

This browser-specific detail document is deprecated. New UX detail belongs in [Terminal UI](terminal.md) and [Terminal UI and Agent Visual Language](../../system/terminal-ui.md).

The previous browser style, local server, header navigation, and second-screen expectations should not drive new implementation work. Remove or archive this document with the web UI cleanup task after product/system references are updated.

## Still-valid principles

The following principles remain valid for terminal UX:

- source-backed views,
- compact cards and panels,
- readable monospace visuals,
- no hidden UI-only durable truth,
- advanced/source disclosure for raw refs,
- visual outputs that complement agent chat rather than replacing compiler loops.

## Related docs

- [Terminal UI](terminal.md)
- [Deprecated Browser CodeWiki UI](control-room.md)
- [Terminal UI System Contract](../../system/terminal-ui.md)
