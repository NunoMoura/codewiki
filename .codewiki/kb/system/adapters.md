---
id: spec.system.adapters
title: Adapters
state: active
summary: Harness and protocol translation boundary for Pi, CLI, MCP, Claude Code, Codex, or other integrations.
owners:
  - architecture
updated: "2026-06-03"
---

# Adapters

## Responsibility

Adapters translate non-Pi external harness capabilities and protocol surfaces into CodeWiki tools and translate CodeWiki results back into commands, tools, messages, protocols, or sessions. Pi is the foundation path for the CodeWiki software-development distribution, not a mere adapter in the target architecture.

Adapters do not own CodeWiki semantics. Loop roots, telemetry, graph, gateway, runtime, agency, and project modules own semantics, including compiler behavior, gate criteria, decision row state, graph behavior, runtime coordination, and local execution policy. Adapters only translate external harness or protocol concerns into those semantics.

## Access surfaces and UIs

Tools, commands, skills, CLI, MCP, package APIs, and harness integrations are adapter or API access surfaces. They are not product UIs unless they render a visual screen, panel, board, graph view, or editor interface for a human.

Visual UI expectations live under product `uis/**` and system UI docs. Active Pi-hosted status/config panels currently live under compatibility path `src/adapters/pi/ui/**` and should migrate toward `src/pi/**`; deprecated browser UI source has been removed. Harness-native approval controls such as Pi decision cards belong in Pi integration but must write through CodeWiki capabilities such as `wiki_decide`; they must not bypass decision compiler output or gateway gates. Adapter, launch, protocol, and harness mechanics live here and in [CodeWiki API](api.md).

## Current adapter

Pi is the only implemented host runtime now and is the first-class CodeWiki foundation path. It packages:

- commands,
- tools,
- compact visual status UI,
- interactive decision/task approval surfaces when the harness TUI supports them,
- skills,
- session integration,
- session boundary and handoff control,
- session queue artifact statuses for parallel work,
- setup actions that call application bootstrap tools.

Pi integration advertises its foundation capabilities through `piCodeRuntimeFoundation()` in compatibility path `src/adapters/pi/tools/ports.ts`. That contract says Pi Code owns model loop execution, session/thread state, tool execution, context assembly, compaction mechanics, replacement-session lifecycle, and event streams. CodeWiki owns KB/telemetry/Git truth, daemon job semantics, artifact-status coordination, source-backed resume context, and gateway policy above that foundation. Future adapters must satisfy the same capability contract before they can run CodeWiki jobs.

## Future adapters

Future harnesses may not support Pi packages or extensions. They should use the same API through optional CLI automation, MCP, or a package-level programmatic interface. For interactive software development, CodeWiki is a Pi distribution: Pi provides the terminal harness and CodeWiki supplies API-backed commands, tools, TUI panels, skills, and prompt contract.

Session boundary control is an adapter capability, not a Pi-only semantic. CodeWiki can request `codewiki-compaction`, `new-session`, `context-refresh`, `context-reset` compatibility, or `external-orchestrator` modes when agents need context hygiene or policy requires a boundary. Same-agent soft context hygiene is CodeWiki-owned compaction or `context_refresh`; hard replacement-session hygiene is `new_session`; true transfer is transfer to another session, agent, or role. In Pi, an LLM-callable tool cannot call command-only `ctx.newSession()`, so the internal `wiki_resume_context` tool builds the bounded prompt packet while `/wiki-resume --new` uses command-context `ctx.newSession({ withSession })` to create a fresh replacement session and seed it. Tool-context `context-refresh` and `context-reset` must return visible results instead of calling `ctx.compact()` during tool execution, because compaction can hide the visible tool response and interrupt the session before the agent sees the result. Pi may trigger CodeWiki-owned compaction only from safe adapter lifecycle points after the agent loop ends, and `session_before_compact` injects the regenerated resume packet instead of a chat-history summary. Gateway-passed validation reports can request the next CodeWiki-owned context boundary with the passed build and validation report refs; compiler build creation alone must not request pre-gateway compaction. After successful CodeWiki compaction, Pi should auto-pick up only after the agency runner approves the source-backed resume packet and then delivers a protocol-safe custom kickoff message generated from `wiki_resume_context` with `triggerTurn=true`; it must never call continuation from an assistant leaf. The runner blocks when intent is not stored in CodeWiki refs, budgets are exhausted, approval is required, or the adapter cannot deliver a safe kickoff; hard new-session pickup must use command-context `ctx.newSession()` or report a visible fallback. Pi `sendUserMessage` follow-ups disable prompt/command expansion and would deliver slash text as chat, not execute it; therefore the adapter must not auto-inject legacy session-handoff commands through follow-up chat. Pi `ctx.newSession()` creates a fresh replacement session in the current Pi process/terminal; the current extension API does not expose a portable way to open a new terminal tab. A CLI/MCP adapter may spawn a bounded worker process, clear conversation state, or emit a plan-only boundary when it cannot replace context itself.

