---
id: spec.product.users.external-users
title: Future External Users
state: active
summary: Future humans, agents, and integrations that may consume CodeWiki through
  non-current access paths.
owners:
- product
updated: '2026-05-09'
code_paths:
- skills
code_paths_mode: explicit_override
---

# Future External Users

Future external users may include people and agents working through CLI, TUI, MCP, editor panels, service agents, package APIs, or optional runtime programs.

From a product point of view, these users should get the same durable semantics as current adapter users:

- read graph-backed status,
- inspect current knowledge and roadmap state,
- request compiler workflows,
- use gated agency where supported,
- record evidence and validation outcomes through typed capabilities,
- avoid editing generated files directly.

Technical distribution details belong under system API, adapters, and extension docs. Visual interfaces belong under product UI docs only when users can see and interact with them.

## Success signals

- External users get the same truth boundaries as current users.
- Access path differences do not change CodeWiki semantics.
- Visual and non-visual access surfaces are documented in the correct layer.

## Related docs

- [CodeWiki API](../../system/api.md)
- [Adapters](../../system/adapters.md)
- [Extension](../../system/extension.md)
