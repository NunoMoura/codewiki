---
id: spec.system.runtime
title: CodeWiki Runtime
state: active
summary: Source concept root for CodeWiki daemon-capable software-development runtime orchestration across agency plans, claims, compiler/gateway preparation, harness boundaries, and session spawning.
owners:
  - architecture
  - engineering
updated: "2026-05-31"
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

The CodeWiki runtime is the package-source domain that executes and, after the daemon refactor, dispatches CodeWiki software-development loops after agency policy has selected and authorized them. It is not the Node runtime, terminal runtime, generic chat gateway, or arbitrary agent swarm. CodeWiki builds on Pi Code as its primary runtime foundation dependency, then layers CodeWiki-specific roadmap, compiler, gateway, worktree, proof, and daemon-job semantics above it.

Pi Code is a foundation, not merely one external harness adapter. CodeWiki should follow the OpenClaw pattern of building on Pi Code primitives while defining explicit model/runtime plug points that can operate the CodeWiki software-development system. Future compatible runtimes or protocols may be added through support contracts, but they must preserve CodeWiki truth, proof, and gate semantics.

The runtime owns bounded execution mechanics now and daemon dispatch mechanics after the approved runtime-daemon refactor:

- read a selected agency plan or scoped work item;
- enforce immediate budget and write/session gates before execution;
- inspect and acquire artifact-status claims for touched task, knowledge, code, build, validation, and state scopes;
- invoke the next deterministic compiler or gateway preparation step that policy allows;
- build source-backed resume context and request or spawn a session/context boundary when useful and allowed;
- enqueue next compiler loops after gateway `pass` with build and validation refs as durable context;
- keep failed or blocked gateways in the same loop/job until rebuilt, fixed, or explicitly blocked for user input;
- record daemon job attempts, worker/session identity, heartbeats, retry limits, block reasons, and structured handoff metadata without duplicating roadmap truth;
- record workflow-efficiency evidence such as interruptions avoided, manual commands avoided, session boundaries used, and platform-limited steps;
- release temporary claims and stop with clear evidence on conflicts, ambiguity, validation blocks, risk escalation, publication/destructive gates, or budget exhaustion.

## Boundary with agency

Agency decides whether CodeWiki may continue. Runtime performs exactly one bounded execution step.

```text
agency planning/policy -> CodeWiki runtime step -> compiler/gateway preparation -> stop or next loop
```

Agency remains responsible for autonomy level, approval cadence, task/sprint/roadmap scope selection, budget defaults, and risk policy. Runtime consumes the agency plan and applies executable orchestration. Runtime may use agency policy helpers, but agency should not own session claims, gateway preflight mechanics, context-boundary delivery, or workflow-efficiency accounting.

## Runtime nomenclature

Only `src/runtime/**` owns the CodeWiki Runtime concept. Helper modules that persist or mutate a specific domain should use names such as `store`, `repository`, `reader`, `writer`, or `service` instead of `runtime` unless they own daemon/harness execution. The existing `src/roadmap/store.ts` name is a migration target because it is roadmap persistence and mutation code, not the CodeWiki Runtime.

## Boundary with harness runtimes

Pi Code owns the primary process/session mechanics CodeWiki builds on: tool invocation, TUI messages, model turns, compaction, replacement sessions, permissions, and host-specific capability delivery. CodeWiki runtime should use Pi Code directly as foundation where appropriate, while still describing the capability boundary in a way future compatible runtimes can satisfy.

CodeWiki runtime must not become a generic model provider, chat gateway, or unsupported harness event loop. A runtime/model plug point must document who owns the model loop, canonical thread/session state, dynamic tools, native tools, context assembly, compaction, and event streams before it can operate CodeWiki jobs.

Adapters expose harness capabilities through ports. Runtime requests capabilities through those ports and records platform-limited steps when a capability is missing. The code contract lives in `src/runtime/ports.ts`: `createPiCodeRuntimeFoundationContract()` defines the first-class Pi Code foundation, and `requireRuntimeCapability()` fails closed with platform-limited evidence when a future runtime does not advertise a needed capability.

```text
CodeWiki runtime request -> adapter port -> harness runtime capability
```

Required capability ownership for the Pi Code foundation:

