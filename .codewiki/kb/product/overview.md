# Product

CodeWiki exists to keep repository intent fresh, explicit, actionable, and recoverable for humans and agents.

For the current architecture wave, CodeWiki is backend-first. The active product focus is:

- hot knowledge in `.codewiki/kb/**`;
- append-only JSONL traces as workflow/state truth;
- runtime outer loop coordination;
- decision, planning, and implementation semantic loops;
- loop outputs and exit conditions;
- generated status/resume/work views;
- Git-backed content proof and retention;
- package APIs and future host adapters.

Product docs own user definitions, user stories, value, workflows, and non-goals. They do not define active visual UI surfaces for this wave.

## UI position

All previous product UI surfaces are deprecated for now, including status panels, status docks, Board, Map, Product/System navigation panels, and browser Control Room concepts.

The only retained UI direction is future Pi TUI support. That direction is intentionally narrow: Pi TUI may render source-backed system diagrams as ASCII/Unicode from canonical `.codewiki/kb/system/diagrams/*.yaml` files. Renderer output is never canonical truth.

Backend status and continuation remain available through tools and APIs such as `wiki_state`, generated views, folded traces, loop outputs, and exit-condition results. `/wiki status` may return later as a thin `wiki_state { view: "status" }` command.

## Product boundaries

Tools, commands, skills, CLI access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe outcomes those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/api.md), [API vNext Tool Surface](../system/api-vnext-tools.md), and [Extension](../system/extension.md).

CodeWiki core is harness-agnostic. Pi is a primary host adapter, not the core. CLI and MCP adapters should expose the same semantics when added.

## Success signals

- User intent is captured before implementation expands.
- Product stories map to semantic loops and system components without duplicating technical design.
- Backend state is inspectable through `wiki_state` and generated views.
- Loop outputs are high-signal enough for downstream loops without chat archaeology.
- Exit conditions make next actions, blockers, and route-backs explicit.
- System diagrams can be rendered in Pi TUI as ASCII/Unicode from canonical YAML.
- Historical recovery relies on Git, harness session storage, compact trace iterations, and retained refs rather than product doc event logs.

## Related docs

- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Loop-Governed Automation](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/overview.md)
