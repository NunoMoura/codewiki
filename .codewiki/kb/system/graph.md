---
id: spec.system.graph
title: Graph
state: active
summary: Generated state/graph representation for reconciliation, routing, freshness, and requirement traceability.
owners:
  - architecture
updated: "2026-05-24"
code_paths:
  - .codewiki/index_graph.json
  - src/application/graph.ts
  - src/application/graph/rebuilder.ts
  - src/application/state-builders.ts
  - src/application/state.ts
  - src/domain/shared/types.ts
---

# Graph

## Responsibility

The graph is the generated representation of CodeWiki state. The domain concept is state; `index_graph.json` is a rebuildable graph-shaped projection over canonical inputs, compiler builds, validation attestations, content proofs, and discoverable code/test facts.

The state engine routes agents to the smallest useful next context, detects drift, reports freshness, exposes scoped roadmap/sprint/task views, and selects the next loop: decision, planning, implementation, validation, or observe. It also supplies the agency controller and CodeWiki UI with safe next-action, context-boundary, isolation, and stop-reason signals.

The graph does not decide intended behavior and does not replace source-of-truth reads. It points to the relevant cycle builds, knowledge docs, planning builds, roadmap items, validation reports, and code/test paths; agents must read those sources directly before making semantic changes.

The graph is the operational state machine for CodeWiki. Markov-chain or Markov Decision Process language is an analytical lens over graph-derived transitions, not a replacement for the graph, because the graph must retain source refs, traceability, evidence ownership, and proof relationships.

Alignment is sourced from cycle builds, KB docs, planning builds, roadmap tasks, tests/code, implementation builds, validation attestations, audit evidence, commits, and publication content proofs. The graph reports alignment gaps; it does not own requirements or solve alignment by itself.

## Inputs

The graph is generated from:

```text
.codewiki/config.json
.codewiki/kb/** frontmatter, paths, explicit refs, and curated Markdown links
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

Curated Markdown links are one input. The graph computes backlinks, stale refs, traceability, freshness, and routing relationships.

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

The generated graph exposes these projections under `views.lenses`. `views.lenses.default` serves status, Control Room, and `codewiki_state include=["graph"]`. `views.lenses.trace` expands requirement rows, canonical source refs, semantic change rows, and build source refs. `views.lenses.audit` expands validation reports, isolation, audit refs, content proof refs, reconciliation items, and traceability gaps. These lenses are generated read models only.

## System diagram nodes

System diagrams are first-class inputs. The graph parses diagram data into refs for components, adapters, flows, domain entities, lifecycles, policies, artifacts, actors, and external systems. Primary refs use `<diagram-file-stem>:<local-id>` with `<diagram-id>:<local-id>` accepted as an alias. System docs may declare `diagram_refs`; the graph links docs to resolved diagram refs and exposes `views.system_diagrams` with refs grouped by category. Diagram-ref audits report missing refs, missing target nodes, and missing docs for nodes marked `requires_doc` according to migration mode.

## Product/system propagation

The graph should model abstraction propagation separately from compiler sequence with edges such as `product_drives_system`, `system_constrains_product`, `product_requires_system`, `system_impacts_product`, `no_product_impact`, and `no_system_impact`.

## Operational state and transition analytics

The full graph snapshot, `G_t`, is the source-backed operational state at a point in time. A compact transition state, `S_t`, may be derived from `G_t` for analytics and routing summaries. The compact state can include active loop, scope, lifecycle state, reconciliation status, failure class, recommended next loop, risk tier, policy profile, proof status, freshness, and runtime availability.

The Markov property only applies to the compact projection when that projection includes enough source-backed context to make the next transition independent of chat history. A loop label by itself is not enough state: the same `implementation` label can mean missing test evidence, a planning gap, ambiguous intent, missing content proof, or a runtime conflict.

Transition analytics may estimate `P(S_t+1 | S_t)` for passive observation, or `P(S_t+1 | S_t, action, policy)` when gated agency chooses actions. These metrics are derived from builds, validation reports, graph snapshots, source fingerprints, and Git history. They are generated analytics, not canonical requirements, not raw event logs, and not a reason to duplicate history in hot CodeWiki state.

Use transition analytics to find retry traps, expected loop counts, frequent gateway failure classes, and agency stop/escalation hints. Use the graph and canonical sources to decide what exists, which refs matter, and which loop must run next.

## Hot state machine

The graph should model cross-layer items with:

- `state`: `aligned`, `drift`, `blocked`, `stale`, or `unknown`,
- `direction`: `downward`, `upward`, or `gateway`,
- `from_layer` and `to_layer`,
- `next_loop`: `decision`, `planning`, `implementation`, `validation`, or `observe`,
- `reason`,
- optional `failure_class` for fail/block routing,
- optional `recommended_next_loop` when a gateway or reconciliation item can route more precisely than the default loop,
- source fingerprints for freshness.

Reconciliation items should represent actionable, unconsumed handoffs and traceability gaps. Accepted decision or planning builds are not drift once explicit consumes/produces build DAG edges, downstream builds, roadmap changes, implementation evidence, or passing validation link back to them. This keeps the graph as a generated map over evidence instead of making lifecycle metadata the only source of completion truth.

Selective back-propagation should prefer the smallest upstream loop that can resolve the issue. Evidence or compiler-output gaps usually retry locally. Planning gaps route to planning. Ambiguous intent, unapproved semantic changes, or missing risk approval route to decision. Content-proof gaps route to validation or task-close proof. Runtime conflicts route to wait/release coordination rather than semantic compiler work.

The graph next action includes context-boundary guidance. Compiler-loop actions start from CodeWiki source refs and may recommend resume-context refresh or a new session at noisy, stale, token-heavy, or loop-boundary points. Task-close, publication, publish, and release require fresh validator context, required audits, `clean=true`, and immutable proof.

Hot context stays small: active tasks/sprints/leases, unconsumed handoffs, fail/block validation, publication blockers, drift routes, compact traceability gaps, and task-local resume packets. Warm and cold evidence expands only through archive, restore, audit, resume-context, or refinement workflows.

For Git-backed archival, the graph should prefer compact cold refs over expanded cold artifact nodes. GC labels are advisory until archive proof exists; tracked purge is safe only after a reachable archive commit/tree and restore ledger exist.

## Requirement traceability

The graph should expose a compact requirement traceability matrix derived from source truth. It should not store requirements as new truth.

A useful traceability row connects:

```text
requirement id
  -> decision_build row
  -> knowledge doc clause / row-to-KB mapping
  -> planning_build task/acceptance mapping
  -> roadmap task
  -> tests/code evidence
  -> implementation_build
  -> validation verdict
