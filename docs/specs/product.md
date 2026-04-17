---
id: spec.product
title: Product
state: active
summary: codewiki gives Pi a repo-local, docs-first navigation and drift contract for development projects.
owners:
- product
updated: '2026-04-17'
---

# Product

## Intent

codewiki turns project documentation into a maintained local wiki that agents and humans can bootstrap, review, repair, and compare against code through a deliberately small command surface.

## Primary users

- maintainers shaping intended architecture before or during implementation
- coding agents that need stable navigation and deterministic docs metadata
- brownfield teams trying to map existing code into a cleaner desired-state documentation tree

## Core value

- keep intended state close to repo
- keep roadmap as freshest tracked delta container from specs to code
- keep research compact and reusable
- make drift visible and actionable instead of implicit
- make roadmap progress legible inside Pi through a compact first-party TUI and derived read models
- keep the public UX small enough to feel simple while preserving deeper internal agent composability
- keep Pi sessions resumable by linking task work back to roadmap tasks

## Non-goals

- general-purpose personal knowledge vault features
- rich hosted viewer or MCP storage layer like full LLM Wiki products
- longform archival document taxonomy for plans, drift, ADRs, and analysis as separate top-level buckets

## Product rules

- research captures evidence
- specs define desired state
- roadmap is the top-level container for delta-closing work
- task is the atomic work unit inside roadmap and canonically uses `TASK-###`
- Pi sessions stay native execution history linked to tasks
- generated docs provide navigation, not canonical truth

## Related docs

- [System Overview](system/overview.md)
- [Package Surface](package/overview.md)
- [Extension Runtime](extension/overview.md)
- [Templates and Rebuild](templates/overview.md)
- [Shared Rules](shared/overview.md)
- [Roadmap](../roadmap.md)
