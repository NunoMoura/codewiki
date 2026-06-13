# Pi TUI Diagram Rendering

CodeWiki is backend-first for the current architecture wave. Previous product UI surfaces are deprecated, including status panels/docks, Board, Map, Product/System navigation panels, and browser Control Room concepts.

The only retained UI direction is future Pi TUI rendering of canonical system diagrams as ASCII/Unicode. Backend state remains available through `wiki_state`, generated views, semantic loop traces, exit-condition results, and source refs.

## Command-triggered surfaces

Active command direction is limited to backend actions and future diagram rendering:

| Command family | Purpose |
| --- | --- |
| `/wiki bootstrap` | Start CodeWiki in a greenfield or brownfield repository through command-adapter backend setup/bootstrap calls. |
| `/wiki resume` | Continue from folded trace state, latest loop outputs, unmet exit conditions, and source refs. |
| `/wiki config` | Apply CodeWiki preferences/configuration through backend command-adapter calls. |
| `/wiki system <diagram type>` | Future Pi TUI rendering of canonical system diagram YAML as ASCII/Unicode. |

`/wiki status` may return later as a thin `wiki_state { view: "status" }` command. Legacy status docks, Product/Board/Map navigation commands, and hidden UI state are not active target surfaces.

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
- [API vNext Tool Surface](api-vnext-tools.md)