Pi-facing extension, skill, runtime, or API source changes must surface explicit `/reload` guidance in final tool summaries and validation metadata. CodeWiki compaction, context refresh, and reset boundaries do not reload live Pi integration code and must never restart Pi automatically.

Artifact-status wait/release coordination is also an adapter capability. The application queue computes pending and ready waits, but an interactive adapter must give waiting sessions a wake path. Pi sessions watch the CodeWiki session queue and inject a bounded wake message when a wait owned by the current session becomes ready; the agent must still re-read current state and claim/mark scopes before writing. Other adapters can implement the same semantics through filesystem watches, RPC events, web sockets, MCP notifications, or worker orchestration.

Role worktree orchestration is an adapter/local-runtime capability over shared CodeWiki semantics. For parallel write work, adapters should ask the application worktree factory for a task/role worktree instead of letting multiple builders, validators, publishers, or cleanup agents edit the same root working tree. The adapter may translate that request into Git worktree commands, bounded worker processes, branch checkout, or a plan-only instruction when the host cannot create a separate filesystem workspace. The resulting path, branch, base/head/tree SHA, clean state, and digest metadata must flow back into artifact status and validation reports.

Publisher orchestration is also adapter-facing but not adapter-owned. Builders should hand off branch or patch refs, validators should check immutable refs from fresh worktrees, and a publisher role should serialize final merge, generated-state refresh, commit, and clean proof in the coordination worktree. Wait/wake messages should name the exact branch, patch, claim, validation, or publisher commit that unblocks work; a vague “dirty from another session” message is insufficient when isolated refs exist.

Potential future access paths:

| Harness or access surface | Likely adapter |
| --- | --- |
| Claude Code | CLI or MCP. |
| Codex | CLI or MCP. |
| Other local agents | CLI, MCP, or package API. |
| Editor integrations | CLI, MCP, host-native extension, or language-specific wrapper. |
| Humans | Pi-hosted commands/status output and compact host panels. |

Do not create empty adapter implementations before they are needed. Keep the structure ready, but implement only real access surfaces.

## Skills

Packaged CodeWiki skills are adapter-facing workflow assets for agents. They should remain progressive-disclosure prompts that route work into the same application tools and three-loop model.

The normal workflow skill set mirrors the canonical loops: `codewiki-decision`, `codewiki-planning`, and `codewiki-implementation`. Gateway/validation behavior is a gate protocol and tool contract, not a fourth workflow skill. Do not keep `/skill:codewiki-validation`, validation-skill shims, or hidden validation aliases; validator kickoff packets and `wiki_gate` carry the durable gate rules.

The generic `codewiki` router skill is not a normal workflow surface. Its invariant/routing content belongs in the injected CodeWiki system prompt and package docs. Public tools keep the `wiki_*` convention during their own migration, but removed skill surfaces should not be preserved as old commands, shims, or aliases.

Skill assets own agent prompt templates, bootstrap guidance, loop guidance, playbooks, and optional helper scripts/tools. Source code may execute these workflows through application tools, but skills must not import adapters or become hidden product logic.

Global third-party skills should not mutate CodeWiki state unless adapted to the CodeWiki contract. General engineering skills are acceptable when they do not override CodeWiki knowledge, roadmap, build, validation, session queue, or state semantics.

## Rules

Role worktree and publisher details live in [Role Worktree Isolation](worktree-isolation.md).

- Harness-specific dependencies stay in Pi integration or future adapters.
- Adapters call loop/API capabilities.
- Adapters never hand-edit generated graph state.
- Adapters should support bounded context and compact outputs.
- Adapter differences must not create different truth semantics.
- Adapter-exposed agency controls must route through application tools and the agency controller rather than running unbounded loops directly.
- Adapter session-control mechanisms must be explicit context boundaries with bounded kickoff context; they must not silently carry builder chat history across isolation boundaries. Same-agent auto-pickup after reset must start from a source-backed custom kickoff or equivalent user-role-safe message, not from an assistant message. Handoff wording is reserved for transfer between sessions, agents, or roles.

## Related docs

- [API](api.md)
- [Extension](extension.md)
- [Agency Controller](agency.md)
