---
id: spec.product.uis.control-room.details
title: CodeWiki UI Details
state: active
summary: Detailed product expectations for CodeWiki UI interactions, source disclosure, visual style, and acceptance.
owners:
  - product
  - design
updated: "2026-05-14"
code_paths:
  - src/ui/web
  - src/adapters/pi/commands
---

# CodeWiki UI Details

This document continues [CodeWiki UI](control-room.md) with lower-priority detail so the primary UI contract stays compact.


## Style

The CodeWiki UI should feel like an ASCII-like terminal command center while staying browser-native, readable, keyboard-friendly, and accessible. Use dark surfaces, monospace typography, muted green base tones, off-white highlights, amber/gold accents, crisp terminal borders, and red only for errors or destructive states. Do not depend on cyan/blue highlights. Visual nostalgia must not reduce legibility, spacing, or canvas usability.

## Multi-computer behavior

The default multi-computer model is git-synchronized local state. Each computer runs a local CodeWiki UI against its repo clone; durable truth syncs through git, while runtime session state stays local unless summarized into session queue records, task evidence, builds, validation reports, or commits.

Optional shared server mode must be explicit, token-protected, and disabled by default.

## Success signals

- The second screen complements agent chat with `Status`, `KB`, `Board`, `Map`, `Sessions`, and a header settings cog.
- Header navigation replaces left rail; no persistent right inspector/sidebar or bottom status line remains.
- The header right shows only the local URL and settings icon.
- Product and System knowledge live under `KB` with Product/System drilldown.
- Product KB defaults to Stories and UI Surfaces, with users/personas disclosed contextually.
- System KB uses ASCII-like diagrams/cards and avoids overlapping labels, arrows, and components.
- Board remains a Trello-like Kanban board while matching the ASCII-like style.
- Map defaults to KB/docs relationships, with broader graph data secondary.
- Sessions uses user-friendly active-session language over lease internals.
- Settings represents repo-backed preferences, with source paths and backend keys in advanced detail only.
- The UI is local, accessible, source-linked, and does not replace compiler loops or agent chat.

## Non-goals

- No hosted SaaS, hidden durable browser preferences, full terminal emulation, raw artifact walls, direct graph edits, direct canonical graph edits, or replacement for compiler loops, validation gates, scoped coordination, and agent chat.

## Related docs

- [Status Panel UI](status-panel.md)
- [Map Navigation UI](graph-navigation.md)
- [Board UI](board.md)
- [CodeWiki UI System Component](../../system/control-room-ui.md)
- [CodeWiki API](../../system/api.md)
- [Adapters](../../system/adapters.md)
- [Graph](../../system/graph.md)
- [System diagram raw data](../../system/diagrams/README.md)
