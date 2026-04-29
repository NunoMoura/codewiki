---
id: spec.clients.overview
title: Clients Overview
state: active
summary: User-facing workflow and status-surface expectations for codewiki.
owners:
- design
updated: '2026-04-29'
---

# Clients Overview

## Core experience

Describe how users author intent in codewiki, how the system validates that intent, and how Pi should surface next actions without forcing users into raw machine files.

## Primary flows

- shape product intent before code drifts too far
- define client flows and surfaces that explain expected user interaction
- inspect evidence and inferred delta inside Pi
- approve tracked work into roadmap state
- resume implementation from tracked roadmap focus

## Goal quality rule

Client specs should describe not only desired behavior, but also how success will be recognized, which behavior is out of scope, and what evidence should be reviewed before work is considered done.

## Surface rules

- keep canonical knowledge under `.wiki/knowledge/`
- keep machine-managed sources, roadmap, evidence, graph, and views under `.wiki/`
- make `Alt+W` the primary control room for status, inferred delta, and tracked work
- keep the optional summary line short enough to coexist with other Pi extension statuses

## Related docs

- [Product](../product/overview.md)
- [Roadmap Surface](surfaces/roadmap.md)
- [Status Panel](surfaces/status-panel.md)
- [System Overview](../system/overview.md)
