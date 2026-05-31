---
id: spec.product
title: Product
state: active
summary: Product intent and navigation for CodeWiki's users, stories, and visual UIs.
owners:
- product
updated: '2026-05-31'
code_paths:
- .codewiki/kb/product
code_paths_mode: explicit_override
---

# Product

CodeWiki exists to keep repository intent fresh, explicit, and actionable for humans and agents. It captures who the product serves, what jobs those users need done, and which visual interfaces make that work understandable.

The product tower owns user-facing intent:

- `users/**` describes who CodeWiki serves.
- `stories/**` describes jobs, outcomes, and acceptance signals.
- `uis/**` describes visual user interfaces: screens, panels, boards, graph views, and other human-visible surfaces.
- [Lexicon](../lexicon.md) defines shared project vocabulary.

Folders do not need `overview.md` files by default. Add a navigation page only when the folder becomes hard to scan or needs explicit ownership rules.

## Product boundaries

Product docs own user definitions, user stories, visual UI expectations, value, workflows, and non-goals. They should not own source layout, module boundaries, adapter protocols, runtime packaging, compiler implementation, graph storage mechanics, or distribution details. Human-visible structure review is product-relevant when it helps maintainers understand intended structure, current structure, drift, approved migration deltas, and next decisions; the authoritative source-layout rules still belong in system docs.

Product-oriented decisions should update product meaning first, then preflight system impact. Technical/system decisions should update system truth first, then update product docs only when architecture constraints, workflows, or tool surfaces change user-visible behavior or expectations.

Tools, commands, skills, CLI access, MCP access, package APIs, and harness adapters are not product UIs. Product stories may describe the outcome those access paths must support, but the technical access contract belongs in [CodeWiki API](../system/api.md), [Adapters](../system/adapters.md), and [Extension](../system/extension.md).

Visual UI docs should describe what users see and understand. System docs should describe how the product is delivered.

## Success signals

- User intent is captured before implementation expands.
- Product stories map to system components and roadmap work without duplicating technical design.
- Visual UI expectations stay separate from adapter, API, and distribution mechanics.
- Agents and humans can understand current state through trustworthy terminal-first product surfaces: chat, Pi TUI panels, compact host status, and focused `/wiki-*` command output.
- Maintainers can review intended file structure, actual file structure, drift, and approved migration deltas before agents reshape source layout.
- Historical recovery relies on git, harness session storage, compact semantic summaries, and generated graph context rather than product doc event logs.

## Related docs

- [Maintainers](users/maintainers.md)
- [Agents](users/agents.md)
- [Extension and Workflow Authors](users/package-authors.md)
- [Future External Users](users/external-users.md)
- [Maintain Fresh Intent](stories/intent.md)
- [Use Gated Agency](stories/automation.md)
- [Low-Token Navigation](stories/navigation.md)
- [Terminal UI](uis/terminal.md)
- [Deprecated Browser CodeWiki UI](uis/control-room.md)
- [Status Panel UI](uis/status-panel.md)
- [Board UI](uis/board.md)
- [Graph Navigation UI](uis/graph-navigation.md)
- [Lexicon](../lexicon.md)
- [System Overview](../system/overview.md)
