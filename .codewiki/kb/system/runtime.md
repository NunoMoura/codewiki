---
id: spec.system.runtime
title: CodeWiki Runtime
state: active
summary: Source concept root for CodeWiki daemon-capable software-development runtime orchestration across agency plans, leases, compiler/gateway preparation, harness boundaries, and session spawning.
owners:
  - architecture
  - engineering
updated: "2026-06-11"
diagram_refs:
  - component-map:runtime
  - file-structure-map:runtime_orchestration_boundary
code_paths:
  - src/runtime
  - src/agency/tool.ts
  - src/adapters/pi/tools/ports.ts
code_paths_mode: explicit_override
---

# CodeWiki Runtime

## Responsibility

The CodeWiki runtime executes and, after the daemon refactor, dispatches CodeWiki software-development loops after agency policy authorizes them. It is not the Node runtime, a generic chat gateway, or an arbitrary agent swarm. CodeWiki builds on Pi Code as its primary runtime foundation and layers roadmap, compiler, gateway, worktree, content-evidence, and daemon-job semantics above it.

The long-term CodeWiki distribution should remain Pi-based: CodeWiki configures Pi Code with CodeWiki defaults, prompt contract, tools, skills, and workflow policy instead of forking Pi internals. Forking is reserved for a future blocker where Pi SDK/runtime hooks cannot enforce required CodeWiki behavior. Optional CLI entrypoints may support bootstrap, CI, linter, or admin workflows, but interactive development happens through Pi-hosted CodeWiki surfaces.

Runtime performs one bounded execution step at a time. Agency decides whether CodeWiki may continue; runtime performs the selected step and stops with evidence. Before claiming scopes or requesting a context boundary, runtime verifies the selected trace/task automation-readiness contract. Missing, expired, ambiguous, blocked, or waiting contracts stop the runner with exact blockers and next safe actions; only `runnable`, `retryable`, or `promotable` contracts may proceed to a decision, planning, implementation, or gate-preparation step. Target runtime state is represented by trace events and tail checkpoints; compatibility session/runtime files are temporary coordination surfaces only.

The daemon can request fresh Pi subagent or gate sessions only through an explicit runtime context-boundary adapter port. Command-context `newSession`/`withSession` remains replacement-session support for `/wiki-resume --new`; it is not evidence of parallel subagent spawning. The Pi adapter’s supported bridge is subprocess-backed (`pi --mode json -p --no-session`) and marks `chat_context_shared=false`. If the bridge is unavailable, runtime records a precise `platform_limited` blocker with trace/gate/Git refs and manual `/wiki-resume --new` remediation.

Runtime dispatch is role-free. Fresh subagent and compaction requests carry a context-boundary reason, trace/task/sprint scope, graph lens, expected output, constraints, source refs, compiler-output refs, gate refs, Git refs, artifact refs, and content-evidence requirements. Compatibility fields may still record old builder/validator/publisher labels, but those labels are not scheduling, policy, or gate criteria. Dirty implementation handoff requires exact `working_tree_digest` plus patch or worktree handoff refs. Promotion gates such as task-close, sprint-close, ship-ready, publication, and release require immutable content evidence such as commit/tree/package/archive/remote refs. Missing content proof blocks before dispatch or compaction pickup and returns same-loop remediation to the originating compiler context; it is not a request for the end user to supply refs by hand.

Runtime keeps spawned and compacted sessions high-signal and low-noise. The Source-backed context packet points to the current trace head or task/sprint scope, graph lens, exact source refs, blockers, artifact status, budget, expected output, and proof requirements. It does not include full chat history, full graph dumps, or unrelated roadmap work.

Context refresh is disabled for this repository during the rebuild. The old CodeWiki-owned refresh window, source-backed projection injection, and automatic `wiki_resume_context` pickup caused agents to resume deprecated workflow assumptions. Until a future explicit decision reintroduces the extension, conversation compression must use Pi native automatic compaction only. No CodeWiki runtime code may inject refresh control messages, hidden projection messages, or per-turn CodeWiki compaction triggers.

