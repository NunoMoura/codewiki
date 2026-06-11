---
id: spec.system.control-room-ui
title: Deprecated Browser UI
state: deprecated
summary: Deprecated standalone browser Control Room contract retained temporarily as migration evidence; terminal UI is the active UX direction.
owners:
  - architecture
  - engineering
updated: "2026-06-01"
code_paths:
  - src/adapters/pi/commands/ui.ts
  - src/adapters/pi/commands/status.ts
code_paths_mode: explicit_override
---

# Deprecated Browser UI

The standalone browser CodeWiki UI / Control Room is deprecated. New UX work should target Pi TUI panels, chat-native visual output, and focused `/wiki-*` terminal commands documented in [Terminal UI and Agent Visual Language](terminal-ui.md).

This document remains temporarily to preserve migration context and references until the web UI removal task deletes or archives browser-specific code and docs.

## Deprecated scope

Deprecated browser-specific source scope has been removed. The remaining migration surface is:

- `/wiki-ui` as a deprecation shim that points to Pi-hosted commands,
- historic/deprecated browser product docs retained as migration evidence,
- immutable historic builds, validation reports, and archive refs that mention the old browser UI.

## Replacement direction

Terminal UX should provide source-backed visual views through Pi chat, Pi TUI panels, and command-triggered outputs:

- status summaries,
- roadmap boards,
- diagram views from canonical YAML,
- trace chains from graph/build/validation refs,
- runtime Brain lease/job/block views,
- decision row cards.

Rendered terminal output is not canonical truth. Canonical truth remains in KB docs, roadmap state, builds, validation reports, source code/tests, generated views, runtime/session state, and Git proof.

## Migration rules

- Do not migrate deprecated web UI code to new diagram or graph contracts unless required for a removal-safe compatibility step.
- Remove browser code/docs through a validated roadmap task with tests and package proof.
- Keep immutable historical builds/validation/archive refs intact.
- If shareable diagram exports are needed later, generate them from canonical YAML/generated view state into generated/export paths, not KB source-truth paths.

## Related docs

- [Terminal UI and Agent Visual Language](terminal-ui.md)
- [Extension](extension.md)
- [API](api.md)
- [System Diagram Raw Data](diagrams/README.md)
