# Pi Terminal UX

CodeWiki is backend-first for the current architecture wave, but Pi terminal rendering is now a primary product surface because it makes the agent's semantic work observable without spending extra model tokens.

Previous browser/control-room UI surfaces remain deprecated. Terminal UX should render current CodeWiki state and canonical diagrams from traces, KB, generated views, loop exit-condition results, and source refs. Tool payloads are agent handles, not the durable user observability surface.

## Command-triggered surfaces

Active command direction is intentionally small. Each command has one direct slash form for Pi discovery; the older grouped namespace command is deprecated:

| Command | Purpose |
| --- | --- |
| `/wiki-state [flags]` | Compact state summary; flags can render trace-board/work-queue/triggers board, quality, blockers, detail, or JSON. |
| `/wiki-resume` | Continue from the trace-derived resume view, latest loop outputs, unmet exit conditions, and source refs. |
| `/wiki-explain [target]` | Explain the whole project, a component, a flow, or a path from KB, source-map ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Start CodeWiki in a greenfield or brownfield repository through explicit backend setup/bootstrap calls, then render a human ready summary. |
| `/wiki-config` | Inspect CodeWiki preferences/configuration; writes require explicit confirmation. |

There is no separate public `status` name; CodeWiki standardizes on `state` for user commands and internal tooling. Board, quality, blockers, and JSON are state render flags rather than separate direct slash commands, except `resume`, which is high-frequency user intent.

## Tool and trace rendering

Bootstrap keeps rich command rendering because it runs before a project has useful trace state. Explicit read commands such as `/wiki-state`, `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render their requested view. After bootstrap, `wiki_*` tools should return compact agent handles; they should not own rich TUI observability or render preview output as product UX.

The durable user-facing observability path is append-driven:

```text
append trace record -> update derived view -> render trace/view surface
```

Preview results are agent-private validation drafts. Only appended trace records should update post-bootstrap user observability.

`src/pi/tui/index.ts` is a pure renderer facade for command renderers plus the CodeWiki footer status helper. It may be imported by commands/tests without writing state or depending on the Pi SDK. The footer is UI-only: it summarizes CodeWiki state and must not become workflow truth.

Renderers use consistent table-first layouts where tables clarify structured state and plain text carries guidance. The active bootstrap renderer shows project/status identity, bootstrap action counts, optional preserved/stale path tables, and plain-text next steps. Future trace/view renderers should show active workstreams and trace goal states from appended trace state, not from raw tool payloads.

The header row must be separated from content with a horizontal rule. Table rendering should reserve terminal margin and use display-width-aware truncation so right borders do not wrap or drift in Pi notifications. Bootstrap and footer rendering should expose the active extension artifact so dogfood users can distinguish local checkout, project-local package, and non-project package execution. Rendered output is not canonical truth and must not create hidden UI-only state.

## Diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated view lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- source maps render as trees,
- data models render as entity cards plus relation lists.

The renderer should use Unicode box drawing by default and ASCII fallback when needed. Renderer output is not canonical truth and must not create hidden UI-only state.

## Non-goals

- No browser dashboard.
- No status panel or dock UI.
- No Board or Map product UI.
- No Product/System navigation panel work.
- No full generated graph renderer by default.
- No hidden terminal-only workflow state.

## Related docs

- [Product TUI Diagram Rendering](../product/uis/terminal.md)
- [Loop Model](loop-model.md)
- [API Tool Surface](api-tools.md)
