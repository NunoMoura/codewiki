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

The project-scoped control loop that folds canonical inputs, schedules a compatible set of next safe jobs, coordinates semantic sessions, claims, workers, integration, budgets, supervision, retention, and guarded writes. Runtime is not a semantic loop and does not invent semantic truth.

## Project control plane

The single elected project coordinator generation that owns runtime scheduling, WorkState refresh, session and worker lifecycle, integration, guarded writes, and client projections. Dashboard, Pi, CLI/test, and future clients connect to it; no client session owns its lifetime.

## Semantic loop

One of CodeWiki's three product workflow loops:

1. Decision loop;
2. Planning loop;
3. Implementation loop.

There are no knowledge, validation, runtime, roadmap, graph, publication, quality, review, or recovery semantic loops.

## CodeWiki OS

Versioned compact system guidance that applies CodeWiki's truth, authority, routing, privacy, and progression invariants to Pi-owned execution. It does not replace Pi providers, authentication, tools, sessions, extensions, or Skills.

## Stage Protocol

Mandatory versioned CodeWiki instruction for Decision, Planning, or Implementation. A Stage Protocol defines stage role, authoritative input, required output, prohibited actions, stop conditions, route-back behavior, and candidate schema. It is not a Skill.

## Pi Skill

Ordinary Pi-discovered reusable capability that provides a method or workflow. CodeWiki does not own a Skill schema, registry, taxonomy, distribution mechanism, or activation protocol. A Skill cannot grant authority, tools, paths, acceptance, routing, or Quality Policy changes.

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

## Quality Standard

Versioned statement of what must be established for one bounded candidate. It declares assessment criteria, verifier kind, measurement shape, evidence requirements, repair target, cost, timeout, and protected status where applicable.

## Standard binding

Deterministic activation of one Quality Standard for one candidate, including enforcement mode, parameters, dependencies, and explainable activation reasons.

## Assessment

Result produced by a verifier for one bound Standard against one immutable candidate. Status is `met`, `unmet`, or `indeterminate`. Measurements, findings, evidence refs, and repair feedback preserve the Standard's declared shape. Operational verifier failure is `indeterminate`, never fabricated failure evidence or score `0`.

## Deterministic gate

Pure CodeWiki policy decision over assessments and exact authority facts. A deterministic gate may permit exit, require repair, route back, or block. A stochastic model assessment never controls progression directly.

## Quality Policy receipt

Explainable identity of one Resolved Quality Policy. It records selector inputs, active bindings, `activatedBy` reasons, rule refs, protected Standards, permitted exclusions, versions, and digest without storing prompts, private reasoning, credentials, or full tool payloads.

## Implementation tier

Runtime-selected `routine`, `standard`, or `complex` model class for one Implementation attempt. Selection uses structured risk, scope, uncertainty, context, tool, verification, effect, and prior-attempt facts. Planning may establish a minimum budget class but does not choose the concrete model route.

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

