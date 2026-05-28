---
id: spec.system.runtime
title: CodeWiki Runtime
state: active
summary: Source concept root for bounded CodeWiki execution orchestration across agency plans, claims, compiler/gateway preparation, and harness boundaries.
owners:
  - architecture
  - engineering
updated: "2026-05-28"
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

The CodeWiki runtime is the package-source domain that executes one bounded CodeWiki step after agency policy has selected and authorized that step. It is not the Pi runtime, Node runtime, terminal runtime, or harness event loop. Harnesses run the process and provide capabilities; CodeWiki runtime coordinates CodeWiki semantics inside those capabilities.

The runtime owns bounded execution mechanics:

- read a selected agency plan or scoped work item;
- enforce immediate budget and write/session gates before execution;
- inspect and acquire artifact-status claims for touched task, knowledge, code, build, validation, and state scopes;
- invoke the next deterministic compiler or gateway preparation step that policy allows;
- build source-backed resume context and request a session/context boundary when useful and allowed;
- record workflow-efficiency evidence such as interruptions avoided, manual commands avoided, session boundaries used, and platform-limited steps;
- release temporary claims and stop with clear evidence on conflicts, ambiguity, validation blocks, risk escalation, publication/destructive gates, or budget exhaustion.

## Boundary with agency

Agency decides whether CodeWiki may continue. Runtime performs exactly one bounded execution step.

```text
agency planning/policy -> CodeWiki runtime step -> compiler/gateway preparation -> stop or next loop
```

Agency remains responsible for autonomy level, approval cadence, task/sprint/roadmap scope selection, budget defaults, and risk policy. Runtime consumes the agency plan and applies executable orchestration. Runtime may use agency policy helpers, but agency should not own session claims, gateway preflight mechanics, context-boundary delivery, or workflow-efficiency accounting.

## Boundary with harness runtimes

Harness runtimes such as Pi own process/session mechanics: tool invocation, TUI messages, model turns, compaction, replacement sessions, permissions, and host-specific capability delivery. CodeWiki runtime must not assume those capabilities exist or implement a harness event loop.

Adapters expose harness capabilities through ports. Runtime requests capabilities through those ports and records platform-limited steps when a capability is missing.

```text
CodeWiki runtime request -> adapter port -> harness runtime capability
```

Examples:

| Runtime need | Adapter/harness capability |
| --- | --- |
| Same-session context hygiene | Pi CodeWiki-owned compaction or context refresh. |
| Hard replacement context | Pi `new_session` or another harness replacement-session API. |
| Separate worker execution | External orchestrator or future worker adapter. |
| User-visible kickoff | Protocol-safe custom/user-role-safe message seeded by `codewiki_resume_context`. |

Runtime must not inject slash commands as control flow, must not auto-continue from an assistant-leaf message, and must not treat unsupported harness features as normal user work. It should return a visible fallback and platform limitation.

## Source layout

Runtime package source lives under `src/runtime/**`.

```text
src/runtime/
  runner.ts   # bounded runtime step implementation
  ports.ts    # harness/runtime capability ports
  types.ts    # runtime result, budget usage, and workflow-efficiency evidence
```

`src/agency/**` keeps agency planning and the `codewiki_agency` tool entrypoint. `src/session/**` owns claims and wait/wake state. `src/state/**` owns resume context and generated graph state. `src/validation/**` owns gateway checks. Runtime coordinates those concepts without absorbing their durable truth.

## Invariants

- Runtime executes at most one bounded step per call.
- Runtime does not bypass decision, planning, implementation, validation, task-close, publication, or destructive gates.
- Runtime does not create compiler outputs by itself; it invokes the correct compiler/gateway tool or prepares a safe source-backed kickoff.
- Runtime treats artifact status as temporary coordination evidence, not durable roadmap truth.
- Runtime releases claims it acquires before returning unless the adapter/process fails; release failures are recorded as platform-limited evidence.
- Runtime requests harness capabilities through ports and records unsupported capabilities rather than fabricating host behavior.
- Runtime is package source under `src/runtime/**`; dogfood operational state under `.codewiki/runtime/**` remains repo-local state, not package source.

## Related docs

- [Agency Controller](agency.md)
- [API](api.md)
- [Session Queue Coordination](api.md)
- [Validation Gateway](validation-gateway.md)
- [Compilers](compilers.md)
- [File Structure](file-structure.md)
