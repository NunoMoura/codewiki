---
id: spec.product
title: Product
state: active
summary: codewiki gives Pi a repo-local, docs-first navigation and execution contract for development projects.
owners:
- product
updated: '2026-04-21'
---

# Product

## Intent

codewiki turns project documentation into a maintained local wiki that agents and humans can bootstrap, inspect, and execute against through a deliberately small public workflow.

## Primary users

- maintainers shaping intended architecture before or during implementation
- coding agents that need stable navigation, deterministic docs metadata, and explicit execution truth
- brownfield teams trying to map existing code into a cleaner desired-state documentation tree

## Core value

- keep intended state close to repo
- keep roadmap as the freshest tracked delta container from specs to code
- keep research compact and reusable
- make drift visible and actionable instead of implicit
- make authored goals explicit enough that validation and verification can measure real alignment instead of vague intent
- make project status legible inside Pi through a compact first-party TUI and derived read models
- let users understand status through four stable questions:
  - how good and aligned is the wiki intent?
  - what roadmap work is moving the project forward?
  - which agents are doing what?
  - how will those agents communicate progress?
- keep the public UX small enough to feel simple while preserving deeper internal agent composability
- keep Pi sessions resumable by linking task work back to roadmap tasks

## Non-goals

- general-purpose personal knowledge vault features
- rich hosted viewer or MCP storage layer like full LLM Wiki products
- longform archival document taxonomy for plans, drift, ADRs, and analysis as separate top-level buckets
- a generic multi-agent control plane detached from roadmap and spec truth
- first-pass implementation of every possible communication channel before the core contract is stable

## Product rules

- research captures evidence
- specs define desired state
- roadmap is the top-level container for delta-closing work
- task is the atomic work unit inside roadmap and canonically uses `TASK-###`
- status should organize understanding around `Wiki`, `Roadmap`, `Agents`, and `Channels`
- `Wiki` is the primary understanding surface because that is where user intent becomes organized project truth
- the `Wiki` surface should help users judge product idea quality, system alignment, and client experience, including non-human clients such as agents, through Product, System, and Clients talkable groups
- the authored folder name may remain `wiki/ux` for now even while panel language says `Clients`, with a deliberate future taxonomy migration tracked in roadmap
- the long-term public workflow should center on `/wiki-bootstrap`, `/wiki-status`, `/wiki-resume`, and `/wiki-config`, with `Alt+W` as the interactive shortcut for status

## Goal quality rule

Well-defined goals are required for strong validation and verification loops.

Authored docs and roadmap tasks should therefore be concrete enough to answer:

- what outcome is intended?
- what evidence would demonstrate alignment?
- what would count as drift or failure?
- what is explicitly out of scope?

## Related docs

- [Clients Overview](../clients/overview.md)
- [System Overview](../system/overview.md)
- [Package Surface](../system/package/overview.md)
- [Extension Runtime](../system/extension/overview.md)
- [Templates and Rebuild](../system/templates/overview.md)
- [Roadmap](../../../wiki/roadmap.md)