| Capability | Pi Code foundation owner | CodeWiki responsibility | Unsupported behavior |
| --- | --- | --- | --- |
| Model loop | Pi Code owns provider calls, streaming, retry, abort, and model-turn lifecycle. | Select/store CodeWiki task intent and compiler/gateway boundaries before model work. | Stop as `platform_limited`; do not fabricate a model loop. |
| Session/thread state | Pi Code owns session files, tree state, replacement lifecycle, and current thread state. | Store CodeWiki truth in roadmap/build/validation/Git refs, not chat state. | Stop as `platform_limited`; require compatible session state before running jobs. |
| Tools | Pi Code owns built-in and extension tool execution, validation, rendering, and tool-event ordering. | Expose CodeWiki operations as package tools and enforce artifact/gateway policy. | Stop as `platform_limited`; do not bypass policy through ad hoc commands. |
| Context assembly | Pi Code owns system prompt, skills, prompt templates, context files, tool snippets, and provider payload assembly. | Provide bounded source-backed resume packets and compaction context from CodeWiki refs. | Runtime fail-closes before kickoff when this capability is missing. |
| Compaction | Pi Code owns compaction mechanics and lifecycle events. | Replace generic summaries with CodeWiki-owned source-backed resume context at safe boundaries. | Return visible fallback/manual continuation; do not hide tool results behind compaction. |
| Event streams | Pi Code owns session, agent, turn, message, model, and tool event streams. | Record only CodeWiki evidence needed for claims, validation, daemon jobs, and workflow efficiency. | Record platform-limited evidence; do not assume events happened. |
| Replacement session | Pi Code owns command-context `newSession`/`switchSession`/`fork` with `withSession`. | Request hard context boundaries only through adapter-safe paths and seed source-backed kickoff. | Return visible fallback; tools must not call command-only APIs directly. |
| Worker execution | Not implemented yet; Pi Code is the intended first worker foundation. | Keep daemon jobs as attempts only until explicit spawning/gateway routing lands. | `platform_limited` by default for TASK-064; later tasks may enable it. |

Examples:

| Runtime need | Adapter/harness capability |
| --- | --- |
| Same-session context hygiene | Pi CodeWiki-owned compaction or context refresh. |
| Hard replacement context | Pi `new_session` or another harness replacement-session API. |
| Separate worker execution | Runtime daemon job spawning through Pi Code first, then future supported worker adapters. |
| User-visible kickoff | Protocol-safe custom/user-role-safe message seeded by `wiki_resume_context`. |

Runtime must not inject slash commands as control flow, must not auto-continue from an assistant-leaf message, and must not treat unsupported harness features as normal user work. It should return a visible fallback and platform limitation.

## Source layout

Runtime package source lives under `src/runtime/**`.

```text
src/runtime/
  runner.ts   # bounded runtime step implementation; migration target for daemon dispatcher entrypoints
  ports.ts    # Pi Code foundation and future runtime capability ports
  types.ts    # runtime result, daemon job/run, budget usage, and workflow-efficiency evidence
```

`src/agency/**` keeps agency planning and the `wiki_agency` tool entrypoint. `src/session/**` owns claims and wait/wake state. `src/state/**` owns resume context and generated graph state. `src/validation/**` owns gateway checks. Runtime coordinates those concepts without absorbing their durable truth.

## Daemon job/run model

Daemon jobs live at `.codewiki/runtime/jobs.json`. This path is repo-local runtime state, not package source and not roadmap truth. A job is a durable execution request for one CodeWiki loop against an existing roadmap/source boundary. A run is one worker attempt for that job. Jobs and runs may reference roadmap tasks, compiler builds, validation reports, Git proof, package/archive proof, session claims, and worktree identity, but those referenced artifacts remain canonical.

Job states:

- `queued`: authorized by agency/planning and waiting for a worker attempt.
- `running`: exactly one run attempt is active and heartbeating.
- `blocked`: latest run ended with fail/block/error/stale evidence, missing proof, artifact conflict, budget exhaustion, risk/user gate, or retry limit. The same job can retry only while `max_attempts` permits and an external gate resolves the blocker.
- `completed`: latest run ended with `pass` and emitted required handoff/build/validation/content refs.
- `cancelled`: user or policy stopped the execution request.

Run states:

- `running`: worker has started, owns any required artifact-status claim, and updates `last_heartbeat_at` plus append-only heartbeat records.
- `completed`: run outcome `pass`; any next loop must be represented by a new queued job carrying build/validation refs.
- `blocked`: run outcome `block`; human/policy/planning input is required before retry or reroute.
- `failed`: run outcome `fail` or `error`; validator/builder must repair evidence before retry.
- `stale`: heartbeat expired or worker vanished; runtime may retry if `max_attempts` permits.
- `cancelled`: user or policy stopped the run.

Lifecycle contract:

```text
queued -> running -> completed
queued -> running -> blocked -> running
queued -> running -> failed/stale -> running
queued/running/blocked -> cancelled
completed/cancelled are terminal
```