Runtime constraints use one generic materialization procedure. A constraint is classified as durable policy, task constraint, or session runtime constraint; records its scope, owner/ref source, expiry or inheritance rule, and blocking behavior; and is externalized to KB, roadmap/task context, session/runtime coordination, or trace evidence before any refresh/spawn that depends on it. If required intent or constraints exist only in raw chat, refresh blocks until they are externalized or the user explicitly drops them.

Daemon/agency completion is the enabling sprint for the broader structure refactor. Until runtime aligns with the three-loop model, telemetry traces, gate diagnostics/remediation, graph readiness queries, fresh worker session spawning, and safe worktree publishing, daemon automation is pilot-capable for observe/maintain or narrow bounded steps rather than broad autonomous refactor execution.

## Component and flow detail

- [Runtime and daemon component](components/runtime-daemon.md) owns runtime paths and contracts.
- [Runtime daemon dispatch](flows/runtime-daemon-dispatch.md) describes job/run lifecycle.
- [Artifact lease wait/wake](flows/artifact-claim-wait-wake.md) describes session queue coordination. The file path retains legacy claim wording until migration renames it.
- [Resume context boundary](flows/resume-context-boundary.md) describes source-backed context refresh and replacement-session starts.

## Source layout

```text
src/runtime/
  runner.ts   # bounded runtime step implementation and dispatcher migration target
  ports.ts    # Pi Code foundation, fresh-worker bridge, and future runtime capability ports
  types.ts    # runtime result, fresh-worker request, daemon job/run, budget, and workflow evidence
```

Runtime coordinates `src/agency/**`, current compatibility `src/session/**`, current compatibility `src/state/**`, current compatibility `src/build/**`, and gateway behavior without absorbing their durable truth. Target source moves generated state to `src/graph/**`, compiler engines to loop roots, and trace persistence to `src/telemetry/**`.

## Daemon job model

Target daemon jobs are trace-backed. Planning trace events define work units, dependencies, waves, budgets, conflict scopes, and context-boundary requirements. Implementation/runtime trace events record worker starts, claims, renewals, releases, blocks, completion, tests, gates, and content evidence. Tail checkpoints expose ready work units, active claims, active workers, blockers, and retryable/promotable states for fast scheduling.

Compatibility `.codewiki/runtime/jobs.json`, `.codewiki/runtime/state.json`, and `.codewiki/session/**` files may exist during migration, but they are not target truth. They must be derivable from trace events/tails or treated as ephemeral handoff state with TTL/heartbeat semantics.

Parallel workers claim work by appending trace events with compare-and-swap on the expected last sequence. A claim event records work-unit id, worker/session id, conflict scopes, expiry, and source refs. A stale or conflicting append reloads the trace tail and retries or waits. Any OS/file lock used to serialize append is gitignored and non-truth.

Fail/block boundaries keep the same canonical loop or job blocked until evidence, structured gate diagnostics/remediation, policy, retry limits, or user input resolves the issue. Daemon and runner scheduling consume the same trace/view readiness predicate so retryable failure, claim wait, and promotion states are source-backed and do not rely on chat inference.

## Invariants

- Runtime does not bypass decision, planning, implementation, publication, release, or destructive gate criteria.
- Runtime treats compatibility artifact status as temporary coordination evidence; target claims live in trace implementation/runtime events and tails.
- Runtime releases leases it acquires before returning unless the adapter/process fails and records that failure.
- Runtime requests host capabilities through explicit adapter ports and records platform-limited evidence instead of fabricating behavior.
- Runtime owns all subagent spawning and context-boundary mechanics; decision, planning, implementation, and gates request boundaries but do not own dispatch.
- Runtime dispatch and compaction use context-boundary reason, source refs, expected output, constraints, and budgets rather than canonical roles.
- Dogfood operational state under `.codewiki/runtime/**` and `.codewiki/session/**` is compatibility coordination state, not package source or target truth root.

## Related docs

- [Agency Controller](agency.md)
- [API](api.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Worktree Isolation](worktree-isolation.md) — compatibility doc retaining historical role wording until source schemas migrate.
