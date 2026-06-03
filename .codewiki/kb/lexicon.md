---
id: spec.lexicon
title: Lexicon
state: active
summary: Canonical CodeWiki vocabulary for commands, tools, loops, compiler outputs, gateway gates, telemetry traces, graph state, runtime, refs, and closure.
owners:
- product
- architecture
updated: '2026-06-03'
---

# Lexicon

This file is CodeWiki's active vocabulary contract. Keep only terms used by humans, agents, source contracts, command help, tool schemas, generated views, and gate reports. Compatibility terms are non-canonical unless this file names their replacement, allowed contexts, and deletion trigger.

## Command

Human-facing Pi slash command that renders or navigates CodeWiki state. Target commands:

- `/wiki bootstrap` for greenfield or brownfield CodeWiki setup;
- `/wiki status` for the most important developer-facing project state;
- `/wiki resume` for agent continuation from the last known stable state;
- `/wiki config` for user preferences and configuration selection;
- `/wiki system <diagram type>` for source-backed system diagram navigation;
- `/wiki product` for product overview, users, and user-story navigation.

Legacy hyphenated or standalone compatibility commands may remain as shims, but are not canonical.

## Internal agent tool

Pi-exposed `wiki_*` tool for agents and automation. Normal surface:

- `wiki_state`;
- `wiki_decide`;
- `wiki_plan`;
- `wiki_implement`;
- `wiki_gate`;
- `wiki_runtime`.

Low-level artifact, roadmap, session, lease, linter, and report writers are primitives or compatibility tools, not normal vocabulary.

## Three loops

CodeWiki has exactly three compiler loops:

1. Decision Loop;
2. Planning Loop;
3. Implementation Loop.

Gateway gates are the exit conditions for these loops. There is no separate validation loop.

## Decision Loop

The loop that turns user input, grounded reads, and approved semantic rows into current product/system truth and a decision trace entry. It owns intent, requirements, constraints, assumptions, risks, non-goals, KB propagation, and diagram propagation before downstream work starts.

## Planning Loop

The loop that turns a passed decision trace into executable work alignment. It owns task/sprint shaping, acceptance criteria, non-goals, verification strategy, candidate paths, and implementation handoff evidence.

## Implementation Loop

The loop that turns passed planning into production-ready code/docs/tests. It owns executable changes, required linters, implementation evidence, implementation gate passage, and Git commit/tree proof for completion.

## Compiler

Loop engine in CodeWiki product source. Each loop source root owns a `compiler.ts` engine. A compiler emits compact output into that loop's telemetry trace file; the compiler output is not a separate source architecture layer.

## Compiler output

The compact artifact emitted by a loop compiler. Historic `decision_build`, `planning_build`, and `implementation_build` are compatibility names for compiler output sections inside `decision.json`, `planning.json`, and `implementation.json` trace files.

## Diff table

Decision-loop surface that compares current state to desired state before canonical edits. Pending rows can live in runtime UI state and be approved, rejected, deferred, or edited with alternatives. Approved rows compile into decision compiler output and KB/diagram updates.

## Gateway

Gate engine that evaluates loop evidence against exit criteria, source refs, required linters, executable tests when relevant, KB/diagram freshness, approvals, and content proof. A gateway returns `pass`, `fail`, or `block` and does not mutate canonical truth.

## Gate

A loop exit condition. Canonical gates are `decision`, `planning`, and `implementation`. Former `task-close`, `sprint-close`, `ship-ready`, `policy`, `audit`, and `checks` concepts are compatibility names or criteria suites inside these three gates during migration.

## Gate verdict

The `pass`, `fail`, or `block` result for a gate. A pass promotes the trace to the next loop or closes implementation when Git proof exists. Fail/block verdicts keep the trace in the current loop or route back to the smallest safe earlier loop.

## Gate diagnostics

Structured gate output that tells the agent exactly what is missing, wrong, stale, weak, or needs remediation. Gate diagnostics include required refs, failed criteria, remediation items, and next action. Do not use legacy wording for this concept.

## Gate finding

One specific diagnostic item emitted by a gate. Findings should include severity, criterion, related refs, rationale, and remediation.