The semantic loop that changes code/docs/tests, records checks and acceptance evidence, aggregates worker reports, correlates runtime claims, and produces final content proof. It exits only when planned acceptance and closure conditions are met.

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
| Backlog | Work workspace for proposal intake and persisted Change Traces whose current Decision state is not approved or terminal. It is a projection and guarded client surface, not a truth store or semantic loop. | WorkState projection over Change Traces plus bounded intake capabilities. |
| Decision | Semantic loop that receives, refines, validates, and approves or terminally dispositions an exact Change revision. It is not a domain entity. | Decision-loop iterations in the Change Trace. |
| Approval | Binding fact that exact authority accepted one exact Change revision and digest. | `decision.change_approved` event output. |
| Approved Change | Exact immutable Change revision plus approval receipt that Planning or an approved direct Implementation route may consume. | Exited Decision-loop output in the Change Trace. |
| Sprint | Planning-created execution grouping covering one or more approved Changes under coherent dependency, integration, rollback, and verification boundaries. | Planning facts joined across participating Change Traces into a Sprint view. |
| Planning epoch | One global Planning iteration over a bounded approved-Change horizon that may create or revise several Sprints and Work Items. | Deterministic Planning output batch with participant and WorkState digests. |
| Work | User-facing runtime destination containing Backlog, Planning, and Implementation. It does not rename Change, Sprint, Work Item, Assignment, or semantic loops. | Purpose-built WorkState and runtime projections. |
| Planning workspace | Project-wide graph of approved Changes, Planning epochs, Sprints, Work Items, dependencies, conflicts, contribution, and ready/held frontiers. | Generated WorkState projection over canonical Planning facts. |
| Implementation workspace | Execution view over Work Items, Assignments, workers, isolation, integration, checks, evidence, and Git proof. | Generated WorkState plus bounded runtime observations. |
| Change dossier | Cross-cutting accountable detail for one Change: intent, authority, impact, Planning coverage, realization, proof, route-backs, and history. It does not own a private pipeline. | Generated Change Trace and current-project projection. |
| Work Item | Planning-created, parallel-safe, assignable execution unit with exactly one owning Change and optional explicit contribution to others. | Planning output in the owning Change Trace. |
| Claim | Canonical, temporary reservation that grants one exact worker attempt the right to execute one Work Item while preventing unsafe overlap. A claim grants bounded execution authority, not semantic acceptance. | `runtime.work_unit.claimed` event in the owning Change Trace. |
| Assignment | Runtime-derived binding of one Planning-approved Work Item, one worker attempt, exact context, scope, isolation, and report contract. An Assignment becomes executable only while its matching canonical Claim is active. | Canonical Claim plus runtime-derived Assignment contract and WorkState projection. |
| Assignment packet | Private serialized handoff containing the exact Assignment details needed by an execution adapter. A packet is operational scratch and grants no authority unless its digest and job identity match the active canonical Claim. | Digest-bound file under `.codewiki/runtime/worker-assignments/**`. |
| Worker Workbench | Complete private execution environment for one exact Assignment attempt, binding fresh source, bounded context, Skills, tools, model route, Quality obligations, isolation, budgets, and report contract. | Digest-bound private manifest and materialized environment under `.codewiki/runtime/**`. |
| Worker report | Immutable normalized report that one execution adapter completed, blocked, failed, or cancelled an exact Assignment attempt, with bounded implementation evidence and references. Runtime verifies it against the active Claim before Quality Policy evaluation or release. | Digest-bound operational file under `.codewiki/runtime/workers/**`; accepted realization remains a separate canonical Implementation fact. |
| WorkState | Disposable typed project-wide projection used by runtime and all loops to reason from the same current facts. | Fold over Change Traces, KB, source/tests/Git, configuration, ownership, and runtime observations. |
| Quality Policy | Exact resolved Standards, bindings, assessments, and deterministic gates required for one immutable stage candidate. | Deterministic policy resolution plus receipt digest and bounded evaluation output. |
| Ready Checks | User-facing name for active Quality Standards and deterministic exit gates that must permit progression before output becomes downstream-authoritative. | Resolved Quality Policy and exit-result internals. |
| Needs Review | User-facing status when earlier semantic authority is required. | `route_back` exit status. |
| Blocked | User-facing status when an external wait, resource, host capability, or policy prevents progress. | `blocked` exit status. |
| Committed | User-facing delivery status for a realized Change whose closure carries Git restore evidence and explicit outcome disposition. | Closed-complete Change view plus `trace_close.gitRestoreRef`. |
| Aligned | Relevant Change Knowledge topics match accepted intent and no grounded contradiction is open. | Generated topic-scoped alignment projection. |
| Review Needed | Relevant Knowledge content changed after its accepted baseline and needs semantic review. Digest change alone can establish only this state. | Generated freshness projection. |
| Misaligned | Explicit grounded finding proves contradiction and names affected layer, source refs, rationale, and owning semantic loop. | Explicit alignment finding plus generated projection. |
| Unknown | Topic scope, baseline, or evidence is insufficient to establish alignment. | Safe generated fallback. |

Implementation workers may use private scratchpads or checklists inside an
assigned Work Item. These are execution aids, not Planning truth, work-queue items,
or runtime-claimable units.

Host/session terms such as semantic session, SDK session, worker process, container worker, session reference, Assignment packet, and Worker report are technical architecture terms. They should appear in user-facing views when needed to explain exact activity, recovery, failure, or authority, not as unexplained implementation jargon. Session identity and private runtime files are operational metadata, never canonical authority.

## Route-back

A loop iteration status indicating that an earlier semantic loop owns the
required authority. User-facing UX should say **Needs Review**. Example:
implementation routes back to planning for bad path scopes, or to decision for
ambiguous product/API behavior or user validation.

## Blocked

A loop iteration status indicating that external user input, resource availability, policy, host capability, or runtime wait is required.

## Claim

A trace-owned coordination fact that reserves one Work Item for one exact worker attempt. The Claim binds worker identity, Work Item, Planning references, runtime job identity, and the digest of the private Assignment packet. Claims prevent unsafe overlap but do not replace source, tests, Git proof, or Implementation acceptance.

