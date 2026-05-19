---
id: spec.system.agency
title: Agency Controller
state: active
summary: System mechanism for bounded roadmap automation through agency cycles and explicit gates.
owners:
  - architecture
  - engineering
updated: "2026-05-11"
code_paths:
  - src/application
  - src/adapters/pi
---

# Agency Controller

## Responsibility

The agency controller is the system mechanism behind the product need for gated agency. It lets an agent advance roadmap work automatically while enforcing explicit token, time, cost, write, session, risk, validation, policy, and approval gates.

The product concept is gated agency. The implementation mechanism is the agency controller running bounded agency cycles. An agency cycle observes state, selects safe work, runs one small step, checks gates, and stops or routes to the next loop.

## Inputs

The controller reads:

- graph state and recommended next actions,
- roadmap active sprints, active tasks, blockers, and closure state,
- accepted builds and linked knowledge,
- validation requirements and policy gates,
- user-provided budgets such as token limit, time limit, cost limit, cycle limit, write limit, session limit, and risk limit,
- configured agency scope such as roadmap, sprint, or task,
- harness capabilities exposed through adapters.

## Scopes

Agency can run at three scopes:

| Scope | Responsibility |
| --- | --- |
| `roadmap` | Audit or maintain the whole active roadmap inside conservative budgets. |
| `sprint` | Advance a bounded cohort of related tasks with shared budget, session leases, and closure checkpoint. |
| `task` | Advance one atomic roadmap work item. |

Sprint scope is the default target for parallel work when a sprint is active. If the harness can spawn sessions or fresh worker processes, CodeWiki may create one isolated execution per sprint or bounded sprint workstream through the adapter session handoff capability. Otherwise it emits a plan-only `session_spawn_plan` with task ids, required scoped leases, and stop reasons for manual or external orchestration.

## Modes

| Mode | Responsibility |
| --- | --- |
| `observe` | Read graph and roadmap state, report next safe action, write nothing. |
| `maintain` | Refresh generated state or run safe audits inside a small write budget. |
| `work` | Advance one bounded roadmap/compiler step inside explicit gates. |

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
- destructive or publication action is requested without explicit approval.

## Routing

The controller does not replace the graph, compilers, roadmap, or validation gateway. It coordinates them:

```text
graph state -> scoped roadmap/sprint/task focus -> compiler step -> validation gateway -> build/evidence -> next graph state
```

When intent is unclear, it routes to feedback. When knowledge must change, it routes to documentation. When code/tests must change, it routes to implementation. When evidence is ready, it routes to validation or closure. When a route requires a fresh context boundary and the session budget allows it, agency should call the adapter session handoff capability instead of asking the user to run a host command manually.

## Invariants

- Agency is always gated; unbounded autonomous editing is not allowed.
- Agency cycles are bounded implementation steps, not a fourth compiler.
- The controller must not mutate generated graph state directly.
- The controller must not bypass validation gateway or policy decisions.
- Commit, push, release, and remote updates require explicit publication policy approval.
- Parallel sprint execution must mark narrow artifact scopes in use and stop on write/write conflicts unless policy explicitly permits override.
- Agency plans must expose token, time, cost, write, session, and risk budgets in bounded context and policy output.
- Agency may spend session budget by requesting adapter session handoffs; each handoff must carry a minimal kickoff prompt, source refs, task/build ids, and expected output. In Pi, tool-context requests stage handoff artifacts and queue the internal command-context executor; only `/wiki-session-handoff` performs interactive session replacement/reset, while future worker-process adapters must be bounded and explicit.

## Related docs

- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Validation Gateway](validation-gateway.md)
- [Compilers](compilers.md)
