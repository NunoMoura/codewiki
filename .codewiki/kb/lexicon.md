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
**Ready Checks** when explaining whether a Change revision, Planning epoch, Sprint plan, Work Item, or realization can advance.

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

Append-only JSONL state and recovery record under `.codewiki/traces/TRACE-*.jsonl`. One Change Trace records semantic iterations, runtime coordination, checkpoints, refs, and compact recovery facts for one accountable Change journey. It is not a Sprint Record.

## `refs`

Canonical artifact references on trace events. Valid refs include KB paths, source/test paths, trace event ids, Git commits/trees/restore refs, and content digests. Commands, prose, findings, remediation, acceptance text, and summaries belong in trace `data`, not `refs`.

## Generated view

Disposable projection under `.codewiki/views/**`, such as status, resume, work-plan, work-queue, blockers, or conflicts. Views are rebuilt from KB, traces, source/tests, and Git refs. Views are not truth.

## Decision loop

The semantic loop that receives and refines persisted Change intent, requirements, outcomes, alternatives, risks, current-state refs, KB/diagram propagation, authority, and route-back answers. It exits only when an exact Change revision is approved or terminally dispositioned.

## Planning loop

The semantic loop that turns the relevant portfolio of approved Changes into Sprints, owned Work Items, dependencies, path scopes, criteria, component refs, conflicts, integration boundaries, and verification. It exits when every selected Change has trustworthy executable coverage or explicit resolution.

## Implementation loop

The semantic loop that changes code/docs/tests, records checks and acceptance evidence, aggregates worker results, correlates runtime claims, and produces final content proof. It exits only when planned acceptance and closure conditions are met.

## Route contract

Shared loop-exit metadata that names the next semantic target, route kind,
rationale, refs, and optional implementation mode. It is how Decision, Planning,
and Implementation prevent drift without inventing another semantic loop.

## Direct implementation route

A Decision-loop route for tiny or small low-risk work where an approved Change carries explicit scope, criteria, and verification, allowing Implementation to consume that exact approved revision without Planning. It remains Change-trace-backed and requires Implementation evidence.

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
| Change | Stable accountable carrier of user or agent intent and the product/system delta CodeWiki tries to close. Each semantic revision is immutable once approved. | Change revisions and lifecycle facts in one Change Trace. |
| Change Trace | Complete append-only journey of one persisted Change from intake through Decision, Planning, Assignments, Implementation, outcome disposition, and retention. | One `.codewiki/traces/TRACE-*.jsonl` file bound one-to-one to a Change id. |
| Change Journey | Human/agent-readable projection of one Change Trace, including revisions, approval, Sprints, Work Items, evidence, route-backs, and outcomes. | Generated view; never a truth file. |
| Changes Backlog | View of persisted Change Traces whose current Decision state is not approved or terminal. It is not a store, workspace, or loop. | WorkState projection over Change Traces. |
| Decision | Semantic loop that receives, refines, validates, and approves or terminally dispositions an exact Change revision. It is not a domain entity. | Decision-loop iterations in the Change Trace. |
| Approval | Binding fact that exact authority accepted one exact Change revision and digest. | `decision.change_approved` event output. |
| Approved Change | Exact immutable Change revision plus approval receipt that Planning or an approved direct Implementation route may consume. | Exited Decision-loop output in the Change Trace. |
| Sprint | Planning-created execution grouping covering one or more approved Changes under coherent dependency, integration, rollback, and verification boundaries. | Planning facts joined across participating Change Traces into a Sprint view. |
| Planning epoch | One global Planning iteration over a bounded approved-Change horizon that may create or revise several Sprints and Work Items. | Deterministic Planning output batch with participant and WorkState digests. |
| Work Pipeline | Change-rooted lifecycle projection from persisted intent through approval, planning, realization, outcome disposition, and commitment. | WorkState/UI projection over Change Traces and current project truth. |
| Pipeline Card | Shared user-facing shell for one Change journey. Sprint, Work Item, Assignment, preview, Knowledge, file, and evidence detail are attached projections. | Generated Change view. |
| Sprints Queue | Current Planning-created execution groups and their Work Items. | Generated Sprint/work-queue views over WorkState. |
| Trace Detail | Expanded Change Journey with loop iterations, Sprint coverage, Work Items, Assignments, blockers, refs, paths, evidence, and current action. | Generated Change Trace projection. |
| Work Item | Planning-created, parallel-safe, assignable execution unit with exactly one owning Change and optional explicit contribution to others. | Planning output in the owning Change Trace. |
| Assignment | Runtime claim of one Planning-approved Work Item by one worker/session attempt. | Runtime claim event in the owning Change Trace. |
| WorkState | Disposable typed project-wide projection used by runtime and all loops to reason from the same current facts. | Fold over Change Traces, KB, source/tests/Git, configuration, ownership, and runtime observations. |
| Ready Checks | User-facing name for loop quality standards and exit conditions that must pass before output becomes downstream-authoritative. | Quality-network and exit-result internals. |
| Needs Review | User-facing status when earlier semantic authority is required. | `route_back` exit status. |
| Blocked | User-facing status when an external wait, resource, host capability, or policy prevents progress. | `blocked` exit status. |
| Committed | User-facing delivery status for a realized Change whose closure carries Git restore evidence and explicit outcome disposition. | Closed-complete Change view plus `trace_close.gitRestoreRef`. |
| Aligned | Relevant Change Knowledge topics match accepted intent and no grounded contradiction is open. | Generated topic-scoped alignment projection. |
| Review Needed | Relevant Knowledge content changed after its accepted baseline and needs semantic review. Digest change alone can establish only this state. | Generated freshness projection. |
| Misaligned | Explicit grounded finding proves contradiction and names affected layer, source refs, rationale, and owning semantic loop. | Explicit alignment finding plus generated projection. |
| Unknown | Topic scope, baseline, or evidence is insufficient to establish alignment. | Safe generated fallback. |

Implementation workers may use private scratchpads or checklists inside an
assigned Work Item. These are execution aids, not Planning truth, Sprints Queue items,
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

Trace-owned coordination event that grants a worker or session a bounded Work Item
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
| board | Work Pipeline or Sprints Queue; compatibility flag/name only where already public |
| trace board | Work Pipeline or Sprints Queue |
| trace queue | work queue; internal generated view only |
| trace card | Change Journey / Pipeline Card |
| Sprint Card | Sprint view |
| generic card | Pipeline Card |
| Sprint Queue | Sprints Queue |
| Archived (user-facing status) | Committed; archive remains a backend retention term |
| sprint proposal | Planning preview or Sprint plan |
| proposed change | pending Change revision; after approval it remains an approved Change |
| task / work unit | Work Item; internal Planning trace shape only |
| sub-task / planner to-do list | Work Item, or worker-local scratchpad/checklist |
| route_back | Needs Review; `route_back` only in internals |
| roadmap | work-plan/work-queue generated views over traces |
| graph truth | generated views over traces/KB/source/Git |
| telemetry trace | JSONL trace |
| garbage collection / GC | retention/archive/hydrate/restore pipeline |
| agency subsystem | runtime automation/config policy |

Deprecated terms may appear in this replacement list only; the old implementation archive has been removed.

## Related docs

- [Loop Model](system/components/loop-model.md)
- [Decision Loop](system/components/decision-loop.md)
- [Planning Loop](system/components/planning-loop.md)
- [Implementation Loop](system/components/implementation-loop.md)
- [Traces](system/components/traces.md)
- [API Tool Surface](system/components/api-tools.md)
