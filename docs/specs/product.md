---
id: spec.product
title: Product
state: active
summary: codebase-wiki gives Pi a repo-local, docs-first navigation and drift contract for development projects.
owners:
- product
updated: '2026-04-16'
---

# Product

## Intent

codebase-wiki turns project documentation into a maintained local wiki that agents and humans can navigate, rebuild, lint, and compare against code.

## Primary users

- maintainers shaping intended architecture before or during implementation
- coding agents that need stable navigation and deterministic docs metadata
- brownfield teams trying to map existing code into a cleaner desired-state documentation tree

## Core value

- keep intended state close to repo
- keep roadmap as freshest tracked delta from specs to code
- keep research compact and reusable
- make drift visible and actionable instead of implicit
- keep Pi sessions resumable by linking task work back to roadmap items

## Non-goals

- general-purpose personal knowledge vault features
- rich hosted viewer or MCP storage layer like full LLM Wiki products
- longform archival document taxonomy for plans, drift, ADRs, and analysis as separate top-level buckets

## Product rules

- research captures evidence
- specs define desired state
- roadmap tracks numbered delta-closing work
- generated docs provide navigation, not canonical truth

## Related docs

- [System Overview](system/overview.md)
- [Package Surface](package/overview.md)
- [Extension Runtime](extension/overview.md)
- [Templates and Rebuild](templates/overview.md)
- [Shared Rules](shared/overview.md)
- [Roadmap](../roadmap.md)