## Remediation item

Actionable repair instruction from a gate finding, such as update a KB doc, add a diagram ref, run a linter, add executable test evidence, acquire approval, or attach Git content proof.

## Linter

A deterministic rule set run as gate evidence to evaluate source, knowledge, package, security, generated-state, or alignment contracts. Linters produce findings; gates decide verdicts.

## Test

Executable code behavior verification that lives in code/test directories and is run by implementation or gate workflows. CodeWiki does not call documentation drift, graph alignment, content evidence, or gateway decisions “tests”.

## Validation

Compatibility term for gate judgment or verdict evidence. Validation is not a loop, source root, or hot artifact folder in the target model.

## Telemetry trace

Structured workflow evidence under `.codewiki/telemetry/<trace_id>/`. A trace tells the story of one change from decision through planning and implementation. A trace contains loop files, not separate hot build/gate/report folders.

## Loop trace file

One of the three files under a trace:

```text
decision.json
planning.json
implementation.json
```

Each loop trace file contains metadata, input refs, compiler output, gate criteria, gate verdict, gate diagnostics, evidence refs, next action, and retention hints. `implementation.json` also carries Git proof refs required to close implementation.

## ArtifactRef

Generic typed reference used by traces, graph, gates, and tools. New schemas should prefer `<artifact_type>_refs` arrays whose items normalize to `ArtifactRef`:

```ts
type ArtifactRef = {
  kind: "knowledge" | "diagram" | "trace" | "loop" | "gate" | "compiler_output" | "task" | "source" | "test" | "git" | "package" | "remote";
  ref: string;
  path?: string;
  json_pointer?: string;
  sha?: string;
  fingerprint?: string;
  summary?: string;
};
```

Examples: `knowledge_refs`, `diagram_refs`, `trace_refs`, `loop_refs`, `gate_refs`, `compiler_output_refs`, `task_refs`, `source_refs`, `test_refs`, `git_refs`, `package_refs`, and `remote_refs`.

## Evidence

Compact support for an assertion. Knowledge evidence supports product/system truth; implementation evidence supports changed tests/code and closure; gate evidence supports a verdict; immutable content evidence identifies the exact content evaluated or promoted.

## Requirement ID

Stable identifier for an accepted requirement as it moves from decision to knowledge, planning, tests/code, implementation evidence, gate verdicts, and Git proof. Requirement ids let CodeWiki prove alignment without relying on broad prose matching.

## Traceability matrix

Compact generated view that connects requirement ids to decision rows, knowledge clauses, loop trace files, roadmap work, tests/code, gate verdicts, and Git proof. It reports gaps but does not own requirements.

## Vertical alignment

Traceability across layers:

```text
user intent -> decision.json -> planning.json -> implementation.json -> Git proof
```

## Horizontal alignment

Coherence within one layer: knowledge, diagrams, trace files, source, tests, gate evidence, and generated graph state agree with peer artifacts.

## State index / graph

Primary generated hot state index at `.codewiki/index_graph.json`. Domain language calls this graph. It indexes KB, telemetry traces, source/test facts, runtime coordination, and Git refs with typed nodes and edges. It is generated and must not be hand-edited.

## Graph lens

Focused graph query returned by `wiki_state`, such as status, resume, trace, system, product, runtime, or automation readiness. Lenses return source refs, next actions, blockers, and compact graph neighborhoods instead of the whole graph.

## Hot truth

Current truth stored in `.codewiki/kb/**` plus compact active workflow traceability in `.codewiki/telemetry/**`. The graph is generated from hot truth and other source refs.

## Cold truth

Git history and immutable content proof: commit SHAs, tree SHAs, tags, package digests, and remote refs. Git stores historical content; telemetry indexes the refs needed to find it.

## Runtime

The CodeWiki execution layer that performs one bounded step after policy authorizes it. Runtime coordinates leases, jobs, block/unblock state, context boundaries, agency scheduling, worktrees, and retention without owning product truth.

## Gated agency

User-facing capability where an agent advances CodeWiki work inside explicit token, time, cost, write, session, risk, gate, configured agency level, and approval boundaries.

## Agency level

