---
id: spec.system.graph
title: Graph
state: active
summary: Generated state/graph representation for reconciliation, routing, freshness, and requirement traceability.
owners:
  - architecture
updated: "2026-05-31"
---

# Graph

## Responsibility

The graph is the generated representation of CodeWiki state. The domain concept is state; `index_graph.json` is a rebuildable graph-shaped projection over canonical inputs, compiler builds, validation attestations, content proofs, and discoverable code/test facts.

The state engine routes agents to the smallest useful next context, detects drift, reports freshness, exposes scoped roadmap/sprint/task views, and selects the next loop: decision, planning, implementation, validation, or observe. It also supplies the agency controller and CodeWiki UI with safe next-action, context-boundary, isolation, and stop-reason signals.

The graph does not decide intended behavior and does not replace source-of-truth reads. It points to the relevant cycle builds, knowledge docs, planning builds, roadmap items, validation reports, and code/test paths; agents must read those sources directly before making semantic changes.

The graph is the operational state machine for CodeWiki and the generated linker between docs, roadmap, builds, validation, code, tests, and proofs. Markov-chain or Markov Decision Process language is an analytical lens over graph-derived transitions, not a replacement for the graph, because the graph must retain source refs, traceability, evidence ownership, and proof relationships.

Alignment is sourced from cycle builds, KB docs, planning builds, roadmap tasks, tests/code, implementation builds, validation attestations, audit evidence, commits, and publication content proofs. The graph reports alignment gaps; it does not own requirements or solve alignment by itself.

Agent access is graph-centered for reads and routing. Agents ask graph/state first for current project map, next safe action, relevant refs, drift, blockers, daemon context, and context boundaries. Agents then read or edit canonical source refs directly through the proper decision, planning, implementation, gate, runtime, or lifecycle operation. The graph is the project's fresh index and state machine, not the owner of semantic truth.

## Inputs

The graph is generated from:

```text
.codewiki/config.json
.codewiki/kb/** semantic frontmatter, diagram_refs, optional explicit overrides, paths, explicit refs, and curated Markdown links
.codewiki/builds/**, including decision, planning, and implementation builds
.codewiki/kb/system/diagrams/** diagram nodes, flows, entities, lifecycles, and policy boundaries
.codewiki/roadmap/**
.codewiki/validation/**
.codewiki/session/queue.json session queue focus, waits, scoped leases, and isolation metadata
.codewiki/runtime/diff-tables.json pending decision change rows
code/test manifests
Git/source fingerprints, tree SHAs, commit SHAs, package digests, and archive ledgers
audit evidence required by gateway policy
```

Curated Markdown links are one input. The graph computes backlinks, stale refs, traceability, freshness, and routing relationships. Routine knowledge-frontmatter `code_paths` are deprecated as required doc-code edges; the graph should derive doc-code links from file-structure and diagram mappings, roadmap task paths, builds, validation evidence, source facts, and explicit refs. If a doc still declares `code_paths`, the graph treats them as optional explicit overrides and audits them for staleness.

## Output

The primary graph output is:

```text
.codewiki/index_graph.json
```

The CodeWiki UI graph view reads this file through CodeWiki API or local UI transport and renders it visually. The visual graph is a generated-state projection; it must not become separate truth.

The graph serves status, queue-order, and session-queue coordination reads directly. Extra queue files are generated caches only when a future adapter proves a concrete performance need.

## vNext graph lenses

Default vNext graph reads should show five families:

```text
Decision -> Knowledge -> Work -> Execution -> Proof
```

Decision covers approved rows and risk state. Knowledge covers product docs and diagram-backed system docs. Work covers planning and roadmap. Execution covers code, tests, checks, and implementation evidence. Proof covers validation, commits, publication, and archive evidence. Default views collapse non-next-action build/validation internals into badges.

Generated graph projections live under `views.lenses`: `default` serves status/Control Room, `trace` expands requirement and source refs, `audit` expands validation, isolation, audit, proof, reconciliation, and traceability gaps, and `execution` exposes planning-owned dependency/order/conflict/model-policy metadata plus runtime job state for daemon scheduling. These lenses are generated read models only.

The execution graph is a lens over planning and runtime state, not a separate truth store. Planning owns sprint/task dependencies, parallel waves, conflict scopes, validation gates, and model-policy intent. Runtime owns jobs, runs, Brain leases, worker questions, heartbeats, retries, and block/unblock state. The generated graph indexes both so agents can schedule work without creating a second competing graph.

## System diagram nodes

System diagrams are first-class inputs. The graph parses diagram data into refs for components, adapters, flows, domain entities, lifecycles, policies, artifacts, actors, and external systems. Primary refs use `<diagram-file-stem>:<local-id>` with `<diagram-id>:<local-id>` accepted as an alias. System docs may declare `diagram_refs`; the graph links docs to resolved diagram refs and exposes `views.system_diagrams` with refs grouped by category. Diagram-ref audits report missing refs, missing target nodes, and missing docs for nodes marked `requires_doc` according to migration mode.

