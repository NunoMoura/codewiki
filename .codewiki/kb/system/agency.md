---
id: spec.system.agency
title: Agency Controller
state: active
summary: System mechanism for bounded roadmap automation through agency cycles and explicit gates.
owners:
  - architecture
  - engineering
updated: "2026-05-27"
code_paths:
  - src/agency
  - src/runtime
  - src/project/types.ts
  - src/adapters/pi
  - src/state/resume-context.ts
code_paths_mode: explicit_override
---

# Agency Controller

## Responsibility

The agency controller is the system mechanism behind the product need for gated agency. It decides whether CodeWiki may continue automatically while enforcing explicit token, time, cost, write, session, risk, validation, policy, and approval gates.

The product concept is gated agency. The agency controller owns autonomy level, approval cadence, scope selection, planning, and budget/risk policy. The CodeWiki runtime owns bounded execution mechanics after an agency plan is authorized: acquiring scoped claims, running one compiler or gateway preparation step, requesting context boundaries, recording workflow-efficiency evidence, and stopping or routing to the next loop. Agency may route backward to decision or planning when missing semantics or task-boundary doubts appear, but it should not absorb runtime orchestration concerns.

## Inputs

The controller reads:

- graph state and recommended next actions,
- roadmap active sprints, active tasks, blockers, and closure state,
- accepted builds and linked knowledge,
- validation requirements and policy gates,
- user-provided budgets such as token limit, time limit, cost limit, cycle limit, write limit, session limit, and risk limit,
- configured agency scope such as roadmap, sprint, or task,
- configured agency autonomy level and approval cadence such as task, sprint, or roadmap,
- context reset budget and adapter boundary capability for source-backed auto-pickup,
- harness capabilities exposed through adapters through runtime ports.

## Scopes

Agency can run at three scopes:

| Scope | Responsibility |
| --- | --- |
| `roadmap` | Audit or maintain the whole active roadmap inside conservative budgets. |
| `sprint` | Advance a bounded cohort of related tasks with shared budget, session leases, and closure checkpoint. |
| `task` | Advance one atomic roadmap work item. |

Sprint scope is the default target for parallel work when a sprint is active. If the harness can spawn sessions or fresh worker processes, CodeWiki may create one isolated execution per sprint or bounded sprint workstream through adapter session-boundary capability. Otherwise it emits a plan-only `session_spawn_plan` with task ids, required scoped leases, and stop reasons for manual or external orchestration.

## Autonomy levels

Agency level is the user-approved continuation contract. It controls how far CodeWiki may continue after a safe context reset or task boundary without asking for another approval. Scope controls the work pool; level controls approval cadence.

| Level | Approval cadence | Allowed continuation |
| --- | --- | --- |
| `task` | Stop after the focused task reaches validation/closure evidence. | Continue through context resets inside one task only. |
| `sprint` | Stop at sprint closure or when a hard gate fires. | Continue task-by-task through the active sprint, resetting context between tasks when useful. |
| `roadmap` | Stop at roadmap completion, budget exhaustion, or a hard gate. | Continue across active roadmap work in priority order, including sprint-to-sprint or task-to-task transitions. |

Roadmap-level agency is valid but high blast radius. It must have explicit budgets, risk ceiling, write/session limits, and stop gates. It does not authorize destructive actions, publication, remote updates, or semantic changes without their own approval.

A config-level contract may expose:

```json
{
  "codewiki": {
    "agency": {
      "level": "task",
      "default_scope": { "kind": "roadmap" },
      "approval_cadence": "task",
      "context_reset": {
        "enabled": true,
        "auto_pickup": true,
        "strategy": "soft-first",
        "max_resets_per_run": 5
      }
    }
  }
}
```

## Modes

| Mode | Responsibility |
| --- | --- |
| `observe` | Read graph and roadmap state, report next safe action, write nothing. |
| `maintain` | Refresh generated state or run safe audits inside a small write budget. |
| `work` | Authorize one bounded runtime step inside explicit gates, including compiler invocation or gateway preparation when policy permits. |

These modes are implementation controls, not product stories. Product docs should describe the user-visible gated agency experience.

## Stop conditions

The controller must stop when any gate fails:

- token, time, cost, cycle, session, or write budget exhausted,
- risk exceeds the configured limit,
- user approval is required,
- intent is ambiguous,
- validation fails or blocks,
- checks fail,
- policy forbids the next action,
- the configured approval cadence boundary is reached,
- a context reset cannot produce a protocol-safe auto-pickup boundary,
- destructive or publication action is requested without explicit approval.

