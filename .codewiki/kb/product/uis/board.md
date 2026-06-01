---
id: spec.product.uis.board
title: Board UI
state: active
summary: Product expectations for visual roadmap work, gated agency, approvals, and next-action visibility.
owners:
- product
- design
updated: '2026-05-16'
code_paths:
- src/adapters/pi/ui/manager.ts
- src/adapters/pi/commands
code_paths_mode: explicit_override
---

# Board UI

The Board UI should make roadmap work, inferred delta, approvals, gates, blockers, and next actions visible before users inspect raw machine state files. In terminal-first CodeWiki it is a Pi TUI or command-triggered roadmap/work view; in compact status panels it may remain a summary.

The standalone Board should feel like a Trello-like retro terminal Kanban board, not a backend task dump. The default workspace should group work into a small set of readable lanes such as `Now`, `Ready`, `Blocked`, and `Gate/Done recent`. Lane membership must be derived from roadmap truth, active focus, blockers, validation/content-proof gates, and recent closure evidence. The UI must not create hidden Kanban state.

Board should be available as a focused terminal view, for example `/wiki board`, rather than as browser header navigation. Its visual style should use clear monospace cards, terminal borders, compact cues, and inline details.

Roadmap work is work truth, not a requirements brief. Planning notes, drift findings, architecture candidates, validation failures, and implementation follow-ups should become structured work items or evidence instead of scattered prose buckets. Full intent and implementation specifications should live in accepted builds and linked KB docs.

Cards should surface the user's decision-relevant information first: outcome, current lane/status, blocker or gate, acceptance target, and next safe action. IDs, raw source paths, full verification lists, build payloads, validation records, and graph records remain available through contextual source/evidence disclosure instead of dominating the default card.

## Success signals

- Users can read the Board as a Kanban-like map of current work without understanding roadmap JSON.
- Board is visually coherent with the ASCII-like CodeWiki UI.
- Users can resume implementation from tracked roadmap focus.
- Users can see which token, time, risk, validation, policy, or approval gate limits agent autonomy.
- Decision gates are visible when approval or clarification is needed.
- Board labels remain user-friendly while backend data remains roadmap/work based.
- Cards show outcome, lane/status, blocker/gate cues, acceptance target, and next safe action before raw metadata.
- Roadmap items link to decision builds, specs, outcome, acceptance criteria, non-goals, validation expectations, and implementation evidence.

## Related docs

- [Use Gated Agency](../stories/automation.md)
- [Terminal UI](terminal.md)
- [Status Panel UI](status-panel.md)
- [Roadmap](../../system/roadmap.md)
- [Builds](../../system/builds.md)
