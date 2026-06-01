---
id: spec.system.terminal-ui
title: Terminal UI and Agent Visual Language
state: active
summary: Terminal-first CodeWiki UX contract for Pi TUI panels, command-triggered views, and source-backed ASCII/Unicode visual rendering.
owners:
  - architecture
  - design
updated: "2026-05-31"
diagram_refs:
  - component-map:extension
  - component-map:api
  - component-map:graph
---

# Terminal UI and Agent Visual Language

CodeWiki is terminal-first. Pi chat and explicit `/wiki-*` commands are the primary user experience today. Richer Pi TUI design is future work; browser UI code is deprecated and should be removed through a validated cleanup task.

The terminal UI is not a separate truth system. It renders source-backed views from `.codewiki/kb/**`, roadmap state, builds, validation reports, session/runtime state, generated graph lenses, and Git proof. Rendered ASCII, Unicode, Mermaid, SVG, HTML, PNG, Cytoscape JSON, or future terminal snapshots are not canonical truth.

## Commercial fit

CodeWiki users are maintainers, agents, extension authors, workflow authors, and future technical integrations. They operate inside coding harnesses, terminals, WSL, SSH, CI, and local repositories. Terminal-native UX reduces context switching, works headlessly, is easy to copy into chat/PRs/issues, and matches CodeWiki's role as a repo-local software development OS for agents.

The product should not compete as a browser dashboard. CodeWiki should win by making repository intent, work state, orchestration, drift, and validation proof visible inside the developer's active terminal.

## Command-triggered surfaces

Terminal UX should be specific and task-oriented rather than one large app:

| Command family | Purpose |
| --- | --- |
| `/wiki status` | Compact project health, active focus, next action, drift, blockers, and latest gate signal. |
| `/wiki board` | Roadmap lanes/cards from roadmap truth, gates, blockers, and closure evidence. |
| `/wiki diagram <name>` | Render a canonical YAML diagram as a terminal view. |
| `/wiki diagram <name> --focus <id>` | Render selected node/entity/state/step plus neighbors and source refs. |
| `/wiki trace <ref>` | Render decision → planning → task → implementation → validation → Git proof chains. |
| `/wiki runtime` | Render Brain lease, jobs/runs, worker questions, block/unblock, and model policy state. |
| `/wiki decide` | Render pending decision rows as terminal cards with approve/edit/reject/defer actions. |

Existing tools such as `wiki_state`, `wiki_resume_context`, `wiki_audit`, `wiki_gateway`, `wiki_roadmap`, `wiki_build`, and `wiki_runtime`-style future workflow capabilities remain semantic APIs. Terminal commands call those capabilities; they do not own source truth.

## Visual grammars

Agents and TUI panels should use a small set of visual grammars:

| Grammar | Best for | Notes |
| --- | --- | --- |
| `board` | Roadmap and sprint state. | Deterministic lanes such as Now, Ready, Blocked, Gate/Done recent. |
| `tree` | File structure, ownership, nested docs, focused dependency paths. | Shows source paths and drift badges. |
| `sequence` | Key flows, handoffs, compiler/runtime steps. | Prefer vertical steps when terminal width is small. |
| `state` | Lifecycle, gateway, task, runtime job states. | Show allowed transitions and current state. |
| `layered_graph` | Architecture and component maps. | Use lanes/groups and small node counts only. |
| `trace_chain` | Proof and vertical alignment. | Decision → planning → implementation → validation → Git. |
| `matrix` | Drift, acceptance mapping, task/row resolution, audit summaries. | Good for compact comparisons. |

The renderer should use Unicode box drawing by default and ASCII fallback when needed.

## Focus rule

The terminal must not render the full generated graph by default. Full graph views are too dense for users and agents. Render focused lenses instead:

- current task or sprint,
- selected node plus direct neighbors,
- selected proof chain,
- selected diagram group/lane,
- selected blocker/question,
- drift category with affected refs,
- summarized omitted counts.

When a view omits data, it should say how much was omitted and which command or source ref expands it.

## Diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated graph lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- file-structure maps render as trees with ownership/drift badges,
- data models render as entity cards plus relation lists.

Large arbitrary graph rendering is a non-goal. If a diagram is too dense, the terminal should ask for focus or render a summary with top-level groups.

## Agent visual expression

Agents may draw small diagrams in chat when it improves understanding. A CodeWiki visual skill should teach agents when to use `board`, `tree`, `sequence`, `state`, `layered_graph`, `trace_chain`, and `matrix` patterns. Deterministic renderer code should handle source-backed layouts for commands and TUI panels.

Do not create a broad `wiki_visualize` mega-tool. Prefer specific commands and `wiki_state`/graph lenses with render options once the backend surface is ready.

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
