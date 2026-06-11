---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target repository, package-source, and dogfood CodeWiki state structure for the KB-plus-traces source-of-truth model.
owners:
  - architecture
updated: "2026-06-11"
diagram_refs:
  - file-structure-map:intended_file_structure
  - file-structure-map:concept_root_target
  - file-structure-map:dogfood_kb
  - file-structure-map:hot_trace_truth
  - file-structure-map:cold_trace_catalog
  - file-structure-map:legacy_loop_evidence
  - file-structure-map:generated_graph
  - file-structure-map:runtime_session
  - file-structure-map:local_workspace_state
  - file-structure-map:migration_compatibility_constraints
---

# File Structure

## Project boundary

This repository is intentionally not dogfooding the CodeWiki Pi extension during the rebuild.

- active package source: `src/`, `tests/`, `README.md`, `CHANGELOG.md`, `package.json`, and `tsconfig.json`;
- archived previous implementation: `_OLD_VERSION/**`, used only as migration reference;
- source-of-truth documentation: `.codewiki/kb/**`;
- legacy dogfood state: other `.codewiki/**` roots such as roadmap, builds, validation, runtime, session, telemetry, and generated graph files.

`package.json` must not expose `pi.extensions` or `pi.skills` while this rebuild is active. Pi should treat this checkout as normal project files plus KB documentation, not as a loaded CodeWiki package. Pi native compaction is the only active conversation-compaction mechanism.

## Target dogfood/user `.codewiki` structure

Target CodeWiki project state has two canonical roots and one generated root:

```text
.codewiki/
  config.json
  kb/                       # current product/system knowledge truth
    lexicon.md
    product/
    system/
      diagrams/
  traces/                   # workflow/state truth
    TRACE-*.jsonl           # append-only head/events/tail checkpoints
  views/                    # generated query surfaces; disposable
    status.json
    roadmap.json
    runnable.json
    conflicts.json
    context/
```

Rules:

- `kb/**` owns current product/system knowledge truth.
- `traces/TRACE-*.jsonl` owns workflow and state truth: decision approvals, planning work units and ordering, implementation claims/workers, gates, lifecycle state, retention refs, and current tails.
- `views/**` owns no truth. Views are generated caches over KB, traces, source/tests, and Git refs.
- Git is the cold historical/content source of truth.
- Pi session transcripts remain in Pi storage; CodeWiki traces store only refs and concise summaries.
- `config.json` is project policy/configuration, not lifecycle state.

Migration compatibility may still read or write `.codewiki/roadmap/queue.json`, `.codewiki/roadmap/tasks/**`, `.codewiki/builds/**`, `.codewiki/validation/**`, `.codewiki/runtime/**`, `.codewiki/session/**`, `.codewiki/index_graph.json`, and `.codewiki/telemetry/**` until planned migration tasks replace those surfaces. Those paths must not be promoted as target truth roots.

Standalone hot roots such as `builds`, `validation`, `gateway`, `archive`, `logs`, `sources`, `research`, `gc`, `session`, `runtime`, `telemetry/catalog.json`, top-level `roadmap.json`, `index_graph.json`, `cache`, and multi-file trace directories are not target truth roots. New trace-aware code must not add shims that normalize these roots into lifecycle traces.

## Hot-state retention classes

