---
id: spec.system.truth-and-compilers
title: System Truth and Compilers
state: active
summary: CodeWiki truth boundaries, three compiler loops, gateway gates, telemetry traces, and Git proof relationships.
owners:
  - architecture
updated: "2026-06-03"
diagram_refs:
  - component-map:compilers
  - component-map:validation_gateway
---

# System Truth and Compilers

This focused companion to [System Overview](overview.md) keeps truth-boundary and compiler-loop detail reachable without making the overview too large.

## Truth boundaries

| Truth type | Lives in | Role |
| --- | --- | --- |
| Repo-local contract truth | `.codewiki/config.json` | Defines project roots, policy, generated files, and runtime settings. |
| Product and system truth | `.codewiki/kb/**/*.md`, `.codewiki/kb/**/*.yaml`, and `.codewiki/kb/**/*.json` | Durable intended behavior, product direction, architecture, diagram raw data, workflows, and non-goals. |
| Workflow traceability | `.codewiki/telemetry/<trace_id>/{decision,planning,implementation}.json` | Compact loop evidence, compiler output, gate verdicts, gate diagnostics, refs, and next action. |
| Work truth compatibility | `.codewiki/roadmap/**` during migration | Active work items, priority, status, blockers, and closure state until planning trace/task migration completes. |
| Coordination state | `.codewiki/session/**` and `.codewiki/runtime/**` during migration | Temporary scoped leases, waits, jobs, runs, focus, isolation, and daemon metadata; never replaces truth. |
| Graph/index projection | `.codewiki/index_graph.json` | Generated graph representation for reconciliation, drift detection, traceability, routing, status, and freshness. |
| Gate evidence | Linters, tests, content refs, gate criteria, and loop trace refs | Evidence consumed by gates; not intent truth by itself. |
| Executable truth | Code and tests | Final behavior and automated proof. |
| Cold content truth | Git tree/commit SHA, package digest, tags, and remote refs | Immutable or externally published proof of what exists or shipped. |

Agents should not hand-edit generated graph/index files. Durable changes flow into KB, telemetry traces, source/tests, and Git first; generated graph state is rebuilt afterward. Parallel coordination flows through runtime leases and jobs, not graph edits. If graph state and canonical inputs disagree, canonical inputs win and the graph is stale or broken. If a gate verdict and content proof disagree, content proof wins and the verdict must be treated as stale or invalid.

## Compiler model

CodeWiki has exactly three compiler loops and three gateway gates:

```text
Decision Loop -> decision gate
  -> Planning Loop -> planning gate
    -> Implementation Loop -> implementation gate -> Git proof
```

A compiler is product source engine code. Compiler output is compact data inside the loop trace file. Historic `decision_build`, `planning_build`, and `implementation_build` are compatibility names for compiler output sections, not target source roots or permanent artifact piles.

## Gate model

Gateway gates are loop exit conditions. A compiler output can refresh graph state as pending evidence, but only gate pass promotes to the next loop. Gate fail/block records findings and remediation items and routes to the smallest safe loop.

Gates validate:

- approved semantic rows and KB/diagram propagation for decision;
- decision-to-work mapping, task boundaries, acceptance, and verification strategy for planning;
- executable changes, tests/linters, acceptance evidence, KB/diagram freshness, and Git proof for implementation.

## Telemetry and graph model

Telemetry traces tell the story. The graph makes the story searchable.

Trace files should use `<artifact_type>_refs` arrays normalized to `ArtifactRef`, including `knowledge_refs`, `diagram_refs`, `trace_refs`, `loop_refs`, `gate_refs`, `compiler_output_refs`, `task_refs`, `source_refs`, `test_refs`, `git_refs`, `package_refs`, and `remote_refs`.

The graph indexes trace summaries, statuses, refs, gate findings, remediation items, and Git refs. It should not duplicate full trace payloads, KB docs, test logs, raw diffs, or Git history.

## Migration compatibility

Current repositories may still contain `.codewiki/builds/**`, `.codewiki/validation/**`, `.codewiki/roadmap/**`, `.codewiki/session/**`, and `.codewiki/runtime/**`. Readers should normalize these into target trace/graph concepts while writers migrate toward `.codewiki/telemetry/**`.

## Related docs

- [System Overview](overview.md)
- [Alignment Model](alignment-model.md)
- [Compilers](compilers.md)
- [Gateway](validation-gateway.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
