---
type: Concept
title: Product
description: CodeWiki exists to keep repository intent fresh, explicit, actionable, and recoverable for humans and agents.
tags:
  - codewiki
  - product
  - overview
timestamp: 2026-06-30T00:00:00Z
---
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

Backend state and continuation remain available through tools and APIs such as `wiki_state`, generated views derived from traces, loop outputs, and exit-condition results. `/wiki-state` and `/wiki-state` are the preferred command shapes for summary output; no separate status command is planned.

## Product boundaries

Tools, commands, skills, temporary CLI harness access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe outcomes those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/api.md), [API Tool Surface](../system/api-tools.md), and [Extension](../system/extension.md).

CodeWiki core is harness-agnostic. Pi is a primary host adapter, not the core. MCP adapters should expose the same semantics when added. The source CLI remains a temporary development/test harness and is not a product host.

CodeWiki should optimize for the best achievable code quality with the least useful token spend. Ceremony that does not improve quality, recovery, or agent efficiency should be questioned instead of preserved by default.

## Success signals

- User intent is captured before implementation expands.
- Product stories map to semantic loops and system components without duplicating technical design.
- Backend state is inspectable through `wiki_state` and generated views.
- Loop outputs are high-signal enough for downstream loops without chat archaeology.
- Workflow ceremony improves code quality or token efficiency; otherwise it is removed or challenged.
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
