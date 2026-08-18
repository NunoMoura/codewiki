---
type: User Story
title: Retrieve Bounded Context
description: An agent wants content-addressed local project material that refreshes coherently without live authority or hidden ambient state.
status: stable
codewiki_user: /product/users/agent.md
tags: [product, story, query]
---
# Retrieve Bounded Context

As an agent, I want compact current-stage material and lazy exact local queries so I can act safely without loading raw project history, blocking on Project Server query round trips, trusting stale conversation memory, or inventing missing facts.

## Acceptance signals

- Project Server builds immutable content-addressed Project Material Generations from exact WorkState, Knowledge, Alignment, active Changes, accepted Work Graph, repository material, Evidence, Results, query-engine identity, coverage, and staleness.
- A generation is a reusable producer query substrate, not canonical state and not a Gate input package; unchanged content-addressed chunks may be reused.
- Producer Runs mount authorized generations read-only and query them locally through typed Knowledge, Alignment, project-state, repository, Evidence, Result, batch, and high-level change-delta services.
- Direct, batch, and admitted programmatic queries preserve deterministic ordering, generation and query-engine identity, source references, coverage, unknowns, truncation, cursor position, call and byte budgets, and exact ledger capture.
- A long-lived producer DSH Agent Session may move from generation M1 to M2 only at a controlled idle turn boundary. Every query remains bound to the generation it used; old generations remain reproducible while referenced.
- Producer material permits no ambient live-working-tree fallback, Project Server storage handle, unrestricted network, credentials, environment, or unlogged dynamic context.
- Candidate checkpoint freezes output. Project Server then builds a separate immutable Gate Evaluation Package containing only declared exact Candidate, repository, Change, WorkState, Knowledge, Alignment, Evidence, Result, Check Pack, configuration, and route inputs.
- Formal Model Checks are fresh, isolated, tool-free, and receive no producer Project Material Generation handle, query tools, Session, or memory.
- Every CodeWiki-controlled model-visible input and query is bound to Execution Ledger and Run Receipt; delegated routes identify context they cannot prove.
- DSH owns compaction mechanics while CodeWiki promotes authority-relevant facts before compaction, supplies stage-aware summaries, preserves exact history, and deterministically rehydrates canonical facts.
- The existing immutable `StageContextBundle` and native direct/batch replay tools remain qualification evidence only until mounted material querying replaces them; they are not the final production producer-context contract.
