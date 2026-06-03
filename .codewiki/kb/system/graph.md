---
id: spec.system.graph
title: Graph
state: active
summary: Generated query/index projection over KB truth, telemetry traces, source/test facts, runtime coordination, and Git proof.
owners:
  - architecture
updated: "2026-06-03"
---

# Graph

## Responsibility

The graph is the generated representation of CodeWiki state. It is the agent entrypoint for status, routing, traceability, drift, automation readiness, and focused source refs. The graph does not own truth and must not be hand-edited.

Canonical truth and evidence live in:

- `.codewiki/kb/**` for current product/system truth;
- `.codewiki/telemetry/**` for compact workflow traces;
- source and test files for implementation truth;
- Git commits, trees, tags, package digests, and remote refs for cold historical/content truth.

The graph makes these sources searchable and routable. Tools read graph lenses first, then read or write exact source refs through the proper loop, gate, runtime, or Git operation.

## Target inputs

The graph is generated from:

```text
.codewiki/config.json
.codewiki/kb/** semantic frontmatter, diagram_refs, links, and explicit refs
.codewiki/kb/system/diagrams/** diagram nodes, flows, entities, lifecycles, file-structure refs, and policy boundaries
.codewiki/telemetry/<trace_id>/{decision,planning,implementation}.json
code/test manifests and source fingerprints
Git commit SHAs, tree SHAs, package digests, tags, branches, and remote refs
runtime leases/jobs/questions when active
pending decision diff tables during decision UI interaction
```

During migration the graph also reads legacy roots and normalizes them into target concepts:

| Legacy input | Target graph concept |
| --- | --- |
| `.codewiki/builds/**` | `LoopRun.compiler_output` and `compiler_output_refs` |
| `.codewiki/validation/**` | `GateVerdict`, `GateFinding`, and `gate_refs` |
| `.codewiki/roadmap/**` | `WorkItem` / `task_refs` until work state moves into traces or compatibility ends |
| `.codewiki/session/**` | runtime coordination refs only |
| `.codewiki/runtime/**` | runtime/daemon coordination refs only |

## Refresh vs promotion

Graph refresh and loop promotion are separate:

- compiler output written: graph refreshes pending loop evidence;
- gate fail/block written: graph refreshes gate findings and remediation items;
- gate pass written: graph refreshes and promotes to the next loop;
- implementation pass plus Git proof: graph marks the trace production-ready/closed for its scope.

Build/compiler output is not a promotion boundary. Gate pass is the promotion boundary.

## Target node types

The graph should keep high-signal nodes and refs, not full artifact payloads:

| Node | Purpose |
| --- | --- |
| `Trace` | One change journey from decision to implementation completion. |
| `LoopRun` | Decision, planning, or implementation loop file within a trace. |
| `GateVerdict` | Verdict and status for a loop exit gate. |
| `GateFinding` | Missing/wrong/stale/weak finding emitted by a gate. |
| `RemediationItem` | Actionable next repair instruction. |
| `ArtifactRef` | Typed normalized reference to KB, diagram, trace, gate, compiler output, task, source, test, Git, package, or remote artifact. |
| `Requirement` | Accepted requirement or acceptance criterion with stable id. |
| `WorkItem` | Executable planned unit, currently roadmap task/sprint during migration. |
| `SourceFile` | Source, test, doc, package, or script path. |
| `GitProof` | Commit/tree/package/remote content proof. |

Historic `Build`, `ValidationReport`, `Audit`, `Check`, and `Policy` graph nodes should collapse into compiler output refs, gate refs, gate findings, or criteria metadata where possible.

## Target edge types

Core edges:

```text
Trace --has_loop--> LoopRun
LoopRun --uses_ref--> ArtifactRef
LoopRun --produces_ref--> ArtifactRef
LoopRun --has_gate--> GateVerdict
GateVerdict --has_finding--> GateFinding
GateFinding --has_remediation--> RemediationItem
GateVerdict --promotes_to--> LoopRun
GateVerdict --blocks_on--> GateFinding
LoopRun --maps_to--> Requirement
LoopRun --changes--> SourceFile
LoopRun --tests--> SourceFile
ImplementationLoop --attests--> GitProof
GitProof --attests_content--> SourceFile
```

Edges should preserve source refs and JSON pointers so tools can open exact trace, KB, diagram, code, or Git evidence.

## Artifact refs

Graph schemas should normalize refs to `ArtifactRef` and prefer `<artifact_type>_refs` field names: `knowledge_refs`, `diagram_refs`, `trace_refs`, `loop_refs`, `gate_refs`, `compiler_output_refs`, `task_refs`, `source_refs`, `test_refs`, `git_refs`, `package_refs`, and `remote_refs`.

The graph may expose compatibility aliases, but lens output should prefer target names.

## Lenses

`wiki_state` is the canonical read/query entrypoint for graph subsets. Initial lenses include `status`, `resume`, `trace`, `system`, `product`, `runtime`, and `automation-readiness`. Compatibility lenses such as `task`, `sprint`, or `validation` may remain while legacy roots exist.

Lens output should return:

- current loop and trace status;
- next safe action;
- blockers and gate findings;
- source refs and JSON pointers;
- omitted-count metadata when output is compacted;
- freshness and stale-ref findings;
- automation-readiness contracts for daemon/agency scheduling.

Graph output should not duplicate whole KB docs, full loop trace files, raw test logs, raw diffs, or full Git history.

## System diagram nodes

System diagrams are first-class KB inputs. The graph parses diagram data into refs for components, foundation runtime, flows, entities, lifecycle states, policies, artifacts, actors, and external systems. Primary refs use `<diagram-file-stem>:<local-id>` with `<diagram-id>:<local-id>` accepted as an alias.

Diagram-ref linters report missing refs, missing target nodes, and required-doc gaps according to migration mode. Semantic file-structure changes should update both system docs and diagram YAML or provide explicit no-diagram-impact rationale.

## Agency and daemon use

Daemon/agency scheduling consumes graph-derived automation-readiness contracts. It may schedule only work whose trace/task refs, gate status, scopes, budgets, risk approval, worktree strategy, and next safe action are fresh and unambiguous. Runtime state is coordination evidence, not product truth.

## Related docs

- [Knowledge](knowledge.md)
- [Compiler Output Artifacts](builds.md)
- [Compilers](compilers.md)
- [Gateway](validation-gateway.md)
- [Runtime](runtime.md)
- [File Structure](file-structure.md)
