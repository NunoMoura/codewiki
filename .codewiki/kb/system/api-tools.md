# API Tool Surface

CodeWiki should be operated through a small set of explicit tools backed by the same core package APIs. The tools are required for CodeWiki as a software-development OS: without them, an agent can read files, but it cannot safely execute semantic loop iterations, runtime coordination, and trace state updates.

The current rebuild keeps the core package harness-agnostic, but the intended agent-facing product surface is Pi-native tools and commands. The CLI remains a temporary development/test harness until the Pi adapter is stable.

```text
CodeWiki core package
  -> Pi extension adapter (primary product surface)
  -> CLI harness (temporary development/test support)
  -> MCP adapter (future optional adapter)
```

Pi is the supported host/peer for normal CodeWiki operation, not the CodeWiki core. Core source must not import the Pi SDK directly. Pi integration belongs under `src/pi/**` and remains disabled in this checkout until an explicit reintroduction decision.

## Tool parameter style

Use structured parameters rather than broad, free-form flags. The same shape can render as CLI flags, Pi tool schemas, or MCP JSON parameters.

Good pattern:

```json
{
  "view": "work_queue",
  "traceId": "TRACE-...",
  "format": "summary",
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
| `wiki_state` | Read trace/source-map-backed state summaries, resume packets, work-plan, work-queue, blockers, conflicts, trace summaries, and source ownership refs. Views are output shape, not truth input. | No |
| `wiki_decide` | Run decision-loop iterations from intent, current-state refs, KB propagation evidence, and exit conditions; append trace state. | Yes |
| `wiki_plan` | Run planning-loop iterations from exited decision output into work units, dependencies, path scopes, acceptance criteria, and exit conditions; append trace state. | Yes |
| `wiki_implement` | Run implementation-loop iterations from exited planning output, code/docs/tests evidence, worker results, checks, content proof, and exit conditions; append trace state. | Yes |
| `wiki_runtime` | Inspect queue state, plan dispatch, claim/release work, and coordinate worker dispatch without creating a fourth loop. | Yes, for claim/release events |
| `wiki_archive` | Preview retention stubs, append trace-close records, and plan hydrate/restore from retained trace refs. | Yes |
| `wiki_config` | Read and update CodeWiki configuration for automation, agency, approval, budgets, worktree isolation, retention, skills, and host integration. | Yes |

There is no standalone current tool for split output generation or split exit evaluation. Loop output, exit-condition evaluation, and trace append are one safe operation at the public tool boundary. Normal agents should not use split output/evaluation tools because that can recreate split-brain workflow state.

The core reduced-tool facade shape now exists for the current tool set:

- `buildWikiState()` folds traces and source-map inputs into view-shaped state projections.
- `runWikiDecide()` runs decision output and exit conditions, then previews or appends the checked decision iteration batch.
- `runWikiPlan()` runs planning output and exit conditions, then previews or appends the checked planning iteration batch.
- `runWikiImplement()` prepares repository snapshot data and merged working-tree/content proof, runs implementation output and exit conditions, then previews or appends the checked implementation iteration batch.
- `runWikiRuntime()` plans dispatch from the work queue, reports runtime policy blockers, and optionally appends runtime claim events when automation policy and append safety checks allow it.
- `createRuntimeHandoffManifest()` turns a runtime result into a disposable host handoff bundle: claim events, worktree command steps, worker prompts, expected completion shape, and release instructions. It is a helper, not a separate semantic tool.
- `runWikiArchive()` previews trace retention stubs, appends `trace_close` records with byte preflight, and plans hydrate/restore from archived records.
- `runWikiConfig()` resolves and patches typed CodeWiki project config for automation, agency, approvals, budgets, worktree isolation, retention, and host adapters.

Host tools should call these facades instead of exposing separate proof, output, evaluation, and append steps. The Pi adapter registers `wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_runtime`, and `wiki_archive` over the same root facade surface. Runtime append reads project config when a CodeWiki root is discovered; default `manual` automation permits preview but blocks claim append. The CLI adapter is only a transitional development harness and should not be the normal agent path.

## `wiki_state` views

`wiki_state` is the primary read surface. There is no separate status tool; summary output is one `wiki_state` view shape. Core state reads fold trace records and source-map inputs directly; stored `.codewiki/views/**` files are optional caches or render artifacts, never state truth.

Initial `view` values:

| View | Purpose |
| --- | --- |
| `summary` | Default state summary: latest trace health, active loop, latest exit status, blockers, and next safe action. Currently backed by the legacy `status` projection during the rebuild. |
| `resume` | Compact continuation packet with durable refs, current loop, and recovery rationale. |
| `work_plan` | Per-trace planning detail: work units, acceptance, dependencies, path scopes, and implementation refs. |
| `work_queue` | Cross-trace scheduling projection: backlog, waiting, ready, claimed, blocked, and done. |
| `quality` | Per-loop quality standard summaries and blockers for decision, planning, and implementation iterations. |
| `trace` | Trace lifecycle summary from decision through implementation and content proof. |
| `blockers` | Current blocked/route-back/continue exit conditions and remediation refs. |
| `conflicts` | Path or dependency conflicts that affect scheduling. |
| `kb` | KB refs and selected source-of-truth docs relevant to the query. |
| `config` | Effective CodeWiki configuration and host capabilities. |

Useful selectors:

- `traceId`
- `workUnitId`
- `loop`
- `ref`
- `include`
- `format`: `summary`, `json`, or `refs`
- `limit`

Large results should return omitted-count metadata and refs for expansion instead of dumping full state.

## User command surface

Slash commands are host UX, not workflow semantics. Use `/wiki` as the short user-facing command namespace because it matches the `wiki_*` tools and minimizes repeated typing.

| Command | Backend action |
| --- | --- |
| `/wiki state` | Compact state summary from `wiki_state`; flags can request board, quality, blockers, detail, or JSON. |
| `/wiki resume` | Resume-oriented `wiki_state` view plus host prompt handoff for the next safe action. |
| `/wiki explain [target]` | Read-only explanation of the project, a component, a flow, or a path from KB/source-map/views. |
| `/wiki bootstrap` | Explicit setup action for the current repository; install must not auto-bootstrap. |
| `/wiki config` | Effective config summary; writes require explicit user confirmation. |

Users may ask for decision, planning, implementation, runtime, or archive work in chat. The agent uses the internal tools to execute those loop actions.

## Tool rendering contract

Pi tool rendering is a product UX surface. It should show what the agent is doing and how that affects the project without making the user repeatedly call `/wiki state`. Renderers are UI-only and derive from tool params/results; they must not become hidden state.

Default collapsed render should show user value, not internal trace mechanics. Expanded render may show engineering detail. Debug-only views may include trace ids, sequence numbers, expected byte checks, or raw JSONL refs when explicitly needed by CodeWiki maintainers.

All loop tool renders use table-first layouts with a separator line between the header row and content:

| Loop/tool | Primary render |
| --- | --- |
| `wiki_decide` | Decision alignment table: current state, desired state, quality verdict derived from decision quality standards. Agent judgement explains pass/block/uncertainty, blindspots, and proposed solutions. |
| `wiki_plan` / `wiki_runtime` | Board table: To do, Doing, Done, derived from work-plan and runtime queue/claim projections. This is a rendered board, not roadmap truth. |
| `wiki_implement` | Verification matrix: work, code, tests, publish evidence. `Publish` means package/pack/merge/release evidence where relevant, not automatic commits. |

Each loop render ends with a quality footer using the loop-local quality standards as visible exit-condition status: `✓` met, `⚠` unmet/uncertain, and `✗` blocked. The agent verdict is derived from these standards rather than an independent vibe check.

## Skills

Skills are as important as tools. Tools execute; skills tell agents when and how to use them.

Project-local skills under `.agents/skills/codewiki-*` are small, operational, and aligned to the new model:

- `codewiki-state`: inspect status/resume/work queue before acting;
- `codewiki-decision`: run decision loop cycles, output, and exit conditions;
- `codewiki-planning`: run planning loop cycles, output, and exit conditions;
- `codewiki-implementation`: run implementation loop cycles, output, and exit conditions;
- `codewiki-runtime`: claim/release/dispatch worker work safely;
- `codewiki-archive`: close, retain, hydrate, and restore traces/knowledge;
- `codewiki-config`: read automation and host policy.

Repo-local dogfooding is enabled, so these skills may point agents at Pi-owned `wiki_*` tools for read-only state and explanation work. Mutation workflows must still require explicit expected byte/sequence checks and must not reintroduce old roadmap truth, graph truth, split output/evaluation as product concepts, standalone validation loops, or CodeWiki-owned compaction.

## Distribution

Distribution should keep one harness-agnostic core and multiple thin adapters.

Recommended packaging path:

1. `codewiki` package exports core APIs and types.
2. Pi extension adapter registers the normal CodeWiki tools and commands once the core surface stabilizes.
3. CLI source remains optional development/CI support only if deliberately retained; the package should not expose a `codewiki` binary while Pi is the intended product surface.
4. MCP server adapter can expose the same seven tools to non-Pi agents later.

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
- [File Structure](file-structure.md)
