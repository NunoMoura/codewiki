---
id: spec.product.users.agents
title: Agents and Subagents
state: active
summary: AI agents that use CodeWiki as persistent project memory and gated workflow
  state across harness adapters.
owners:
- product
updated: '2026-05-16'
code_paths:
- skills
- src
---

# Agents and Subagents

Agents use CodeWiki as persistent project memory and orchestration state through harness adapters. They need compact current state, clear source-of-truth boundaries, session queue scoped leases for parallel coordination, wait/wake signals, and explicit gates before they change knowledge, roadmap work, code, tests, or publication state.

User-opened sessions and subagents run focused work from CodeWiki refs with fresh context windows when useful. They support validation, research, architecture review, planning review, tester work, builder work, and other bounded tasks where isolated context reduces token cost and parent-session bias.

## Success signals

- Agents start from compact graph-backed status before broad reads.
- Agents follow compiler artifacts: feedback build, documentation build, planning build, roadmap work item, and implementation build.
- Agents can advance roadmap work automatically only inside explicit token, time, risk, validation, policy, and approval gates.
- Parallel agents can lease narrow documentation, roadmap, build, validation, or code scopes and see overlap warnings or conflicts before work proceeds.
- Subagents return compact structured results rather than mutating canonical truth directly.
- Ambiguous intent escalates back to the decision loop instead of being guessed.

## Related docs

- [Low-Token Navigation](../stories/navigation.md)
- [Use Gated Agency](../stories/automation.md)
- [CodeWiki API](../../system/api.md)
- [Adapters](../../system/adapters.md)
- [Graph](../../system/graph.md)
