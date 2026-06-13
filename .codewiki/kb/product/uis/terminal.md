# Pi TUI Diagram Rendering

CodeWiki is backend-first for the current architecture wave. Previous product UI surfaces are deprecated for now. The only retained UI direction is Pi TUI support for rendering source-backed system diagrams as ASCII/Unicode.

## Scope

Pi TUI rendering may show focused diagrams from canonical YAML files under `.codewiki/kb/system/diagrams/*.yaml`.

Allowed diagram outputs:

- architecture/component lanes;
- key-flow ordered steps;
- file-structure trees;
- state lifecycle transitions;
- data-model entity cards and relationships.

The renderer should read canonical diagram YAML and source refs. Renderer output is not canonical truth and must not create hidden UI-only state.

## Deprecated UI surfaces

The following are not active product surfaces in this wave:

- status panel or status dock;
- Board UI;
- Map or graph navigation UI;
- Product/System navigation panels;
- browser Control Room;
- archived status UI commands.

Backend status and continuation remain available through `wiki_state`, generated views, folded traces, loop outputs, and exit-condition results.

## Success signals

- Backend architecture work does not depend on product UI surfaces.
- System diagrams can be rendered in Pi TUI as readable ASCII/Unicode.
- Diagram rendering stays source-backed and compact.
- No renderer output becomes source of truth.

## Non-goals

- No browser dashboard.
- No status panel or dock UI.
- No Board or Map product UI.
- No product/system navigation panel work.
- No broad generated-view visualizer.

## Related docs

- [System TUI Diagram Rendering](../../system/terminal-ui.md)
- [Loop Model](../../system/loop-model.md)
