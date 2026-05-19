---
id: spec.system.builds
title: Builds
state: active
summary: High-signal cycle build contracts for intent, knowledge, planning, implementation evidence, and state reconciliation.
owners:
  - architecture
updated: "2026-05-17"
code_paths:
  - src/application/builds.ts
  - src/application/graph.ts
  - src/domain/shared/types.ts
  - src/adapters/pi/schemas.ts
---

# Builds

## Responsibility

Builds are temporary handoff contracts between alignment loops. They compact validated intent, knowledge updates, planning decisions, or implementation evidence so the next loop can work from artifacts instead of chat memory.

Every semantic change must trace to accepted build evidence before it closes, validates, or publishes. Builds should carry the smallest useful downstream contract plus enough evidence to prove intent was preserved across layers.

Builds are not permanent archives. After downstream truth absorbs them, validation confirms alignment, and Git publication preserves recoverable history, builds can become cold or purgeable. Commits, tree SHAs, package digests, archive ledgers, and remote refs are stronger content proof than build files.

Tracked build files must not be deleted from the working tree until a reachable archive commit contains the full revive context. Garbage collection runs after that archive commit, writes compact restore evidence that names the archive commit/tree and removed paths, then deletes eligible tracked build artifacts in a separate GC commit. The GC commit must not amend or squash away the archive commit it depends on.

## Build kinds

| Build | Produced by | Consumed by | Role |
| --- | --- | --- | --- |
| `feedback_build` | Feedback loop | Documentation loop | Validated user intent and approved changes. |
| `documentation_build` | Documentation loop | Planning loop | Knowledge changes and requirement-to-KB mapping. |
| `planning_build` | Planning loop | Implementation loop | Roadmap alignment, acceptance, TDD plan, and candidate paths. |
| `implementation_build` | Implementation loop | Validation/publication/closure | Evidence that code, tests, docs, or roadmap changes were implemented. |

## Cycle contract

Loop-level builds should include:

- loop kind, sequence, attempt id, supersedes refs, and status;
- validation profile, exit criteria, and isolation policy;
- stable requirement ids, source refs, and evidence mapping;
- consumed and produced refs for builds, knowledge, roadmap, validation, code, tests, publication, and closure;
- audit refs, assumptions, open questions, non-goals, risks, and agent assessment;
- content proof when required, such as working-tree digest, tree SHA, commit SHA, package digest, archive ledger, or remote ref.

Build policy may require fresh context at loop start, validation, or next-loop handoff. Micro-step evidence belongs in the implementation build only when it matters for acceptance.

## Loop-specific contracts

A feedback build contains the user-facing intent contract: approved change rows, accepted decisions, assumptions, non-goals, risks, expected lower-layer changes, and requirement ids.

A documentation build contains source feedback refs, knowledge files changed, requirement-to-knowledge mapping, deferred requirements, planning questions, and validation expectations. It should not duplicate full roadmap tasks.

A planning build contains source documentation refs, task ids or task changes, acceptance criteria, non-goals, blockers, verification, TDD strategy, candidate files, and requirement-to-task/test mapping.

An implementation build contains source planning refs, task ids, files changed, checks, tester/builder evidence, acceptance mapping, validation/audit refs, unresolved risks, a closure brief, and recommended commit/PR/release text when useful. The closure brief is the user-facing proof that accepted intent was satisfied.

Implementation builds may recommend publication, but validation and policy decide whether commit, push, release, or remote updates are allowed. Publication gates require immutable content proof and explicit handling for secret scanning, remote visibility, fail/block evidence, and private evidence.

## Contract fields

New builds should expose explicit DAG fields:

- `consumes` and `produces`;
- `change_type`: `product`, `system`, `task`, or `code`;
- `traceability`: semantic flag, optional `exemption` (`generated`, `runtime`, or `mechanical`), upstream refs, and accepted build refs;
- `policy.isolation`: loop-start, validation, and next-loop context requirements.

Graph reconciliation should prefer explicit edges over inferred legacy fields. Semantic changes in knowledge, roadmap, code, tests, package metadata, or publication claims need accepted upstream build refs before implementation validation or task closure can pass. Generated, runtime, and mechanical-only changes may set `traceability.exemption` and `semantic=false` when policy allows. Legacy `change_class` is compatibility input only; new builds write `change_type`.

## Lifecycle and consumption

```text
proposed -> accepted -> consumed -> validated -> archived -> purged
```

A later cycle build may supersede a failed or blocked build. Superseded builds remain audit evidence but should not route hot work unless policy keeps them active.

A build is consumed when lower-layer truth or validation evidence references it:

- feedback: downstream documentation, implementation evidence, or passing validation references it;
- documentation: planning, passing validation, or knowledge-only policy references it;
- planning: roadmap refinement plus implementation evidence or passing validation references it;
- implementation: passing validation, a passing validation verdict, or safe publication/archive proof references it.

Accepted implementation evidence without validation or publication safety still routes to the validation gateway.

## Post-commit garbage collection

Build garbage collection is a post-commit maintenance step, not a pre-commit cleanup. A close or publication commit first captures the builds, validation reports, roadmap archive state, graph state, and recovery context needed to revive or reinterpret the work. Only after that commit exists may GC classify tracked builds as cold or purgeable.

A GC run must use an exact archive commit SHA and tree SHA as input, emit a restore ledger with `git restore --source=<archive-sha> -- <path>` commands for deleted tracked files, and commit the deletion plus ledger separately. Runtime-only handoff files may be cleaned under runtime policy, but tracked builds require archive proof.

## Related docs

- [Compilers](compilers.md)
- [Validation Gateway](validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Roadmap](roadmap.md)
- [Graph](graph.md)
