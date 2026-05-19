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

The validation gateway has one job: validate a submitted cycle build against its policy, source refs, exit criteria, and evidence. It returns `pass`, `fail`, or `block`. Gateway behavior is exposed through the validation tool and focused application modules such as `src/application/builds.ts` and `src/application/gateway/**`; it stays separate from compiler-loop instructions so independent validation does not collapse into build production.

The gateway does not define requirements, write canonical truth, create plans, compile handoffs, or prove that content exists. Compilers create builds. Commits, tree SHAs, package digests, and canonical files prove content. The gateway evaluates builds and emits an attestation over named evidence. For implementation builds, the gateway must also verify commit-readiness: the build must contain everything needed to create the task recovery commit after validation.

A verifier can be an implementation role inside the gateway, but validation gateway is the product term.

## Build validation contract

A gateway run should receive:

- the build path and build kind,
- the policy profile embedded in or selected for the build,
- requirement ids and exit criteria,
- source refs used by the compiler,
- evidence mapping supplied by the compiler,
- relevant graph/state routing context,
- required audit profile outputs,
- checked content proof such as working-tree digest, tree SHA, commit SHA, package digest, or archive ledger when policy requires it,
- any required mechanical checks or fresh-context isolation data.

The gateway should inspect only enough source truth to decide whether the build is valid. It may recommend routing after a fail or block, but the next compiler cycle owns the revised build.

## Gate points

Validation can run at:

- feedback build handoff,
- documentation build handoff,
- decision build handoff,
- planning build handoff,
- implementation build handoff,
- roadmap work closure,
- gated agency cycle boundaries,
- graph/drift audits,
- release checkpoints,
- commit/push/publication readiness,
- adapter/API boundary changes.

## Alignment checks

Vertical alignment checks traceability across layers:

```text
user intent
  -> decision_build or compatibility feedback_build
  -> product/system knowledge and system diagrams
  -> documentation_build when compatibility mode is active
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

Requirement ids and evidence mapping should make this trace explicit. The gateway should not rely on broad prose similarity when explicit refs are available. The graph is required gateway context for routing, missing-edge detection, and freshness, but the gateway must verify against canonical sources and content proof instead of trusting graph summaries blindly.


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

Passing validation does not need a separate durable report by default when the accepted build records the validation result and required content proof. A validation result is an attestation, not content proof by itself.

Persist validation reports when:

- verdict is `fail`,
- verdict is `block`,
- policy requires storage,
- release/audit mode requires storage,
- publication or remote update policy requires an explicit current record.

Persistent hot reports live under `.codewiki/validation/**`. Pass reports are hot only while active work, active publication, or audit policy needs them. After safe Git archival/publication, pass reports should be evicted from the working tree and recovered from Git only through explicit archive/restore/audit requests. Fail, block, and policy-kept reports remain hot until resolved or explicitly archived by policy.

Tracked validation reports are safe to purge only after a reachable archive commit contains them and the GC step writes restore evidence for the exact removed paths. The GC ledger is a restoration index, not a validation substitute; current task-close, publication, fail, block, audit-required, and policy-kept reports remain hot until their own lifecycle permits archival.

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
- The gateway may recommend next routing: feedback, documentation, planning, implementation, validation, observe, or block.
- Gated agency must stop on fail/block verdicts or missing required approval.
- Commit, push, release, or remote updates require gateway/policy approval when configured and immutable content proof when publication policy requires it.
- Risk-tiered gates may fast-path low-risk mechanical or docs-cleanup work only when deterministic audits, stale-ref scans, diagram/doc checks, and content proof satisfy policy.
- Destructive changes, security policy changes, public API breaks, migrations, publication, release, ambiguous tradeoffs, or high-cost work must escalate to the user for semantic approval before lower-layer promotion.

## Isolation evidence

Implementation, task-close, publication, publish, and release validation must be independently reproducible when the work changes code, tests, publication metadata, or release state. The required validation posture is:

- validator runs in a separate clean worktree from the builder,
- validator starts from artifacts rather than builder chat context,
- validation report records the exact Git commit SHA, tree SHA, package digest, archive/remote ref, or working-tree digest it checked as required by policy,
- validation report records whether the worktree was clean,
- validation report records the validator role and any builder session or scoped lease it intentionally did not reuse.

`sha` means a Git object id/hash. CodeWiki uses SHAs to make statements exact:

- `base_sha` is the commit where a work session started,
- `head_sha` is the builder or publisher result,
- `validated_sha` is the exact commit the validator checked,
- `published_sha` is the exact commit pushed or released.

Legacy reports can remain valid without these fields. New reports should include them when a fresh validator, publication gate, or audit needs independence evidence.

Implementation validation requires `fresh_context=true`, an explicit clean-state value, checked content proof, and a commit-ready implementation build. A clean worktree can use `validated_sha`, `head_sha`, `published_sha`, or `tree_sha`; a dirty pre-commit worktree must use `working_tree_digest` or `worktree_digest` that identifies the checked dirty content.

A commit-ready implementation build must include task id, upstream planning/build refs, acceptance mapping, touched code/test evidence, checks, closure brief, commit title/body draft, and CodeWiki trailers for task, build, checks, validation placeholder or refs, and recovery command. The implementation gateway validates this before passing; it does not require the commit to already exist.

Task-close, publication, publish, and release profiles are stricter. They require `fresh_context=true`, `clean=true`, and immutable proof such as `published_sha`, `head_sha`, `validated_sha`, `tree_sha`, `package_digest`, `archive_ref`, or `remote_ref`. Working-tree digest alone cannot pass a task-close or publication boundary because the close record must be recoverable from committed/published content. The `codewiki_task close` path must block unless a passing `task-close` validation report with this proof already exists for the task.

Those immutable close/publication proofs are also the safety boundary for tracked CodeWiki GC. GC must run after the archive/close commit exists, name that proof in its restore ledger, and produce a separate deletion commit. A GC run must not amend, squash, or otherwise remove the commit that proves the purged content.

When a required validation boundary needs a new context, the producing session should request an adapter session handoff with the submitted build, task id, checks, and expected validation output. The validator session or fresh worker process starts from that handoff artifact instead of from builder chat.

## Related docs

- [Alignment Model](alignment-model.md)
- [Audits](audits.md)
- [Builds](builds.md)
- [Compilers](compilers.md)
- [Roadmap](roadmap.md)
- [Agency Controller](agency.md)
