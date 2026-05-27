---
id: spec.system.adapters
title: Adapters
state: active
summary: Harness and protocol translation boundary for Pi, CLI, MCP, Claude Code, Codex, or other integrations.
owners:
  - architecture
updated: "2026-05-27"
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
- session boundary and handoff control,
- session queue artifact statuses for parallel work,
- setup actions that call application bootstrap tools.

## Future adapters

Future harnesses may not support Pi packages or extensions. They should use the same API through CLI, MCP, or a package-level programmatic interface.

Session boundary control is an adapter capability, not a Pi-only semantic. CodeWiki can request `codewiki-compaction`, `new-session`, `context-refresh`, `context-reset` compatibility, or `external-orchestrator` modes when agents need context hygiene or policy requires a boundary. Same-agent soft context hygiene is CodeWiki-owned compaction or `context_refresh`; hard replacement-session hygiene is `new_session`; true transfer is transfer to another session, agent, or role. In Pi, an LLM-callable tool cannot call command-only `ctx.newSession()`, so the internal `codewiki_resume_context` tool builds the bounded prompt packet while `/wiki-resume --new` uses command-context `ctx.newSession({ withSession })` to create a fresh replacement session and seed it. Tool-context `context-refresh` and `context-reset` must return visible results instead of calling `ctx.compact()` during tool execution, because compaction can hide the visible tool response and interrupt the session before the agent sees the result. Pi may trigger CodeWiki-owned compaction only from safe adapter lifecycle points after the agent loop ends, and `session_before_compact` injects the regenerated resume packet instead of a chat-history summary. After successful CodeWiki compaction, Pi should auto-pick up only by delivering a protocol-safe custom kickoff message generated from `codewiki_resume_context` with `triggerTurn=true`; it must never call continuation from an assistant leaf. Pi `sendUserMessage` follow-ups disable prompt/command expansion and would deliver slash text as chat, not execute it; therefore the adapter must not auto-inject legacy session-handoff commands through follow-up chat. Pi `ctx.newSession()` creates a fresh replacement session in the current Pi process/terminal; the current extension API does not expose a portable way to open a new terminal tab. A CLI/MCP adapter may spawn a bounded worker process, clear conversation state, or emit a plan-only boundary when it cannot replace context itself.

Artifact-status wait/release coordination is also an adapter capability. The application queue computes pending and ready waits, but an interactive adapter must give waiting sessions a wake path. Pi sessions watch the CodeWiki session queue and inject a bounded wake message when a wait owned by the current session becomes ready; the agent must still re-read current state and claim/mark scopes before writing. Other adapters can implement the same semantics through filesystem watches, RPC events, web sockets, MCP notifications, or worker orchestration.

Role worktree orchestration is an adapter/local-runtime capability over shared CodeWiki semantics. For parallel write work, adapters should ask the application worktree factory for a task/role worktree instead of letting multiple builders, validators, publishers, or cleanup agents edit the same root working tree. The adapter may translate that request into Git worktree commands, bounded worker processes, branch checkout, or a plan-only instruction when the host cannot create a separate filesystem workspace. The resulting path, branch, base/head/tree SHA, clean state, and digest metadata must flow back into artifact status and validation reports.

Publisher orchestration is also adapter-facing but not adapter-owned. Builders should hand off branch or patch refs, validators should check immutable refs from fresh worktrees, and a publisher role should serialize final merge, generated-state refresh, commit, and clean proof in the coordination worktree. Wait/wake messages should name the exact branch, patch, claim, validation, or publisher commit that unblocks work; a vague “dirty from another session” message is insufficient when isolated refs exist.

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

Role worktree and publisher details live in [Role Worktree Isolation](worktree-isolation.md).

- Harness-specific dependencies stay in adapters.
- Adapters call application use cases or API capabilities.
- Adapters never hand-edit generated graph state.
- Adapters should support bounded context and compact outputs.
- Adapter differences must not create different truth semantics.
- Browser UI code lives under `src/ui/**` and must not import Pi SDK or Pi TUI packages.
- Adapter-exposed agency controls must route through application tools and the agency controller rather than running unbounded loops directly.
- Adapter session-control mechanisms must be explicit context boundaries with bounded kickoff context; they must not silently carry builder chat history across isolation boundaries. Same-agent auto-pickup after reset must start from a source-backed custom kickoff or equivalent user-role-safe message, not from an assistant message. Handoff wording is reserved for transfer between sessions, agents, or roles.

## Related docs

- [API](api.md)
- [CodeWiki UI](control-room-ui.md)
- [Extension](extension.md)
- [Agency Controller](agency.md)
