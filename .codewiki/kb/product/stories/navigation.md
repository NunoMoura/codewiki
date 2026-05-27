---
id: spec.product.stories.navigation
title: Navigate With Low Token Cost
state: active
summary: Humans and agents should start from compact graph-backed state and expand
  only to exact needed context.
owners:
- product
updated: '2026-05-09'
code_paths:
- skills/codewiki/SKILL.md
- src/adapters/pi/ui
code_paths_mode: explicit_override
---

# Navigate With Low Token Cost

As an agent or maintainer, I want compact graph-backed status first so I can choose the right next context without loading the whole knowledge base into the session.

## Acceptance signals

- Compact status or graph-backed state is the default first read for agent workflows and status views.
- Navigation surfaces expose freshness metadata, affected components, and recommended next reads.
- Current work context routes users and agents to only the linked knowledge, code, builds, validation reports, and evidence needed for the current task status and gate.
- Visual graph navigation explains important nodes, edges, stale links, and missing links without duplicating canonical truth.
- Bounded context tools are optional microscopes, not required runtime dependencies.

## Related docs

- [Agents](../users/agents.md)
- [Graph Navigation UI](../uis/graph-navigation.md)
- [Graph](../../system/graph.md)
- [API](../../system/api.md)