A Claim remains active while the worker runs and while a completed Worker report awaits Implementation review. A terminal claim-release event ends the reservation after accepted completion, failure, blocking, cancellation, or expiry. Release means that the reservation ended; it does not mean that implementation succeeded.

`Runtime claim` is acceptable in System documentation when needed to distinguish this fact from other uses of the word claim. Product UI and ordinary explanations should use **Claim**.

## Assignment

The exact execution contract for one worker attempt on one Work Item. It binds the worker, Claim, Change Trace, Planning references, source base, WorkState and context digests, component and path scopes, prompt, report path, execution policy, and required isolation.

Assignment and Claim are related but not interchangeable: Assignment says what one worker attempt must do and under which bounds; Claim is the canonical fact that temporarily authorizes that exact Assignment to run.

## Assignment packet

Private runtime serialization of an Assignment used to hand work to a process or container adapter and recover it after coordinator replacement. Runtime writes the packet before appending the Claim, then records its digest in the Claim. The packet becomes executable only when packet digest, deterministic worker job identity, and active Claim all match.

Assignment packets are restartable operational scratch, not project truth. A copied, edited, orphaned, or stale packet grants no execution authority. Runtime preserves packets matching active Claims and may remove pre-Claim or terminal unsuccessful packet scratch idempotently; completed or ambiguous packet evidence remains until integration proof authorizes cleanup.

## Worker Workbench

Complete private environment provisioned by runtime for one exact Assignment attempt. Planning declares Workbench requirements; runtime binds fresh source, context, Pi Skills, tools, model tier and route, Quality obligations, isolation, budgets, output path, report schema, and exact digests.

A Workbench is inert before its exact matching canonical Claim and grants no semantic authority after activation. It is disposable operational state, never Planning truth, WorkState truth, a canonical trace artifact, or acceptance evidence by itself.

## Worker report

Immutable normalized report written by the worker adapter for one exact Assignment attempt. It records outcome status (`completed`, `blocked`, `failed`, or `cancelled`), bounded implementation evidence, and references needed to recover a settled worker job without invoking the worker again.

Runtime must match the report digest, identity, Assignment, and active Claim before using it. A completed report becomes candidate evidence for Implementation review. A blocked, failed, or cancelled report supports guarded claim release and repair routing. The report remains the same object through persistence, recovery, and review; no separate Worker receipt or Worker result exists.

A Worker report proves only what the adapter observed about that attempt. It never marks a Work Item implemented or semantically accepted by itself. Implementation acceptance remains a separate canonical fact. Active-Claim and completed reports are retained during artifact sanitation; terminal unsuccessful orphan reports may be removed after guarded Claim handling. Completed report artifacts remain until exact Integration proof authorizes cleanup.

## Integration proof

Canonical runtime evidence that accepted worker output was applied under one exact Planning target set and source base to a guarded integration worktree. It binds the runtime job, Claim, Assignment, Worker report, base and parent commits, resulting local commit and tree, changed paths, patch digest, and integration checks. Integration proof establishes integrated content state; it does not merge the project branch, push, publish, grant semantic approval, or prove a business outcome.

## Project-branch merge proof

Canonical runtime evidence that one exact Integration commit was fast-forwarded from its expected parent onto one exact checked-out local project branch under explicit elected-host user or policy authority. It binds the Integration event and runtime job, target branch, prior target commit, promoted commit and tree, content proof, merge job, authority, and observation time. It does not authorize or prove push, publication, release, remote effects, semantic approval, business outcomes, or automatic rollback.

## Project-branch push proof

Canonical runtime evidence that one exact locally merged project-branch commit was accepted as the exact head of one configured Git remote branch under explicit user authority. It binds the prior remote commit or branch absence, merge proof, local and remote branch identity, pushed commit and tree, user authority, runtime job, and observation time. It proves only exact Git transport state at that boundary; it does not authorize or prove product publication, deployment, release, registry publication, business outcomes, or later remote state.

## Product publication proof

Canonical runtime evidence that one exact artifact derived from a canonically pushed source commit was accepted at one exact publication target under explicit elected-host user authority. It binds the push event and runtime job, source commit/tree, target id/kind/channel/destination, artifact id/digest/version, prior destination revision/digest, provider operation and resulting revision, adapter identity, publication job, authority, and observation time.

