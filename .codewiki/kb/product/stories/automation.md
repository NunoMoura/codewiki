---
id: spec.product.stories.automation
title: Use Gated Agency
state: active
summary: CodeWiki should let agents advance roadmap work automatically inside explicit
  user-visible gates.
owners:
- product
updated: '2026-05-09'
code_paths:
- skills/codewiki-implementation/SKILL.md
- skills/codewiki-decision/SKILL.md
---

# Use Gated Agency

As a user, I want an agent to advance roadmap work automatically while staying bounded by explicit gates, so progress can continue without losing alignment with my intent.

## Acceptance signals

- Agents can move through roadmap work automatically when the user allows it.
- Automation is gated by token budget, time budget, risk level, approval requirements, validation results, and policy boundaries.
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
