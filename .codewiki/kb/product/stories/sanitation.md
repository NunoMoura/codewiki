---
id: spec.product.stories.sanitation
title: Sanitize Historical State
state: active
summary: CodeWiki should keep hot state small while full history remains recoverable
  through git and harness session storage.
owners:
- product
updated: '2026-05-16'
code_paths:
- tests/smoke/package-smoke.test.mjs
- src/state/lint.ts
---

# Sanitize Historical State

As a maintainer, I want hot CodeWiki state to stay small while full history remains recoverable.

## Acceptance signals

- Git is the full historical recovery mechanism.
- Harness session storage owns execution transcripts; product docs do not store raw chat or event logs.
- Closed roadmap work and compiler builds retain compact semantic summaries only when needed.
- Generated graph/index state does not include cold history unless explicitly requested.
- Raw event history is not stored by default.
- Durable knowledge docs describe current intent instead of preserving archival chronology.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Builds](../../system/builds.md)
- [Graph](../../system/graph.md)
- [Knowledge](../../system/knowledge.md)
- [System Overview](../../system/overview.md)