| Class | Paths | Retention rule | Safe deletion trigger |
| --- | --- | --- | --- |
| Package source truth | `src/**`, `skills/**`, `scripts/**`, `tests/**`, `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `tsconfig.json` | Tracked package behavior and tests. This is not CodeWiki dogfood cleanup state. | Only normal product changes; never CodeWiki GC. |
| Dogfood KB truth | `.codewiki/kb/**` | Hot while it describes current repository intent or target system truth. | Only approved KB migration or normal docs edits. |
| Trace state truth | `.codewiki/traces/TRACE-*.jsonl` | Hot/full while active, blocked, unpublished, recently closed, route-back relevant, or referenced by open work/gates. Cold traces keep a small stub with `trace_head` and retention/tail checkpoint refs. | Trace retention records Git restore refs for archived event ranges, and generated views can rebuild from the stub plus Git. |
| Generated views | `.codewiki/views/**`; compatibility `.codewiki/index_graph.json`, `.codewiki/roadmap/tasks/**` | Rebuildable projections. Views may be tracked when useful for tooling, but never own truth. | Rebuild or remove generated output only; do not use generated files as authoritative deletion evidence. |
| Legacy build/gate evidence | `.codewiki/builds/**`, `.codewiki/validation/**`, `.codewiki/research/**`, `.codewiki/gc/**`, `.codewiki/telemetry/**` | Compatibility evidence while active migration tasks still consume legacy roots. | `wiki_gc` or trace retention classifies artifact as purgeable and records archive commit/tree restore evidence before deletion. |
| Runtime/session compatibility | `.codewiki/runtime/**`, `.codewiki/session/**` | Hot only for active compatibility leases, jobs, heartbeats, wait/wake queues, and current handoffs. Target runtime state is represented by trace events and tails. | Runtime GC may purge completed/cancelled/failed/external consumed handoffs; active compatibility leases/jobs remain. |
| Pi/local/editor state | `.pi/**`, `.pi-lens/**`, `.vscode/**`, `.tmp-worktrees/**` | `.pi/settings.json`, `.pi/APPEND_SYSTEM.md`, and `.pi/.gitignore` are repo-local Pi configuration; `.pi` package cache contents, `.pi-lens`, `.vscode`, and `.tmp-worktrees` are local/editor/worktree state with no production semantics. | `.vscode`, `.pi-lens`, and `.tmp-worktrees` stay ignored. Remove registered worktrees only with `git worktree remove`/`prune` after dirty-state and CodeWiki trace claim checks. |

No gate report, compiler output, validation report, trace event range, or lifecycle stub required by an open task, an active migration, or current policy may be deleted. If a purge is not safe, record the deferral reason instead of deleting.

Prefer Git refs and Git object queries for restore work. `.tmp-worktrees/**` is optional local isolation scratch for parallel builders, validators, or publishers; it is not durable retention state.

Agent-created scratch and cache data must be repo-local, ignored, scoped, and disposable by default. Preferred locations are `.codewiki/runtime/tmp/**`, `.codewiki/cache/**`, `.tmp-worktrees/**`, or in-memory streams, depending on whether the data is coordination, generated cache, worktree isolation, or transient processing. Durable user-relevant evidence must be written to canonical KB, trace, roadmap, build, validation, source, test, or Git refs, not to OS temp. Unavoidable external-tool OS-temp usage is allowed only as an implementation detail and should be disclosed when it affects recoverability, privacy, cleanup, or validation evidence.

## Lifecycle trace files

One trace file represents one accountable change journey from decision intent to production-ready or published code:

```text
.codewiki/traces/TRACE-YYYYMMDD-<slug>.jsonl
```

Each trace is append-only and Pi-session-like:

```text
trace_head          # stable identity, title, scope, creation refs
trace_event         # decision/planning/implementation/runtime/gate event with seq
trace_event         # more events
tail_checkpoint     # derived loop tails and retention refs
```

The first line is the stable head. Event lines carry `seq`, `loop`, `run_id`, `type`, `refs`, and `data`. Tail checkpoints are derived current-state summaries for fast resume and queries; replaying lines from the head remains authoritative. Context refresh at a loop boundary appends summary/checkpoint events instead of depending on chat history.

## Target package source structure

Package source should mirror the three-loop mental model:

```text
src/
  index.ts
  api/                       # public facade only
  decision/
    table.ts
    compiler.ts
    gate.ts
    tool.ts
    types.ts
  planning/
    compiler.ts
    gate.ts
    tool.ts
    types.ts
  implementation/
    compiler.ts
    gate.ts
    tool.ts
    types.ts
  telemetry/
    trace.ts
    reader.ts
    writer.ts
    replay.ts
    scanner.ts
    retention.ts
    types.ts
  graph/
    builder.ts
    views.ts
    reader.ts
    types.ts
  knowledge/
    doc-parser.ts
    diagram-parser.ts
  git/
    content-evidence.ts
    worktrees.ts
    publisher.ts
  pi/
    commands/
    tools/
    ui/
    prompt/
    prompt-assets/
    compaction.ts
  project/
  runtime/
  agency/
  shared/
```

Loop roots own their compiler engines and loop-specific gates. Shared roots exist only when behavior is genuinely cross-loop.

## Source roots to retire or merge

| Current root | Target |
| --- | --- |
| `src/adapters/pi/**` | `src/pi/**` because Pi is the foundation for the CodeWiki distribution, not a mere adapter. |
| `src/build/**` | old compiler-output writer to replace; target output is emitted to lifecycle traces under `src/telemetry/**`. |
| `src/change/**` (retired by TASK-109; do not recreate without accepted migration trigger) | `src/decision/**`, with decision-table behavior in `src/decision/table.ts`. |
| `src/roadmap/**` | `src/planning/**` for work shaping; migrate active roadmap storage without a shim layer. |
| `src/audit/**`, `src/checks/**`, `src/policy/**`, `src/gateway/**` | loop gate facets plus shared gate criteria helpers; migrate toward loop-owned gates. |
| `src/validation/**` | remove; it is not a target source root or shim root. Use `src/gateway/**`, loop gate helpers, or public API contracts during migration. |
| `src/state/**` | `src/graph/**` for generated graph/read models; non-graph concerns move to owning roots. |
| `src/gc/**` | `src/telemetry/retention.ts` and Git-history-backed retention. |
| `src/session/**` | `src/runtime/**`, `src/git/worktrees.ts`, or Pi session integration depending on responsibility. |
| `src/workflow/**` | loop tools and runtime orchestration. |

Thin shim roots should not be added. Existing roots must either remain explicit previous-state code until replaced or move directly to target owners. `src/validation/**` should be removed rather than retained as a shim root once imports are migrated.

## Skills

Pi skill assets may continue to live under top-level `skills/**` because the package manifest and Pi skill discovery expect that surface. Normal workflow skill folders mirror the three loop names only:

```text
skills/
  codewiki-decision/
  codewiki-planning/
  codewiki-implementation/
```

Gateway/validation rules belong in the gateway tool contract, loop handoffs, fresh validator kickoff packets, prompt contract, and package docs rather than a normal fourth workflow skill. The generic `codewiki` router skill content belongs in the injected system prompt/package docs, not a visible or hidden skill command. Cross-loop runtime templates, bootstrap prose, starter taxonomy, and tool catalog assets are package prompt assets under `src/adapters/pi/prompt-assets/**` during migration, not discoverable skills and not `.codewiki/kb/**` dogfood truth. The file-structure map classifies `src/adapters/pi/prompt-assets/**` as compatibility package prompt assets owned by the skill/prompt-asset surface, with target ownership `src/pi/prompt-assets/**` after the Pi source-root migration. They are not a second strict adapter owner during the current migration. Do not preserve removed skill surfaces as old commands, shims, aliases, or `/skill:codewiki-validation` compatibility entrypoints.

## Tests

Tests should be task-linked or shared:

```text
tests/
  tasks/
    TASK-*/
  shared/
    gates/
    fixtures/
    helpers/
  decision/
  planning/
  implementation/
  telemetry/
  graph/
  runtime/
  pi/
