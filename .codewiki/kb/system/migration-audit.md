# Migration Audit

CodeWiki is midway through a rebuild from `_OLD_VERSION/src/**` into the clean `src/**` scaffold. `_OLD_VERSION/**` remains reference-only code. It must not be re-enabled wholesale, and it must not reintroduce the archived Pi extension, graph truth roots, roadmap truth roots, validation roots, or CodeWiki-owned compaction.

The roadmap product concept is deprecated. Active work state is a projection over traces, especially `work-plan` and `work-queue`. Historical roadmap files are archive/reference material unless a future accepted decision explicitly imports selected facts.

This audit records the current migration state after the pivot to runtime outer loop, semantic loop iterations, loop outputs, exit conditions, runtime claims, worker aggregation, claim correlation, and aggregate content proof.

## Current source inventory

| Area | Old source | New source | Migration state | Notes |
| --- | ---: | ---: | --- | --- |
| Pi adapter and commands | 36 files | 13 files | Package metadata enabled / read-only repo dogfood | `src/pi/**` exposes tools, `/wiki`, prompt/TUI seams, process/session worker transport, and package install/RPC smoke coverage without importing the Pi SDK into core source. |
| Agency | 5 files | 0 files | Intentionally dropped for now | Role/agency scheduling is not a target concept during the rebuild. Runtime scheduling uses work-queue projections and claims. |
| Public API facade | 2 files | 8 files | Core facades complete | Reduced core facades exist for `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_runtime`, `wiki_archive`, and `wiki_config`; the Pi wrapper is package-installable while MCP remains deferred. |
| Audit/checks | 8 files | 0 files | Partially replaced | Deterministic checks move into semantic loop exit conditions where relevant. Packaged audit tooling is not migrated. |
| Output artifacts | 7 old files | semantic loop internals | Replaced | Loop output and runtime-temp scratch replace the old artifact model. Historical artifact files are not target truth. |
| Decision | 5 files | 6 files | Migrated core | Decision table, iteration runner, exit evaluation, propagation, and approval helpers exist in target source. |
| Validation roots | 7 files | loop exit conditions | Replaced | There is no target validation root. Exit conditions live with the three semantic loops. |
| Retention/archive | 3 old files | trace retention lifecycle | Migrated core | Trace retention stubs, `trace_close`, and hydrate plans exist. Destructive purge remains out of target normal workflow. |
| Knowledge parsing | 2 files | 8 files | Expanded core | Markdown headings/body, diagram YAML, source-map, and file-structure map parsing exist. Markdown frontmatter is intentionally forbidden. Deep scaffold refactor remains deferred. |
| Policy/risk | 4 files | exit-condition inputs/runtime stubs | Partial | Policy is currently encoded as deterministic exit-condition options and runtime stubs, not a standalone policy subsystem. |
| Project bootstrap/context | 9 files | 5 files | Core migrated | Root/config/config-file/bootstrap/types exist. Bootstrap writes target KB/traces/views/config scaffold without old graph or roadmap truth roots. |
| Roadmap/tasks | 8 files | planning/work-queue | Deprecated / replaced | Planning work units and work-queue projections replace roadmap truth. Historical roadmap files remain archive/reference state, not active workflow truth. |
| Runtime | 3 files | 10 files | Migrated core | Scheduler, claims, dispatcher batches, leases/budget/policy stubs, and tmp helpers exist. |
| Session/worktree dispatch | 11 files | runtime + implementation + git stubs | Partial | Claims, worker dispatch seam, worker result aggregation, and aggregate proof exist. Full worktree isolation/session tooling is deferred. |
| Shared utilities | 4 files | 5 files | Partial | Small source utilities exist. Historical lock/ports helpers are not migrated wholesale. |
| State/graph/resume | 21 files | traces + views | Replaced core, Pi surface active | JSONL traces and generated views replace graph/state roots. State/resume projections are exposed through core facades and `/wiki` commands. |
| Telemetry/lifecycle | 3 files | trace events | Replaced conceptually | Trace events/checkpoints/close records carry lifecycle facts. Historical telemetry roots are not target truth. |
| Workflow composite tool | 1 file | core facades complete | Core facades exist for `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_runtime`, `wiki_archive`, and `wiki_config`. CLI wrapper exists as a temporary development harness; Pi wrapper is package-installable; MCP remains deferred. Standalone split-output and split-evaluation tools should not return as normal tools. |

