# File Structure

## Project boundary

This repository is intentionally not dogfooding the CodeWiki Pi extension during the rebuild.

- Active package source: `src/`, `tests/`, `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, and `tsconfig.json`.
- Archived previous implementation: `_OLD_VERSION/**`, used only as migration reference.
- Source-of-truth documentation: `.codewiki/kb/**`.
- Future workflow/state truth: `.codewiki/traces/TRACE-*.jsonl`.
- Archived dogfood state: other `.codewiki/**` roots from earlier migration phases.

`package.json` must not expose `pi.extensions` or `pi.skills` while this rebuild is active. Pi should treat this checkout as normal project files plus KB documentation, not as a loaded CodeWiki package. Pi native compaction is the only active conversation-compaction mechanism.

## Rebuild bootstrap boundary

During this source rebuild, `.codewiki/kb/**` is the intended-design source of truth, while `.codewiki/traces/**` may contain preserved workflow history. Surrounding dogfood `.codewiki/**` roots outside `kb`, `traces`, `views`, and `config.json` are legacy migration state. The bootstrap command audits the current repository, preserves existing KB/traces, reports stale roots, and writes only missing target scaffold files.

`source-map.yaml` is the canonical machine-readable source ownership map. It links source roots, owning KB docs, tests, generated views, and trace/event responsibilities. KB Markdown must not use frontmatter.

`diagrams/file-structure-map.yaml` currently remains a component/path registry for loop exit conditions during the rebuild. Its final replacement is `source-map.yaml`; parser/source migration should happen after loop-iteration APIs stabilize.

## Target `.codewiki` structure

Target CodeWiki project state has two canonical roots and one generated root:

```text
.codewiki/
  config.json
  kb/                       # current product/system knowledge truth
    lexicon.md
    product/
    system/
      source-map.yaml       # canonical doc/source/test ownership map
      diagrams/
  traces/                   # workflow/state truth
    TRACE-*.jsonl           # append-only Pi-session-like trace records
  views/                    # generated query surfaces; disposable
    status.json
    resume.json
    work-plan.json
    work-queue.json
    quality.json
    blockers.json
    conflicts.json
```

Rules:

- `kb/**` owns current product/system knowledge truth.
- `traces/TRACE-*.jsonl` owns workflow and state truth: semantic loop iterations, decision outputs, planning work units and ordering, implementation evidence, runtime boundaries, worker claims, exit-condition results, lifecycle state, and retention refs.
- `views/**` owns no truth. Views are generated caches over KB, traces, source/tests, and Git refs.
- Git is the cold historical/content source of truth.
- Pi session transcripts remain in Pi storage; CodeWiki traces store only refs and concise summaries.
- `config.json` is project policy/configuration, not lifecycle state.
- `kb/system/source-map.yaml` owns doc/source/test/view/event mapping. Frontmatter does not.

Deprecated graph terminology must not be used for target architecture. A graph, if ever needed for an algorithm or UI, is only an implementation detail behind a generated view. It is not a source root, truth root, or product mental model.

The active core reads `.codewiki/kb/**`, `.codewiki/traces/**`, and generated `.codewiki/views/**` only. Other historical `.codewiki/**` roots must not be promoted as target truth roots.

## Runtime temporary data

Temporary working data belongs under:

```text
.codewiki/runtime/tmp/<trace-id>/<loop>/
```

Cleanup policy:

- On loop `exit`, delete that loop's temporary data after durable trace, KB, source, test, or Git refs exist.
- On loop `continue`, `route_back`, or `blocked`, preserve that loop's temporary data when remediation needs it.
- On a superseding same-loop run, delete or replace stale temporary data for the old run.
- On trace close, delete all remaining temporary data for that trace.
- Anything needed after loop exit must be promoted before cleanup.

No accepted decision, durable requirement, work ownership, exit-condition evidence, or implementation proof may live only in runtime temporary data.

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
  decision/                  # decision loop: output and exit conditions
    table.ts
    iteration.ts             # runs one durable decision iteration
    exit.ts                  # evaluates decision exit conditions
    approval.ts
    propagation.ts
    types.ts
  planning/                  # planning loop: output and exit conditions
    iteration.ts             # runs one durable planning iteration
    materialization.ts
    ordering.ts
    conflicts.ts
    exit.ts                  # evaluates planning exit conditions
    types.ts
  implementation/            # implementation loop: output and exit conditions
    claims.ts
    iteration.ts             # runs one durable implementation iteration
    evidence.ts
    workers.ts
    publication.ts
    exit.ts                  # evaluates implementation exit conditions
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
    work-queue.ts
    blockers.ts
    conflicts.ts
    writer.ts
    types.ts
  knowledge/                 # KB parsing and refs
    markdown.ts
    source-map.ts
    file-structure-map.ts
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
  cli/                       # temporary development/test harness
    index.ts
  pi/                        # Pi package surface, disabled until reintroduced
    extension.ts
    dispatcher.ts
    commands/
    tools/
    tui/
    prompt/
    sessions.ts
    compaction.ts
  project/                   # root/config/bootstrap contracts
    root.ts
    config.ts
    config-file.ts
    bootstrap.ts
    types.ts
  utils/                     # domain-free primitives only
    result.ts
    time.ts
    json.ts
    paths.ts
    assert.ts
```

Loop roots own loop output shaping and exit-condition evaluation. `project/config.ts` owns resolved automation, agency, approval, budget, host, worktree, and retention settings. `runtime` owns scheduling, boundaries, claims, leases, dispatch, lifecycle helpers, and temporary data. `pi` is the primary host adapter over root core facades; `cli` is only a temporary development/test harness and is not part of host config. `pi/tui` is the only UI family because CodeWiki is terminal/Pi-first. `utils` must remain domain-free; if a helper knows CodeWiki semantics, it belongs in an owning root.

## Roots to retire or merge

| Previous root | Target |
| --- | --- |
| `src/adapters/pi/**` | `src/pi/**`; Pi is the distribution surface, not a generic adapter. |
| Old artifact-output root | retired; loop outputs are semantic iteration data under `src/traces/**`. |
| `src/roadmap/**` | `src/planning/**` and generated `views/work-plan.ts`. |
| Old audit/checks/policy/evaluation roots | loop-owned exit-condition modules plus runtime policy helpers when truly cross-loop. |
| `src/validation/**` | removed; exit conditions are loop-local, not a validation loop/root. |
| `src/state/**`, `src/graph/**` | `src/views/**` for generated projections; there is no graph root in the target model. |
| `src/gc/**` | retired term; use retention/archive/hydrate/restore in `src/traces/retention.ts` and Git restore refs. |
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
  project/
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
    source-map.yaml
```

Product docs define user-facing orientation. System docs define technical specs. Diagram YAML is canonical conceptual source, not generated render output. Source ownership lives in `source-map.yaml`, not Markdown frontmatter. Semantic changes must update product/system KB and affected diagrams or include explicit no-impact rationale before decision exit conditions can pass.

## Migration operation rules

This refactor is bootstrapped without repo-local CodeWiki Pi dogfooding. Agents must not use CodeWiki `wiki_*` tools, CodeWiki-owned compaction, generated roadmap state, or generated views as active workflow truth in this repository until repo-local dogfooding is explicitly enabled.

Migrate code from `_OLD_VERSION/**` into `src/**` one module at a time: decision, then planning, then implementation, then traces/views/runtime support. Each migration should keep tests local to the migrated module and should not re-enable Pi extension metadata until explicitly approved.

Context compression belongs to Pi native compaction during this phase. CodeWiki-owned refresh windows, context-boundary injection, and automatic `wiki_resume_context` pickup are disabled until a future explicit decision reintroduces them.

## Related docs

- [Traces](traces.md)
- [Lexicon](../lexicon.md)
- [Source Map](source-map.md)
- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Runtime](runtime.md)
