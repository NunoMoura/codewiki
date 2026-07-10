---
type: Concept
title: Sanitize Historical State
description: As a maintainer, I want hot CodeWiki state to stay small while full history remains recoverable.
tags:
  - codewiki
  - product
  - stories
  - sanitation
timestamp: 2026-06-30T00:00:00Z
---
# Sanitize Historical State

As a maintainer, I want hot CodeWiki state to stay small while full history remains recoverable.

## Acceptance signals

- Git is the full historical recovery mechanism for project content.
- Harness session storage owns execution transcripts; product docs do not store raw chat or event logs.
- Closed traces retain compact semantic summaries and restore refs only when needed.
- Generated views do not include cold history unless explicitly requested.
- Raw event history is not copied into knowledge docs.
- Durable knowledge docs describe current intent instead of preserving archival chronology.
- Retention uses archive/hydrate/restore language, not generic garbage collection.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Traces](../../system/components/traces.md)
- [Knowledge](../../system/components/knowledge.md)
- [System Overview](../../system/components/overview.md)
