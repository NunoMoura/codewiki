---
type: Concept
title: API Tool Surface
description: "CodeWiki clients expose bounded state, Change, authority, and config capabilities while the project control plane schedules semantic sessions and workers through execution adapters."
tags:
  - codewiki
  - system
  - api
  - tools
timestamp: 2026-06-30T00:00:00Z
codewiki_component: pi-tools
codewiki_components:
  - pi-tools
codewiki_source_patterns:
  - src/pi/tools/**
codewiki_test_patterns:
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-tool-mutation-smoke.mjs
  - tests/integration/control-center-reconciliation.test.mjs
codewiki_role: host_tool_adapter
codewiki_source_map:
  - id: pi-tools
    source_patterns:
      - src/pi/tools/**
    test_patterns:
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-tool-mutation-smoke.mjs
      - tests/integration/control-center-reconciliation.test.mjs
    role: host_tool_adapter
---
# API Tool Surface

CodeWiki exposes a small set of explicit client capabilities backed by the same core package APIs and one project-scoped control plane. `wiki_state`, `wiki_change`, and `wiki_config` remain bounded Pi-client capabilities. Runtime derives WorkState and schedules Decision, Planning, and Implementation-review jobs through semantic-session adapters rather than asking the main conversation to choose or host the next loop. Archive lifecycle remains runtime-owned and not normally model-active. Runtime is backend coordination, not a model-facing mega-tool.

The core package remains harness-neutral. Pi has two adapter roles: a thin conversational client and the primary execution engine. The dashboard is another first-class client. The CLI remains temporary development/test support.

```text
Dashboard / Pi extension / CLI or future clients
  -> CodeWiki project control plane and core APIs
       -> embedded Pi SDK semantic-session adapter
       -> process/container implementation-worker adapter
       -> future harness adapters
```

Harness-neutral core source must not import Pi SDK types. Pi integration belongs under `src/pi/**`. The CodeWiki source checkout does not install or load CodeWiki itself during stabilization; maintainers use Pi native coding tools and test packed artifacts in disposable external projects. Unattended runtime automation remains disabled.

## Tool parameter style

Use structured parameters rather than broad, free-form flags. The same shape can render as CLI flags, Pi tool schemas, or MCP JSON parameters.

Good pattern:

```json
{
  "view": "board",
  "traceId": "TRACE-...",
  "include": ["blockers", "refs"]
}
```

Temporary CLI harnesses may map the same objects to flags for development, but normal agents should use registered Pi tools instead of shelling out.

Rules:

- read tools may support compact selectors such as `view`, `include`, `format`, `traceId`, `workUnitId`, and `ref`;
- write tools must use explicit `mode` such as `preview` or `append` when a dry-run/apply distinction exists;
- append operations must use expected trace sequence and byte checks held by runtime when they write durable JSONL state; semantic callers never marshal those guards;
- Pi tools that can write traces or config must register as sequential tools so parallel model tool calls do not race mutation windows;
- no tool should hide loop promotion behind prose-only flags;
- no single mega-tool should replace the small verb set.

## Current internal agent tools

Client capabilities remain small and phase-aligned. Main Pi conversations normally receive state, Change, configuration, explanation, and exact authority capabilities only. Runtime-created semantic sessions receive one closed role-specific candidate-submission tool plus read-only repository tools. They never receive unrelated semantic schemas or archive authority. Candidate submission returns judgment or evidence to the runtime executor; it does not invoke a facade with caller-authored repository context.

| Tool | Responsibility | Mutates truth? |
| --- | --- | --- |
| `wiki_state` | Read bounded WorkState-backed Change, Sprint, queue, quality, and blocker projections. Views are output shape, not truth input. | No |
| `wiki_change` | Explicitly persist, query, revise, link, split, merge, defer, reject, withdraw, or validate Change revisions by appending Decision-loop intake facts to Change Traces. It cannot approve, plan, implement, launch workers, or edit source. | Yes |
| `wiki_decide` | Submit disposition, rationale, and authority evidence for the exact Change selected by runtime. Runtime invokes Decision and owns identity, freshness, and append guards. | Yes, through runtime |
| `wiki_plan` | Submit a Sprint and Work Item candidate for the bounded approved-Change horizon selected by runtime. Runtime invokes Planning and owns participants, freshness, and multi-trace append guards. | Yes, through runtime |
| `wiki_implement` | Submit worker results or explicit realization evidence for runtime-selected Work Items. Runtime derives Sprint, owning Change, Planning events, Assignments, source ownership, sequence, parent, and byte guards before invoking Implementation. | Yes, through runtime |
| `wiki_archive` | Preview retention stubs, append trace-close records, and plan hydrate/restore from retained trace refs. Trace close may take a guarded `traceId` and resolve records internally so agents never need to copy raw trace JSONL into model context or tool arguments. | Yes |
| `wiki_config` | Read and update CodeWiki configuration for automation, agency, approval, budgets, worktree isolation, retention, skills, and host integration. | Yes |

`wiki_change` also exposes bounded feedback intake for explicit user, runtime, or lab findings. Intake searches pending Changes first, reinforces a deterministic match with evidence, or creates only a pending unvalidated Change. Its closed schema rejects prompts, reasoning, credentials, private fields, unrestricted refs, and oversized output. It cannot accept, decide, plan, implement, launch, publish, or advance controllers.

Dashboard controls are narrower than model execution adapters. Backlog permits bounded proposal, revision, validation, withdrawal, and exact authority responses under capability, same-origin, revision/digest CAS, idempotency, and receipt checks. Product, System, and Design editors submit deterministic source patches through the Change workflow; browser code never writes source directly. Configuration compiles only schema-defined patches below active authority and quality ceilings and validates the complete result. Raw arbitrary execution JSON is not browser UX. No dashboard request grants semantic approval implicitly, starts a caller-authored model prompt, appends trace truth, publishes, advances controllers, or raises unsupervised authority.

There is no standalone current tool for split output generation or split exit evaluation. Loop output, exit-condition evaluation, and trace append are one safe operation at the public tool boundary. Normal agents should not use split output/evaluation tools because that can recreate split-brain workflow state.

## Backend support contract

| Consumer | Surface | Backend support | Non-goal |
| --- | --- | --- | --- |
| Main Pi client | Normally `wiki_state`, `wiki_change`, `wiki_config`, explanation, and exact authority capabilities. | WorkState-backed reads, checked Change intake, supervision presence, and guarded client requests. | Choosing semantic routing, owning runtime lifetime, or acting as hidden Planning/worker session. |
| Semantic session | One runtime-selected role-specific candidate tool plus bounded read-only repository tools. | Judgment/evidence submission for one exact Decision, Planning, or Implementation-review job. | Append authority, repository identity replacement, source mutation, worker launch, archive, publication, or unrelated semantic tools. |
| Control plane | Core APIs, scheduler, session/worker adapters, lifecycle helpers, claim/integration helpers, and guarded writers. | Compatible-job selection, claims, session and worker lifecycle, integration, retries, append-safe writes, and client projections. | Semantic approval, Planning-owned work invention, or treating worker output as proof before Implementation acceptance. |
| User clients | Dashboard plus `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. | Backlog, Planning, Implementation, Product, System, Design, dashboard lifecycle, explanation, configuration, and setup readiness. | Direct source/trace mutation, arbitrary prompts, grouped namespace commands, state-dump command sprawl, or exposed runtime internals. |

The core reduced-tool facade shape now exists for the current tool set:

- `runWikiChange()` creates or mutates canonical Change revisions by guarded append to one Change Trace per Change, with bounded inputs, deduplication, secret rejection, and exact trace/revision guards.
- `buildWorkState()` derives typed current project work from Change Traces, KB, ownership, source/tests/Git, config, and bounded runtime observations. `buildWikiState()` exposes bounded model-facing views over that state.
- `runWikiDecide()` evaluates a runtime-prepared exact Change candidate and previews or appends approval or terminal disposition to the same Change Trace.
- `runWikiPlan()` evaluates a runtime-prepared bounded global Planning candidate and previews or appends deterministic per-Change slices of one accepted Planning epoch.
- `runWikiImplement()` accepts only a WorkState freshness guard plus worker results or explicit evidence. It resolves the runtime-selected Sprint, Work Items, owning Change, Planning events, Assignments, source ownership, sequence, parent, and byte offset internally before evaluating or appending realization.
- Exact coordinator reaction jobs own production semantic selection, invocation, append authority, CAS reruns, route-back stops, deterministic job identity, and restart recovery. `runRuntimeSemanticExecutor()` remains a singular compatibility primitive.
- `ImplementationWorkerDispatcher.reconcile()` derives eligible Work Items from canonical WorkState and current Git/config policy, writes private Assignment packets, appends exact claims under CAS, prepares worktrees, and schedules exact worker jobs. Canonical claim data binds each packet digest and deterministic job id so runtime scratch cannot grant execution authority. Coordinator Assignment lanes serialize one Work Item and overlapping paths while compatible work runs concurrently. Adapter output remains candidate evidence.
- `runWikiArchive()` previews trace retention stubs, appends `trace_close` records with byte preflight, and plans hydrate/restore from archived records.
- `runWikiConfig()` resolves and patches typed CodeWiki project config for automation, agency, approvals, budgets, worktree isolation, retention, and host adapters.

The runtime backend remains available to host code, not as a normal agent tool:

- `runWikiRuntime()` selects work-unit claims from the work queue, reports runtime policy blockers, can include heartbeat-cycle trigger/run planning and lease expiry, and optionally appends runtime claim events, lease-expiry events, or run trace heads when automation policy and append safety checks allow it.
- Runtime lifecycle helpers plan main-host and trace-host coordination from derived views and can create trace-owned host observed/block/stop events. They are helpers, not a fourth semantic loop.
- `createRuntimeHandoffManifest()` turns a runtime result into a disposable host handoff bundle: claim events, worktree command steps, worker prompts, expected completion shape, and release instructions. It is a helper, not a separate semantic tool.

The authenticated project service exposes bounded generation-scoped event polling, exact semantic execution, and `POST /v1/runtime/workers/reconcile` for leased clients. Event cursors replay coordinator transitions and runtime-observed WorkState digests; gaps require snapshot refresh and never grant event payloads truth authority. The service selects an exact invariant and invokes the embedded Pi SDK adapter when that optional peer is available. The adapter creates a bounded role-specific session with read-only repository tools and one closed candidate tool, then returns its candidate directly to the exact coordinator job. Main Pi conversations do not receive semantic tools in this mode. Peer-absent installs retain a candidate-only fallback through the service, which still rejects loop mismatch and runtime-owned fields. Runtime validates reports and owns identity, CAS writes, fencing, and recovery. Process/container worker adapters derive Implementation context from canonical WorkState and worker-result correlation rather than caller-marshalled Planning authority. The CLI adapter remains a transitional development harness.

## `wiki_state` views

`wiki_state` is the primary internal agent trace read surface. Summary and focused views come from one progressive read model. Views own derived calculations over active trace records only. Stored `.codewiki/views/**` files are optional caches or render artifacts, never state truth. Source-map ownership is still canonical, but it is exposed through KB/source-map validation and `/wiki-explain`, not `wiki_state`. Project-backed `wiki_state` also returns append handles for active trace files as diagnostic state. Runtime consumes those handles for guarded semantic appends; semantic callers do not copy byte offsets or sequence numbers into adapter inputs.

Supported `view` values stay intentionally small:

| View | Purpose |
| --- | --- |
| `summary` | Default state summary: trace ids, selected trace status/resume when available, work-queue summary, next action, and append handles. |
| `board` | Compatibility projection of Backlog, Planning, Implementation, Changes, Sprints, Work Items, runtime state, and append handles for active Change Traces. It is not the dashboard information architecture. |
| `quality` | Per-loop quality standard summaries and blockers for decision, planning, and implementation iterations. |
| `blockers` | Current blocked/route-back/continue exit conditions and remediation refs for the selected trace. |
| `all` | Debug/maintenance payload containing all derived projections. |

Every full project-backed state payload includes:

- `next`: compact safe-action hint (`decide`, `plan`, `implement`, `archive`, or `wait`) with target tool when applicable;
- `append.byTrace[traceId].expectedBytes`: current hot open trace file byte length;
- `append.byTrace[traceId].nextSequence`: next trace event sequence for guarded semantic appends.

Closed traces are terminal, so they appear in trace-board/history projections when still hot but are omitted from `append.byTrace`.

Useful selectors:

- `traceId`
- `generatedAt` for deterministic tests

Large future results should return omitted-count metadata and refs for expansion instead of growing the model-facing tool list.

## User command surface

Slash commands are host UX, not workflow semantics. Use direct `/wiki-*` commands so Pi can show and trigger each supported action as its own slash command. No grouped namespace command exists.

| Command | Backend action |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json] [--stop]` | Ensure/discover and reopen the project dashboard, return service state without opening, or explicitly stop the local service according to policy. |
| `/wiki-resume` | Resume-oriented `wiki_state` view plus host prompt handoff for the next safe action. |
| `/wiki-explain [target]` | Read-only explanation of the project, a component, a flow, or a path from KB, OKF source ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Explicit setup action for the current repository; install must not auto-bootstrap. The default render is a ready summary with active extension source/version/entry identity, not only raw scaffold counts. |
| `/wiki-config` | Effective config summary; writes require explicit user confirmation. |

Users may ask for decisions, planning, implementation, automation, or archive work in chat. Runtime selects semantic work and activates the matching bounded candidate adapter; submitted judgment or evidence is then invoked through runtime, not directly by the agent. Archive and coordination use runtime backend APIs.

## Rendering contract

Pi command rendering and future trace/view rendering are product UX surfaces. Wiki tools execute loops and return compact agent handles; they should not register rich TUI renderers for calls or results.

Post-bootstrap observability is Change-Trace-append driven. First explicit persistence creates a Change Trace; revisions, links, merge/split facts, validation, approval, planning, realization, and outcome disposition append there. Final approval remains bound to the exact rendered Change revision and digest.

```text
wiki_* append -> trace record -> derived view -> renderer
```

Preview mode is agent-private validation. It can fail fast and guide the agent, but it should not update user-facing progress UI because it is not proof of durable work.

`/wiki-bootstrap` remains the rich setup renderer because it can run before useful trace state exists. Explicit read commands such as `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render the requested view. The automatically opened dashboard owns rich user-facing progress observability, while `/wiki-dashboard` provides reopen/recovery and host stop. Loop progress, collapsed-by-default Ready Checks, blockers, workers, host lifecycle events, and completion receipts should render from Change/trace-backed projections, not from raw tool payloads.

Renderers are UI-only and must not become hidden state. Debug-only views may include trace ids, sequence numbers, expected byte checks, or raw JSONL refs when explicitly needed by CodeWiki maintainers.

Backlog, Planning, Implementation, Sprint, and Change dossier screens are WorkState projections over Change Traces and current project truth. They must not write UI files or create a separate Board/state root. Internal `board` and `cards` values are compatibility projection selectors only; they do not define product information architecture.

## Agent guidance

Semantic-loop guidance belongs to the packaged Pi prompt and runtime reaction, not agent loop choice, a second tool surface, or project-local skill directory. The source repository carries no `codewiki-*` skills during stabilization. Decision, Planning, and Implementation remain the only semantic loops; state and config remain bounded capabilities, archive remains a backend lifecycle API, and Runtime remains coordination rather than a fourth loop.

Mutation workflows must still require explicit expected byte/sequence checks and must not reintroduce old roadmap truth, graph truth, split output/evaluation as product concepts, standalone validation loops, or CodeWiki-owned compaction.

## Distribution

Distribution should keep one harness-agnostic core and multiple thin adapters.

Recommended packaging path:

1. `codewiki` package exports harness-neutral core APIs, control-plane types, and execution-adapter contracts.
2. The package exposes a local project-service entrypoint used by dashboard and clients.
3. Pi extension entrypoint registers conversational client tools and commands.
4. Pi execution entrypoint implements embedded semantic sessions and process-worker transport without leaking Pi SDK types into core.
5. CLI source remains temporary development/CI support until an explicit product CLI is approved.
6. Future MCP or harness adapters preserve runtime-owned routing and authority.

Pi SDK dependencies stay entrypoint-isolated. If weight or version coupling warrants it, Pi client and execution adapters may split into optional packages without changing core contracts.

## Retention and archive tools

Do not model hot/cold knowledge movement as generic garbage collection. The current concept is a retention and archival pipeline:

```text
hot .codewiki/kb + active traces
  -> close trace with trace_close
  -> compact trace stub + Git restore refs
  -> hydrate/restore on demand
```

Temporary cleanup and Change Trace archival are runtime lifecycle responsibilities. Archive APIs stay guarded and testable without becoming a normal model-active destructive tool.

## Related docs

- [CodeWiki API](api.md)
- [Migration Audit](../flows/migration-audit.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Extension](extension.md)
- [Source Map](source-map.md)