## Stabilized target spine

The following source is now stable enough to be treated as the active migration base:

- runtime outer loop plus exactly three semantic loops: decision, planning, implementation;
- loop cycles, loop outputs, exit conditions, progress signals, and route-back statuses;
- trace append/replay/query/project folding helpers;
- compact semantic iteration/checkpoint trace events;
- canonical trace refs and validation of traceability refs;
- work-plan, work-queue, quality, status, resume, blockers, and conflicts projections;
- runtime scheduler, claim/release events, and append preflight for dispatch claims;
- injected Pi worker dispatcher seam with no hard Pi dependency;
- worker result aggregation into implementation changes;
- runtime claim to worker result correlation;
- core facades for the reduced `wiki_*` surface: state, decide, plan, implement, runtime, archive, and config;
- `runWikiDecide()`, `runWikiPlan()`, and `runWikiImplement()` core facades for preview/append loop iterations;
- implementation snapshot/proof helpers wired through `runWikiImplement()`;
- final aggregate content proof for worker or parallel implementation outputs;
- file-structure component alignment for planning and implementation exit conditions;
- red/green TDD proof support when policy requires it.

## Intentional non-migrations

These old behaviors should stay out of active source unless a future accepted decision explicitly reintroduces them:

- automatic CodeWiki compaction, context projection, or prompt injection;
- mutation-heavy repo-local Pi dogfooding without fresh expected byte/sequence evidence;
- graph files as canonical truth;
- historical roadmap/artifact/validation/session/telemetry roots as active workflow truth;
- role-based agency scheduling as a first-class workflow axis;
- standalone validation, knowledge-update, publication, or semantic runtime loops;
- old split output/evaluation terms as product concepts;
- standalone split-output, split-evaluation, or roadmap normal tools;
- wholesale `_OLD_VERSION/**` imports or archived API shims without target-loop tests.

## Remaining migration gaps

| Priority | Gap | Why it matters | Target shape |
| --- | --- | --- | --- |
| Done | Orchestrator append facade | `appendSemanticLoopIteration()` runs one semantic loop iteration, verifies one target `<loop>.iteration` event plus checkpoint, and appends the batch with expected bytes/sequence. | Semantic producers and generated views now use iteration output directly. |
| Done | `wiki_state` core facade | `buildWikiState()` folds trace records and source-map input into status, resume, work-plan, work-queue, blockers, conflicts, and source ownership projections without reading stored views as truth. | Host tools/commands can wrap this facade later. |
| Done | Target `wiki_*` core API | Agents need CodeWiki tools to operate the development OS. Old tool sprawl should not return, but the reduced core surface is required before host wrappers. | Core facades exist, root exports are facade-only, and host/CLI/Pi wrappers can sit over the reduced set. |
| Done | User-facing state/resume surface | Core `wiki_state` exists, and the CLI can inspect trace-backed state without Pi. | Pi `/wiki state` and `/wiki resume` are package-installable; repo-local read-only dogfooding is enabled. |
| Done | Repository snapshot/content proof helpers | `collectProjectSnapshot()`, `createWorkingTreeDigest()`, and `createWorkingTreeContentProof()` provide normalized path snapshots and deterministic content proof for implementation exit inputs. | `runWikiImplement()` now calls these helpers automatically. |
| Done | Skills refactor | Tools execute the OS, but agents need concise operational skills to use the new loop/output/exit-condition/runtime model correctly. | Project-local `.agents/skills/codewiki-*` skills cover state, decision, planning, implementation, runtime, archive, and config; they must point at Pi-owned tools once the extension is explicitly enabled. |
| Done | Retention/archive pipeline | Hot `.codewiki/kb/**` and active traces need smooth cold archival through Git restore refs. This is product lifecycle, not destructive cleanup. | `wiki_archive` now previews retention stubs, appends `trace_close` records, and plans hydrate/restore from archived trace records. |
| Done | Worktree isolation and session lifecycle | Worktrees may help parallel workers, dirty repos, and aggregate Git proof, but defaulting to them everywhere adds cost. | Config declares isolation policy as `none`, `worktree`, or `auto`; host-owned worktree execution is dry-run by default, explicit-runner only, and includes optional setup hooks. |
| Done | Project bootstrap/scaffold generation | New repositories need target `.codewiki` structure without old graph/roadmap/gateway roots. | `src/project/bootstrap.ts` now writes config, KB, traces, views, and source-map scaffold; `/wiki bootstrap` is the target Pi command, while the CLI remains a temporary harness. |
| P2 | Roadmap archival note | Planning work units replace roadmap truth. Old roadmap files may need a recorded archival decision, not import by default. | Write a trace/KB note that old roadmap state is ignored or archived unless explicitly selected for import. |
| Done | Policy/config model | Exit-condition policy and agency behavior need one typed project config instead of scattered options. | `src/project/config.ts` now resolves automation, agency, worktree isolation, budgets, approvals, retention, and host adapter flags through `wiki_config`; `src/project/config-file.ts` loads and saves `.codewiki/config.json`. |
| P2 | Audit command | External Pi/LSP/lens validation is used during rebuild. | Package audit facade can wait until active CLI/API needs it. |

