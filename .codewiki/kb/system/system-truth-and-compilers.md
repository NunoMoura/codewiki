---
id: spec.system.truth-and-compilers
title: System Truth and Compilers
state: active
summary: CodeWiki truth boundaries, compiler-loop model, and validation/publication proof relationships.
owners:
  - architecture
updated: "2026-05-27"
diagram_refs:
  - component-map:compilers
  - component-map:validation_gateway
---

# System Truth and Compilers

This focused companion to [System Overview](overview.md) keeps truth-boundary and compiler-loop detail reachable without making the overview too large. Canonical truth remains in `.codewiki/**`, code/tests, validation reports, and Git content proof.

## Truth boundaries

CodeWiki separates truth by role so that agents can reason about the current state without treating every artifact as the same kind of source.

| Truth type | Lives in | Role |
| --- | --- | --- |
| Repo-local contract truth | `.codewiki/config.json` | Defines project roots, policy, generated files, and runtime settings. |
| Intent and knowledge handoff truth | accepted `decision_build` files under `.codewiki/builds/decision/**` | Temporary validated brief of user intent, KB changes, and propagation evidence for planning. |
| Product and system truth | `.codewiki/kb/**/*.md`, `.codewiki/kb/**/*.yaml`, and `.codewiki/kb/**/*.json` | Durable intended behavior, product decisions, architecture, diagram raw data, workflows, and non-goals. |
| Planning handoff truth | accepted `planning_build` files under `.codewiki/builds/planning/**` | Temporary roadmap, acceptance, verification, and TDD-strategy brief for the implementation loop. |
| Work truth | `.codewiki/roadmap/**` | Active work items, priority, ownership, progress, status, blockers, and closure state. |
| Coordination state | `.codewiki/session/queue.json` | Session queue with temporary scoped leases, waits, focus, and isolation metadata; expires/releases and never replaces durable truth. |
| State truth | `.codewiki/index_graph.json` | Generated state/graph representation for reconciliation, drift detection, derived queue order, routing, status, and freshness. |
| Audit evidence | audit reports, check logs, and build/validation embedded evidence | Deterministic evidence used by gateways; not intent truth by itself. |
| Executable truth | code and tests | Final behavior and automated proof. |
| Implementation evidence truth | accepted `implementation_build` files under `.codewiki/builds/implementation/**` | Temporary compiled evidence that changes were successfully implemented and publication payloads for Git-backed archival. |
| Validation attestation | validation gateway output, plus persisted reports when required | Records a gateway judgment over named evidence. It is not proof that content changed. |
| Content proof | Git tree/commit SHA, package digest, archive ledger, and remote refs | Immutable or externally published proof of what exists or shipped. |
| Publication truth | implementation builds, validation outcomes, content proofs, and Git/remote results | Supports commit messages, PR bodies, issue updates, release notes, and push readiness. |

Agents should not hand-edit generated graph/index files. Durable changes flow into knowledge, roadmap, code/tests, builds, validation reports, commits, or publication artifacts first; generated graph state is rebuilt afterward. Parallel coordination flows through session queue scoped leases, not graph edits. If graph state and canonical inputs disagree, canonical inputs win and the graph is stale or broken. If a validation report and content proof disagree, content proof wins and the report must be treated as stale or invalid.

Passing validation does not need a separate durable report by default when the accepted build records the validation result. Failed, blocked, policy-required, current publication, release, or audit-mode validation reports should be stored under `.codewiki/validation/**`. After safe Git archival/publication, pass validation reports are cold and should leave the hot working tree.


## Compiler model

CodeWiki's target alignment model uses four compiler loops and a pure validation gateway:

- [Alignment Model](alignment-model.md) — layer model, graph/gateway/content-proof precedence, and semantic change rules.
- [Compilers](compilers.md) — decision, planning, and implementation loops that produce cycle builds.
- [Validation Gateway](validation-gateway.md) — validates a submitted build against policy, source refs, criteria, and evidence.
- [Audits](audits.md) — deterministic audit profiles and `/audit [flags]` semantics.

```text
decision loop -> decision_build -> validation gateway
  -> planning loop -> planning_build -> validation gateway
      -> implementation loop -> implementation_build -> validation gateway/publication
```

A cycle build is one loop attempt. It contains criteria, requirement ids, source refs, evidence mapping, assumptions, risks, and non-goals for the gateway and the next fresh session. Every semantic change must trace to an accepted compiler build before it closes, validates, or publishes.

Builds compact one loop for the next; they are not permanent archives. Long-term product/system truth belongs in `.codewiki/kb/**`, work truth in roadmap state, and executable truth in code/tests.

Roadmap items reference accepted builds and knowledge paths, then track priority, state, progress, blockers, and closure. Planning creates or refines roadmap work from validated decision builds.

Implementation builds also support publication. They can recommend commit, PR, issue, release-note, and push-readiness text, but validation and policy decide whether commit, push, release, or remote updates are allowed.

Gateways check vertical and horizontal alignment, but they do not invent requirements or compile the next build.

## Related docs

- [System Overview](overview.md)
- [Alignment Model](alignment-model.md)
- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