```

Task-specific regression tests live under task-ref paths/files. Reusable helpers/suites live under `tests/shared/**`. Gate/source-contract checks live under shared gate harnesses or loop gate contracts. Current `tests/smoke/**`, `tests/fixtures/**`, `tests/run.mjs`, `tests/setup-env.mjs`, and `tests/decision-table-fixture.mjs` are accepted migration compatibility evidence while they remain referenced by package/gate checks. Future test-root migration should move long-lived suites into task-linked, shared, or loop-owned roots without deleting executable coverage.

## Residual structure cleanup

File-structure cleanup must be scoped by warning class and owner boundary. Do not close a broad “fix all structure warnings” task while leaving warnings unexplained. Remaining actionable drift needs residual coverage: task, sprint, accepted deferral, compatibility rule, archive plan, or false-positive rationale.

Accepted target source structure also needs owner coverage. When target roots or roots-to-retire remain unmatched by current source, planning must route the delta to executable tasks/sprint scope, implementation evidence, or accepted deferral with owner and trigger. Roadmap `open=0` does not prove the target source structure is complete.

`historical`, `non-task`, and `out-of-scope` are not durable coverage. Close evidence must name the owning task/sprint or accepted deferral. Legacy compatibility paths need a migration or deletion trigger.

## Knowledge-base contract

Project KB uses:

```text
.codewiki/kb/
  lexicon.md
  product/
    overview.md
    users/
    stories/
    uis/
  system/
    overview.md
    trace-graph.md
    file-structure.md
    <component>.md
    diagrams/
      README.md
      context-map.yaml
      component-map.yaml
      key-flow.yaml
      data-model.yaml
      state-lifecycle.yaml
      file-structure-map.yaml
```

Product docs define user-facing orientation. System docs define technical specs. Diagram YAML is canonical source, not generated render output. Semantic changes must update product/system KB and affected diagrams or include explicit no-impact rationale before gates can pass.

## Migration operation rules

This refactor is bootstrapped without the CodeWiki Pi extension. Agents must not use `wiki_*` tools, CodeWiki skills, CodeWiki-owned compaction, or generated roadmap/graph state as active workflow truth in this repository while the extension is disabled.

The first rebuild objective is a clean target source scaffold. Migrate code from `_OLD_VERSION/**` into `src/**` one module at a time: decision, then planning, then implementation, followed by telemetry/graph/runtime support. Each migration should keep tests local to the migrated module and should not re-enable Pi extension metadata until explicitly approved.

Context compression belongs to Pi native compaction during this phase. CodeWiki-owned refresh windows, context-boundary injection, and automatic `wiki_resume_context` pickup are disabled until a future explicit decision reintroduces them.

## Local scratch and worktrees

Local scratch/worktree folders such as `.tmp-worktrees/**` are not production CodeWiki structure. Worktree roots should be configured by runtime/worktree factory policy and ignored intentionally. Registered Git worktrees must be removed with `git worktree remove` and `git worktree prune` after dirty-state and lease checks.

## Related docs

- [Trace Graph and Lifecycle Trace Schema](trace-graph.md)
- [Lexicon](../lexicon.md)
- [Compilers](compilers.md)
- [Gateway](validation-gateway.md)
- [Graph](graph.md)
- [Runtime](runtime.md)
- [Agency Controller](agency.md)
