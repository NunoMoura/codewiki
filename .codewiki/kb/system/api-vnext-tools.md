# API vNext Tool Surface

CodeWiki should be operated through a small set of explicit tools backed by the same core package APIs. The tools are required for CodeWiki as a software-development OS: without them, an agent can read files, but it cannot safely execute semantic loop iterations, runtime coordination, and trace state updates.

The target design keeps the core package harness-agnostic and exposes thin adapters for Pi, CLI, MCP, or future harnesses.

```text
CodeWiki core package
  -> Pi extension adapter
  -> CLI adapter
  -> MCP adapter
  -> tests/host integrations
```

Pi is an important first host, not the CodeWiki core. Core source must not import the Pi SDK directly. Pi integration belongs under `src/pi/**` and remains disabled in this checkout until an explicit reintroduction decision.

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

CLI adapters can expose those as flags:

```bash
codewiki state --view work-queue --trace TRACE-... --include blockers,refs
```

Rules:

- read tools may support compact selectors such as `view`, `include`, `format`, `traceId`, `workUnitId`, and `ref`;
- write tools must use explicit `mode` such as `preview` or `append` when a dry-run/apply distinction exists;
- append operations must require expected trace sequence and/or expected byte offsets when they write durable JSONL state;
- no tool should hide loop promotion behind prose-only flags;
- no single mega-tool should replace the small verb set.

## Target internal agent tools

The normal internal agent surface is small and phase-aligned.

| Tool | Responsibility | Mutates truth? |
| --- | --- | --- |
| `wiki_state` | Read trace/source-map-backed status, resume packets, work-plan, work-queue, blockers, conflicts, trace summaries, and source ownership refs. Views are output shape, not truth input. | No |
| `wiki_decide` | Run decision-loop iterations from intent, current-state refs, KB propagation evidence, and exit conditions; append trace state. | Yes |
| `wiki_plan` | Run planning-loop iterations from exited decision output into work units, dependencies, path scopes, acceptance criteria, and exit conditions; append trace state. | Yes |
| `wiki_implement` | Run implementation-loop iterations from exited planning output, code/docs/tests evidence, worker results, checks, content proof, and exit conditions; append trace state. | Yes |
| `wiki_runtime` | Inspect queue state, plan dispatch, claim/release work, and coordinate worker dispatch without creating a fourth loop. | Yes, for claim/release events |
| `wiki_archive` | Close, compact, archive, hydrate, or restore trace/knowledge artifacts through the retention pipeline. | Yes |
| `wiki_config` | Read and update CodeWiki configuration for automation, policy, retention, skills, and host integration. | Yes |

There is no standalone target tool for split output generation or split exit evaluation. Loop output, exit-condition evaluation, and trace append are one safe operation at the public tool boundary. Normal agents should not use split output/evaluation tools because that can recreate split-brain workflow state.

The core reduced-tool facade shape now exists for the target tool set:

- `buildWikiState()` folds traces and source-map inputs into view-shaped state projections.
- `runWikiDecide()` runs decision output and exit conditions, then previews or appends the checked decision iteration batch.
- `runWikiPlan()` runs planning output and exit conditions, then previews or appends the checked planning iteration batch.
- `runWikiImplement()` prepares repository snapshot data and working-tree content proof, runs implementation output and exit conditions, then previews or appends the checked implementation iteration batch.
- `runWikiRuntime()` plans dispatch from the work queue and optionally appends runtime claim events.
- `runWikiArchive()` previews trace retention stubs and restore refs.
- `runWikiConfig()` resolves and patches typed CodeWiki runtime/retention config.

Host tools should call these facades instead of exposing separate proof, output, evaluation, and append steps. The CLI adapter exposes `state`, `config`, `decide`, `plan`, `implement`, `runtime`, and `archive` commands over the same root facade surface. The run commands accept `--input <file|->` JSON and optional flag overrides for repository, mode, trace, sequence, expected bytes, and runtime worker count.

## `wiki_state` views

`wiki_state` should be the primary read surface. It can be powerful because it does not mutate truth. Core state reads fold trace records and source-map inputs directly; stored `.codewiki/views/**` files are optional caches or render artifacts, never state truth.

Initial `view` values:

| View | Purpose |
| --- | --- |
| `status` | Latest trace health, active loop, latest exit status, blockers, and next safe action. |
| `resume` | Compact continuation packet with durable refs, current loop, and recovery rationale. |
| `work_plan` | Per-trace planning detail: work units, acceptance, dependencies, path scopes, and implementation refs. |
| `work_queue` | Cross-trace scheduling projection: backlog, waiting, ready, claimed, blocked, and done. |
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

Slash commands are host UX, not workflow semantics. A Pi extension may eventually expose:

| Command | Backend action |
| --- | --- |
| `/wiki status` | `wiki_state { view: "status" }` |
| `/wiki resume` | `wiki_state { view: "resume" }` plus host prompt handoff |
| `/wiki queue` | `wiki_state { view: "work_queue" }` |
| `/wiki config` | `wiki_config` |
| `/wiki archive` | `wiki_archive` |

Users may ask for decision, planning, implementation, or runtime work in chat. The agent uses the internal tools to execute those loop actions.

## Skills

Skills are as important as tools. Tools execute; skills tell agents when and how to use them.

Target skills should be small, operational, and aligned to the new model:

- `codewiki-state`: inspect status/resume/work queue before acting;
- `codewiki-decision`: run decision loop cycles, output, and exit conditions;
- `codewiki-planning`: run planning loop cycles, output, and exit conditions;
- `codewiki-implementation`: run implementation loop cycles, output, and exit conditions;
- `codewiki-runtime`: claim/release/dispatch worker work safely;
- `codewiki-archive`: close, retain, hydrate, and restore traces/knowledge;
- `codewiki-config`: read automation and host policy.

Do not reintroduce old skills that teach roadmap truth, graph truth, split output/evaluation as product concepts, standalone validation loops, or CodeWiki-owned compaction.

## Distribution

Distribution should keep one harness-agnostic core and multiple thin adapters.

Recommended packaging path:

1. `codewiki` package exports core APIs and types.
2. CLI entrypoint wraps the same APIs for local users and CI.
3. Pi extension adapter ships as an optional adapter once the core tool surface stabilizes.
4. MCP server adapter can expose the same seven tools to non-Pi agents.

If Pi SDK dependencies become heavy or version-sensitive, split adapters into optional packages later. Until then, avoid hard SDK imports from core source and keep adapter dependencies optional or entrypoint-isolated.

## Retention and archive tools

Do not model hot/cold knowledge movement as generic garbage collection. The target concept is a retention and archival pipeline:

```text
hot .codewiki/kb + active traces
  -> close trace
  -> compact trace stub + Git restore refs
  -> hydrate/restore on demand
```

Temporary cleanup is runtime housekeeping. Knowledge/trace archival is a product pipeline and should be exposed through `wiki_archive`, not a generic `wiki_gc` normal tool.

## Related docs

- [CodeWiki API](api.md)
- [Migration Audit](migration-audit.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Extension](extension.md)
- [File Structure](file-structure.md)
