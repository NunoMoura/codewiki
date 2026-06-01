---
id: spec.product.uis.terminal
title: Terminal UI
state: active
summary: Product expectations for Pi TUI, chat-native visual explanations, and command-triggered CodeWiki terminal surfaces.
owners:
  - product
  - design
updated: "2026-06-01"
code_paths:
  - src/adapters/pi/ui
  - src/adapters/pi/commands
code_paths_mode: explicit_override
---

# Terminal UI

The Terminal UI is CodeWiki's primary visual product surface. Users interact through agent chat, Pi TUI panels, and focused `/wiki ...` commands. Browser UI is deprecated and should not be the target for new UX work.

CodeWiki should feel like an agent-native development OS inside the terminal: compact, source-linked, visual enough to explain state, and strict about truth boundaries.

## User value

Maintainers and agents should be able to understand current state without opening a browser, reading generated JSON, or loading the whole repository into context.

The terminal should help users answer:

- What is true now?
- What changed?
- What is blocked?
- What should run next?
- Which decision, task, build, validation, and content evidence support this state?
- What should the agent ask before acting?

## UX model

Terminal UX should be command-triggered and focused:

```text
/wiki bootstrap
/wiki status
/wiki resume
/wiki config
/wiki system component-map
/wiki system key-flow
/wiki product
```

The default output should fit in a normal terminal pane and link to source refs. Expanded detail should be explicit.

## Command expectations

| Command | User expectation |
| --- | --- |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield project. |
| `/wiki status` | Show the most important developer-facing state: health, focus, blockers, next action, validation signal, automation readiness, and source refs. |
| `/wiki resume` | Let the agent continue from the last known stable state. |
| `/wiki config` | Render preferences/configuration choices for selection. |
| `/wiki system <diagram type>` | Render a system diagram, let the user toggle components/flows, highlight the selected item in ASCII/Unicode, and open the corresponding `.md` source on Enter. |
| `/wiki product` | Let the user choose overview or users; overview opens the overview source, while users can be selected and their stories toggled before opening the corresponding product KB source. |

Workflow phases such as decide, plan, implement, gate, and runtime are agent/tool phases that users can request in chat. They are not primary slash-command names in the target UX.

## Visual style

Use compact terminal-native visuals:

- cards,
- tables,
- trees,
- sequence steps,
- state transitions,
- trace chains,
- focused diagrams.

Use Unicode box drawing by default and ASCII fallback when needed. Visuals should be copyable into chat, PRs, issues, and validation reports.

## Diagram expectations

Terminal diagrams should not try to render the entire generated graph. They should render focused views from canonical YAML diagrams and graph lenses.

Architecture and component maps should default to grouped lanes or selected-node neighborhoods. File-structure maps should render as trees. Key flows should render as ordered steps. State lifecycle diagrams should render current state plus transitions. Data models should render entity cards plus relationships.

When a diagram is too large, show a summary, omitted count, and focus options instead of drawing unreadable ASCII spaghetti.

## Product navigation expectations

`/wiki product` should make product knowledge browsable without first exposing raw paths. The first choice is overview or users. Overview renders `.codewiki/kb/product/overview.md`; users renders selectable user cards and story toggles, then opens the linked user or story Markdown file on Enter.

## Success signals

- Users can operate CodeWiki without the browser UI.
- Agents can express state visually with source-backed diagrams, not only prose.
- Terminal views show source refs and never create hidden UI-only truth.
- Status, system, product, config, resume, and bootstrap views are understandable in chat/terminal output.
- Full graph complexity is hidden behind focused lenses.
- Browser UI docs/code can be removed without losing core product value.

## Non-goals

- No standalone browser dashboard as active product direction.
- No full raw graph renderer by default.
- No hidden terminal-only workflow state.
- No renderer output as canonical truth.
- No broad visualization mega-tool replacing phase-specific CodeWiki capabilities.

## Related docs

- [Status Panel](status-panel.md)
- [Board](board.md)
- [Map Navigation](graph-navigation.md)
- [Terminal UI System Contract](../../system/terminal-ui.md)
- [API](../../system/api.md)
