---
id: spec.product
title: Product
state: active
summary: Product intent for a backend-first CodeWiki package.
owners:
- product
updated: '2026-06-04'
code_paths:
- .codewiki/kb/product
code_paths_mode: explicit_override
---

# Product

CodeWiki exists to keep repository intent fresh, explicit, and actionable for humans and agents. For the current architecture wave, CodeWiki is backend-first: durable knowledge, roadmap truth, lifecycle traces, compiler outputs, gateway evidence, graph lenses, runtime coordination, and package APIs are the active product focus.

Product docs own user definitions, user stories, value, workflows, and non-goals. They do not define active visual UI surfaces for this wave.

## UI position

All previous product UI surfaces are deprecated for now, including status panels, status docks, Board, Map, Product, System navigation panels, and browser Control Room concepts.

The only retained UI direction is future Pi TUI support. That direction is intentionally narrow: Pi TUI may render source-backed system diagrams as ASCII/Unicode from canonical `.codewiki/kb/system/diagrams/*.yaml` files. Renderer output is never canonical truth.

Backend status and continuation remain available through tools and APIs such as `wiki_state`, graph lenses, roadmap state, lifecycle traces, and validation reports. `/wiki status`, `/wiki-status`, and `/wiki_status` are deprecated UI command surfaces and should not be promoted as product entrypoints.

## Product boundaries

Tools, commands, skills, CLI access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe outcomes those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/api.md), [Adapters](../system/adapters.md), and [Extension](../system/extension.md).

CodeWiki is Pi-based at the product boundary because Pi supplies the agent harness, chat session, TUI host, tools, skills, and prompt hooks. CodeWiki supplies the repo contract, workflow policy, backend APIs, lifecycle traces, and source-owned semantics.

## Success signals

- User intent is captured before implementation expands.
- Product stories map to system components and roadmap work without duplicating technical design.
- Backend state is inspectable through source-backed tools and graph lenses.
- System diagrams can be rendered in Pi TUI as ASCII/Unicode from canonical YAML.
- Historical recovery relies on git, harness session storage, compact semantic summaries, and generated graph context rather than product doc event logs.

## Related docs

- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Gated Agency](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/overview.md)
