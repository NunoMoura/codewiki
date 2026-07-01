---
type: Concept
title: Lexicon
description: This file is CodeWiki's active vocabulary contract. Desired-state docs, skills, user-facing tools, command help, generated views, and trace summaries should use these terms.
tags:
  - codewiki
  - lexicon
timestamp: 2026-06-30T00:00:00Z
---
# Lexicon

This file is CodeWiki's active vocabulary contract. Desired-state docs, skills, user-facing tools, command help, generated views, and trace summaries should use these terms.

Non-canonical terms are listed only to identify their replacements.

## Runtime outer loop

The control loop that folds traces, chooses next safe actions, coordinates claims/workers/budgets/retention, and appends trace records. Runtime is not a semantic loop and does not invent semantic truth.

## Semantic loop

One of CodeWiki's three product workflow loops:

1. Decision loop;
2. Planning loop;
3. Implementation loop.

There are no knowledge, validation, runtime, roadmap, graph, publication, or recovery semantic loops.

## Loop cycle

The repeated work inside a semantic loop:

```text
observe refs -> act inside authority -> update loop output -> check exit conditions -> report iteration to runtime
```

## Loop output

The high-signal packet produced by a semantic loop iteration. Loop output contains accepted facts, canonical refs, coverage, risks/blockers, route-back questions, and next-loop context. It excludes transcript noise, raw logs, scratch reasoning, generated view dumps, and non-canonical refs.

## Exit condition

A structured condition that decides whether a loop iteration can exit, must
continue, must route back, or is blocked. Exit conditions are the loop-local
trust boundary for output acceptance. User-facing UX should call these
**Ready Checks** when explaining whether a Sprint Proposal, Sprint Plan, or Task
can advance.

## Exit status

One of four statuses:

| Status | Meaning |
| --- | --- |
| `continue` | Same loop can remediate unmet conditions. |
| `exit` | Loop output is accepted for downstream use. |
| `route_back` | Earlier loop authority is required. |
| `blocked` | External user, resource, policy, or runtime wait is required. |

## Progress boundary

Runtime stop/progress rule that detects whether iterations are moving toward exit. Examples: newly met conditions, changed refs, repeated failure signatures, unchanged state digests, and budget spent without new evidence.

## Trace iteration

One append-only JSONL trace event written by runtime to record a semantic loop report. A route-back or later correction appends a new iteration; it never rewrites the old one.

## Trace

Append-only JSONL state and recovery record under
`.codewiki/traces/TRACE-*.jsonl`. A trace records semantic loop iterations,
runtime coordination events, checkpoints, refs, and compact recovery facts for
one accountable change journey. In product language, this is the technical
backing for a **Sprint Record**.

## `refs`

Canonical artifact references on trace events. Valid refs include KB paths, source/test paths, trace event ids, Git commits/trees/restore refs, and content digests. Commands, prose, findings, remediation, acceptance text, and summaries belong in trace `data`, not `refs`.

## Generated view

Disposable projection under `.codewiki/views/**`, such as status, resume, work-plan, work-queue, blockers, or conflicts. Views are rebuilt from KB, traces, source/tests, and Git refs. Views are not truth.

## Decision loop

The semantic loop that accepts user intent, requirements, alternatives, risks, approvals, current-state refs, KB/diagram propagation, and route-back answers. It exits only when planning can trust the decision output.

## Planning loop

The semantic loop that turns exited Decision output into Tasks, dependencies,
path scopes, acceptance criteria, component refs, conflicts, and verification
strategy. It exits only when implementation and runtime can trust the planning
output. Low-level trace data may still call these work items or work units for
compatibility.

## Implementation loop

The semantic loop that changes code/docs/tests, records checks and acceptance evidence, aggregates worker results, correlates runtime claims, and produces final content proof. It exits only when planned acceptance and closure conditions are met.

## Route contract

Shared loop-exit metadata that names the next semantic target, route kind,
rationale, refs, and optional implementation mode. It is how Decision, Planning,
and Implementation prevent drift without inventing another semantic loop.

## Direct implementation route

A Decision-loop route for tiny or small low-risk work where approved rows carry
explicit scope and validation, allowing Implementation to consume the decision
row without a Planning iteration. This is still trace-backed and still requires
implementation evidence.

## AX

Agent Experience: how clear and safe CodeWiki is for an agent using tools,
traces, append handles, route hints, and repair loops.

## UX

User Experience: how clear and useful CodeWiki is for the human developer.

## Product workflow terms

These terms are canonical in product docs, command help, generated views, and
user-facing terminal rendering.

