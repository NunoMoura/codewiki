---
id: spec.system.validation-gateway
title: Validation Gateway
state: active
summary: Pure build-validation gateway for horizontal and vertical alignment before handoff, closure, release, or publication.
owners:
  - architecture
updated: "2026-05-26"
code_paths:
  - src/validation
  - src/gateway
  - src/validation/tool.ts
  - skills/codewiki-validation/SKILL.md
---

# Validation Gateway

## Responsibility

The validation gateway validates a submitted cycle build against policy, source refs, exit criteria, and evidence, returning `pass`, `fail`, or `block`. It is exposed through the validation tool at `src/validation/tool.ts`, validation report/preflight modules under `src/validation/**`, and gateway transaction helpers under `src/gateway/**`, staying separate from compiler-loop build production.

The gateway does not define requirements, write canonical truth, create plans, compile handoffs, or prove content. Compilers create builds; commits, tree SHAs, package digests, and canonical files prove content. The gateway attests named evidence and, for implementation builds, verifies commit-readiness.

## Build validation contract

A gateway run should receive the build path/kind, policy profile, requirement ids, exit criteria, source refs, evidence mapping, graph/state routing context, required audits, content proof, check results, and required isolation data.

When a gateway returns `fail` or `block`, it classifies the failure and recommends the smallest safe next loop. The gateway inspects only enough source truth to decide; the next compiler cycle owns any revised build.

## Gate points

Validation can run at:

- decision build handoff,
- planning build handoff,
- implementation build handoff,
- roadmap work closure,
- gated agency cycle boundaries,
- graph/drift audits,
- release checkpoints,
- commit/push/publication readiness,
- adapter/API boundary changes.

## Handoff policy

Fresh context is for independence or context health. Decision may stay in-session; agents may run new_session/context_refresh when chat is noisy. Implementation validation, task-close, publication, publish, and release require fresh/content proof. Artifact wakes are not validation handoffs. Missing boundaries block or record fallback.

## Gateway preflight and risk tiers

Preflight reports missing upstream builds, audits, task ids, content proof, stale refs, close/publication blockers, and risk approval gaps before expensive validation.

Risk tiers:

- `mechanical-docs`: generated, runtime, mechanical, or docs cleanup with audits and content proof.
- `code-local`: localized code/test work with accepted task context.
- `semantic-system`: product, system, or task semantics; requires accepted decision/planning evidence.
- `security-migration-publication`: security, migration, publication, release, remote update, or breaking API work; requires explicit user approval.
- `destructive`: irreversible work; requires explicit approval and cannot be promoted by gateway validation alone.

Low-risk paths still validate. High-risk tiers escalate before lower-layer promotion.

## Alignment checks

Vertical alignment traces work across layers:

```text
user intent -> decision_build -> knowledge/diagrams -> planning_build -> roadmap task -> tests/code -> implementation_build
```

Horizontal alignment checks coherence inside one layer: docs with docs, planning with roadmap, tasks with tasks, code with code, tests with intended behavior, and builds with their source layer/policy. Requirement ids and evidence mappings should use explicit refs over prose similarity. Graph context helps routing and freshness; canonical sources and content proof remain authoritative.

## Planning validation

For planning builds, the gateway validates decision propagation before implementation can consume the plan. Every accepted decision row, requirement, and downstream planning question that has executable impact must map to one of: knowledge-only completion, roadmap task, sprint/cohort metadata, or explicit deferral with owner, trigger, and rationale. A planning build that leaves accepted work only in open questions, assumptions, or chat memory fails or blocks.

Planning validation should require a row-to-roadmap propagation map for semantic decisions. If a first atomic task is valid but other accepted rows remain, the gateway may pass only when those other rows are represented by durable sprint metadata, follow-up tasks, or an explicit deferred state. Otherwise the producing planner must create a superseding planning build and iterate until the gateway passes.

Task-close and roadmap-empty contexts should also consider residual accepted-decision propagation. If closing a task leaves no open roadmap work while an accepted decision still has unmapped executable rows or downstream planning questions, the gateway routes back to planning instead of treating the roadmap as complete.

## Decision and knowledge validation

For vNext decision builds, the gateway validates that:

- every semantic KB change maps to an approved decision row,
- every approved row is reflected in product/system knowledge or explicitly deferred with rationale,
- product-first changes include system-impact or no-system-impact evidence,
- system-first changes include product-impact or no-product-impact evidence,
- system docs changed by the decision have valid diagram refs once the diagram-ref migration is enabled,
- no KB clause introduces unapproved product or system semantics,
- risk escalations that require user approval were explicitly approved.

The gateway validates task creation, implementation, closure, diagram/doc alignment, and content proof. The user validates semantic decisions and risk escalations, not low-level task or code machinery.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `pass` | The build satisfies its policy and can be consumed by the next loop or publication step. |
| `fail` | A requirement, criterion, alignment assertion, or evidence mapping is proven wrong or incomplete. |
| `block` | The gateway cannot safely decide because context, checks, policy, source refs, intent, or task boundary integrity is insufficient. |

