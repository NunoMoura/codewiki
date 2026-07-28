---
type: Concept
title: API and Client Surface
description: CodeWiki exposes bounded client and query capabilities while Project Runtime alone selects semantic work, owns exact identity, and performs guarded writes and effects.
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
# API and Client Surface

CodeWiki's standalone CLI, dashboard, optional Pi extension, tests, and future adapters connect to one Project Runtime. Clients expose bounded intent, authority, state, configuration, explanation, query, and supervision capabilities. They do not choose semantic jobs or append truth directly.

```text
CLI / dashboard / thin Pi extension / future client
→ authenticated bounded Runtime API
→ WorkState and relationship queries
→ Runtime-selected semantic session or isolated Assignment
→ guarded append/effect
```

Core package remains harness-neutral. Pi integration belongs under `src/pi/**`; published Pi SDK stays entrypoint-isolated. Source checkout never loads CodeWiki itself during stabilization.

## API style

Use closed role-specific schemas, never arbitrary records or prose flags. The same domain object may render as CLI arguments, HTTP JSON, Pi tool schema, or SDK input.

Rules:

- read operations use bounded selectors and report coverage/truncation/staleness;
- write/effect operations distinguish preview from explicit apply/append;
- Runtime holds exact trace bytes/sequence, generation, snapshot, candidate identity, CAS, canonical actor/time, and idempotency;
- client inputs contain only intent, evidence, authority, or control facts they legitimately own;
- mutation endpoints are sequential/idempotent and fail closed on stale state;
- no mega-tool, user-authored Loop DSL, arbitrary shell, arbitrary model prompt, or generic graph mutation endpoint;
- credentials and provider auth remain inside Pi/host adapters;
- a trigger requests observation; it grants no authority.

## Client capabilities

Target capability groups:

| Capability | Purpose | Authority boundary |
| --- | --- | --- |
| State | Read bounded WorkState, Change dossier, Loop exit, blockers, delivery, and next-safe-action projections. | Read-only derived data. |
| Change | Submit/revise/link/split/merge/defer/reject/withdraw pending intent. | Creates Decision intake only; no approval/execution. |
| Authority | Submit exact user/maintainer approval or intervention response. | Runtime authenticates and binds exact candidate/revision/effect. |
| Project query | Read bounded Work, Alignment, and Learning relationships. | Snapshot-bound, read-only, provenance-bearing. |
| Configuration | Read/propose schema-defined changes below authority ceilings. | No Check suppression, threshold lowering, credential mutation, or hidden execution. |
| Runtime control | Inspect/pause/resume/cancel according to policy. | No semantic selection or truth mutation by payload. |
| Preview | Manage declared local preview targets and evidence capture. | Evidence only; no acceptance. |
| Feedback Bundle | Generate local allowlisted diagnostic preview. | Export requires separate user approval. |

Archive/retention, Integration, merge, push, publication, release, and deployment are Runtime/effect APIs, not ordinary model-active tools.

## Semantic session surface

Runtime-created Pi semantic sessions receive:

- exact CodeWiki OS and one mandatory Loop Protocol;
- exact role-specific typed input and bounded context;
- Runtime-selected route/configuration;
- normal or Workbench-scoped Pi Skills;
- read-only repository/query tools;
- one closed role-specific candidate or Model Check submission tool.

They do not receive trace append, source mutation, worker launch, config mutation, archive, Integration, publication, arbitrary shell, or unrelated semantic schemas.

Exact submission schemas include `DecisionCandidateSubmission`, `PlanningCandidateSubmission`, `ImplementationCandidateSubmission`, and `ModelCheckOutput`. Broad `Record<string, unknown>` and broad `Omit<RunWiki*Input, ...>` submissions are forbidden.

Runtime adds candidate/Result identity, snapshots, actor/time, policy, thresholds, routes, and guards. Model Check output cannot declare final authority or aggregate Exit Report.

## Implementation workers

Assignment execution uses separate harness-neutral worker adapter, not read-only semantic-session tool set. Worker receives one exact private Workbench and may mutate only assigned source/workspace through allowed capabilities. It returns immutable Worker Report.

Worker cannot call semantic append, widen scope, alter Checks, select tier, integrate, publish, or mark acceptance. Runtime correlates Report with Claim/Assignment/Workbench/base before constructing Implementation candidate.

## Project relationship queries

Agents use typed bounded operations, not arbitrary Cypher or generic graph DSL. Query classes include:

- blockers, dependencies, overlap, Claims, and Integration state;
- Knowledge constraints and source/test realization;
- reverse trace from source to accepted intent;
- suspect/invalidation relationships;
- Planning coverage across Changes/Knowledge/Work Items;
- explanation of active Checks and failed Results;
- applicable successful and harmful Repair Episodes/Patterns.

Every result includes:

```ts
{
  snapshotDigest: string;
  facts: StructuredFact[];
  provenanceRefs: string[];
  authority: "canonical" | "derived" | "observed";
  coverage: "complete" | "partial" | "unknown";
  truncated: boolean;
  stale: boolean;
}
```

Runtime preloads mandatory context. Queries are supplemental and Assignment-scoped for workers. Model Checks read only pinned candidate evidence. Partial coverage never proves absence.

