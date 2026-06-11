---
id: spec.system.file-structure
title: File Structure
state: active
summary: Target repository, package-source, and CodeWiki state structure for the KB plus JSONL trace source-of-truth model.
owners:
  - architecture
updated: "2026-06-11"
diagram_refs:
  - file-structure-map:intended_file_structure
---

# File Structure

## Project boundary

This repository is intentionally not dogfooding the CodeWiki Pi extension during the rebuild.

- Active package source: `src/`, `tests/`, `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, and `tsconfig.json`.
- Archived previous implementation: `_OLD_VERSION/**`, used only as migration reference.
- Source-of-truth documentation: `.codewiki/kb/**`.
- Future workflow/state truth: `.codewiki/traces/TRACE-*.jsonl`.
- Legacy dogfood state: other `.codewiki/**` roots such as roadmap, builds, validation, runtime, session, telemetry, and generated graph files.

`package.json` must not expose `pi.extensions` or `pi.skills` while this rebuild is active. Pi should treat this checkout as normal project files plus KB documentation, not as a loaded CodeWiki package. Pi native compaction is the only active conversation-compaction mechanism.

## Target `.codewiki` structure

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
    TRACE-*.jsonl           # append-only Pi-session-like trace records
  views/                    # generated query surfaces; disposable
    status.json
    resume.json
    work-plan.json
    blockers.json
    conflicts.json
```

Rules:

- `kb/**` owns current product/system knowledge truth.
- `traces/TRACE-*.jsonl` owns workflow and state truth: decision approvals, planning work units and ordering, implementation evidence, runtime boundaries, worker claims, gates, lifecycle state, and retention refs.
- `views/**` owns no truth. Views are generated caches over KB, traces, source/tests, and Git refs.
- Git is the cold historical/content source of truth.
- Pi session transcripts remain in Pi storage; CodeWiki traces store only refs and concise summaries.
- `config.json` is project policy/configuration, not lifecycle state.

Deprecated graph terminology must not be used for target architecture. A graph, if ever needed for an algorithm or UI, is only an implementation detail behind a generated view. It is not a source root, truth root, or product mental model.

Migration compatibility may still read legacy `.codewiki/roadmap/**`, `.codewiki/builds/**`, `.codewiki/validation/**`, `.codewiki/runtime/**`, `.codewiki/session/**`, `.codewiki/views/**`, and `.codewiki/traces/**` while old code is being migrated. Those paths must not be promoted as target truth roots.

## Runtime temporary data

Temporary working data belongs under:

```text
.codewiki/runtime/tmp/<trace-id>/<loop>/
```

Cleanup policy:

- On loop gate pass, delete that loop's temporary data after durable trace, KB, source, test, or Git refs exist.
- On loop fail/block, preserve that loop's temporary data for remediation.
- On a superseding same-loop run, delete or replace stale temporary data for the old run.
- On trace close, delete all remaining temporary data for that trace.
- Anything needed after gate pass must be promoted before cleanup.

No accepted decision, durable requirement, task/work ownership, gate evidence, or implementation proof may live only in runtime temporary data.

## Target package source structure

Package source mirrors the three-loop mental model:

```text
src/
  index.ts
  api/                       # stable facade only
    index.ts
    decision.ts
    planning.ts
    implementation.ts
    traces.ts
    views.ts
  decision/                  # semantic approval loop
    table.ts
    compiler.ts
    gate.ts
    approval.ts
    propagation.ts
    types.ts
  planning/                  # approved intent to executable work
    compiler.ts
    materialization.ts
    ordering.ts
    conflicts.ts
    gate.ts
    types.ts
  implementation/            # code/docs/tests execution evidence
    compiler.ts
    evidence.ts
    publication.ts
    gate.ts
    types.ts
  traces/                    # append-only JSONL trace engine
    schema.ts
    append.ts
    reader.ts
    writer.ts
    replay.ts
    retention.ts
    queries.ts
    types.ts
  views/                     # generated projections only
    status.ts
    resume.ts
    work-plan.ts
    blockers.ts
    conflicts.ts
    writer.ts
    types.ts
  knowledge/                 # KB parsing and refs
    markdown.ts
    frontmatter.ts
    diagrams.ts
    refs.ts
    types.ts
  git/                       # content proof, restore refs, worktrees, publishing
    content-proof.ts
    restore-ref.ts
    worktrees.ts
    publisher.ts
    types.ts
  runtime/                   # boundaries, claims, scheduling, policy, tmp
    boundary.ts
    claims.ts
    leases.ts
    scheduler.ts
    policy.ts
    budget.ts
    dispatcher.ts
    lifecycle.ts
    tmp.ts
    types.ts
  pi/                        # Pi package surface, disabled until reintroduced
    extension.ts
    commands/
    tools/
    tui/
    prompt/
    sessions.ts
    compaction.ts
  project/                   # root/config/bootstrap contracts
    root.ts
    config.ts
    bootstrap.ts
    types.ts
  utils/                     # domain-free primitives only
    result.ts
    time.ts
    json.ts
    paths.ts
    assert.ts
```

Loop roots own their compiler engines and loop-specific gates. `runtime` owns automation policy, scheduling, budgets, boundaries, claims, leases, dispatch, lifecycle helpers, and temporary data. `pi/tui` is the only UI family because CodeWiki is terminal/Pi-first. `utils` must remain domain-free; if a helper knows CodeWiki semantics, it belongs in an owning root.

## Roots to retire or merge

| Previous root | Target |
| --- | --- |
| `src/adapters/pi/**` | `src/pi/**`; Pi is the distribution surface, not a generic adapter. |
| `src/build/**` | loop compiler output emitted as trace events under `src/traces/**`. |
| `src/roadmap/**` | `src/planning/**` and generated `views/work-plan.ts`. |
| `src/audit/**`, `src/checks/**`, `src/policy/**`, `src/gateway/**` | loop-owned `gate.ts` modules plus runtime policy helpers when truly cross-loop. |
| `src/validation/**` | removed; gates are loop exits, not a validation loop/root. |
| `src/state/**`, `src/graph/**` | `src/views/**` for generated projections; there is no graph root in the target model. |
| `src/gc/**` | `src/traces/retention.ts` and Git-history-backed retention. |
| `src/session/**` | `src/runtime/**`, `src/git/worktrees.ts`, or `src/pi/sessions.ts` depending on responsibility. |
| `src/agency/**` | `src/runtime/**`; agency is runtime automation policy, not an architecture root. |
| `src/telemetry/**` | `src/traces/**`; traces are product workflow/state truth, not observability telemetry. |
| `src/shared/**` | `src/utils/**` for domain-free primitives only. |
| `src/workflow/**` | loop roots and runtime orchestration. |

Thin shim roots should not be added. Existing roots must either remain archived in `_OLD_VERSION/**` until migrated or move directly to target owners.

## Tests

Tests should be task-linked, loop-owned, or shared helper coverage:

```text
tests/
  decision/
  planning/
  implementation/
  traces/
  views/
  runtime/
  pi/
  shared/
    fixtures/
    helpers/
```

Task-specific historical regression tests from the old implementation stay under `_OLD_VERSION/tests/**` until they are intentionally migrated.

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
    traces.md
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

This refactor is bootstrapped without the CodeWiki Pi extension. Agents must not use `wiki_*` tools, CodeWiki skills, CodeWiki-owned compaction, generated roadmap state, or generated views as active workflow truth in this repository while the extension is disabled.

Migrate code from `_OLD_VERSION/**` into `src/**` one module at a time: decision, then planning, then implementation, then traces/views/runtime support. Each migration should keep tests local to the migrated module and should not re-enable Pi extension metadata until explicitly approved.

Context compression belongs to Pi native compaction during this phase. CodeWiki-owned refresh windows, context-boundary injection, and automatic `wiki_resume_context` pickup are disabled until a future explicit decision reintroduces them.

## Related docs

- [Traces](traces.md)
- [Lexicon](../lexicon.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Runtime](runtime.md)
