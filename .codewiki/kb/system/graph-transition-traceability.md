---
id: spec.system.graph-transition-traceability
title: Graph Transition and Traceability
state: active
summary: Operational transition analytics, hot-state routing, and requirement traceability details for the generated graph.
owners:
  - architecture
updated: "2026-05-27"
diagram_refs:
  - component-map:graph
  - component-map:state_engine
---

# Graph Transition and Traceability

This focused companion to [Graph](graph.md) keeps transition and traceability detail reachable without making the primary graph contract too large. The generated graph projection is `.codewiki/index_graph.json`, built by `src/state/graph.ts`.

## Operational state and transition analytics

The full graph snapshot, `G_t`, is the source-backed operational state. A compact transition state, `S_t`, may be derived for routing analytics with active loop, scope, lifecycle, reconciliation status, failure class, next loop, risk, policy, proof status, freshness, and runtime availability.

The Markov property applies only when the compact projection includes enough source-backed context to make the next transition independent of chat history. A loop label alone is insufficient. Transition analytics are generated from builds, validation, graph snapshots, source fingerprints, and Git history. They help identify retry traps and stop/escalation hints; they never replace canonical sources.

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

The graph exposes a compact traceability matrix derived from source truth; it does not store requirements as new truth.

A useful row connects:

```text
requirement id -> decision row -> knowledge/diagram mapping -> planning task mapping -> roadmap task -> tests/code evidence -> implementation_build -> validation verdict
```

The graph reports gaps such as missing KB mapping, missing impact evidence, unresolved diagram refs, executable knowledge with no plan, planning without task/acceptance mapping, implementation without tests or justified test design, code without upstream coverage, validation without required audits/proof, task-close without immutable proof, or publication without matching commit/tree/package proof.

Default views keep traceability compact. Full historical rows, superseded cycles, and cold pass validation expand only for archive, restore, or audit requests.

## Related docs

- [Graph](graph.md)
- [Alignment Model](alignment-model.md)
- [Validation Gateway](validation-gateway.md)
