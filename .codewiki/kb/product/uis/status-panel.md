---
id: spec.product.uis.status-panel
title: Status Panel UI
state: active
summary: Product expectations for compact host status, launch, and fallback CodeWiki navigation.
owners:
  - product
  - design
updated: "2026-05-16"
code_paths:
  - src/adapters/pi/ui
code_paths_mode: explicit_override
---

# Status Panel UI

The status panel is the compact host-native status and fallback navigation surface for CodeWiki. The standalone [CodeWiki UI](control-room.md) is the primary rich visual product surface. The status panel should summarize health, focus, next action, gated agency state, task status, evidence, and resume guidance while staying small enough to coexist with host surfaces.

The current Pi visual surface opens with `Alt+W`. Future host-native panels should preserve the same compact status semantics even when their shortcut, panel system, or rendering framework differs.

The status panel should also make the browser CodeWiki UI launch path discoverable when the host can open or print a local URL.

The status panel header shows only the repo name or compact repo context. Its user-facing sections should mirror the simplified second-screen CodeWiki UI model:

- Status — compact health, focus, current-state metrics, gates, blockers, drift/staleness counts, and next action.
- KB — source-backed summaries of product stories, UI surfaces, users/personas as context, system components, and diagrams.
- Board — tracked roadmap work, sprint/task scopes, task status/detail navigation, gates, and closure evidence.
- Map — docs/KB relationships first, with scoped roadmap/task graph slices, build links, drift, and reconciliation cues as secondary detail.
- Sessions — active sessions, scoped coordination, waits/conflicts, and safe resume/unblock cues over raw lease internals.

The panel should not expose Product, System, Graph, Leases, Knowledge, Builds, Validation, Diff, or Settings as permanent first-level tabs. Those details should appear only when relevant to the current selection, pending decision, gate, source detail, or chat workflow. Settings stays in the browser UI header cog or host-specific configuration affordance.

## Success signals

- Users can open a compact host-native status surface for health, inferred delta, gates, and tracked work.
- Users can see what needs attention without reading generated JSON.
- Status stays small and does not duplicate the agent chat or standalone browser UI.
- KB routes to canonical product and system knowledge rather than hidden UI-only truth.
- Board focuses on roadmap work and closure evidence.
- Map focuses on KB/docs relationships before broader graph internals.
- Sessions uses active-session language while preserving lease/source detail as advanced context.
- Decision diff rows remain available when pending, but do not become a permanent navigation destination.
- The panel can act as a launcher or fallback for the standalone CodeWiki UI.
- Visual status reads graph-backed relationships, runtime pending diff tables, session queue coordination, and roadmap work truth instead of duplicating them.

## Related docs

- [Maintainers](../users/maintainers.md)
- [CodeWiki UI](control-room.md)
- [Board UI](board.md)
- [Map Navigation UI](graph-navigation.md)
- [CodeWiki UI System Component](../../system/control-room-ui.md)
- [Extension](../../system/extension.md)
