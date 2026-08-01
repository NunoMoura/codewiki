---
type: Concept
title: API Facade Component
description: Harness-neutral typed facade exposes CodeWiki Runtime/client/query capabilities while preventing direct `.codewiki/**` mutation and runtime-authority injection.
tags:
  - codewiki
  - system
  - components
  - api
  - facade
timestamp: 2026-07-28T00:00:00Z
---
# API Facade Component

## Responsibility

`src/api/**` exposes stable typed CodeWiki use cases to standalone CLI, dashboard, optional Pi client, tests, and future adapters. It keeps clients away from direct Knowledge/trace/private-runtime mutation and host-specific SDK types.

Behavior remains owned by Decision, Planning, Implementation, Loop Exit, WorkState, traces, Knowledge, Git, project configuration, and Project Runtime packages.

## Contracts

- Use exact role-specific schemas; no arbitrary candidate records or universal mega-tool.
- Change intake exposes the closed material protocol, strict client preflight normalizer, and Runtime factory; only Runtime authenticates, correlates, deduplicates, routes, timestamps, identifies, and admits material.
- Read/query results are compact, snapshot-bound, provenance-bearing, and explicit about coverage/staleness/truncation.
- Candidate/Check/Result/Report identity, activation, thresholds, actor/time, generation, CAS, and route remain Runtime-owned.
- Preview and apply/append/effect are distinct; passing Exit Report is not effect authority.
- Large/private machine payloads remain under bounded Runtime paths; chat/UI receives compact refs and findings.
- Generated views rebuild from canonical sources and are never hand-edited.
- Current `wiki_*` facades remain compatibility surface while standalone CLI/Runtime API becomes primary.
- Host adapters remain entrypoint-isolated and cannot change core semantics.

There is no target facade over canonical graph, roadmap, session, artifact-output, validation, lesson/memory, split-evaluation, or cleanup roots.

## Related docs

- [Decision to Planning](../flows/decision-to-planning.md)
- [Planning to Implementation](../flows/planning-to-implementation.md)
- [System Overview](overview.md)
- [Loop Exit](loop-exit.md)
- [API and Client Surface](api-tools.md)
- [Source Map](source-map.md)