A failed or blocked verdict should name the failed criteria or missing context. The producing loop or the recommended upstream loop then creates a superseding cycle build after revision.

## Failure routing vocabulary

Verdict remains `pass`, `fail`, or `block`; routing metadata names the smallest safe next action.

| Failure class | Meaning | Typical route |
| --- | --- | --- |
| `evidence_missing` | Required mapping, checks, audits, or refs are missing. | Same compiler loop or validation preflight. |
| `compiler_incomplete` | Compiler output is inconsistent or incomplete. | Same compiler loop with superseding build. |
| `planning_gap` | Accepted intent lacks durable task, sprint, knowledge-only, or deferral state. | Planning. |
| `decision_ambiguity` | Intent or source truth is ambiguous, contradictory, or unapproved. | Decision. |
| `risk_approval_missing` | Policy needs explicit semantic/high-risk approval. | Decision or user approval. |
| `content_proof_missing` | Commit/tree/package/archive/remote proof is absent or stale. | Validation, task-close, publication, or publisher proof. |
| `runtime_conflict` | Lease, worktree, or role conflict blocks safe progress. | Wait/release coordination. |

## Persistence policy

Passing validation does not need a durable report by default when the accepted build records the result and required content proof. A validation result is an attestation, not content proof.

Persist reports for `fail`, `block`, policy-required storage, release/audit mode, publication, or remote-update current records. Hot reports live under `.codewiki/validation/**`; pass reports stay hot only while active work, publication, or audit policy needs them. Fail, block, and policy-kept reports remain hot until resolved or archived by policy.

Tracked reports are safe to purge only after a reachable archive commit contains them and GC writes restore evidence for exact removed paths. The GC ledger restores files; it does not replace validation or content proof.

## Rules

- The gateway validates builds; it does not mutate canonical truth.
- The gateway uses graph context but does not treat graph state as final authority.
- The gateway report is an attestation; commits, tree SHAs, package digests, and canonical files prove content.
- The gateway does not replace mechanical checks or required audit profiles.
- The gateway does not invent requirements or plan implementation work.
- Planning, implementation, and task-close validation must block when a `TASK-###` item is actually an umbrella/container/epic, mainly groups other tasks, or has acceptance criteria that mostly close other tasks.
- Shared files across tasks are allowed only when ownership and acceptance evidence remain independent; overlapping ownership without an explicit dependency/split rationale blocks validation.
- Semantic validation should run in a fresh, bounded context when independence matters.
- Implementation, task-close, publication, publish, and release validation profiles require fresh-context isolation evidence before they can pass.
- The gateway may recommend next routing: decision, planning, implementation, validation, observe, or block, and should include failure classification when a fail/block verdict needs selective back-propagation.
- Gated agency must stop on fail/block verdicts or missing required approval.
- Commit, push, release, or remote updates require gateway/policy approval when configured and immutable content proof when publication policy requires it.
- Risk-tiered gates may fast-path low-risk mechanical or docs-cleanup work only when deterministic audits, stale-ref scans, diagram/doc checks, and content proof satisfy policy.
- Destructive changes, security policy changes, public API breaks, migrations, publication, release, ambiguous tradeoffs, or high-cost work must escalate to the user for semantic approval before lower-layer promotion.

## Isolation evidence

Implementation, task-close, publication, publish, and release validation must be independently reproducible when work changes code, tests, publication metadata, or release state.

Validation records the checked Git commit, tree, package digest, archive/remote ref, or working-tree digest required by policy; clean-state value; validator role; and any builder/publisher session, worktree, branch, or lease it intentionally did not reuse. Parallel write work follows [Role Worktree Isolation](worktree-isolation.md): prefer immutable refs over shared-root dirtiness. Dirty implementation validation may use a working-tree digest; task-close/publication boundaries require `clean=true` plus immutable proof.

SHA fields make proof exact: `base_sha` is session start, `head_sha` builder/publisher result, `validated_sha` checked commit, and `published_sha` pushed/released commit. New independent validation should include these fields.

Implementation validation requires `fresh_context=true`, explicit clean-state value, checked content proof, and a commit-ready implementation build. Task-close/publication/publish/release are stricter: working-tree digest alone cannot pass because close and publication records must be recoverable from committed or published content. These proofs also gate tracked CodeWiki GC.

When validation needs new context, the producing session supplies the build, task id, checks, and expected output. Another worker may validate as a handoff, or the adapter may start a fresh context and continue from CodeWiki refs.

## Related docs

- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Roadmap](roadmap.md)
- [Agency Controller](agency.md)
- [Role Worktree Isolation](worktree-isolation.md)
