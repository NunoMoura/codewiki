---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target repository, package-source, and dogfood CodeWiki state structure for the three-loop lifecycle trace model.
owners:
  - architecture
updated: "2026-06-05"
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

This repository contains two things named CodeWiki:

- product/package source: `src/`, `skills/`, `scripts/`, `tests/`, `README.md`, `CHANGELOG.md`, `package.json`;
- dogfood project state: `.codewiki/**`.

Package source changes build the CodeWiki distribution. `.codewiki/**` records this repository's KB truth, active work truth, lifecycle traces, generated graph/cache projections, runtime coordination, and migration evidence.

## Target dogfood/user `.codewiki` structure

Target CodeWiki project state is small:

```text
.codewiki/
  config.json
  kb/                       # current product/system truth
    lexicon.md
    product/
    system/
      diagrams/
  roadmap.json              # active work truth
  telemetry/
    catalog.json            # compact cold trace catalog and restore refs
    TRACE-*.json            # hot lifecycle traces only
  runtime/
    state.json              # hot coordination: leases, jobs, heartbeats, blockers
  index_graph.json          # generated; never hand-edit
  views/                    # optional generated projections
  cache/
    graph.sqlite            # optional generated cache; gitignored
```

Rules:

- `kb/**` owns current product/system truth.
- `roadmap.json` owns target active work truth; the configured roadmap queue compatibility path remains migration storage until the roadmap migration replaces it.
- `telemetry/TRACE-*.json` owns hot lifecycle trace truth for active, blocked, unpublished, recently closed, or active-work-referenced changes.
- `telemetry/catalog.json` owns compact metadata and Git restore refs for cold traces.
- `runtime/state.json` owns mutable live coordination only.
- `index_graph.json`, `views/**`, and `cache/graph.sqlite` are generated projections/caches.
- Git is the cold historical/content source of truth.
- Pi session transcripts remain in Pi storage; CodeWiki traces store only refs and concise summaries.

Standalone hot roots such as `builds`, `validation`, `gateway`, `archive`, `logs`, `sources`, `research`, `gc`, `session`, and multi-file telemetry trace directories are not target truth roots. New trace-aware code must not add shims that normalize these roots into lifecycle traces.

## Hot-state retention classes

| Class | Paths | Retention rule | Safe deletion trigger |
| --- | --- | --- | --- |
| Package source truth | `src/**`, `skills/**`, `scripts/**`, `tests/**`, `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `tsconfig.json` | Tracked package behavior and tests. This is not CodeWiki dogfood cleanup state. | Only normal product changes; never CodeWiki GC. |
| Dogfood KB and roadmap truth | `.codewiki/kb/**`, target roadmap root, configured roadmap queue compatibility storage, `.codewiki/roadmap/tasks/**` | Hot while it describes current repository intent or active/closed roadmap history. | Roadmap/archive migration with source-owned restore path; not runtime GC. |
| Hot lifecycle trace truth | `.codewiki/telemetry/TRACE-*.json` | Full JSON remains hot while the trace is active, blocked, unpublished, recently closed, route-back relevant, or referenced by open roadmap/gate/compiler-output migration evidence. | Cold catalog entry exists with commit SHA, tree SHA, original path, content digest, and graph can route through the catalog. |
| Cold trace catalog | `.codewiki/telemetry/catalog.json` | Compact Git-tracked index for cold traces and restore refs. | Never purge as scratch; update through retention tooling only. |
| Legacy build/gate evidence | `.codewiki/builds/**`, `.codewiki/validation/**`, `.codewiki/research/**`, `.codewiki/gc/**` | Compatibility evidence while TASK-093/TASK-094 readers and active migration tasks still consume legacy roots. | `wiki_gc` classifies tracked artifact as purgeable and purge receives archive commit/tree evidence, then writes a restore ledger before deletion. |
| Generated graph/views/cache | `.codewiki/index_graph.json`, `.codewiki/views/**`, `.codewiki/cache/graph.sqlite` | Rebuildable projections. `index_graph.json` and views may be tracked generated state; SQLite cache is optional and gitignored. | Rebuild or remove cache only; do not use generated files as authoritative deletion evidence. |
| Runtime/session coordination | `.codewiki/runtime/**`, `.codewiki/session/**` | Hot only for active leases, jobs, heartbeats, wait/wake queues, and current handoffs. | Runtime GC may purge completed/cancelled/failed/external consumed handoffs; current leases/jobs remain. |
| Pi/local/editor state | `.pi/**`, `.pi-lens/**`, `.vscode/**`, `.tmp-worktrees/**` | `.pi/settings.json`, `.pi/APPEND_SYSTEM.md`, and `.pi/.gitignore` are repo-local Pi configuration; `.pi` package cache contents, `.pi-lens`, `.vscode`, and `.tmp-worktrees` are local/editor/worktree state with no production semantics. | `.vscode`, `.pi-lens`, and `.tmp-worktrees` stay ignored. Remove registered worktrees only with `git worktree remove`/`prune` after dirty-state and CodeWiki lease/claim checks. |

No gate report, compiler output, validation report, or lifecycle trace required by an open task, an active migration, or current policy may be deleted. If a purge is not safe, record the deferral reason instead of deleting.

Prefer Git refs and Git object queries for restore/catalog work. `.tmp-worktrees/**` is optional local isolation scratch for parallel builders, validators, or publishers; it is not durable retention state.

## Lifecycle trace files

One trace file represents one accountable change journey from decision intent to production-ready or published code:

```text
.codewiki/telemetry/TRACE-YYYYMMDD-<slug>.json
```

Each trace has a top-level `lifecycle` control plane plus three canonical loop sections:

```text
lifecycle
relations
scope
decision
planning
implementation
accountability
```

Publication is stored under `implementation.publication` by default. A separate publish loop requires a future approved decision.

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
    catalog.ts
    reader.ts
    writer.ts
    retention.ts
    types.ts
  graph/
    builder.ts
    views.ts
    reader.ts
    sqlite-cache.ts
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
| `src/change/**` | `src/decision/**`, with decision-table behavior in `src/decision/table.ts`. |
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

Task-specific regression tests live under task-ref paths/files. Reusable helpers/suites live under `tests/shared/**`. Gate/source-contract checks live under shared gate harnesses or loop gate contracts. Legacy `tests/smoke/**` may remain as explicitly classified package/gate evidence during migration, but new long-lived suites should map to task refs or shared contracts.

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

This refactor is bootstrapped by the current working Pi extension and current CodeWiki tools. New trace-aware code can be integrated progressively, but agents may rely on new commands, skills, prompt contract, or schemas only after telling the user to run `/reload` and receiving the reloaded environment.

Safe context refresh is an early implementation priority. Until `wiki_resume_context` and graph views are trace-aware, any session refresh must use a compact source-backed handoff containing approved rows, KB refs, trace/build refs, risks, blockers, and next safe planning actions.

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