## Recommended next migration order

1. **Exit criteria hardening** — continue reviewing old validation lessons and migrate only loop-owned conditions into `decision/exit.ts`, `planning/exit.ts`, and `implementation/exit.ts`. Decision rows now require explicit low/medium/high risk tiers; decision table source refs are validated before entering current-state evidence; user-authority decision blockers remediate to the user; planning resolutions now preserve and reject unknown kinds; implementation evidence now must cover planned verification refs/commands; package/dependency changes now require pack verification inside `implementation/exit.ts`; complete planning route-back resolutions now return to decision authority instead of implementation; `trace_close` now terminates appends and active queue/status/resume behavior; package metadata keeps installed runtime support at Node.js `>=20.6.0`, and packages build `dist/**` before packing so installed bins do not execute TypeScript from `node_modules`.
2. **Optional host integrations** — Pi extension commands/tools and MCP after core package APIs are stable.

## Stop condition for architecture work

Do not add another architecture subsystem before the P0 path from active loop input to durable traces and back to `wiki_state` summary/views exists. The loop-to-trace append facade, read-only `wiki_state` core facade, facade-only root exports, temporary source CLI harness, and local operating skills now exist; remaining work should deepen lifecycle behavior rather than add parallel architecture.

## Distribution direction

CodeWiki should distribute as a harness-agnostic core with thin host adapters:

```text
codewiki core package -> Pi extension adapter -> future MCP adapter
```

Pi is a primary host, not the core. Core source must stay free of hard Pi SDK imports. The Pi extension is now package-installable after the reduced tool facade stabilized, and repo-local read-only dogfooding is enabled. The source CLI is only a temporary development/test harness. MCP adapters should expose the same tool semantics when added so other harnesses can operate CodeWiki without reimplementing the OS model.

## Tool-surface direction

Use a small number of powerful-but-explicit tools. Read tools can use structured selectors such as `view`, `include`, `traceId`, and `format`. Write tools need explicit `mode`, trace scope, expected sequence/bytes, and typed inputs. CLI flags should be a rendering of these structured parameters, not separate semantics.

The target normal tools are:

```text
wiki_state
wiki_decide
wiki_plan
wiki_implement
wiki_runtime
wiki_archive
wiki_config
```

Standalone split-evaluation, split-output, roadmap, and destructive cleanup tools are not target normal tools. Exit-condition behavior belongs inside safe loop operations. Roadmap is replaced by trace views. Destructive cleanup is replaced by retention/archive for knowledge and trace lifecycle.

## Related docs

- [System Overview](overview.md)
- [Loop Contracts](loop-contracts.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Loop Model](loop-model.md)
- [File Structure](file-structure.md)