Product publication proof establishes only artifact availability at that exact target. It does not authorize or prove deployment, release, Git tagging, channel promotion, package adoption, business success, or any later external effect. Matching provider state without exact operation evidence is not attributed to CodeWiki.

## Product release proof

Canonical runtime evidence that one exact published artifact was promoted onto one exact release target/channel under explicit elected-host user authority. It binds canonical publication event/job and provider operation/revision, artifact id/digest/version, release target id/kind/channel/destination, prior channel revision/digest, resulting provider operation/revision, adapter identity, release job, authority, and observation time.

Product release proof establishes exact provider release-channel state only. It does not authorize or prove deployment, Git tagging, announcement delivery, installation, adoption, runtime health, business success, rollback, or any later external effect. Matching channel state without exact operation evidence is not attributed to CodeWiki.

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
- `wiki_change`;
- `wiki_decide`;
- `wiki_plan`;
- `wiki_implement`;
- `wiki_archive`;
- `wiki_config`.

Runtime coordination is backend/host plumbing, not a normal model-facing tool. Not target normal tools: split output generators, split exit evaluators, runtime mega-tools, roadmap tools, or destructive cleanup tools.

## CodeWiki core

Harness-agnostic package source that owns semantic loops, traces, views, runtime, knowledge parsing, Git proof helpers, config, and APIs. CodeWiki core must not import the Pi SDK directly.

## Client adapter

Thin package/entrypoint that connects a user or host surface such as Pi, dashboard, CLI, MCP, editor integration, or CI to the project control plane.

## Execution adapter

Harness-neutral runtime boundary for creating bounded semantic sessions or isolated implementation workers. It reports capabilities and normalized outcomes without owning semantic routing or durable writes.

## Semantic session

Replaceable read-only agent context for one runtime-selected Decision, Planning, Implementation Quality, or other model-based Standard job. It receives exact bounded context plus the CodeWiki OS and relevant Stage Protocol, then returns a candidate or assessment. It is not truth, authority, a lane, a reviewer agent, or a Change.

## Worker adapter

Execution adapter for one Assignment attempt. Implementations use a process or container boundary and may receive scoped mutation capability. Runtime probes adapters that expose external availability before appending a Claim. The opt-in OCI adapter requires a digest-pinned preinstalled image, explicit bounded mounts/resources/environment/network policy, and the same immutable Worker report contract as a process adapter; it does not grant semantic or publication authority. Worker output remains candidate evidence until Implementation accepts it.

## Pi adapter

CodeWiki integration for Pi. Its conversational side is a client adapter; its execution side embeds Pi SDK semantic sessions and may start Pi process workers. Pi remains the primary execution engine, not CodeWiki core.

## Worktree isolation

Optional worker isolation mode controlled by config: `none`, `worktree`, or `auto`. Worktrees help parallel workers, dirty repos, risky merges, and clean Git proof, but are not mandatory for every task.

## Deprecated terms

| Deprecated term | Replacement |
| --- | --- |
| compiler | loop output shaping / loop internals |
| compiler output | loop output |
| build | loop output or runtime-temp scratch |
| generic gate | deterministic gate or exit condition, whichever is exact |
| gateway | resolved Quality Policy and loop-local exit conditions |
| gate verdict | deterministic gate result or exit status |
| rubric | assessment criteria |
| standalone Implementation reviewer | Implementation Quality Policy evaluation |
| validation report | assessment, deterministic gate result, or exit-condition result |
| board | Backlog, Planning, or Implementation projection; compatibility flag/name only where already public |
| Work Pipeline | Work destination with separate Backlog, Planning, and Implementation workspaces |
| Pipeline Card | Change dossier entry or purpose-specific Work row/node/lane |
| Sprints Queue | Planning workspace or work queue |
| trace board | Backlog, Planning, or Implementation projection |
| trace queue | work queue; internal generated view only |
| trace card | Change dossier entry |
| Trace Detail | Change dossier |
| Sprint Card | Sprint view or Planning graph cluster |
| generic card | purpose-specific row, node, lane, or inspector |
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
- [CodeWiki OS and Stage Protocols](system/components/codewiki-os.md)
- [Quality Policy](system/components/quality-policy.md)
- [Worker Workbench](system/components/worker-workbench.md)
- [Model Routing](system/components/model-routing.md)
- [Decision Loop](system/components/decision-loop.md)
- [Planning Loop](system/components/planning-loop.md)
- [Implementation Loop](system/components/implementation-loop.md)
- [Traces](system/components/traces.md)
- [API Tool Surface](system/components/api-tools.md)
