---
id: spec.clients.overview
title: Clients Overview
state: active
summary: codewiki keeps user attention on hidden knowledge while Pi surfaces a four-tab status control room with Product/System/Clients grouping, kanban roadmap progress, named execution ownership, and resume-first workflow through a TUI-first model.
owners:
- design
updated: '2026-04-21'
---

# Clients Overview

## Core experience

codewiki should keep users focused on authoring intent and knowledge under `.wiki/knowledge/`, while the extension validates that intent against the codebase, infers execution delta, and presents tracked work through Pi's status surfaces. The default UX should optimize for low-friction session resume, causal understanding of drift, and explicit next actions rather than making users rediscover context every time they start a new session.

The main live control room should be `/wiki-status` or `Alt+W`, with a status panel organized into `Wiki`, `Roadmap`, `Agents`, and `Channels`. `/wiki-resume` should be the canonical execution-resume command, and `/wiki-config` remains the separate configuration entrypoint.

## UX pillars

- author intent first in `.wiki/knowledge/product`, `.wiki/knowledge/clients`, and `.wiki/knowledge/system`
- make authored goals sharp enough that validation, review, and test loops can measure alignment instead of guess it
- use `Wiki` as the primary understanding tab so users can inspect Product, System, and Clients buckets plus drift explanations before they dive into execution details
- keep the roadmap TUI-first, machine-managed, and visibly kanban-shaped instead of expecting users to edit JSON directly or mentally reconstruct task phase
- make current task ownership and next action obvious without forcing users to inspect every file
- use one visible task progression model across roadmap cards, task status, and resume cues instead of making users translate between a hidden loop and a different board state
- optimize status for resume-first workflow, not only passive observability
- show causality from product intent to system, clients, roadmap, and code impact so users understand why work exists
- show named execution ownership and communication routing without requiring separate admin tooling

## Primary flows

- define or refine product intent
- define or refine client-facing flows and surfaces
- map architecture ownership to real code boundaries
- rebuild and inspect deterministic validation state
- inspect inferred delta and approve tracked work
- open `/wiki-status` and inspect `Wiki`, `Roadmap`, `Agents`, or `Channels` as needed
- start a new session and resume the most relevant in-flight work with minimal friction
- resume research, implementation, or verification from tracked roadmap focus through `/wiki-resume`
- review verification evidence before marking work done

## Surface rules

- `Alt+W` and `/wiki-status` open the same live control room
- the header stays minimal: repo plus a single health circle
- optional status summary belongs only in the Pi footer
- `/wiki-config` remains separate from the status panel
- roadmap details should be visible in Pi first, with generated markdown acting as secondary navigation
- machine-managed evidence and roadmap state belong under `.wiki/`
- when repo context and actionable work are clear, session start should proactively surface status or resume context instead of waiting for a manual status request
- canonical client knowledge lives under `.wiki/knowledge/clients`, while legacy `wiki/ux` compatibility may exist temporarily during migration

## Related docs

- [Product](../product/overview.md)
- [Roadmap Surface](surfaces/roadmap.md)
- [Status Panel](surfaces/status-panel.md)
- [System Overview](../system/overview.md)
- [System Rules](../system/rules/overview.md)
- [Roadmap](../../../wiki/roadmap.md)
