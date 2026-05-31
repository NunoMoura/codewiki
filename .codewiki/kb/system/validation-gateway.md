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

The validation gateway validates submitted cycle evidence against policy, source refs, exit criteria, and proof. It returns `pass`, `fail`, or `block`. It does not define requirements, write canonical truth, create plans, compile handoffs, or prove content by itself.

Policy lives under `src/policy/**`. Gateway report, preflight, transaction, and tool behavior lives under `src/gateway/**`. Compatibility glue lives under `src/validation/**`.

## Gate index

| Gate | Purpose |
| --- | --- |
| `decision` | Approved semantic decisions, KB mappings, risk approval, and no unapproved semantics. |
| `planning` | Decision-to-roadmap propagation, task/sprint mappings, and implementation-ready handoff. |
| `implementation` | Code/doc/test evidence against one planned task. |
| `task-close` | Full task closure chain from decision through implementation, validation, semantic closure evidence, and proof. |
| `sprint-close` | Cohort closure with shared outcome, cross-task rows, risks, and generated-state closure. |
| `ship-ready` | Exact content promotion as commit, package, archive, remote update, or release. |

See [Implementation, validation, and close](flows/implementation-validation-close.md) and [Publication and GC](flows/publication-gc.md) for proof-specific flow detail.

## Preflight and routing

Preflight reports missing upstream builds, audits, task ids, content proof, stale refs, close/ship-ready blockers, and risk approval gaps before expensive validation. Fail/block verdicts classify the failure and recommend the smallest safe next loop: same compiler loop, planning, decision, validation/proof, observe/wait, or user approval.

Risk tiers are mechanical-docs, code-local, semantic-system, security/migration/ship-ready, and destructive. Low-risk paths still validate; high-risk tiers escalate before lower-layer promotion.

## Alignment and proof

Vertical alignment traces intent through decision builds, knowledge/diagrams, planning builds, roadmap tasks, implementation builds, validation reports, and content proof. Horizontal alignment checks coherence inside one layer. Graph context helps routing but is not final authority.

Implementation validation requires fresh-context isolation, explicit clean-state value, checked content proof, and a commit-ready implementation build. Dirty implementation validation may use a working-tree digest. Task-close, ship-ready, publish, and release require clean immutable proof such as commit SHA, tree SHA, package digest, archive ref, or remote ref.

## Rules

- The gateway validates builds; it does not mutate canonical truth.
- Validation reports attest evidence; commits, tree SHAs, package digests, canonical files, archives, and remote refs prove content.
- Planning, implementation, and task-close validation block on umbrella/container tasks or unsafe overlapping ownership.
- Passing reports are hot only while active work, ship-ready, or audit policy needs them; fail/block/policy-kept reports persist until resolved or archived.
- Tracked report GC is safe only after a reachable archive commit and restore ledger exist.

## Related docs

- [Validation gateway component](components/validation-gateway.md)
- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Roadmap](roadmap.md)
