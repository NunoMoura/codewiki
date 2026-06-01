---
id: spec.system.terminal-ui
title: Terminal UI and Agent Visual Language
state: active
summary: Terminal-first CodeWiki UX contract for Pi TUI panels, command-triggered views, and source-backed ASCII/Unicode visual rendering.
owners:
  - architecture
  - design
updated: "2026-06-01"
diagram_refs:
  - component-map:extension
  - component-map:api
  - component-map:graph
---

# Terminal UI and Agent Visual Language

CodeWiki is terminal-first. Pi chat, Pi TUI panels, and explicit `/wiki ...` commands are the primary user experience today. Richer Pi TUI design is future work; browser UI code is deprecated and should not receive new product investment.

The terminal UI is not a separate truth system. It renders source-backed views from `.codewiki/kb/**`, roadmap state, builds, validation reports, session/runtime state, generated graph lenses, and immutable content evidence. Rendered ASCII, Unicode, Mermaid, SVG, HTML, PNG, Cytoscape JSON, or future terminal snapshots are not canonical truth.

## Commercial fit

CodeWiki users are maintainers, agents, extension authors, workflow authors, and future technical integrations. They operate inside coding harnesses, terminals, WSL, SSH, CI, and local repositories. Terminal-native UX reduces context switching, works headlessly, is easy to copy into chat/PRs/issues, and matches CodeWiki's role as a repo-local software development OS for agents.

The product should not compete as a browser dashboard. CodeWiki should win by making repository intent, work state, orchestration, drift, and validation evidence visible inside the developer's active terminal.

## Command-triggered surfaces

Terminal UX should be specific and task-oriented rather than one large app:

| Command family | Purpose |
| --- | --- |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield repository through command-adapter backend setup/bootstrap calls. |
| `/wiki status` | Compact developer-facing project state: health, active focus, next action, blockers, validation signal, automation readiness, and source refs. |
| `/wiki resume` | Continue from the last known stable state using CodeWiki source refs and context-boundary evidence. |
| `/wiki config` | Render CodeWiki preferences/configuration choices for user selection in the TUI. |
| `/wiki system <diagram type>` | Render a canonical system diagram. The user can toggle components or flows, see the selected item highlighted in ASCII/Unicode, and press Enter to open the corresponding component/flow Markdown source. |
| `/wiki product` | Navigate product knowledge. The user can choose overview or users; overview opens the product overview source, while users can be selected and their stories toggled before opening the corresponding KB source. |

Existing hyphenated commands and standalone compatibility commands are migration shims only. Internal tools such as `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_gate`, and `wiki_runtime` remain semantic APIs for agents and adapters. Terminal commands call API/backend capabilities; they do not own source truth.

## Visual grammars

Agents and TUI panels should use a small set of visual grammars:

| Grammar | Best for | Notes |
| --- | --- | --- |
| `card` | Status, config choices, selected product/system item. | Shows concise fields and source refs. |
| `tree` | Product navigation, file structure, ownership, nested docs, focused dependency paths. | Shows source paths and drift badges. |
| `sequence` | Key flows, compiler/runtime steps, system flows. | Prefer vertical steps when terminal width is small. |
| `state` | Lifecycle, gateway, task, runtime job states. | Show allowed transitions and current state. |
| `layered_graph` | System diagrams and component maps. | Use lanes/groups and small node counts only. |
| `trace_chain` | Validation and vertical alignment. | Decision → planning → implementation → validation → content evidence. |
| `matrix` | Drift, acceptance mapping, row resolution, linter/validation summaries. | Good for compact comparisons. |

The renderer should use Unicode box drawing by default and ASCII fallback when needed.

## Focus rule

The terminal must not render the full generated graph by default. Full graph views are too dense for users and agents. Render focused lenses instead:

- current task or sprint,
- selected system diagram node/flow plus direct neighbors,
- selected product user/story path,
- selected trace chain,
- selected blocker/question,
- drift category with affected refs,
- summarized omitted counts.

When a view omits data, it should say how much was omitted and which command or source ref expands it.

## System diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated graph lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- file-structure maps render as trees,
- data models render as entity cards plus relation lists.

`/wiki system <diagram type>` should let the user move through components or flows, highlight the selected item, and open the linked Markdown explanation on Enter. Large arbitrary graph rendering is a non-goal. If a diagram is too dense, the terminal should ask for focus or render a summary with top-level groups.

## Product navigation rendering

`/wiki product` should make product knowledge browsable without exposing raw folder structure first. The top-level choice is:

- overview,
- users.

Choosing overview opens or renders `.codewiki/kb/product/overview.md`. Choosing users lets the user select a user and toggle through that user's stories. Pressing Enter opens or renders the corresponding product KB Markdown file. The TUI may use tree, card, and matrix grammars, but source Markdown remains canonical.

## Agent visual expression

Agents may draw small diagrams in chat when it improves understanding. A CodeWiki visual skill should teach agents when to use `card`, `tree`, `sequence`, `state`, `layered_graph`, `trace_chain`, and `matrix` patterns. Deterministic renderer code should handle source-backed layouts for commands and TUI panels.

Do not create a broad `wiki_visualize` mega-tool. Prefer specific commands and `wiki_state` graph lenses with render options once the backend surface is ready.

## Removal boundary for web UI

The standalone browser Control Room is deprecated. Cleanup now removes active browser source and keeps only migration evidence:

- `src/ui/web/**` removed,
- `/wiki-ui` converted to a temporary deprecation message,
- browser Control Room tests removed,
- browser UI product/system docs retained only as deprecated migration evidence,
- browser-only dependencies removed after package tests prove they are unused.

If shareable non-terminal output is needed later, generate explicit exports such as Markdown reports, Mermaid, or SVG from canonical YAML/graph state. Those exports are artifacts, not product UI source truth.

## Related docs

- [API vNext Tool Surface](api-vnext-tools.md)
- [CodeWiki API](api.md)
- [Extension](extension.md)
- [Graph](graph.md)
- [System Diagram Raw Data](diagrams/README.md)
