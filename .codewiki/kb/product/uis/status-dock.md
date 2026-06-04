---
id: spec.product.uis.status-dock
title: Deprecated Status UI
state: deprecated
summary: Deprecated status panel/dock expectations retained only as historical context.
owners:
  - product
  - design
updated: "2026-06-04"
code_paths:
  - src/adapters/pi/ui
code_paths_mode: explicit_override
---

# Deprecated Status UI

Status panel and status dock product surfaces are deprecated. Do not add product behavior, tests, or roadmap acceptance for this UI surface unless a future accepted decision reactivates it.

Backend state remains available through `wiki_state`, graph lenses, roadmap/task state, lifecycle traces, and validation reports. Status UI commands are deprecated and should not be promoted as user entrypoints.
