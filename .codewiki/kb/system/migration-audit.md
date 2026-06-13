# Migration Audit

CodeWiki is midway through a rebuild from `_OLD_VERSION/src/**` into the clean `src/**` scaffold. `_OLD_VERSION/**` remains reference-only code. It must not be re-enabled wholesale, and it must not reintroduce the archived Pi extension, graph truth roots, roadmap truth roots, validation roots, or CodeWiki-owned compaction.

The roadmap product concept is deprecated. Active work state is a projection over traces, especially `work-plan` and `work-queue`. Legacy roadmap files are archive/reference material unless a future accepted decision explicitly imports selected facts.

This audit records the current migration state after the pivot to runtime outer loop, semantic loop iterations, loop outputs, exit conditions, runtime claims, worker aggregation, claim correlation, and aggregate content proof.

## Current source inventory

| Area | Old source | New source | Migration state | Notes |
| --- | ---: | ---: | --- | --- |
| Pi adapter and commands | 36 files | 8 files | Deferred / seam only | The extension is intentionally disabled. Current `src/pi/**` exposes disabled surfaces and an injected worker dispatcher seam without importing the Pi SDK. |
| Agency | 5 files | 0 files | Intentionally dropped for now | Role/agency scheduling is not a target concept during the rebuild. Runtime scheduling uses work-queue projections and claims. |
| Public API facade | 2 files | 8 files | Core facades complete | Reduced core facades exist for `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_runtime`, `wiki_archive`, and `wiki_config`; host wrappers remain deferred. |
| Audit/checks | 8 files | 0 files | Partially replaced | Deterministic checks move into semantic loop exit conditions where relevant. Packaged audit tooling is not migrated. |
| Output artifacts | 7 old files | semantic loop internals | Replaced | Loop output and runtime-temp scratch replace the old artifact model. Historical artifact files are not target truth. |
| Decision | 5 files | 6 files | Migrated core | Decision table, iteration runner, exit evaluation, propagation, and approval helpers exist in target source. |
| Validation roots | 7 files | loop exit conditions | Replaced | There is no target validation root. Exit conditions live with the three semantic loops. |
| GC/retention | 3 files | trace retention stub | Partial / deferred | Trace retention exists, but destructive purge and restore-ledger workflows are deferred. |
| Knowledge parsing | 2 files | 8 files | Expanded core | Markdown headings/body, diagram YAML, source-map, and file-structure map parsing exist. Markdown frontmatter is intentionally forbidden. Deep scaffold refactor remains deferred. |
| Policy/risk | 4 files | exit-condition inputs/runtime stubs | Partial | Policy is currently encoded as deterministic exit-condition options and runtime stubs, not a standalone policy subsystem. |
| Project bootstrap/context | 9 files | 4 files | Partial | Root/config/types exist; bootstrap remains unavailable while extension is disabled. |
| Roadmap/tasks | 8 files | planning/work-queue | Deprecated / replaced | Planning work units and work-queue projections replace roadmap truth. Legacy roadmap files remain archive/reference state, not active workflow truth. |
| Runtime | 3 files | 10 files | Migrated core | Scheduler, claims, dispatcher batches, leases/budget/policy stubs, and tmp helpers exist. |
| Session/worktree dispatch | 11 files | runtime + implementation + git stubs | Partial | Claims, worker dispatch seam, worker result aggregation, and aggregate proof exist. Full worktree isolation/session tooling is deferred. |
| Shared utilities | 4 files | 5 files | Partial | Small source utilities exist. Legacy lock/ports helpers are not migrated wholesale. |
| State/graph/resume | 21 files | traces + views | Replaced core, product surface missing | JSONL traces and generated views replace graph/state roots. Status/resume projections exist, but no user-facing command/tool facade is active. |
| Telemetry/lifecycle | 3 files | trace events | Replaced conceptually | Trace events/checkpoints carry lifecycle facts. Legacy telemetry roots are not target truth. |
| Workflow composite tool | 1 file | core facades complete | Core facades exist for `wiki_state`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_runtime`, `wiki_archive`, and `wiki_config`. Host wrappers are still deferred. Standalone `wiki_gate` and `wiki_build` should not return as normal tools. |

## Stabilized target spine

The following source is now stable enough to be treated as the active migration base:

- runtime outer loop plus exactly three semantic loops: decision, planning, implementation;
- loop cycles, loop outputs, exit conditions, progress signals, and route-back statuses;
- trace append/replay/query/project folding helpers;
- compact semantic iteration/checkpoint trace events;
- canonical trace refs and validation of traceability refs;
- work-plan, work-queue, status, resume, blockers, and conflicts projections;
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
- repo-local Pi extension loading while the extension is disabled;
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
| Done | User-facing status/resume surface | Core `wiki_state` exists, and the CLI can inspect trace-backed state without Pi. | Pi command reintroduction remains deferred until adapter policy is stable. |
| Done | Repository snapshot/content proof helpers | `collectProjectSnapshot()`, `createWorkingTreeDigest()`, and `createWorkingTreeContentProof()` provide normalized path snapshots and deterministic content proof for implementation exit inputs. | `runWikiImplement()` now calls these helpers automatically. |
| Done | Skills refactor | Tools execute the OS, but agents need concise operational skills to use the new loop/output/exit-condition/runtime model correctly. | Project-local `.agents/skills/codewiki-*` skills cover state, decision, planning, implementation, runtime, archive, and config with CLI-backed instructions. |
| P1 | Retention/archive pipeline | Hot `.codewiki/kb/**` and active traces need smooth cold archival through Git restore refs. This is product lifecycle, not destructive cleanup. | Expose retention/archive/hydrate/restore through `wiki_archive`. |
| P1 | Worktree isolation and session lifecycle | Worktrees may help parallel workers, dirty repos, and aggregate Git proof, but defaulting to them everywhere adds cost. | Add config-driven isolation: `none`, `worktree`, or `auto`. Keep worktree helpers host-owned until orchestration stabilizes. |
| P1 | Project bootstrap/scaffold generation | Target package source is stable enough for core loops, but bootstrap remains unavailable. | Regenerate scaffold from target file-structure docs after active APIs stop moving. |
| P2 | Roadmap archival note | Planning work units replace roadmap truth. Old roadmap files may need a recorded archival decision, not import by default. | Write a trace/KB note that old roadmap state is ignored or archived unless explicitly selected for import. |
| P2 | Policy/config model | Exit-condition policy and agency behavior are mostly code-level options. | Consolidate automation, agency, worktree isolation, budgets, approvals, and retention settings in CodeWiki config. |
| P2 | Audit command | External Pi/LSP/lens validation is used during rebuild. | Package audit facade can wait until active CLI/API needs it. |

## Recommended next migration order

1. **Retention/archive pipeline** — close, archive, hydrate, and restore traces/knowledge through Git refs.
2. **Config model** — consolidate automation/agency, worktree isolation, budgets, approval policy, and retention settings.
3. **Project bootstrap/scaffold rebuild** — update `.codewiki` scaffold once source layout and APIs stop shifting.
4. **Optional host integrations** — Pi extension commands/tools, MCP, worktree isolation, session lifecycle, and audit after core package APIs are stable.

## Stop condition for architecture work

Do not add another architecture subsystem before the P0 path from active loop input to durable traces and back to state/status views exists. The loop-to-trace append facade, read-only `wiki_state` core facade, facade-only root exports, CLI wrapper, and local operating skills now exist; remaining work should deepen lifecycle behavior rather than add parallel architecture.

## Distribution direction

CodeWiki should distribute as a harness-agnostic core with thin adapters:

```text
codewiki core package -> CLI adapter -> Pi extension adapter -> MCP adapter
```

Pi is a primary host, not the core. Core source must stay free of hard Pi SDK imports. The Pi extension should return after the reduced tool facade is stable. CLI and MCP adapters should expose the same tool semantics so other harnesses can operate CodeWiki without reimplementing the OS model.

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