A pass boundary never mutates the roadmap directly. It enqueues or hands off the next compiler/gateway loop with source-backed refs. A fail/block boundary keeps the same loop/job blocked until rebuilt, repaired, rerouted by validation, or explicitly escalated. Artifact status in `.codewiki/session/queue.json` remains the short-lived concurrency lease; daemon jobs record execution attempts, heartbeats, retries, and handoff metadata.

Backend daemon scheduling is the priority before board or other rich UX work. Chat remains sufficient as the user interface while the runtime proves safe scheduling, escalation, graph-centered access, and bounded parallel execution.

## Brain lease and worker lifecycle

The runtime should use a durable Brain lease for each project instead of assuming the first open session remains the conductor forever. The default election may allow the first project session to claim the Brain role, but the runtime truth is a lease that records session id, session file, heartbeat, active sprint or roadmap refs, model policy, and takeover rules. When the Brain lease is stale or absent, workers block or a new session explicitly claims the Brain role through policy-gated runtime state.

Worker sessions are run-scoped by default. A worker is spawned from a source-backed kickoff, reads graph/roadmap/build refs, acquires narrow artifact scopes, heartbeats during the run, emits implementation or validation evidence, records `completed`, `blocked`, `failed`, `stale`, or `cancelled`, releases claims, persists handoff metadata, and then shuts down unless policy keeps it alive for review. Durable state belongs in CodeWiki refs, not worker chat history.

## Worker escalation and model policy

Workers ask the Brain through durable runtime records, not direct chat. When a worker encounters ambiguity it records a question or block on the job/run with attempted evidence, source refs, suggested options, and a block reason such as `user_input_required`, `planning_required`, `decision_required`, `validation_required`, `artifact_conflict`, `platform_limited`, or `retry_limit`. The Brain answers through a durable comment or resolution, then the dispatcher unblocks or requeues the job, or routes the issue to decision/planning/validation when the answer changes semantics, scope, or proof requirements.

Planning/runtime metadata may assign model policy per job: desired model/provider, role profile, thinking level, fallback model, token/cost budget, risk tier, and approval evidence for expensive or high-risk model use. Runtime starts the worker with the requested model when the adapter advertises support; otherwise it follows fallback policy or blocks as `platform_limited`.

Worker question classes are explicit: evidence gaps retry locally, task-scope ambiguity escalates to the Brain, semantic/product/system changes route to decision, schedule or task-boundary changes route to planning, validation/proof blocks route to the gate capability, and budget/model upgrades above policy require Brain or user approval evidence.

## Daemon dispatcher skeleton

The dispatcher runs in one-shot tick mode. One tick may claim one runnable job, write one run attempt with a lease expiry, append one heartbeat, optionally finish that attempt from a deterministic executor result, or mark one stale running attempt. It must not spin an unbounded loop, spawn Pi sessions, close roadmap tasks, or bypass compiler/gateway policy.

Runnable jobs are `queued` jobs or `blocked` jobs whose block reason is retryable and whose attempts are below `max_attempts`. Running jobs stay locked until their lease expires or their heartbeat exceeds the stale threshold. Stale attempts become `stale` runs and blocked jobs; retry is allowed only while the retry circuit breaker permits it. When attempts reach `max_attempts`, the dispatcher records a `retry_limit` block reason and stops selecting that job.

This skeleton intentionally executes only pure lifecycle transitions. Later tasks may attach Pi Code session spawning or gateway pass/fail/block routing behind explicit runtime ports, but this dispatcher already preserves the core invariants: bounded work, lease/TTL ownership, deterministic stale recovery, and daemon jobs as execution attempts rather than roadmap truth.

## Invariants

- Runtime executes at most one bounded step per call until daemon scheduling explicitly dispatches a job attempt.
- Runtime does not bypass decision, planning, implementation, validation, task-close, publication, or destructive gates.
- Runtime does not create compiler outputs by itself; it invokes the correct compiler/gateway tool, schedules the next compiler loop after a pass, or prepares a safe source-backed kickoff.
- Runtime treats artifact status as temporary coordination evidence, not durable roadmap truth.
- Runtime releases claims it acquires before returning unless the adapter/process fails; release failures are recorded as platform-limited evidence.
- Runtime uses Pi Code as the first-class foundation and requests any optional harness/runtime capabilities through explicit contracts, recording unsupported capabilities rather than fabricating host behavior.
- Runtime is package source under `src/runtime/**`; dogfood operational state under `.codewiki/runtime/**` remains repo-local state, not package source.

## Related docs

- [Agency Controller](agency.md)
- [API](api.md)
- [Session Queue Coordination](api.md)
- [Validation Gateway](validation-gateway.md)
- [Compilers](compilers.md)
- [File Structure](file-structure.md)
