---
id: spec.product.stories.automation
title: Use Gated Agency
state: active
summary: CodeWiki should let agents advance roadmap work automatically inside explicit
  user-visible gates.
owners:
- product
updated: '2026-05-27'
code_paths:
- skills/codewiki-implementation/SKILL.md
- skills/codewiki-decision/SKILL.md
---

# Use Gated Agency

As a user, I want an agent to advance roadmap work automatically while staying bounded by explicit gates, so progress can continue without losing alignment with my intent.

## Acceptance signals

- Agents can move through roadmap work automatically when the user allows it.
- Users can choose the agency level: `task` stops for approval after one task, `sprint` continues through the active sprint, and `roadmap` continues through active roadmap work.
- Context resets reduce context bloat and let the agent automatically pick up from CodeWiki source truth when the selected agency level still allows continuation.
- Automation is gated by token budget, time budget, cost budget, write/session budget, risk level, approval requirements, validation results, and policy boundaries.
- The agent stops on ambiguity, unsafe work, failed checks, policy gates, budget exhaustion, or missing approval.
- Users can see what the agent plans to do next, why it is safe, and which gate would stop it.
- Parallel sessions can lease narrow change scopes, and automation can warn or stop when overlapping leases make work unsafe.
- Context-heavy validation and research can run in isolated fresh contexts and return compact findings.
- Durable truth remains separated by role: knowledge, builds, roadmap, graph state, validation reports, code, and tests.

## Related docs

- [Agents](../users/agents.md)
- [Board UI](../uis/board.md)
- [Compilers](../../system/compilers.md)
- [Validation Gateway](../../system/validation-gateway.md)
- [Roadmap](../../system/roadmap.md)
