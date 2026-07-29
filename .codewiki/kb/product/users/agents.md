---
type: Concept
title: Agents and Workers
description: Agents operate CodeWiki through bounded clients, Loop Protocols, Workbenches, exact Checks, and snapshot-bound queries without owning project truth, routing, or acceptance.
tags:
  - codewiki
  - product
  - users
  - agents
timestamp: 2026-07-28T00:00:00Z
---
# Agents and Workers

Agents use CodeWiki as accountable project state through standalone CLI, dashboard, optional Pi client, and Runtime-created sessions/Assignments. They need compact current state, exact authority boundaries, scoped queries, explicit Checks, and safe stop/route behavior.

## Success signals

- Agents begin from bounded WorkState/Change/relationship context rather than full Knowledge or trace history.
- Candidate producers follow exact Decision, Planning, or Implementation Loop Protocol and return role-specific immutable candidate content.
- Model Checks are independent from producer conversation and learning context.
- Workers receive one private Assignment-scoped Workbench and return immutable Worker Report and artifact material only; Runtime decides whether it can become an Evidence Record.
- Agents can use normal Pi Skills and scoped tools, but none grants paths, authority, Check changes, routing, acceptance, or effects.
- Work/Alignment/Learning queries report snapshot, provenance, authority, coverage, truncation, and staleness.
- Ambiguous intent routes to Decision; plan/scope/dependency ambiguity routes to Planning; Runtime/provider/environment failure does not become candidate failure.
- Failed and indeterminate Results provide concise issue classes, repair targets, and evidence refs.
- Agents may produce research citations, command observations, screenshots, and short videos under bounded contracts, but cannot assign canonical Evidence identity/time/authority/coverage or treat completion/tool/media success as acceptance.

## Related docs

- [Navigate With Low Token Cost](../stories/navigation.md)
- [Use Loop-Governed Automation](../stories/automation.md)
- [API and Client Surface](../../system/components/api-tools.md)
- [Loop Model](../../system/components/loop-model.md)
- [Worker Workbench](../../system/components/worker-workbench.md)
- [Runtime](../../system/components/runtime.md)
- [Evidence Records](../../system/components/evidence.md)
