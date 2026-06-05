---
id: spec.system.agency
title: Agency Controller
state: active
summary: System mechanism for bounded roadmap automation through agency cycles and explicit gates.
owners:
  - architecture
  - engineering
updated: "2026-06-05"
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

The agency controller is the system mechanism behind the product need for gated agency. It decides whether CodeWiki may continue automatically while enforcing explicit token, time, cost, write, session, risk, gate, model, and approval boundaries.

The product concept is gated agency. The agency controller owns autonomy level, approval cadence, scope selection, planning, and budget/risk policy. The CodeWiki runtime owns bounded execution mechanics after an agency plan is authorized: acquiring scoped leases, running one compiler or gate-preparation step, requesting context boundaries, recording workflow-efficiency evidence, and stopping or routing to the next loop. Agency may route backward to decision or planning when missing semantics or task-boundary doubts appear, but it should not absorb runtime orchestration concerns.

Daemon/agency completion should happen before broad CodeWiki source refactor sprints. That enabling sprint must align agency/runtime with three loops, telemetry traces, gate diagnostics/remediation, graph automation-readiness, safe worktree leasing, and publisher/merge safety so later refactor tasks can parallelize productively.

## Inputs

The controller reads:

- graph state and recommended next actions,
- roadmap active sprints, active tasks, blockers, and closure state,
- graph-derived automation-readiness contracts for tasks and sprints,
- accepted loop trace entries and linked knowledge,
- gate criteria, gate findings, remediation items, retry class, remediation route, and policy requirements,
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

Automation-readiness is the deterministic scheduling predicate. Generated graph state evaluates each open trace/task/sprint as `runnable`, `blocked`, `waiting`, `retryable`, `promotable`, or `ambiguous` from source refs rather than chat. The predicate checks executable task boundary, accepted planning/decision refs or an approved exemption, gate policy, risk/model approval, scoped leases and worktree strategy, declared candidate files, gate verdicts/findings, source-backed context-boundary plan, and the exact next safe action. Readiness records and next actions expose `trace_refs`, `gate_refs`, and `git_refs` so daemon scheduling can stop or resume from source contracts instead of legacy loop labels. Agency work plans may schedule only `runnable`, `retryable`, or `promotable` records with a fresh readiness contract; missing, stale, waiting, blocked, or ambiguous contracts are hard stop reasons.

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
| `maintain` | Refresh generated state or run safe linters inside a small write budget. |
| `work` | Authorize one bounded runtime step inside explicit gates, including compiler invocation or gateway preparation when policy permits. |

These modes are implementation controls, not product stories. Product docs should describe the user-visible gated agency experience.

## Stop and retry conditions

The controller must distinguish remediation feedback from hard stops. A gate fail/block does not promote the loop, but it can be retried automatically when the report names actionable, scoped remediation inside budget and policy.

Automatic same-loop remediation sequence:

1. read gate findings and remediation from source refs;
2. classify retry route as same loop, decision, planning, implementation, observe/wait, or user approval;
3. acquire narrow artifact scopes;
4. fix the identified issue without expanding scope;
5. rerun required linters/tests;
6. compile a superseding loop output/build;
7. rerun the same gate.

The controller must stop when:

- token, time, cost, cycle, session, write, or retry budget is exhausted;
- risk exceeds the configured limit;
- user approval is required;
- intent is ambiguous or a new semantic decision lacks approved rows;
- gate diagnostics are non-actionable or too noisy to repair safely;
- artifact conflicts, stale leases, or isolation policy block safe writes;
- required linters or executable tests fail and no scoped fix is available;
- policy forbids the next action;
- the configured approval cadence boundary is reached;
- a context reset cannot produce a protocol-safe auto-pickup boundary;
- destructive or publication action is requested without explicit approval.

## Routing

The controller does not replace the graph, runtime, compilers, roadmap compatibility state, telemetry traces, or gateway. It coordinates permission and selection; the CodeWiki runtime coordinates execution:

```text
graph state -> agency scope/policy -> CodeWiki runtime step -> compiler/gate preparation -> loop trace evidence -> next graph state
                       ^                         |                         |
                       |                         v                         v
                decision/planning <- ambiguity, failed gate, or blocked validation
```

