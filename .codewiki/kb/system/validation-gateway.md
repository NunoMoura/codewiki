---
id: spec.system.validation-gateway
title: Gateway
state: active
summary: Three loop exit gates that validate lifecycle trace evidence with structured diagnostics, remediation, and semantic handoff guards.
owners:
  - architecture
updated: "2026-06-05"
diagram_refs:
  - architecture:gateway
  - key-flow:decision_gate
  - key-flow:planning_gate
  - key-flow:implementation_gate
---

# Gateway

## Responsibility

The CodeWiki gateway evaluates loop evidence against exit criteria and returns a gate verdict: `pass`, `fail`, or `block`. It does not define requirements, write canonical truth, create plans, compile loop output, or own content by itself.

There is no validation loop. The gateway owns exit gates for the three loops:

| Gate | Loop exited | Purpose |
| --- | --- | --- |
| `decision` | Decision Loop | Verifies semantic completeness, approved rows, KB/diagram propagation, row mappings, trace-lineage impact, product/system impact, risk/benefit assessment, alternatives, explicit approvals, and downstream planning questions. |
| `planning` | Planning Loop | Verifies decision-to-work propagation, task/sprint boundaries, parallelization contract, acceptance criteria, verification strategy, candidate refs, route-back triggers, and implementation readiness. |
| `implementation` | Implementation Loop | Verifies changed code/docs/tests, required linters/tests, acceptance evidence, KB/diagram freshness, Git/content proof, and publication readiness when configured. |

Former `task-close`, `sprint-close`, `ship-ready`, `publication`, `policy`, `audit`, and `checks` names are compatibility aliases or criteria suites inside the three canonical gates during migration.

## Gate diagnostics and remediation

Gate output must be actionable. Every gate result should include:

- verdict: `pass`, `fail`, or `block`;
- criteria evaluated;
- missing refs or missing evidence;
- wrong, stale, or mismatched refs;
- weak quality items that block pass when policy requires;
- gate findings with severity, criterion, refs, and rationale;
- remediation items with exact next action;
- recommended route: same loop, decision, planning, implementation, observe/wait, or user approval.

A passing gate promotes the trace lifecycle to the next safe state or closes implementation when required content evidence exists. A fail/block gate refreshes graph state with findings and remediation but does not promote lower-layer work.

Fail/block is not automatically a user-stop. When findings are actionable, scoped to the current loop, and inside configured budgets/policy, the agent should stay in the same loop, apply the remediation, run required linters/tests, compile a superseding loop output, and rerun the same gate. The gate stops automation only when remediation is non-actionable, semantically ambiguous, missing user approval, blocked by artifact conflicts, risk escalation, destructive/publication policy, isolation policy, or retry/budget exhaustion.

## Decision-to-planning semantic quality gate

The decision gate is not just a paperwork gate. Before planning, the decision trace/build evidence must prove:

- approved decision rows;
- KB updates where required;
- row-to-KB and row-to-diagram mappings;
- diagram updates or explicit no-impact rationale;
- propagation/no-impact evidence;
- downstream planning questions;
- risk assessment;
- benefits, tradeoffs, and alternatives considered;
- impact on existing trace lineage such as dependencies, supersessions, conflicts, blockers, unblockers, follow-ups, or release coupling;
- product impact and affected users/workflows;
- system impact and migration/compatibility impact;
- open questions and non-goals;
- explicit user approval for high-risk or ambiguity-resolving choices;
- compact trace/build evidence and exact refs for planning.

Decision agents must drill the user when rows are under-specified, risky, conflicting, or strategically important. They should show current project state, expected impact, risks, benefits, and alternatives so the user can validate decisions from product and system standpoints.

The gateway blocks planning handoff when intent is shallow, contradictory, unmapped, unassessed, missing trace impact, missing approvals for the risk tier, or incomplete relative to product/system state.

## Alignment and content evidence

Vertical alignment traces intent through one lifecycle trace:

```text
user input -> trace.decision -> trace.planning -> trace.implementation -> Git/content proof
```

Horizontal alignment validates coherence inside one layer: KB docs, diagrams, trace refs, source, tests, gate criteria, generated graph state, and runtime state when active.

Implementation gate requires fresh or explicitly trusted content evidence. Code-changing implementation completion requires exact Git evidence such as commit SHA and tree SHA, plus package digest or remote ref when policy requires publication readiness. Dirty validation may use a working-tree digest only when the gate allows it and implementation remains unclosed.

## Compatibility paths

Current repositories may still persist gate reports under `.codewiki/validation/**` and expose compatibility source under `src/validation/**`. Target traces embed gate verdicts, findings, and remediation inside loop sections:

```text
.codewiki/telemetry/TRACE-*.json#/decision/gate_history
.codewiki/telemetry/TRACE-*.json#/planning/gate_history
.codewiki/telemetry/TRACE-*.json#/implementation/gate_history
```

Graph readers normalize `validation_refs` and legacy report paths into gate histories and gate refs during migration. `src/validation/**` is not a target source root and should be removed by planned migration once imports/tests are moved to `src/gateway/**` or loop gate helpers.

## Publication

Publication is an implementation-stage concern by default. If CodeWiki config enables publication, the implementation gate or ship-ready criteria must verify configured publication requirements before the trace can move from `production_ready_unpublished` to `published`. A standalone publish loop requires a future approved decision.

## Rules

- The gateway validates loop evidence; it does not mutate canonical truth.
- Gate pass is the semantic promotion boundary.
- Gate fail/block is a remediation boundary, not a fourth loop and not necessarily a user-stop.
- Compiler output alone cannot promote a loop.
- Decision, planning, and implementation gates block on stale KB/diagram truth unless an explicit no-impact rationale exists.
- Planning cannot start from chat memory or incomplete KB edits; it starts from a passed decision trace/build handoff.
- Implementation gate blocks on missing Git/content evidence when the work claims production-ready completion.
- Actionable fail/block findings should route back to the same compiler loop for an automatic superseding output when policy and budgets allow.
- Gate reports and findings are hot only while active routing needs them; long-term history lives in lifecycle trace summaries, `telemetry/catalog.json`, and Git.

## Related docs

- [Trace Graph and Lifecycle Trace Schema](trace-graph.md)
- [Validation gateway component](components/validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Compiler Output Artifacts](builds.md)
- [Compilers](compilers.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
