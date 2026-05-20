---
id: spec.system.validation-gateway
title: Validation Gateway
state: active
summary: Pure build-validation gateway for horizontal and vertical alignment before handoff, closure, release, or publication.
owners:
  - architecture
updated: "2026-05-19"
code_paths:
  - src/application/gateway
  - skills/codewiki-validation/SKILL.md
  - src/application/builds.ts
---

# Validation Gateway

## Responsibility

The validation gateway validates a submitted cycle build against policy, source refs, exit criteria, and evidence, returning `pass`, `fail`, or `block`. It is exposed through the validation tool plus focused modules such as `src/application/builds.ts` and `src/application/gateway/**`, staying separate from compiler-loop build production.

The gateway does not define requirements, write canonical truth, create plans, compile handoffs, or prove content. Compilers create builds; commits, tree SHAs, package digests, and canonical files prove content. The gateway attests named evidence and, for implementation builds, verifies commit-readiness.

## Build validation contract

A gateway run should receive the build path/kind, policy profile, requirement ids, exit criteria, compiler source refs, evidence mapping, graph/state routing context, required audit outputs, checked content proof, mechanical check results, and fresh-context isolation data when policy requires them.

The gateway inspects only enough source truth to decide. It may recommend routing after fail/block; the next compiler cycle owns any revised build.

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

Before an expensive fresh validation handoff, deterministic preflight reports missing upstream builds, audits, task ids, content proof, stale refs, close/publication blockers, and risk approval gaps without writing a report.

Risk tiers:

- `mechanical-docs`: generated, runtime, mechanical, or docs-only cleanup; low-risk fast path when audits and content proof are complete.
- `code-local`: localized code/test work with accepted task context; no extra user approval beyond accepted semantics.
- `semantic-system`: product, system, or task semantics; requires accepted decision/planning evidence before promotion.
- `security-migration-publication`: security policy, migrations, publication, release, remote updates, or breaking API work; requires explicit user approval evidence.
- `destructive`: destructive or irreversible operations; requires explicit user approval evidence and cannot be promoted by gateway validation alone.

Low-risk fast paths do not bypass validation. High-risk tiers escalate before lower-layer promotion.

## Alignment checks

Vertical alignment checks traceability across layers:

```text
user intent
  -> decision_build
  -> product/system knowledge and system diagrams
  -> planning_build
  -> roadmap work item
  -> tests/code
  -> implementation_build
```

Horizontal alignment checks coherence inside a layer:

```text
knowledge docs agree with knowledge docs
planning builds agree with roadmap tasks
roadmap items agree with roadmap items
code components agree with code components
tests agree with intended behavior
builds agree with their source layer and policy
```

Requirement ids and evidence mapping should make this trace explicit. The gateway should use explicit refs over prose similarity. Graph context supports routing, missing-edge detection, and freshness, but canonical sources and content proof remain authoritative.


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

A failed or blocked verdict should name the failed criteria or missing context. The producing loop then creates a superseding cycle build after revision.

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
- The gateway may recommend next routing: decision, planning, implementation, validation, observe, or block.
- Gated agency must stop on fail/block verdicts or missing required approval.
- Commit, push, release, or remote updates require gateway/policy approval when configured and immutable content proof when publication policy requires it.
- Risk-tiered gates may fast-path low-risk mechanical or docs-cleanup work only when deterministic audits, stale-ref scans, diagram/doc checks, and content proof satisfy policy.
- Destructive changes, security policy changes, public API breaks, migrations, publication, release, ambiguous tradeoffs, or high-cost work must escalate to the user for semantic approval before lower-layer promotion.

## Isolation evidence

Implementation, task-close, publication, publish, and release validation must be independently reproducible when the work changes code, tests, publication metadata, or release state. The required validation posture is:

- validator runs in a separate clean worktree from the builder when parallel write work or independence policy requires it,
- validator starts from artifacts rather than builder chat context,
- validation report records the exact Git commit SHA, tree SHA, package digest, archive/remote ref, or working-tree digest it checked as required by policy,
- validation report records whether the worktree was clean,
- validation report records the validator role and any builder session, worktree, branch, or scoped lease it intentionally did not reuse.

For parallel write work, the gateway follows [Role Worktree Isolation](worktree-isolation.md): prefer immutable builder/publisher refs over shared-root dirtiness. Dirty implementation validation may use a working-tree digest, but task-close, publication, publish, and release validation must evaluate a clean immutable publisher or validated ref.

CodeWiki SHA fields make validation exact: `base_sha` names the session start commit, `head_sha` the builder/publisher result, `validated_sha` the checked commit, and `published_sha` the pushed/released commit. Legacy reports can remain valid without these fields; new independent validation should include them.

Implementation validation requires `fresh_context=true`, an explicit clean-state value, checked content proof, and a commit-ready implementation build. A clean worktree can use `validated_sha`, `head_sha`, `published_sha`, or `tree_sha`; a dirty pre-commit worktree must use `working_tree_digest` or `worktree_digest` that identifies the checked dirty content.

A commit-ready implementation build must include task id, upstream refs, acceptance mapping, touched code/test evidence, checks, closure brief, commit title/body draft, and CodeWiki trailers for task, build, checks, validation placeholder/refs, and recovery. The implementation gateway validates readiness before passing; the commit need not already exist.

Task-close, publication, publish, and release profiles are stricter. They require `fresh_context=true`, `clean=true`, and immutable proof such as `published_sha`, `head_sha`, `validated_sha`, `tree_sha`, `package_digest`, `archive_ref`, or `remote_ref`. Working-tree digest alone cannot pass a task-close or publication boundary because the close record must be recoverable from committed/published content. The `codewiki_task close` path must block unless a passing `task-close` validation report with this proof already exists for the task.

Those immutable close/publication proofs also gate tracked CodeWiki GC. GC runs after the archive/close commit, names that proof in its restore ledger, and produces a separate deletion commit without removing the proof commit.

When a required validation boundary needs new context, the producing session should request a session boundary with the submitted build, task id, checks, and expected validation output. If another validator session or worker owns the review, that is a handoff; otherwise the current adapter may run new_session and continue from CodeWiki refs instead of builder chat.

## Related docs

- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Roadmap](roadmap.md)
- [Agency Controller](agency.md)
- [Role Worktree Isolation](worktree-isolation.md)
