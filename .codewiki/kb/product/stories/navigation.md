---
type: Concept
title: Navigate With Low Token Cost
description: As an agent or maintainer, I want compact trace-backed status first so I can choose the right next context without loading the whole knowledge base or trace history into the session.
tags:
  - codewiki
  - product
  - stories
  - navigation
timestamp: 2026-06-30T00:00:00Z
---
# Navigate With Low Token Cost

As an agent or maintainer, I want compact trace-backed status first so I can choose the right next context without loading the whole knowledge base or trace history into the session.

## Acceptance signals

- `wiki_state` is the default first read for agent workflows and status/resume views.
- Status and resume surfaces expose latest loop outputs, unmet exit conditions, route-backs, blockers, refs, and next safe action.
- Current work context routes users and agents to only the linked knowledge, source, tests, Git refs, trace iterations, and evidence needed for the current state.
- Generated views explain important refs, stale projections, missing refs, and blockers without duplicating canonical truth.
- Bounded context tools are optional microscopes, not required runtime dependencies.

## Related docs

- [Agents](../users/agents.md)
- [Loop Model](../../system/components/loop-model.md)
- [Traces](../../system/components/traces.md)
- [API](../../system/components/api.md)