Exact operation names and physical relationship index remain deferred. No canonical graph file/database may be introduced without measured need.

## Current Pi compatibility tools

Current packed extension exposes these compatibility capabilities while standalone CLI/Runtime API is built. First explicit persistence creates a Change Trace. Configuration compiles only schema-defined patches:

| Tool | Current responsibility |
| --- | --- |
| `wiki_state` | Read WorkState-backed Change, Sprint, work, exit, and blocker projections. |
| `wiki_change` | Guarded Change intake/revision/link/split/merge/defer/reject/withdraw. |
| `wiki_decide` | Submit Decision candidate/authority evidence for Runtime-selected Change. |
| `wiki_plan` | Submit Planning candidate for Runtime-selected approved horizon. |
| `wiki_implement` | Submit Worker Reports or explicit evidence for Runtime-selected Work Items. |
| `wiki_archive` | Guarded retention preview/close/hydrate planning. |
| `wiki_config` | Read/update schema-defined project config. |

Compatibility tools preserve exact rejection of unsupported/runtime-owned fields. Target moves candidate submission into Runtime-created sessions and keeps main Pi client focused on state, intent, authority, explanation, supervision, and dashboard access.

`wiki_change` feedback intake may create or reinforce pending Change only. It rejects prompts, reasoning, credentials, private fields, unrestricted refs, and oversized content. It cannot approve, plan, implement, launch, publish, or advance.

## Current facades and migration

Current harness-neutral facades remain executable truth:

- `runWikiChange()` performs guarded Change intake/mutation.
- `buildWorkState()` derives current project state; `buildWikiState()` exposes bounded views.
- `runWikiDecide()`, `runWikiPlan()`, and `runWikiImplement()` evaluate prepared inputs and preview/append legacy outputs.
- exact Runtime reaction jobs own production selection, idempotency, recovery, and generation fencing.
- `ImplementationWorkerDispatcher.reconcile()` derives ready Work Items, writes private Assignment packets, appends Claims, prepares worktrees, and schedules adapters.
- `runWikiArchive()` and `runWikiConfig()` own retention/config compatibility behavior.

Migration replaces broad candidate submission and preview/append reevaluation with exact immutable Candidate/Resolved Exit Policy/Check Result/Exit Report contracts. It also renames legacy state `quality` projections to Loop-exit projections and removes current-catalog historical reinterpretation.

## Runtime backend

Runtime backend, unavailable as normal model tool, owns:

- eligible-job selection and typed lanes;
- candidate/Check/Result/Report identity;
- Check activation/thresholds/scheduling/caching/cancellation;
- Claims, Workbenches, Assignments, Worker Reports, and Integration;
- exact append, multi-trace recovery, merge/push/publication/release;
- retention and cleanup.

Authenticated local service exposes generation-scoped state/event polling and bounded trigger/authority/control requests. Event gaps require canonical snapshot refresh. Event payloads never become truth.

## User command surface

Current optional Pi commands:

| Command | Purpose |
| --- | --- |
| `/wiki-dashboard [--no-open] [--json] [--stop]` | Ensure/discover/reopen/inspect/stop local Runtime dashboard according to policy. |
| `/wiki-resume` | Show current intervention or next safe action. |
| `/wiki-explain [target]` | Explain project/Knowledge/component/flow/source from canonical refs. |
| `/wiki-bootstrap` | Explicit guarded setup for external project. |
| `/wiki-config` | Inspect/propose bounded configuration. |

Standalone CLI eventually exposes equivalent lifecycle/client capabilities without making Pi extension primary. CLI and Pi command names are host UX, not semantic contract.

## Rendering

```text
guarded append/effect
→ canonical trace/Knowledge/Git fact
→ WorkState/relationship projection
→ dashboard/TUI/CLI renderer
```

Preview is private validation and does not update durable progress. Rich progress shows Change candidates, Checks, Results, Exit Report, blockers, workers, Integration, Git/delivery proof, and completion receipts from canonical/projected facts—not raw tool payloads.

Generated view selectors such as current `board` or `quality` are legacy compatibility values, not product information architecture.

## Distribution

Recommended package boundary:

1. core package exports harness-neutral domain/Runtime APIs and adapter contracts;
2. standalone CLI and Project Runtime service are primary hosts;
3. dashboard connects to same Runtime;
4. Pi extension is optional thin client;
5. Pi execution entrypoint embeds published SDK without leaking types into core;
6. future MCP/OpenClaw adapters preserve Runtime-owned semantics and authority.

If weight/version coupling warrants, optional client/execution adapters may split packages without changing contracts.

## Security and source boundary

- Local service uses private loopback transport and exact generation capabilities.
- Browser writes require same-origin/capability/idempotency/freshness validation.
- No public unauthenticated proposal endpoint or public tunnel by default.
- No client-supplied shell, prompt, path widening, model route, Check, threshold, or effect authority.
- No credentials/prompts/reasoning/raw output in traces/events.
- Source repository carries no active CodeWiki extension, commands, tools, controller, Skills, or Change Traces.
- Packed candidates run only in disposable external projects.

## Related docs

- [CodeWiki API](api.md)
- [Loop Exit](loop-exit.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Extension](extension.md)
- [Traces](traces.md)
- [Source Map](source-map.md)
