---
type: Concept
title: API Tool Surface
description: "CodeWiki should be operated through a small set of explicit tools backed by the same core package APIs. The tools are required for CodeWiki as a software-development OS: without them, an agent can read files, but it cannot safely execute semantic loop iterations and trace state updates. Runtime coordination remains backend/host plumbing, not a model-facing mega-tool."
tags:
  - codewiki
  - system
  - api
  - tools
timestamp: 2026-06-30T00:00:00Z
codewiki_component: skills
codewiki_components:
  - skills
codewiki_source_patterns:
  - .agents/skills/**
codewiki_test_patterns:
  - tests/knowledge/skills.test.mjs
codewiki_role: host_guidance
codewiki_source_map:
  - id: skills
    source_patterns:
      - .agents/skills/**
    test_patterns:
      - tests/knowledge/skills.test.mjs
    role: host_guidance
---
# API Tool Surface

CodeWiki should be operated through a small set of explicit tools backed by the same core package APIs. The tools are required for CodeWiki as a software-development OS: without them, an agent can read files, but it cannot safely execute semantic loop iterations and trace state updates. Runtime coordination remains backend/host plumbing, not a model-facing mega-tool.

The current rebuild keeps the core package harness-agnostic, but the intended agent-facing product surface is Pi-native tools and commands. The CLI remains a temporary development/test harness until the Pi adapter is stable.

```text
CodeWiki core package
  -> Pi extension adapter (primary product surface)
  -> CLI harness (temporary development/test support)
  -> MCP adapter (future optional adapter)
```

Pi is the supported host/peer for normal CodeWiki operation, not the CodeWiki core. Core source must not import the Pi SDK directly. Pi integration belongs under `src/pi/**`. In this checkout, supervised Pi-tool self-dogfood is enabled by the self-dogfood re-enable decision; unattended runtime automation remains disabled.

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
- append operations must require expected trace sequence and expected byte checks when they write durable JSONL state;
- Pi tools that can write traces or config must register as sequential tools so parallel model tool calls do not race mutation windows;
- no tool should hide loop promotion behind prose-only flags;
- no single mega-tool should replace the small verb set.

## Current internal agent tools

The normal internal agent surface is small and phase-aligned.

| Tool | Responsibility | Mutates truth? |
| --- | --- | --- |
| `wiki_state` | Read active trace-derived state summaries, board packets, quality, and blockers. Views are output shape, not truth input. | No |
| `wiki_decide` | Run decision-loop iterations from intent, current-state refs, KB propagation evidence, and exit conditions; preview or ask the runtime append boundary to append trace state. | Yes |
| `wiki_plan` | Run planning-loop iterations from exited decision output into work units, dependencies, path scopes, acceptance criteria, triggers, and exit conditions; preview or ask the runtime append boundary to append trace state. | Yes |
| `wiki_implement` | Run implementation-loop iterations from exited planning output, code/docs/tests evidence, worker results, checks, content proof, and exit conditions; preview or ask the runtime append boundary to append trace state. | Yes |
| `wiki_archive` | Preview retention stubs, append trace-close records, and plan hydrate/restore from retained trace refs. | Yes |
| `wiki_config` | Read and update CodeWiki configuration for automation, agency, approval, budgets, worktree isolation, retention, skills, and host integration. | Yes |

There is no standalone current tool for split output generation or split exit evaluation. Loop output, exit-condition evaluation, and trace append are one safe operation at the public tool boundary. Normal agents should not use split output/evaluation tools because that can recreate split-brain workflow state.

## Backend support contract

| Consumer | Surface | Backend support | Non-goal |
| --- | --- | --- | --- |
| Internal agent | `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_archive`, `wiki_config` | Trace-derived read model; checked semantic loop preview/append; guarded archive/config mutation. | Runtime mega-tool, split loop output/evaluation tools, or source-map explain inside `wiki_state`. |
| Host/runtime | Package APIs such as `runWikiRuntime()`, host lifecycle helpers, worker-start helpers, handoff manifest helpers. | Work-unit claim selection, heartbeat-cycle Run starts, lease expiry, worker session transport, release events, append-safe coordination writes. | Semantic approval, Planning-owned work invention, or treating worker output as proof before implementation validation. |
| User/Pi commands | `/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, `/wiki-bootstrap`. | Compact observability, active trace cards, source-map/path explanation, effective config, setup readiness. | Grouped namespace commands, extra command sprawl such as `/wiki-board`, or exposing runtime internals directly. |

The core reduced-tool facade shape now exists for the current tool set:

- `buildWikiState()` derives view-shaped state projections from active trace records only.
- `runWikiDecide()` runs decision output and exit conditions, records route metadata, then previews or appends the checked decision iteration batch through the runtime-owned trace append boundary.
- `runWikiPlan()` runs planning output and exit conditions, routes clarification/user-validation needs back to Decision, then previews or appends the checked planning iteration batch through the runtime-owned trace append boundary.
- `runWikiImplement()` prepares repository snapshot data and merged working-tree/content proof, accepts exited planning output or direct implementation decision events, runs implementation output and exit conditions, then previews or appends the checked implementation iteration batch through the runtime-owned trace append boundary.
- `runWikiArchive()` previews trace retention stubs, appends `trace_close` records with byte preflight, and plans hydrate/restore from archived records.
- `runWikiConfig()` resolves and patches typed CodeWiki project config for automation, agency, approvals, budgets, worktree isolation, retention, and host adapters.

The runtime backend remains available to host code, not as a normal agent tool:

- `runWikiRuntime()` selects work-unit claims from the work queue, reports runtime policy blockers, can include heartbeat-cycle trigger/run planning and lease expiry, and optionally appends runtime claim events, lease-expiry events, or run trace heads when automation policy and append safety checks allow it.
- Runtime lifecycle helpers plan main-host and trace-host coordination from derived views and can create trace-owned host observed/block/stop events. They are helpers, not a fourth semantic loop.
- `createRuntimeHandoffManifest()` turns a runtime result into a disposable host handoff bundle: claim events, worktree command steps, worker prompts, expected completion shape, and release instructions. It is a helper, not a separate semantic tool.

Host tools should call these facades instead of exposing separate proof, output, evaluation, and append steps. The Pi adapter registers the model-facing `wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, and `wiki_archive` tools over the root facade surface. Host runners call runtime backend APIs for coordination writes. The CLI adapter is only a transitional development harness and should not be the normal agent path.

## `wiki_state` views

`wiki_state` is the primary trace read surface. Summary and focused views come from one progressive read model. Views own derived calculations over active trace records only. Stored `.codewiki/views/**` files are optional caches or render artifacts, never state truth. Source-map ownership is still canonical, but it is exposed through KB/source-map validation and `/wiki-explain`, not `wiki_state`. Project-backed `wiki_state` also returns append handles for active trace files so agents can move from read context to guarded semantic append without guessing byte offsets or next sequence numbers.

Supported `view` values stay intentionally small:

| View | Purpose |
| --- | --- |
| `summary` | Default state summary: trace ids, selected trace status/resume when available, work-queue summary, next action, and append handles. |
| `board` | Card-ready trace-queue context: one card per trace, row/work subitems, per-trace work plan when selected, runtime-board projection, next action, and append handles for active traces. |
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

Slash commands are host UX, not workflow semantics. Use direct `/wiki-*` commands so Pi can show and trigger each supported action as its own slash command. The older grouped namespace command is deprecated and should not be advertised.

| Command | Backend action |
| --- | --- |
| `/wiki-state` | Compact state summary from `wiki_state`; flags can request board, quality, blockers, detail, or JSON. |
| `/wiki-resume` | Resume-oriented `wiki_state` view plus host prompt handoff for the next safe action. |
| `/wiki-explain [target]` | Read-only explanation of the project, a component, a flow, or a path from KB, source-map ownership, mapped tests, trace refs, and quality summaries. |
| `/wiki-bootstrap` | Explicit setup action for the current repository; install must not auto-bootstrap. The default render is a ready summary with active extension source/version/entry identity, not only raw scaffold counts. |
| `/wiki-config` | Effective config summary; writes require explicit user confirmation. |

Users may ask for decisions, planning, implementation, automation, or archive work in chat. The agent uses semantic loop tools for truth changes; the host uses runtime backend APIs for coordination.

## Rendering contract

Pi command rendering and future trace/view rendering are product UX surfaces. Wiki tools execute loops and return compact agent handles; they should not register rich TUI renderers for calls or results.

Post-bootstrap user-facing observability is append-driven. Decision table validation is the pre-append exception: candidates are shown to the user for approval/edit/reject before becoming decision-loop input.

```text
wiki_* append -> trace record -> derived view -> renderer
```

Preview mode is agent-private validation. It can fail fast and guide the agent, but it should not update user-facing progress UI because it is not proof of durable work.

`/wiki-bootstrap` remains the rich setup renderer because it can run before useful trace state exists. Explicit read commands such as `/wiki-state`, `/wiki-resume`, `/wiki-explain`, and `/wiki-config` may render the requested view. Loop progress, quality, blockers, workers, host lifecycle events, and completion receipts should render from appended trace records and generated views, not from raw tool payloads.

Renderers are UI-only and must not become hidden state. Debug-only views may include trace ids, sequence numbers, expected byte checks, or raw JSONL refs when explicitly needed by CodeWiki maintainers.

## Skills

Skills are semantic loop playbooks, not a second tool surface. The system prompt gives the small CodeWiki OS model; skills tell agents how to run the three loops when needed.

Project-local skills under `.agents/skills/codewiki-*` are intentionally limited to:

- `codewiki-decide`: run decision loop cycles, output, and exit conditions;
- `codewiki-plan`: run planning loop cycles, output, and exit conditions;
- `codewiki-implement`: run implementation loop cycles, output, and exit conditions.

There is no `codewiki-state`, `codewiki-config`, `codewiki-archive`, or `codewiki-runtime` skill. State, config, and archive are tools/APIs that the agent may call when needed, but they do not need separate playbooks. Runtime is backend/host coordination only and must not become an agent skill or fourth loop.

Mutation workflows must still require explicit expected byte/sequence checks and must not reintroduce old roadmap truth, graph truth, split output/evaluation as product concepts, standalone validation loops, or CodeWiki-owned compaction.

## Distribution

Distribution should keep one harness-agnostic core and multiple thin adapters.

Recommended packaging path:

1. `codewiki` package exports core APIs and types.
2. Pi extension adapter registers the normal CodeWiki tools and commands once the core surface stabilizes.
3. CLI source remains optional development/CI support only if deliberately retained; the package should not expose a `codewiki` binary while Pi is the intended product surface.
4. MCP server adapter can expose the same six model-facing tools to non-Pi agents later, with runtime coordination remaining a host/backend API.

If Pi SDK dependencies become heavy or version-sensitive, split adapters into optional packages later. Until then, avoid hard SDK imports from core source and keep adapter dependencies optional or entrypoint-isolated.

## Retention and archive tools

Do not model hot/cold knowledge movement as generic garbage collection. The current concept is a retention and archival pipeline:

```text
hot .codewiki/kb + active traces
  -> close trace with trace_close
  -> compact trace stub + Git restore refs
  -> hydrate/restore on demand
```

Temporary cleanup is runtime housekeeping. Knowledge/trace archival is a product pipeline and should be exposed through `wiki_archive`, not a generic destructive cleanup tool.

## Related docs

- [CodeWiki API](api.md)
- [Migration Audit](migration-audit.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Extension](extension.md)
- [Source Map](source-map.md)
