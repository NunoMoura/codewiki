---
id: research.openclaw-hermes-runtime-daemon-2026-05-30
title: OpenClaw and Hermes runtime/daemon lessons for CodeWiki
state: active
summary: Research notes for the approved CodeWiki daemon-runtime direction.
owners:
  - architecture
updated: "2026-05-30"
source_urls:
  - https://docs.openclaw.ai/pi
  - https://docs.openclaw.ai/concepts/agent-runtimes
  - https://docs.openclaw.ai/concepts/agent-loop
  - https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
  - https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban
---

# OpenClaw and Hermes runtime/daemon lessons for CodeWiki

## Research scope

This note captures the architecture lessons that informed the approved daemon-runtime decision rows `DAEMON-RUNTIME-001` through `DAEMON-RUNTIME-006` in `DT-2026-05-30-21`.

The research question was: how should CodeWiki become the best software-development orchestration layer while building on Pi Code, learning selectively from OpenClaw and Hermes, and preserving CodeWiki's compiler/gateway/source-truth model?

## OpenClaw lessons

OpenClaw separates provider, model, agent runtime, and channel. An agent runtime owns one prepared model loop; a harness implements a runtime. This distinction prevents runtime execution policy from being confused with model/provider configuration.

OpenClaw's runtime layout shows useful boundaries:

- embedded agent runner owns attempt loop, provider stream adapters, compaction, model selection, and session wiring;
- sessions own persistence, extension loading, resources, skills, prompts, themes, and TUI-backed renderers;
- agent core owns lower-level harness types, compaction helpers, prompt templates, and tool/session contracts;
- runtime facades expose local integration points without plugin callers importing internal source paths.

OpenClaw's loop documentation emphasizes serialized runs per session, lifecycle/stream events, session write locks, timeout/abort behavior, prompt assembly, hook points, and compaction events. CodeWiki should reuse these ideas for session safety and capability contracts, but apply them to software-development compiler loops rather than generic chat.

The most important CodeWiki lesson is not "Pi as one adapter." OpenClaw builds on the Pi-style foundation and then adds runtime/model selection. CodeWiki should build on Pi Code as the primary runtime foundation dependency, then define explicit model/runtime plug points that preserve CodeWiki roadmap, build, validation, worktree, and proof semantics.

## Hermes lessons

Hermes exposes one core agent through multiple programmatic surfaces: ACP over stdio, TUI gateway JSON-RPC, and HTTP/SSE API server. Those protocols differ in transport and feature exposure, but they drive the same agent core. CodeWiki can learn from this by keeping its API and runtime semantics stable while allowing multiple harness/protocol surfaces later.

Hermes Kanban is the strongest daemon/dispatcher reference. It uses a durable local board, dispatcher, tasks, runs, comments, links, worker identity, heartbeats, retry limits, block/unblock lifecycle, and structured handoff metadata. The key pattern for CodeWiki is durable execution attempts that survive context loss and process restarts.

CodeWiki must not copy Hermes' board as the main work truth. CodeWiki already has roadmap tasks, builds, validation reports, graph state, and Git/content proof. A CodeWiki daemon job/run store should record execution attempts, not replace roadmap truth.

## CodeWiki-specific principles

1. CodeWiki is a software-development orchestration system, not a general-purpose chat agent.
2. Pi Code is the primary runtime foundation dependency.
3. Runtime/model plug points are allowed only when capability contracts preserve CodeWiki truth and proof semantics.
4. Roadmap remains software work truth.
5. Builds remain compiler handoff truth.
6. Validation remains gate truth.
7. Git tree/worktree/package/remote proof remains content proof.
8. Daemon jobs/runs are execution attempts only.
9. Gateway `fail` or `block` keeps the same job/loop active or blocked until fixed, rebuilt, or explicitly escalated.
10. Gateway `pass` is the safe boundary where the daemon can enqueue the next compiler loop using build and validation refs.

## Recommended direction

CodeWiki should implement a daemon-capable runtime in small slices:

1. Runtime nomenclature cleanup and ownership contract.
2. Research-backed daemon/runtime architecture decision and planning sprint.
3. Durable daemon job/run schema with attempts, heartbeats, block reasons, and build/validation refs.
4. Pi Code-backed session spawning for the next compiler loop after gateway pass.
5. Gateway pass/fail/block routing into daemon jobs.
6. Runtime/model capability contracts for future compatible backends.

This direction combines OpenClaw's runtime/harness/session taxonomy, Hermes' durable dispatcher pattern, and CodeWiki's existing compiler/gateway/source-truth model.
