---
id: spec.system.adapters
title: Adapters
state: active
summary: Harness and protocol translation boundary for Pi, CLI, MCP, Claude Code, Codex, or other integrations.
owners:
  - architecture
updated: "2026-05-16"
code_paths:
  - src/adapters
  - src/application
  - skills/codewiki
---

# Adapters

## Responsibility

Adapters translate external harness capabilities and protocol surfaces into application tools and translate CodeWiki results back into commands, tools, messages, protocols, or sessions.

Adapters do not own CodeWiki semantics. Domain and application layers own semantics, including compiler behavior, gateway policy, state-engine behavior, session queue semantics, and the built-in local runtime. Adapters only translate external harness or protocol concerns into those semantics.

## Access surfaces and UIs

Tools, commands, skills, CLI, MCP, package APIs, and harness integrations are adapter or API access surfaces. They are not product UIs unless they render a visual screen, panel, board, graph view, or editor interface for a human.

Visual UI expectations live under product `uis/**` and system UI docs. Browser UI source belongs under `src/ui/**`, not under `src/adapters/**`. Adapter, launch, protocol, and harness mechanics live here and in [CodeWiki API](api.md).

## Current adapter

Pi is the only implemented harness adapter now. It packages:

- commands,
- tools,
- compact visual status UI,
- skills,
- session integration,
- session handoff control,
- session queue artifact statuses for parallel work,
- setup actions that call application bootstrap tools.

## Future adapters

Future harnesses may not support Pi packages or extensions. They should use the same API through CLI, MCP, or a package-level programmatic interface.

Session handoff is an adapter capability, not a Pi-only semantic. CodeWiki can request `new-session`, `context-reset`, or `external-orchestrator` modes when build/graph policy requires fresh context. Each adapter maps that semantic request to its native mechanism. In Pi, an LLM-callable tool cannot call command-only `ctx.newSession()`, and direct tool-context `ctx.compact()` can hide the tool response, so tool-context `new-session` and `context-reset` handoffs stage a durable handoff artifact and queue the internal `/wiki-session-handoff` command as a follow-up rather than asking the user to run it. `/wiki-session-handoff` remains the command-context executor and performs `ctx.newSession()` or `ctx.compact()`. A CLI/MCP adapter may spawn a bounded worker process, clear conversation state, or emit a plan-only handoff when it cannot replace context itself.

Potential future access paths:

| Harness or access surface | Likely adapter |
| --- | --- |
| Claude Code | CLI or MCP. |
| Codex | CLI or MCP. |
| Other local agents | CLI, MCP, or package API. |
| Editor integrations | CLI, MCP, local CodeWiki UI URL, or language-specific wrapper. |
| Humans | Local CodeWiki UI, CLI/status output, and compact host panels. |

Do not create empty adapter implementations before they are needed. Keep the structure ready, but implement only real access surfaces.

## Skills

Packaged CodeWiki skills are adapter-facing workflow assets for agents. They should remain progressive-disclosure prompts that route work into the same application tools and loop model.

Skill assets own agent prompt templates, bootstrap guidance, loop guidance, playbooks, and optional helper scripts/tools. Source code may execute these workflows through application tools, but skills must not import adapters or become hidden product logic.

Global third-party skills should not mutate CodeWiki state unless adapted to the CodeWiki contract. General engineering skills are acceptable when they do not override CodeWiki knowledge, roadmap, build, validation, session queue, or state semantics.

## Rules

- Harness-specific dependencies stay in adapters.
- Adapters call application use cases or API capabilities.
- Adapters never hand-edit generated graph state.
- Adapters should support bounded context and compact outputs.
- Adapter differences must not create different truth semantics.
- Browser UI code lives under `src/ui/**` and must not import Pi SDK or Pi TUI packages.
- Adapter-exposed agency controls must route through application tools and the agency controller rather than running unbounded loops directly.
- Adapter session-control mechanisms must be explicit handoffs with bounded kickoff context; they must not silently carry builder chat history across isolation boundaries.

## Related docs

- [API](api.md)
- [CodeWiki UI](control-room-ui.md)
- [Extension](extension.md)
- [Agency Controller](agency.md)