## Product/system propagation

The graph should model abstraction propagation separately from compiler sequence with edges such as `product_drives_system`, `system_constrains_product`, `product_requires_system`, `system_impacts_product`, `no_product_impact`, and `no_system_impact`.

## Operational state, hot state, and traceability

Transition analytics, hot-state routing, and requirement traceability details live in [Graph Transition and Traceability](graph-transition-traceability.md). This document keeps graph inputs, outputs, edges, freshness, and invariants compact.

## Edges

Graph edges should explain why context is relevant. Useful edge kinds include:

- `captures_intent`,
- `captures_decision`,
- `maps_row_to_kb`,
- `diagram_ref`,
- `product_drives_system`,
- `system_constrains_product`,
- `documents`,
- `specifies`,
- `plans`,
- `implements`,
- `tests`,
- `validates`,
- `attests`,
- `proves_content`,
- `blocks`,
- `depends_on`,
- `drifts_from`,
- `derives_from`,
- `session_lease_task`,
- `session_lease_build`,
- `session_lease_scope`,
- `sprint_task`,
- `sprint_knowledge_scope`,
- `sprint_code_scope`,
- `build_consumes_*`,
- `build_produces_*`,
- `requirement_*` traceability edges.

## Drift categories

Graph reconciliation should classify drift in the same state machine used by status, resume, gates, and runtime scheduling:

- `vertical_propagation_drift`: accepted intent has not propagated through the expected decision, knowledge, roadmap, implementation, validation, or proof layer.
- `horizontal_contradiction`: product, system, diagrams, roadmap, code, tests, or validation disagree at the same abstraction level.
- `generated_state_stale`: generated graph/view output does not match canonical input fingerprints.
- `proof_mismatch`: validation, commit, tree, package, archive, or remote proof does not attest to the content it claims.
- `runtime_coordination_conflict`: leases, jobs, waits, worktrees, or publisher state conflict with the selected action.

Hard drift blocks lower-layer execution until the correct loop or runtime operation resolves it. Validators still decide pass, fail, or block; the graph supplies the shared routing and evidence map.

## Freshness

Generated state is valid only when it matches source fingerprints. If generated state and canonical inputs disagree, canonical inputs win and the graph is stale or broken. If a validation report asserts content that the checked tree, commit, package digest, or canonical files do not contain, the content proof wins and the validation report is stale or invalid.

Freshness anchors must ignore generated graph/view artifacts such as `.codewiki/index_graph.json`; otherwise a no-op rebuild would make the graph stale against itself. Source files, knowledge files, roadmap truth, builds, validation reports, and mapped non-generated code remain valid freshness inputs.

Freshness should use deterministic input fingerprints rather than volatile generated timestamps or a final commit SHA that cannot be known before publication. Spec/doc freshness must include source content or a reliable source digest; otherwise docs changes can avoid stale detection.

Status, `wiki_state`, and CodeWiki UI views must consume the generated-state reconciliation next action when it is non-observe. They may summarize lint or spec drift, but they must not report a separate unresolved drift action while generated-state reconciliation reports the system is aligned. Actionable deterministic lint drift should enter state reconciliation unless an open roadmap task already covers that spec path. Advisory lint signals, such as large-document token-budget warnings, may keep health yellow without forcing a compiler route.

## Invariants

- `.codewiki/index_graph.json` is generated and must not be hand-edited.
- The graph is reproducible from canonical inputs and source fingerprints.
- Default graph/status reads show hot working-set context only; archives, closed task bodies, old pass validation, and restore indexes need explicit archive/restore/audit requests.
- Generated state points to source files; it does not replace builds, knowledge, roadmap work, validation reports, commits, package digests, or code/tests.
- Graph reconciliation flags deterministic file-contract drift, including deprecated `.codewiki/index/**`, deprecated `.codewiki/evidence/**`, and legacy dot-wiki refs.
- Freshness ignores generated graph/view artifacts as inputs, but checks source, knowledge, roadmap, builds, validation, code, tests, and content proof.
- Markov/MDP analytics are generated views over graph-backed transitions, not requirements.
- Gated agency and UI stop reasons must be explicit for stale state, blockers, unsafe actions, missing approval, missing isolation, or overlapping write leases.
- Session lease and wait metadata is temporary coordination evidence, not source-of-truth behavior.
- Machine backlinks and routine doc-code links belong in the graph; knowledge docs keep intentional human-facing links and only rare explicit code-path overrides.

## Related docs

- [CodeWiki UI](control-room-ui.md)
- [Knowledge](knowledge.md)
- [Roadmap](roadmap.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