User-approved continuation contract for gated agency. `task` stops after one task, `sprint` may continue through the active sprint, and `roadmap` may continue across active roadmap work until completion, budget exhaustion, or a hard gate.

## Pi foundation

Pi is the runtime foundation for the CodeWiki software-development distribution. Pi is not a mere adapter in the target architecture. Adapter language is reserved for future/non-Pi protocol translation or compatibility source paths.

## Context window

The active Pi agent session memory. It is volatile RAM and expensive because it is reloaded with each prompt in the session.

## Subagent

A fresh Pi agent invocation with a clean context window used for bounded work such as gate review, research, planning review, architecture review, testing, or building.

## Product UI

A visual user interface that a human can see and interact with, such as Pi TUI panels, status views, product navigation, system diagram views, board-like summaries, or editor panels. Product UI expectations live under `.codewiki/kb/product/uis/**`.

## System access surface

A technical distribution, command, internal tool, package API, editor integration, service agent, or runtime capability that delivers CodeWiki behavior. Stable access contracts live in `.codewiki/kb/system/api.md` and `.codewiki/kb/system/api-vnext-tools.md`.

## Temporary compatibility term

A non-canonical project expression that still has a project-specific meaning because current source, schema, command, file-path, profile-name, or migration docs need it for compatibility. Every temporary compatibility term must name the canonical replacement, the exact allowed contexts, and the deletion trigger. New user-facing docs and agent guidance must not use these terms as canonical vocabulary.

### audit

- Canonical replacement: gate evidence, linter, or gate verdict depending on context.
- Removed expression pattern: `\baudit(?:s|ed|ing)?\b`
- Allowed compatibility tokens: `/audit`, `wiki_audit`, `codewiki_audit`, `src/audit/**`, `src/adapters/pi/commands/audit.ts`, `src/adapters/pi/tools/audit.ts`, `audit_refs`, `audit_reports`, `AUDIT_*`, `Audit*`, `audit:*`, `graph-audit`, `drift-audit`, `view-audit.md`, `audit.test.mjs`, `audit-drift.test.mjs`.
- Allowed source literals: `audit`.
- Allowed migration docs: `.codewiki/kb/system/audits.md`.
- Deletion trigger: remove after command, tool, schema, gate-report, and profile-name migrations no longer require audit wording for backward compatibility.

### proof

- Canonical replacement: evidence, Git refs, or content evidence.
- Removed expression pattern: `\bproofs?\b`
- Allowed compatibility tokens: `proof_refs`, `publisher-proof`.
- Allowed migration docs: `.codewiki/kb/system/audits.md`.
- Deletion trigger: remove after schemas, gate reports, publisher worktree records, and migration docs use evidence or Git refs only.

### checks

- Canonical replacement: gate evidence, linters, or tests depending on context.
- Removed expression pattern: `\bchecks\b`
- Allowed compatibility tokens: `checks_run`, `gateway.checks`, `CodeWiki-Checks`.
- Allowed migration docs: `.codewiki/kb/system/audits.md`.
- Deletion trigger: remove after trace schemas, gate reports, commit trailers, and command/test summaries use gate evidence, linter, or test wording only.

### build

- Canonical replacement: compiler output when referring to emitted loop data; product source should use compiler terminology.
- Allowed compatibility tokens: `decision_build`, `planning_build`, `implementation_build`, `.codewiki/builds/**`, `src/build/**`, `build_refs`.
- Deletion trigger: remove top-level source/state build wording after telemetry trace migration and compatibility readers are complete.

### validation

- Canonical replacement: gate verdict or gate report.
- Allowed compatibility tokens: `.codewiki/validation/**`, `src/validation/**`, `validation_refs`, `validation-gateway.md`, `codewiki-validation` skill.
- Deletion trigger: remove folder/root/loop wording after gate traces and compatibility aliases are complete.

## Related docs

- [Product](product/overview.md)
- [System Overview](system/overview.md)
- [Knowledge](system/knowledge.md)
- [Graph](system/graph.md)
- [Roadmap](system/roadmap.md)
- [API vNext Tool Surface](system/api-vnext-tools.md)
- [Validation Gateway](system/validation-gateway.md)
