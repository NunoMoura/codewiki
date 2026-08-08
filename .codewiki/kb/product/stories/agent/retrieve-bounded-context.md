---
type: User Story
title: Retrieve Bounded Context
description: An agent wants snapshot-bound project context that expands from current state to exact relationships and source only when needed.
status: stable
codewiki_user: /product/users/agent.md
tags: [product, story, query]
---
# Retrieve Bounded Context

As an agent, I want compact current state and relationship context so I can act safely without loading raw project history or inventing missing facts.

## Acceptance signals

- WorkState answers current guards and scheduling facts.
- Alignment answers bounded impact, provenance, and relationship questions.
- Every response reports snapshot, coverage, truncation, and staleness.
