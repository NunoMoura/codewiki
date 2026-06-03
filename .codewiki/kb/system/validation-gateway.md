---
id: spec.system.validation-gateway
title: Gateway
state: active
summary: Three loop exit gates for decision, planning, and implementation, with structured diagnostics and remediation.
owners:
  - architecture
updated: "2026-06-03"
---

# Gateway

## Responsibility

The CodeWiki gateway evaluates loop evidence against exit criteria and returns a gate verdict: `pass`, `fail`, or `block`. It does not define requirements, write canonical truth, create plans, compile loop output, or own content by itself.

There is no validation loop. The gateway owns the exit gates for the three loops:

| Gate | Loop exited | Purpose |
| --- | --- | --- |
| `decision` | Decision Loop | Verifies approved semantic rows, KB and diagram propagation, no-impact rationales, risk approvals, and planning questions. |
| `planning` | Planning Loop | Verifies decision-to-work propagation, task/sprint boundaries, acceptance criteria, verification strategy, candidate refs, and implementation readiness. |
| `implementation` | Implementation Loop | Verifies changed code/docs/tests, required linters/tests, acceptance evidence, KB/diagram freshness, and Git content proof for production-ready completion. |

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
- recommended loop route: same loop, decision, planning, implementation, observe/wait, or user approval.

A passing gate promotes the trace to the next loop or closes implementation when required Git proof exists. A fail/block gate refreshes graph state with findings and remediation but does not promote lower-layer work.

## Alignment and content evidence

Vertical alignment traces intent through:

```text
user input -> decision.json -> planning.json -> implementation.json -> Git proof
```

Horizontal alignment validates coherence inside one layer: KB docs, diagrams, trace refs, source, tests, gate criteria, and generated graph state.

Implementation gate requires fresh or explicitly trusted content evidence. Code-changing implementation completion requires exact Git proof such as commit SHA and tree SHA, plus package digest or remote ref when policy requires publication readiness. Dirty validation may use a working-tree digest only when the gate allows it and implementation remains unclosed.

## Compatibility paths

Current repositories may still persist gate reports under `.codewiki/validation/**` and expose compatibility source under `src/validation/**`. Target traces embed gate verdicts, findings, and remediation inside loop trace files:

```text
.codewiki/telemetry/<trace_id>/decision.json#/gate
.codewiki/telemetry/<trace_id>/planning.json#/gate
.codewiki/telemetry/<trace_id>/implementation.json#/gate
```

Graph readers normalize `validation_refs` and legacy report paths into `gate_refs` during migration.

## Rules

- The gateway validates loop evidence; it does not mutate canonical truth.
- Gate pass is the semantic promotion boundary.
- Compiler output alone cannot promote a loop.
- Decision, planning, and implementation gates block on stale KB/diagram truth unless an explicit no-impact rationale exists.
- Implementation gate blocks on missing Git proof when the work claims production-ready completion.
- Gate reports and findings are hot only while active routing needs them; long-term history lives in telemetry trace summaries and Git.

## Related docs

- [Validation gateway component](components/validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Compiler Output Artifacts](builds.md)
- [Compilers](compilers.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
