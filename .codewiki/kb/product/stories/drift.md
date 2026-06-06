---
id: spec.product.stories.drift
title: Prevent Horizontal and Vertical Drift
state: active
summary: CodeWiki should expose contradictions between intent, knowledge, work, graph
  state, builds, validation, tests, and code.
owners:
- product
updated: '2026-06-06'
code_paths:
- src/state/graph.ts
- src/state/lint.ts
- src/gateway/report.ts
- skills/codewiki-decision/SKILL.md
- skills/codewiki-planning/SKILL.md
- skills/codewiki-implementation/SKILL.md
code_paths_mode: explicit_override
---

# Prevent Horizontal and Vertical Drift

As a maintainer, I want CodeWiki to detect contradictions between intent, docs, work, builds, validation reports, evidence, tests, and code so the knowledge base remains trustworthy.

## Acceptance signals

- Drift signals distinguish horizontal drift inside a layer from vertical drift across layers.
- Drift findings identify the affected layer, likely source of truth, affected components, and recommended next loop.
- Confirmed drift can become roadmap work; unclear drift routes back through decision before downstream changes.
- Validation gateways judge handoffs from fresh context before loop exits.
- Failed, blocked, or policy-kept validation reports remain available for follow-up work.
- Status, graph, and `wiki_state` agree on the current next action; users should not see one surface report alignment while another reports unresolved drift.
- Freshness stays stable across no-op rebuilds and changes only when canonical knowledge, roadmap truth, source code, builds, validation, or explicit user intent changes.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Graph](../../system/graph.md)
- [Validation Gateway](../../system/validation-gateway.md)
- [API](../../system/api.md)