## Routing

The controller does not replace the graph, runtime, compilers, roadmap, or validation gateway. It coordinates permission and selection; the CodeWiki runtime coordinates execution:

```text
graph state -> agency scope/policy -> CodeWiki runtime step -> compiler/gateway preparation -> build/evidence -> next graph state
                       ^                         |                         |
                       |                         v                         v
                decision/planning <- ambiguity, failed gate, or blocked validation
```

When intent is unclear, a requirement is not unequivocally represented in the accepted decision build, or KB semantics must change, it routes to the decision loop and blocks lower-layer continuation until the user approves, edits, rejects, or defers the missing semantics. When roadmap/task boundaries are incomplete, it routes to planning. When code/tests must change and planning proof is valid, it routes to implementation. When evidence is ready, it routes to validation or closure. When context is noisy or policy requires a boundary and the session budget allows it, agency should call adapter session-boundary capability instead of asking the user to run a host command manually. If the adapter cannot perform the boundary automatically, the agency output records the platform limitation and next safe action instead of turning the compatibility command into normal user work.

## Context reset and auto-pickup

Context reset is agency hygiene, not an approval gate by itself. If the current agency level still authorizes the next unit of work, CodeWiki may reset context and automatically pick up from a bounded source-backed kickoff.

The kickoff is generated from `codewiki_resume_context` and carries only the active task/sprint/roadmap contract, source refs, current delta, gates, blockers, and expected output. It should link to rules and source docs instead of restating broad process text. The agency runner consumes the source-backed resume packet plus visible tool-result refs, active task/build refs, budget use, approval cadence, and stop conditions before any auto-pickup is allowed. Same-session reset uses adapter compaction plus a protocol-safe custom kickoff message. Hard replacement-session reset uses adapter `new_session` when available and seeds the replacement session with the same kickoff; when the adapter cannot provide that context, the runner returns a visible fallback instead of auto-continuing. CodeWiki must not auto-continue from an assistant-leaf message and must not inject slash-command text as reset control.

If the adapter cannot guarantee a valid next-turn boundary, agency must block or fall back to visible instructions rather than corrupting the conversation state.

## Invariants

- Agency is always gated; unbounded autonomous editing is not allowed.
- Agency level grants continuation permission only; it never bypasses budgets, validation, risk, policy, publication, or semantic approval gates.
- Agency cycles authorize bounded runtime steps, not a fourth compiler; the runtime may invoke decision, planning, implementation, and validation tools but must not fabricate compiler outputs.
- The controller must not mutate generated graph state directly.
- The controller must not bypass validation gateway or policy decisions.
- Commit, push, release, and remote updates require explicit publication policy approval.
- Parallel sprint execution must mark narrow artifact scopes in use and stop on write/write conflicts unless policy explicitly permits override.
- Parallel write execution should allocate task/role worktrees through the worktree factory when the adapter or local runtime can provide them. Shared-root writes are a solo-mode fallback, not the default for overlapping builder, validator, publisher, or cleanup roles.
- Agency plans must expose token, time, cost, write, session, and risk budgets in bounded context and policy output.
- Agency wait and wake output must name exact blockers and next safe actions, such as claim ids, branch refs, patch refs, validation refs, publisher commits, or rebase requirements. It should not tell agents to wait for a vague dirty worktree when an isolated role ref or publisher queue can express the dependency.
- Agency may spend session budget by requesting adapter session boundaries; each boundary must carry a minimal kickoff prompt from `codewiki_resume_context`, source refs, task/build ids, agency level, approval cadence, and expected output. Same-agent CodeWiki-owned compaction or `context_refresh` is soft context hygiene; `new_session` is hard replacement-session hygiene; handoff means transfer to another session, agent, or role. In Pi, tool-context requests must not inject slash commands through follow-up chat; CodeWiki-owned compaction is the normal same-terminal refresh path and must auto-pick up through a protocol-safe custom kickoff when allowed by the agency contract, command-context `/wiki-resume --new` is the hard replacement-session path, and any unsupported boundary fallback must be reported as platform-limited, not routine user work.
- Agency and close reports should expose workflow-efficiency evidence when a task changes orchestration: user interrupts avoided or required, manual command count, session boundaries used, and any remaining platform-limited steps.

## Related docs

- [Role Worktree Isolation](worktree-isolation.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Validation Gateway](validation-gateway.md)
- [Compilers](compilers.md)
