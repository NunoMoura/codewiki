---
id: spec.system.builds
title: Compiler Output Artifacts
state: active
summary: Compatibility contract for historic build artifacts and their target representation inside telemetry loop traces.
owners:
  - architecture
updated: "2026-06-06"
code_paths:
  - src/build
  - src/adapters/pi/schemas.ts
  - src/gateway/report.ts
  - src/state/graph.ts
code_paths_mode: explicit_override
---

# Compiler Output Artifacts

## Responsibility

This document defines how historic build artifacts migrate into the target telemetry trace model. In canonical vocabulary, a compiler is the source engine and compiler output is emitted trace data. The word build remains a compatibility name for `decision_build`, `planning_build`, and `implementation_build` until schemas, tools, and artifact readers migrate.

Compiler output should carry the smallest useful downstream contract plus enough refs to prove intent was preserved across layers. It should not become a permanent archive or a source architecture layer.

## Target storage

Target CodeWiki state stores compiler output inside one lifecycle trace JSON file:

```text
.codewiki/telemetry/TRACE-YYYYMMDD-<slug>.json
  decision.compiler_output
  planning.compiler_output
  implementation.compiler_output
```

Each loop section contains:

- metadata: schema version, trace id, loop name, status, timestamps, and superseded refs;
- input refs and fingerprints;
- compact compiler output summary;
- requirement refs and requirement state;
- `<artifact_type>_refs` arrays normalized to `ArtifactRef`;
- KB and diagram refs or explicit no-impact rationale;
- gate criteria, gate verdict, gate findings, remediation items, and next action;
- retention hints for hot/cold lifecycle.

The `implementation` section also contains content evidence refs such as commit SHA, tree SHA, package digest, branch, remote ref, or working-tree digest when policy permits dirty validation.

## Historic compatibility

Current repositories may still contain:

```text
.codewiki/builds/decision/**
.codewiki/builds/planning/**
.codewiki/builds/implementation/**
```

Graph readers and tools should normalize these files into loop trace concepts during migration:

| Historic artifact | Target concept |
| --- | --- |
| `decision_build` | `decision.json#/compiler_output` |
| `planning_build` | `planning.json#/compiler_output` |
| `implementation_build` | `implementation.json#/compiler_output` |
| `build_refs` | `compiler_output_refs` |
| validation refs attached to builds | `gate_refs` |

`src/build/**` is compatibility infrastructure, not target source structure. Target source engines live under loop roots such as `src/decision/compiler.ts`, `src/planning/compiler.ts`, and `src/implementation/compiler.ts`.

## Size and structure rules

Compiler output must be ref-first and compact:

- include short summaries and stable refs;
- avoid duplicating whole KB docs, full task bodies, raw test logs, raw diffs, or repeated policy boilerplate;
- preserve enough rationale for gate routing and fresh-session continuation;
- store detailed history in Git, source files, and referenced artifacts rather than hot trace payloads;
- use explicit no-impact rationale when KB, diagram, source, test, or Git refs are intentionally absent.

## Lifecycle

Compiler output alone is pending evidence. A passing gate is the promotion boundary. Failed or blocked gates keep the trace in the current loop or route to the smallest safe earlier loop.

Hot compiler output can be compacted or purged only when:

1. the relevant gate pass/fail/block state is represented in the lifecycle trace or an active compatibility artifact that remains hot;
2. no open task, current policy, or active migration still requires the legacy `.codewiki/builds/**` or `.codewiki/validation/**` file;
3. required Git commit/tree/package refs preserve recoverable history;
4. graph lenses can still find the gate outcome and remediation history through the trace or catalog;
5. tracked deletion goes through `wiki_gc` with archive commit/tree evidence and a restore ledger.

Until TASK-093/TASK-094 replace compatibility readers, `.codewiki/builds/**` and `.codewiki/validation/**` are legacy evidence roots, not scratch. Do not purge them merely because target storage is lifecycle-trace-first.

TASK-096 defers row backfill for decision builds created before 2026-06-05 that predate the DecisionTableV1 requirement. TASK-104 makes that deferral explicit residual coverage instead of silent warning debt. Linters may report these artifacts as legacy-deferred warnings instead of current-schema errors while they remain recoverable compatibility evidence. Delete this deferral only when lifecycle traces/catalog entries or GC archive/restore-ledger evidence can recover the historical decision intent without the legacy build file.

## Legacy decision-build residual coverage

Current legacy coverage owns one warning class:

| Issue class | Scope | Classification | Owner | Trigger to retire |
| --- | --- | --- | --- | --- |
| `legacy-decision-build-decision-table-deferred` | Rowless `.codewiki/builds/decision/*.json` artifacts with `created` before `2026-06-05T00:00:00Z` | accepted migration deferral | architecture/gateway maintainers | Lifecycle trace/catalog migration or tracked GC archive cleanup proves restore paths for the historical decision intent |

These files predate DecisionTableV1, so their rowless shape is expected historical compatibility evidence, not current authoring permission. New accepted decision builds must include Decision Table rows and row-to-KB mapping evidence. Do not hand-backfill every legacy row unless a future accepted decision scopes that reconstruction.

Archive or deletion is a separate controlled cleanup. Before any legacy decision build is purged, validation must record:

1. a `wiki_gc action=dry-run` inventory for the exact candidate scope;
2. an archive commit SHA and tree SHA that still contain the original files;
3. a restore ledger path/ref with original path, content digest, archive ref, and restore command;
4. trace/catalog refs that preserve the historical decision summary, dates, downstream refs, and gate/remediation history; and
5. a task-close or archive validation report proving no open task, policy, or compatibility reader still requires the hot build file.

Until all five proofs exist, keep the files hot and keep the linter warning as covered residual debt.

## Related docs

- [Lexicon](../lexicon.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
