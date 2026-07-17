---
type: Concept
title: Prevent Horizontal and Vertical Drift
description: As a maintainer, I want CodeWiki to detect contradictions between intent, docs, loop outputs, traces, evidence, tests, code, and Git proof so the knowledge base remains trustworthy.
tags:
  - codewiki
  - product
  - stories
  - drift
timestamp: 2026-06-30T00:00:00Z
---
# Prevent Horizontal and Vertical Drift

As a maintainer, I want CodeWiki to detect contradictions between intent, docs, loop outputs, traces, evidence, tests, code, and Git proof so the knowledge base remains trustworthy.

## Acceptance signals

- Drift signals distinguish horizontal drift inside a layer from vertical drift across layers.
- Drift findings identify affected layer, likely source of truth, affected components, and recommended next semantic loop.
- Confirmed drift can become new decision/planning/implementation iterations; unclear drift routes back through decision before downstream changes.
- Exit conditions judge loop output from grounded refs before downstream loops consume it.
- Continue, route-back, and blocked iterations remain available as compact trace provenance for follow-up work.
- `wiki_state` and generated views agree on current next action; users should not see one surface report alignment while another reports unresolved drift.
- Freshness stays stable across no-op view rebuilds and changes only when relevant canonical Knowledge topics, installed-project traces, source/tests, Git proof, or explicit user intent changes.
- Sprint alignment has exactly four states: Aligned, Review Needed, Misaligned, and Unknown.
- A relevant scoped digest change produces Review Needed and never proves Misaligned by itself.
- Misaligned requires a grounded finding with affected layer, source-of-truth refs, rationale, and recommended next semantic loop.
- Legacy or insufficiently scoped Sprints report Unknown, and no alignment projection creates an amendment automatically.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Alignment Model](../../system/components/alignment-model.md)
- [Loop Model](../../system/components/loop-model.md)
- [API](../../system/components/api.md)
