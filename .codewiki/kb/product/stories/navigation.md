---
type: Concept
title: Navigate With Low Token Cost
description: As an agent or maintainer, I want compact trace-backed and relationship state first so I can load only exact context needed for next safe action.
tags:
  - codewiki
  - product
  - stories
  - navigation
timestamp: 2026-07-28T00:00:00Z
---
# Navigate With Low Token Cost

As an agent or maintainer, I want compact trace-backed and relationship state first so I can load only exact context needed for next safe action.

## Acceptance signals

- CLI/dashboard/optional Pi client expose compact WorkState and Change dossier summaries before broad reads.
- Status shows current Loop candidate, active Checks, failed/indeterminate Results, Exit Report, Runtime route, blockers, refs, and next safe action.
- Context routes to only relevant Knowledge, source/tests, Git/delivery proof, trace attempts, and repair evidence.
- Typed Work/Alignment/Learning queries return provenance, authority, coverage, truncation, staleness, and snapshot digest.
- Partial coverage never implies absence.
- Runtime preloads mandatory context; queries are supplemental microscopes.
- Generated views and caches remain disposable and explain stale/missing refs.
- Model Checks receive pinned candidate evidence only; producer sessions do not ingest raw history.

## Related docs

- [Agents](../users/agents.md)
- [WorkState](../../system/components/work-state.md)
- [Change Traces](../../system/components/traces.md)
- [API and Client Surface](../../system/components/api-tools.md)
