---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target repository, package-source, and dogfood CodeWiki state structure for the loop-first telemetry model.
owners:
  - architecture
updated: "2026-06-03"
diagram_refs:
  - file-structure-map:intended_file_structure
  - file-structure-map:concept_root_target
  - file-structure-map:dogfood_kb
  - file-structure-map:dogfood_builds
  - file-structure-map:migration_compatibility_constraints
---

# File Structure

## Project boundary

This repository contains two things named CodeWiki:

- product/package source: `src/`, `skills/`, `scripts/`, `tests/`, `README.md`, `CHANGELOG.md`, `package.json`;
- dogfood project state: `.codewiki/**`.

Package source changes build the CodeWiki distribution. `.codewiki/**` records this repository's KB truth, telemetry traces, generated graph, and migration evidence.

## Target dogfood/user `.codewiki` structure

Target CodeWiki project state is small:

```text
.codewiki/
  config.json
  index_graph.json          # generated; never hand-edit
  kb/                       # hot current product/system truth
    lexicon.md
    product/
    system/
      diagrams/
  telemetry/                # compact workflow traces
    <trace_id>/
      decision.json
      planning.json
      implementation.json
```

Rules:

- `kb/**` owns current product/system truth.
- `telemetry/**` owns compact traceability from decision to production-ready implementation.
- `index_graph.json` is generated from KB, telemetry, source/tests, runtime coordination, and Git refs.
- Git is the cold historical/content source of truth.
- Standalone hot roots such as `builds`, `validation`, `gateway`, `archive`, `logs`, `gc`, `session`, and `runtime` are not target truth roots. Existing roots remain compatibility inputs during migration only.

## Target package source structure

Package source should mirror the three-loop mental model:

```text
src/
  index.ts
  api/                       # public facade only
  decision/
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
    retention.ts
    types.ts
  graph/
    builder.ts
    lenses.ts
    reader.ts
    types.ts
  knowledge/
    doc-parser.ts
    diagram-parser.ts
  git/
    proof.ts
    worktrees.ts
    publisher.ts
  pi/
    commands/
    tools/
    ui/
    prompt/
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
| `src/build/**` | loop compiler output emitted to telemetry traces; shared trace writer under `src/telemetry/**` if needed. |
| `src/change/**` | `src/decision/**` decision rows/diff-table behavior. |
| `src/roadmap/**` | `src/planning/**` for work shaping, with compatibility for roadmap task storage during migration. |
| `src/audit/**`, `src/checks/**`, `src/policy/**`, `src/validation/**` | `src/{decision,planning,implementation}/gate.ts` plus shared gate criteria helpers if needed. |
| `src/state/**` | `src/graph/**` for generated graph/read models; non-graph concerns move to owning roots. |
| `src/gc/**` | `src/telemetry/retention.ts` and Git-history-backed retention. |
| `src/session/**` | `src/runtime/**`, `src/git/worktrees.ts`, or Pi session integration depending on responsibility. |
| `src/workflow/**` | loop tools and gateway/runtime orchestration. |

Thin compatibility roots may remain temporarily only with deletion triggers and compatibility exports.

## Skills

Pi skill assets may continue to live under top-level `skills/**` because the package manifest and Pi skill discovery expect that surface. Normal workflow skill folders mirror the three loop names only:

```text
skills/
  codewiki-decision/
  codewiki-planning/
  codewiki-implementation/
```

Gateway/validation rules belong in the gateway tool contract, loop handoffs, and fresh validator kickoff packets rather than a normal fourth workflow skill. The generic `codewiki` router skill content belongs in the injected system prompt/package docs, not a visible or hidden skill command. Do not preserve removed skill surfaces as old commands, shims, aliases, or `/skill:codewiki-validation` compatibility entrypoints.

Do not hide skill Markdown inside `src/**` unless package loading and skill discovery remain straightforward.

## Tests

Target tests should follow the same structure:

```text
tests/
  decision/
  planning/
  implementation/
  gateway/
  telemetry/
  graph/
  runtime/
  pi/
  smoke/
  fixtures/
```

Task-named regression folders may remain for historical migration evidence, but new long-lived suites should map to target concepts.

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

## Local scratch and worktrees

Local scratch/worktree folders such as `.tmp-worktrees/**` are not production CodeWiki structure. Worktree roots should be configured by runtime/worktree factory policy and ignored intentionally. Registered Git worktrees must be removed with `git worktree remove` and `git worktree prune` after dirty-state and lease checks.

## Related docs

- [Lexicon](../lexicon.md)
- [Compilers](compilers.md)
- [Gateway](validation-gateway.md)
- [Graph](graph.md)
- [Runtime](runtime.md)
- [Agency Controller](agency.md)