| Term | Meaning | Technical backing |
| --- | --- | --- |
| Sprint Proposal | Draft package of Decisions being shaped and validated with the user before accountable work exists. | Decision table while stored or rendered inside the Decision loop. |
| Decision | User-approved intent, requirement, risk choice, or product/system direction inside a Sprint Proposal. | Decision row and row id inside trace data. |
| Sprint | Approved accountable change journey created after user-approved Decisions pass Decision ready checks. | One trace-backed workflow lifecycle. |
| Sprint Record | Durable append-only record for a Sprint. | `.codewiki/traces/TRACE-*.jsonl` trace file. |
| Sprint Queue | User-facing list of active and completed Sprints. | Generated view/projection over traces and work queues. |
| Sprint Card | User-facing projection for one Sprint in the Sprint Queue. | Derived card/widget data; never a separate truth file. |
| Task | Planning-created, parallel-safe, assignable work that covers one or more approved Decisions. | Planning work item / work unit in trace data. |
| Assignment | Runtime claim of one Planning-approved Task by a worker or session. | Runtime claim trace event. |
| Ready Checks | User-facing name for loop exit conditions and quality standards that must pass before work advances. | Exit-condition and quality-graph internals. |
| Needs Review | User-facing status when earlier authority is required before work can proceed. | `route_back` exit status. |
| Blocked | User-facing status when an external wait, resource, host capability, or policy prevents progress. | `blocked` exit status. |
| Done | User-facing status for accepted completed work. | Passed implementation/archive closure state. |

Implementation workers may use private scratchpads or checklists inside an
assigned Task. These are execution aids, not Planning truth, Sprint Queue items,
or runtime-claimable units.

Host/session terms such as decision host, trace host, worker session, process
session, and runtime claim are technical architecture terms. They should appear
in runtime or host-adapter docs only when that topology matters.

## Route-back

A loop iteration status indicating that an earlier semantic loop owns the
required authority. User-facing UX should say **Needs Review**. Example:
implementation routes back to planning for bad path scopes, or to decision for
ambiguous product/API behavior or user validation.

## Blocked

A loop iteration status indicating that external user input, resource availability, policy, host capability, or runtime wait is required.

## Runtime claim

Trace-owned coordination event that grants a worker or session a bounded Task
Assignment. Claims prevent unsafe overlap but do not replace trace truth,
source/tests, or Git proof.

## Worker result

Structured implementation evidence returned by a worker. It must reference an active runtime claim and becomes part of implementation loop output only after aggregation and exit-condition evaluation.

## Aggregate content proof

Final content proof for merged implementation output, such as a working-tree digest, tree, commit, package digest, or publication ref. Worker-local proof is provenance only when worker/parallel changes are involved.

## Hot knowledge

Current intended product/system truth under `.codewiki/kb/**`.

## Cold knowledge

Historical or archived knowledge reachable through Git history, restore refs, compact trace stubs, or retained content evidence.

## Retention

Product pipeline that closes, compacts, archives, hydrates, and restores trace/knowledge detail using traces plus Git restore refs. Do not call this garbage collection except for low-level temporary-file cleanup.

## Command

Human-facing host command, such as Pi slash commands or CLI commands. Commands are host UX. They should delegate to core CodeWiki APIs and `wiki_*` tool semantics.

## Internal agent tool

Harness-exposed `wiki_*` tool used by agents and automation. Target normal tools:

- `wiki_state`;
- `wiki_decide`;
- `wiki_plan`;
- `wiki_implement`;
- `wiki_archive`;
- `wiki_config`.

Runtime coordination is backend/host plumbing, not a normal model-facing tool. Not target normal tools: split output generators, split exit evaluators, runtime mega-tools, roadmap tools, or destructive cleanup tools.

## CodeWiki core

Harness-agnostic package source that owns semantic loops, traces, views, runtime, knowledge parsing, Git proof helpers, config, and APIs. CodeWiki core must not import the Pi SDK directly.

## Host adapter

Thin package/entrypoint that exposes CodeWiki core semantics to a host such as Pi, CLI, MCP, editor integrations, or CI.

## Pi adapter

Optional CodeWiki host adapter for Pi. Pi is a primary host, not the CodeWiki core.

## Worktree isolation

Optional worker isolation mode controlled by config: `none`, `worktree`, or `auto`. Worktrees help parallel workers, dirty repos, risky merges, and clean Git proof, but are not mandatory for every task.

## Deprecated terms

| Deprecated term | Replacement |
| --- | --- |
| compiler | loop output shaping / loop internals |
| compiler output | loop output |
| build | loop output or runtime-temp scratch |
| gate | exit condition evaluator |
| gateway | loop-local exit conditions |
| gate verdict | exit status |
| validation report | exit condition result |
| board | Sprint Queue; compatibility flag/name only where already public |
| trace board | Sprint Queue |
| trace queue | Sprint Queue; internal generated view only |
| card / trace card | Sprint Card |
| decision table | Sprint Proposal; internal Decision-loop table shape only |
| decision row / row | Decision; row id only for trace refs |
| work unit / work item | Task; internal Planning trace shape only |
| sub-task / planner to-do list | Task, or worker-local scratchpad/checklist |
| route_back | Needs Review; `route_back` only in internals |
| roadmap | work-plan/work-queue generated views over traces |
| graph truth | generated views over traces/KB/source/Git |
| telemetry trace | JSONL trace |
| garbage collection / GC | retention/archive/hydrate/restore pipeline |
| agency subsystem | runtime automation/config policy |

Deprecated terms may appear in this replacement table only; the old implementation archive has been removed.

## Related docs

- [Loop Model](system/loop-model.md)
- [Decision Loop](system/decision-loop.md)
- [Planning Loop](system/planning-loop.md)
- [Implementation Loop](system/implementation-loop.md)
- [Traces](system/traces.md)
- [API Tool Surface](system/api-tools.md)
