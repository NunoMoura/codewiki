---
type: User Story
title: Retrieve Bounded Context
description: An agent wants snapshot-bound project context that expands from current state to exact relationships and source only when needed.
status: stable
codewiki_user: /product/users/agent.md
tags: [product, story, query]
---
# Retrieve Bounded Context

As an agent, I want compact current stage context and lazy exact queries so I can act safely without loading raw project history, trusting stale conversation memory, or inventing missing facts.

## Acceptance signals

- One immutable stage-context envelope binds exact subject, Change revision, repository snapshot, WorkState, Knowledge, Alignment, Pack Skills, Gate feedback, coverage, and staleness.
- WorkState answers current coordination, guards, attempts, feedback, and pending authority; Knowledge answers accepted intent; Alignment answers bounded impact, provenance, and relationships.
- Typed direct and declarative batch queries expand context lazily with deterministic ordering, complete snapshot identity, source references, coverage, unknowns, truncation, cursor position, query-engine identity, and staleness.
- Backend Agent Runs expose no live-working-tree fallback, ambient project read, network lookup, credential access, or unlogged dynamic context.
- Every CodeWiki-controlled model-visible input and query is bound to the Backend Agent Run's Execution Ledger and receipt; delegated routes identify any context that cannot be proven inside the child.
- Compaction preserves exact history, rehydrates canonical facts from their owners, and summarizes only unresolved conversational state plus a recent tail.
- Optional programmatic querying runs fresh against the same immutable facade and returns bounded canonical JSON; no persistent opaque heap becomes project truth.
- External Agent Client receipts prove only CodeWiki operations actually performed and never imply custody over the External Agent Client's prompts, tools, local reads, models, subagents, code runtime, or memory.
