# Pi Terminal UX

CodeWiki is backend-first for the current architecture wave, but Pi terminal rendering is now a primary product surface because it makes the agent's semantic work observable without spending extra model tokens.

Previous browser/control-room UI surfaces remain deprecated. Terminal UX should render the current CodeWiki state, tool effects, and canonical diagrams from traces, KB, generated views, loop exit-condition results, and source refs.

## Command-triggered surfaces

Active command direction is intentionally small:

| Command family | Purpose |
| --- | --- |
| `/wiki state [flags]` | Compact state summary; flags can render board, quality, blockers, detail, or JSON. |
| `/wiki resume` | Continue from folded trace state, latest loop outputs, unmet exit conditions, and source refs. |
| `/wiki explain [target]` | Explain the whole project, a component, a flow, or a path from KB/source-map/views. |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield repository through explicit backend setup/bootstrap calls. |
| `/wiki config` | Inspect CodeWiki preferences/configuration; writes require explicit confirmation. |

There is no separate public `status` name; CodeWiki standardizes on `state` for user commands and internal tooling. Board, quality, blockers, and JSON are state render flags rather than separate top-level slash commands, except `resume`, which is high-frequency user intent.

## Tool call rendering

The primary real-time observability layer is custom rendering of `wiki_*` tool calls/results. This keeps the chat timeline focused on immediate agent action while showing the CodeWiki semantic effect next to the tool that caused it.

`src/pi/tui/index.ts` is a pure renderer facade for command and tool renderers. It may be imported by commands/tests without enabling the extension, writing state, or depending on the Pi SDK.

Renderers use consistent table-first layouts:

- decision alignment table: current state, desired state, quality verdict;
- board table: To do, Doing, Done;
- implementation matrix: work, code, tests, publish;
- quality footer: `✓` met, `⚠` unmet/uncertain, `✗` blocked.

The header row must be separated from content with a horizontal rule. Rendered output is not canonical truth and must not create hidden UI-only state.

## Diagram rendering

Canonical diagrams live under `.codewiki/kb/system/diagrams/**` as YAML. Terminal renderers read those YAML files or generated view lenses derived from them.

Diagram rendering should prioritize interpretation over fidelity:

- architecture/component maps render as grouped lanes or focused neighborhoods,
- sequence flows render as ordered steps or simple swimlanes,
- state lifecycle maps render as states plus transitions,
- file-structure maps render as trees,
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