```

The graph should report gaps such as:

- accepted requirement has no knowledge mapping,
- decision build has no row-to-KB mapping,
- product-first change lacks system-impact or no-system-impact evidence,
- system-first change lacks product-impact or no-product-impact evidence,
- system doc lacks required diagram refs,
- diagram ref points to a missing diagram node or flow,
- diagram node marked `requires_doc` has no owning system doc,
- knowledge change has no planning build when executable work is needed,
- planning build has no roadmap task or acceptance mapping,
- implementation work has no test or justified test-design evidence,
- code changed without upstream requirement/task coverage,
- validation pass does not reference the submitted build or requirement ids,
- implementation build lacks commit-readiness fields required for a recovery commit,
- validation report lacks required audit evidence or checked content proof,
- task-close lacks immutable commit/tree proof,
- publication assertion lacks matching commit/tree/package proof.

Traceability should be compact in the default graph. Full historical rows, superseded cycles, and cold pass validation should be expanded only for explicit archive, restore, or audit requests.

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

## Freshness

Generated state is valid only when it matches source fingerprints. If generated state and canonical inputs disagree, canonical inputs win and the graph is stale or broken. If a validation report asserts content that the checked tree, commit, package digest, or canonical files do not contain, the content proof wins and the validation report is stale or invalid.

Freshness anchors must ignore generated graph/view artifacts such as `.codewiki/index_graph.json`; otherwise a no-op rebuild would make the graph stale against itself. Source files, knowledge files, roadmap truth, builds, validation reports, and mapped non-generated code remain valid freshness inputs.

Freshness should use deterministic input fingerprints rather than volatile generated timestamps or a final commit SHA that cannot be known before publication. Spec/doc freshness must include source content or a reliable source digest; otherwise docs changes can avoid stale detection.

Status, `codewiki_state`, and CodeWiki UI views must consume the generated-state reconciliation next action when it is non-observe. They may summarize lint or spec drift, but they must not report a separate unresolved drift action while generated-state reconciliation reports the system is aligned. Actionable deterministic lint drift should enter state reconciliation unless an open roadmap task already covers that spec path. Advisory lint signals, such as large-document token-budget warnings, may keep health yellow without forcing a compiler route.

## Invariants

- `.codewiki/index_graph.json` is generated and must not be hand-edited.
- The graph must be reproducible from canonical inputs and source fingerprints.
- The graph should route to exact files instead of inlining large docs, code, logs, or old task history.
- Default graph/status/state consumers should receive hot working-set context only; archive refs, closed task bodies, old pass validation, superseded cycle detail, and restore indexes require an explicit archive/restore/audit request.
- Post-commit GC next actions require archive commit/tree proof and must produce restore-ledger refs before tracked purge operations are applied.
- The graph should flag deterministic file-contract drift, including deprecated `.codewiki/index/**`, deprecated default `.codewiki/evidence/**`, and legacy dot-wiki path references in active contract/source files.
- Generated state does not replace builds, knowledge, roadmap work items, validation reports, commits, package digests, or code/tests; those remain the evidence sources for truth and content proof.
- Markov/MDP-style transition analytics do not replace the graph; they are derived generated views over graph-backed reconciliation transitions.
- Generated state should make gated agency and CodeWiki UI stop reasons explicit when state is stale, blocked, unsafe, missing approval, missing required fresh-session isolation, or blocked by overlapping write leases.
- The graph should expose active session lease counts, read/write warnings, write/write conflicts, pending waiters, and ready waiters, while scoped leases remain temporary coordination state rather than source-of-truth behavior.
- The graph should surface session queue role/worktree metadata, wait entry blockers, wait readiness, and validation isolation evidence so CodeWiki UI, status, and audits can distinguish builder, validator, publisher, blocked, and ready-to-resume contexts.
- The graph should own machine backlinks and exhaustive relationship discovery; knowledge docs should keep only intentional human-facing links.

## Related docs

- [CodeWiki UI](control-room-ui.md)
- [Knowledge](knowledge.md)
- [Roadmap](roadmap.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