When intent is unclear, a requirement is not unequivocally represented in the passed decision trace, or KB semantics must change, it routes to the decision loop and blocks dependent lower-layer work until the user approves, edits, rejects, or defers the missing semantics. Independent tasks whose refs, scopes, and acceptance do not depend on that decision may continue in parallel under normal lease and risk policy. When task boundaries are incomplete, it routes affected work to planning. When code/tests must change and planning evidence is valid, it routes affected work to implementation. When implementation evidence is ready, it routes to the implementation gate and closure Git/content evidence. When context is noisy or policy requires a boundary and the session budget allows it, agency should call Pi session-boundary capability instead of asking the user to run a host command manually. If Pi cannot perform the boundary automatically, the agency output records the platform limitation and next safe action instead of turning the compatibility command into normal user work.

A new decision introduced mid-roadmap becomes a parallel decision workstream when its impact can be scoped. Agency should fence only dependent tasks, keep unaffected sprint/roadmap tasks schedulable, and record dependency edges from the new decision trace to any paused or future planning/implementation work. Broad architecture, policy, or risk decisions that may affect many active tasks become a sprint/roadmap stop gate until impact classification is approved.

## Context reset and auto-pickup

Context reset is agency hygiene, not an approval gate by itself. If the current agency level still authorizes the next unit of work, CodeWiki may reset context and automatically pick up from a bounded source-backed kickoff.

The kickoff is generated from `wiki_resume_context` and carries only the active task/sprint/roadmap contract, source refs, current delta, gates, blockers, and expected output. It should link to rules and source docs instead of restating broad process text. The agency runner consumes the source-backed resume packet plus visible tool-result refs, active task/build refs, budget use, approval cadence, and stop conditions before any auto-pickup is allowed. Same-session reset uses adapter compaction plus a protocol-safe custom kickoff message. Hard replacement-session reset uses adapter `new_session` when available and seeds the replacement session with the same kickoff; when the adapter cannot provide that context, the runner returns a visible fallback instead of auto-continuing. CodeWiki must not auto-continue from an assistant-leaf message and must not inject slash-command text as reset control.

If the adapter cannot guarantee a valid next-turn boundary, agency must block or fall back to visible instructions rather than corrupting the conversation state.

## Invariants

- Agency is always gated; unbounded autonomous editing is not allowed.
- Agency level grants continuation permission only; it never bypasses budgets, validation, risk, policy, publication, or semantic approval gates.
- Agency cycles authorize bounded runtime steps, not a fourth compiler; the runtime may invoke decision, planning, implementation, and gate tools but must not fabricate compiler outputs.
- Agency may automatically remediate actionable gate fail/block findings by invoking the same loop compiler again with superseding output; it must not bypass the gate or promote on a failed/blocked report.
- The controller must not mutate generated graph state directly.
- The controller must not bypass gateway verdicts or policy decisions.
- Commit, push, release, and remote updates require explicit publication policy approval.
- Parallel sprint execution must mark narrow artifact scopes in use and stop on write/write conflicts unless policy explicitly permits override.
- Parallel write execution should allocate task/role worktrees through the worktree factory when the adapter or local runtime can provide them. Shared-root writes are a solo-mode fallback, not the default for overlapping builder, validator, publisher, or cleanup roles.
- Agency plans must expose token, time, cost, write, session, and risk budgets in bounded context and policy output.
- Agency wait and wake output must name exact blockers and next safe actions, such as lease ids, branch refs, patch refs, validation refs, publisher commits, or rebase requirements. It should not tell agents to wait for a vague dirty worktree when an isolated role ref or publisher queue can express the dependency. Artifact wait wakeups must use durable CodeWiki session-queue wake records with source refs and `wiki_resume_context` intent, not direct inter-agent chat.
- Agency may spend session budget by requesting adapter session boundaries; each boundary must carry a minimal kickoff prompt from `wiki_resume_context`, source refs, task/build ids, agency level, approval cadence, and expected output. Same-agent CodeWiki-owned compaction or `context_refresh` is soft context hygiene; `new_session` is hard replacement-session hygiene; handoff means transfer to another session, agent, or role. In Pi, tool-context requests must not inject slash commands through follow-up chat; CodeWiki-owned compaction is the normal same-terminal refresh path and must auto-pick up through a protocol-safe custom kickoff when allowed by the agency contract, command-context `/wiki-resume --new` is the hard replacement-session path, and any unsupported boundary fallback must be reported as platform-limited, not routine user work.
- Agency and close reports should expose workflow-efficiency evidence when a task changes orchestration: user interrupts avoided or required, manual command count, session boundaries used, and any remaining platform-limited steps.

## Related docs

- [Role Worktree Isolation](worktree-isolation.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
- [Validation Gateway](validation-gateway.md)
- [Compilers](compilers.md)
