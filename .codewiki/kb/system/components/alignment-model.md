---
type: Concept
title: Alignment Model
description: Alignment means every discrepancy among accepted intent, Knowledge, work, implementation, Git, delivery, and outcomes is resolved, accounted for by an exact active Change, or explicitly unknown and blocked from unsafe progression.
tags:
  - codewiki
  - system
  - alignment
  - model
timestamp: 2026-06-30T00:00:00Z
---
# Alignment Model

Alignment is not permanent equality among durable sources. During active work, accepted future intent may deliberately lead source, Git, or delivery state.

A project is accountably aligned when every relevant discrepancy is:

1. resolved;
2. explained by one exact active Change and its current transition state; or
3. explicitly unknown and blocked from unsafe progression.

Unaccounted divergence is drift.

```text
resolved state
or exact Change-accounted transition
or explicit unknown with safe block
= accountable alignment
```

## Authority sources

Durable sources retain separate authority:

- `.codewiki/kb/**` owns accepted Product/System/Design Knowledge;
- `.codewiki/traces/TRACE-CHG-*.jsonl` owns durable Change progression, Loop attempts, Check Results, Exit Reports, runtime coordination, and outcome disposition in consuming projects;
- source and tests own executable implementation truth;
- Git commits, trees, refs, and artifact proofs own exact content and delivery-boundary facts;
- protected remote checks, attestations, provider observations, and deployment observations own only their exact external boundary.

Generated WorkState, relationship views, indexes, dashboards, and `.codewiki/views/**` are disposable alignment projections. They do not become another authority.

The CodeWiki source repository does not self-host during stabilization. It carries no active dogfood Change Traces; Pi-native tools, canonical KB, source/tests, Git, and normal review remain its development authorities.

## Four alignment dimensions

### Vertical alignment

Connects intent through realization:

```text
accepted Change intent
→ Knowledge and invariants
→ Planning obligations
→ source/tests
→ exact Git candidate
→ delivery/outcome evidence
```

### Horizontal alignment

Maintains coherence among concurrent Changes, shared invariants, components, dependencies, path Claims, Sprints, Work Items, integration boundaries, and conflicting outcomes.

### Temporal alignment

Preserves exact lineage across revisions, supersession, staleness, failed attempts, repairs, changed Checks, invalidated evidence, and later observations. Historical meaning comes from persisted candidate, policy, Result, and Report identity—not today's catalog.

### Delivery alignment

Distinguishes local candidate, integrated tree, project-branch merge, remote push, published artifact, release, deployment, and observed user outcome. One boundary never implies another.

## Accounted transitions

An active Change may intentionally create temporary divergence:

```text
accepted Knowledge says target behavior B
source still realizes behavior A
Change CHG-B records approved intent, plan, current realization state,
and exact work needed to close the gap
```

This is aligned transition, not unexplained drift. If the Change is stale, contradictory, unowned, or missing required evidence, WorkState marks the relevant relationship suspect or blocked.

No user action should exist only because runtime needs a field it can derive safely. Change Trace exhaust should emerge from doing work, not from paperwork.

## Loop alignment

| Loop | Required alignment output |
| --- | --- |
| Decision | Exact accepted interpretation, outcome, Knowledge delta, constraints, risks, active-Change overlap, and authority. |
| Planning | Global coverage of approved Changes through coherent Work Items, dependencies, verification, ownership, integration, and explicit resolutions. |
| Implementation | Exact realization of accepted obligations in source/tests/Knowledge plus candidate-bound Checks, Git proof, Integration, and outcome disposition. |

Each Loop produces one immutable candidate, Resolved Exit Policy, Check Results, and Exit Report. Runtime routes and appends only after final freshness and authority guards. Failed and indeterminate attempts remain evidence for repair and later learning.

## Relationship projection

CodeWiki may derive one bounded relationship layer over canonical inputs with several views:

- **Work Graph:** Changes, Sprints, Work Items, dependencies, Assignments, Claims, blockers, and Integration state.
- **Alignment Graph:** OKF concepts, provenance, components, source/test ownership, Change revisions, candidates, Check Results, Git trees, delivery artifacts, and outcome observations.
- **Learning View:** temporal candidate-to-failed-Check-to-repair-to-outcome relationships derived from Change Traces.

These views remain disposable. Agents query typed, scoped, snapshot-bound operations rather than arbitrary graph mutation or a general graph DSL. Query results name provenance, authority class, coverage, truncation, and staleness.

## Knowledge alignment

A Change's Knowledge scope is the accepted Product/System/Design topic set for its exact revision. Decision binds the relevant concept versions and provenance. Runtime compares current concept digests and grounded findings against that accepted scope.

User-facing projection may show:

| State | Meaning |
| --- | --- |
| Aligned | Relevant relationships are resolved or validly accounted for by current Changes, with no grounded contradiction. |
| Review Needed | Relevant content or evidence changed and dependent relationships are suspect pending semantic review. |
| Misaligned | Grounded evidence proves an unaccounted contradiction and names affected layer, source refs, rationale, and owning Loop. |
| Unknown | Scope, provenance, coverage, current evidence, or relationship grounding is insufficient. Unsafe progression remains blocked. |

A digest change can establish only Review Needed. Misaligned requires grounded contradiction. Unknown is honest brownfield state, not failure to fabricate certainty.

## Progressive brownfield adoption

Projects may begin with sparse Knowledge and provisional source mappings. CodeWiki should:

- preserve accepted known concepts;
- label uncovered areas as unknown;
- derive fine-grained source relationships from LSP/AST/Pi-Lens without making them canonical;
- expand validated Knowledge and ownership through actual Changes;
- persist stable semantic relationships only to outcome, behavior/invariant, system responsibility/interface, source ownership boundary, and tests/evidence.

No complete ontology or exhaustive symbol graph is required before useful work begins.

## Guarantee boundary

CodeWiki can guarantee structural validity, exact identity, deterministic thresholding, required-result fan-in, progression integrity, Git/delivery provenance, and explicit uncertainty. Model Checks provide bounded semantic assurance, not proof of unknowable perfect intent interpretation.

Ongoing remote claims require protected branches, required status checks, commit-bound attestations, artifact provenance, and deployment observations. Without those, CodeWiki reports only what it observed at one exact time.

## Related docs

- [WorkState](work-state.md)
- [Loop Model](loop-model.md)
- [Loop Exit](loop-exit.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Knowledge](knowledge.md)
- [Traces](traces.md)
