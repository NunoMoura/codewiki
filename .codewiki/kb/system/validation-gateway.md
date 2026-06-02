---
id: spec.system.validation-gateway
title: Validation Gateway
state: active
summary: Pure build-validation gateway for horizontal and vertical alignment before handoff, closure, sprint close, or ship-ready promotion.
owners:
  - architecture
updated: "2026-06-01"
---

# Validation Gateway

## Responsibility

The validation gateway validates submitted cycle evidence against policy, source refs, exit criteria, required linters, executable tests when code behavior changes, and immutable content evidence. It returns `pass`, `fail`, or `block`. It does not define requirements, write canonical truth, create plans, compile handoffs, or own content by itself.

Policy lives under `src/policy/**`. Gateway report, preflight, transaction, and tool behavior lives under `src/gateway/**`. Compatibility glue lives under `src/validation/**`. Deterministic legacy linter profiles should migrate conceptually to gateway-required linters.

## Gate index

Gateway terminology uses named gates. The tool still accepts the legacy `profile` field for compatibility; preferred gate names are `decision`, `planning`, `implementation`, `task-close`, `sprint-close`, and `ship-ready`. Legacy `publication`, `publish`, and `release` inputs are treated as ship-ready aliases.

| Gate | Purpose |
| --- | --- |
| `decision` | Approved semantic decisions, KB mappings, risk approval, and no unapproved semantics. |
| `planning` | Decision-to-roadmap propagation, task/sprint mappings, and implementation-ready handoff. |
| `implementation` | Code/doc/test evidence against one planned task, including required linters and executable code tests when relevant. |
| `task-close` | Full production-ready task closure chain from decision through implementation, tests, linters, validation, semantic closure evidence, and task-scoped ship-ready quality. |
| `sprint-close` | Cohort closure with shared outcome, cross-task rows, risks, generated-state closure, and ship-ready quality when the sprint changes shippable code or package behavior. |
| `ship-ready` | Exact content candidate is safe to promote; publication, release, push, remote update, and destructive actions still require separate explicit approval when policy requires it. |

See [Implementation, validation, and close](flows/implementation-validation-close.md) and [Publication and GC](flows/publication-gc.md) for content-evidence flow detail.

## Preflight and routing

Preflight reports missing upstream builds, required linters, task ids, decision-propagation gaps, content evidence, stale refs, close/ship-ready blockers, and risk approval gaps before expensive validation. Accepted executable decision rows without durable task/sprint mapping block planning, implementation, and close as `planning_gap`. Fail/block verdicts classify the failure and recommend the smallest safe next loop: same compiler loop, planning, decision, validation/content-evidence, observe/wait, or user approval.

Risk tiers are mechanical-docs, code-local, semantic-system, security/migration/publication, and destructive. Low-risk paths still validate; high-risk tiers escalate before lower-layer promotion. A `ship-ready` gate validates the exact content candidate; publication, release, push, remote update, and destructive actions remain separate approval boundaries.

## Alignment and content evidence

Vertical alignment traces intent through decision builds, knowledge/diagrams, planning builds, roadmap tasks, implementation builds, validation reports, and immutable content evidence. Horizontal alignment validates coherence inside one layer. Graph context helps routing but is not final authority.

Implementation validation requires fresh-context isolation, explicit clean-state value, checked content evidence, and a commit-ready implementation build. Dirty implementation validation may use a working-tree digest. Task-close, sprint-close, and ship-ready require clean immutable evidence such as commit SHA, tree SHA, package digest, archive ref, or remote ref.

## Rules

- The gateway validates builds; it does not mutate canonical truth.
- Validation reports attest evidence; commits, tree SHAs, package digests, canonical files, archives, and remote refs identify the exact content evaluated or promoted.
- Planning, implementation, and task-close validation block on umbrella/container tasks or unsafe overlapping ownership.
- Passing reports are hot only while active work, ship-ready, or linter/gateway policy needs them; fail/block/policy-kept reports persist until resolved or archived.
- Tracked report GC is safe only after a reachable archive commit and restore ledger exist.

## Related docs

- [Validation gateway component](components/validation-gateway.md)
- [Alignment Model](alignment-model.md)
- Linter engine migration document
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Roadmap](roadmap.md)
