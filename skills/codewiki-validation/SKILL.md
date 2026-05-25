---
name: codewiki-validation
description: Use when validating CodeWiki decision, planning, or implementation builds; task close readiness; graph/drift audits; publication/readiness gates; or fresh validator handoffs. Runs the validation gateway as an independent no-mutation reviewer with exact source refs, audit evidence, pass/fail/block semantics, task-boundary checks, and required fresh-context/content proof.
id: skill.codewiki-validation
title: CodeWiki validation gateway skill
state: active
summary: Validation-gateway instructions for independent build, task-close, audit, and publication checks.
owners: [maintainers]
updated: "2026-05-25"
---

# CodeWiki Validation Gateway

Use this skill to validate a submitted build or close/publish decision from fresh artifact context. The validation gateway evaluates evidence and records an attestation. It does not compile builds, change requirements, create plans, implement fixes, or mutate roadmap/knowledge/code truth.

For exact tool arguments and required fields, read `references/tools.md` when needed.

## Core rules

- Act as an independent validator. Start from artifacts, not builder chat memory.
- Validate one profile and one submitted source/build at a time.
- Use `codewiki_state` to locate graph/build/task/validation refs, then read canonical sources directly.
- Use `codewiki_audit` for required deterministic evidence before a pass verdict.
- Use `codewiki_validation preflight_only=true` before expensive fresh validation when metadata, risk, proof, or publication readiness may block late.
- Use `codewiki_validation` to record pass/fail/block when policy requires a report, when verdict is not pass, or when publication/task-close/current validation needs durable proof.
- Do not call compiler tools (`codewiki_build`, `codewiki_diff_table`) in validation mode.
- Do not create/refine/close roadmap tasks in validation mode.
- Do not edit `.codewiki/kb/**`, source code, tests, roadmap queue, generated views, or builds.
- Return `pass`, `fail`, or `block`; never return “probably pass”.
- Preserve `pass`/`fail`/`block` as the verdict contract; use routing metadata such as `failure_class`, `recommended_next_loop`, and `stop_reason` to explain local retry, upstream escalation, proof collection, or runtime waiting.
- Missing required refs, audit evidence, fresh context, content proof, task-boundary integrity, or decision-row propagation evidence blocks instead of passing.
- Planning validation must fail/block when accepted decision rows or downstream planning questions are not mapped to knowledge-only completion, roadmap tasks, sprint metadata, or explicit deferred owner/trigger/rationale evidence.
- A GC restore ledger is restoration evidence only. It never replaces validation, task-close, publication, or content-proof evidence.

## Inputs to inspect

Read only enough source truth to decide:

- submitted build path and kind;
- validation profile and policy requirements;
- requirement ids, exit criteria, accepted upstream build refs, and evidence mapping;
- relevant `decision_build`, `planning_build`, or `implementation_build` refs;
- roadmap task and sibling task context when validating planning, implementation, or task-close;
- linked `.codewiki/kb/**` specs;
- touched code/test/docs paths;
- checks run and outputs available;
- audit refs/reports;
- isolation evidence and checked content proof.

## Workflow

1. **Confirm validation boundary**
   - Identify profile: `decision`, `planning`, `implementation`, `task-close`, `drift-audit`, `graph-audit`, publication/publish/release policy, or configured equivalent.
   - If current context is not fresh where policy requires it, stop and restart validation from the source refs instead of judging from builder context.

2. **Load state and source refs**
   - Run `codewiki_state refresh=true` when generated routing may be stale.
   - Read submitted build/report/task/source refs directly.
   - Treat graph as routing context, not final truth.

3. **Run/review audits and preflight**
   - Run `codewiki_audit` for required profiles or cite existing audit refs.
   - Run `codewiki_validation preflight_only=true` when source/build metadata, decision-row propagation, task id, audit evidence, content proof, stale refs, close/publication blockers, or risk approval may block the pass.
   - A pass verdict must include required audit evidence when profile policy requires it.

4. **Check vertical alignment**
   - Trace user intent and accepted build refs through knowledge, planning, roadmap task, tests/code, implementation build, and closure/publication proof as applicable.
   - For planning, inspect `decision_row_resolutions` and `downstream_question_resolutions`; accepted work left only as open questions fails.
   - Each requirement/acceptance criterion must map to evidence.

5. **Check horizontal alignment**
   - Ensure relevant docs agree with docs, roadmap tasks with sibling tasks, builds with source layer, tests with intended behavior, and touched code with surrounding code.

6. **Apply task boundary gate**
   - For planning, implementation, and task-close validation, block if a `TASK-###` is really an umbrella/container/sprint coordinator or mainly closes other tasks.
   - Block if shared paths indicate overlapping ownership without explicit dependency/split rationale.

7. **Apply isolation/content-proof and risk gates**
   - Implementation validation requires `fresh_context=true`, a clean-state value, required audits, and checked content proof (`validated_sha`, `tree_sha`, `working_tree_digest`, etc.).
   - Task-close/publication/publish/release require `fresh_context=true`, `clean=true`, immutable committed/published/archive proof (`validated_sha`, `head_sha`, `tree_sha`, `package_digest`, `archive_ref`, `remote_ref`, etc.), and publication readiness when publishing.
   - Working-tree digest alone can support dirty pre-commit implementation validation, not task-close/publication.
   - Mechanical/docs and code-local changes can use the low-risk fast path only after normal gateway evidence is complete.
   - Semantic-system changes must cite accepted decision/planning evidence; security, migration, publication, release, and destructive tiers require explicit user approval evidence before promotion.
   - Pre-commit tracked GC blocks close/publication readiness. Post-commit GC may be reviewed as hygiene only after archive commit/tree proof exists and must not erase the proof commit.

8. **Record verdict**
   - Use `codewiki_validation` with profile, source/build refs, task id if any, verdict, rationale, checks, issues, audit refs/reports, failed criteria/blocking questions, optional `failure_class`, optional `recommended_next_loop`, optional `stop_reason`, and isolation fields.
   - For pass reports, persist only when policy/current publication/task-close/audit requires it.
   - For fail/block, persist deterministic failed criteria and routing recommendation. Prefer `planning_gap -> planning`, `decision_ambiguity` or `risk_approval_missing -> decision`, `compiler_incomplete -> implementation`, `evidence_missing` or `content_proof_missing -> validation`, and `runtime_conflict -> observe/wait`.

## Verdict meanings

- `pass`: submitted build/source satisfies policy and can be consumed by the next loop or gate.
- `fail`: evidence proves a requirement, criterion, alignment assertion, or mapping is wrong/incomplete.
- `block`: validator cannot safely decide because context, checks, refs, audit evidence, policy, fresh isolation, content proof, intent, or task boundary integrity is insufficient.

## Output

End validation with:

- profile and source/build refs checked;
- verdict and compact rationale;
- audit refs/reports used;
- checks reviewed or run;
- vertical/horizontal alignment result;
- acceptance/task-boundary findings;
- failed criteria or blocking questions;
- isolation fields: `fresh_context`, `clean`, role, checked SHA/tree/digest/archive/remote proof when required;
- GC finding when relevant: not required, safe post-commit cleanup, deferred, or blocked because archive proof/restore ledger is missing;
- routing recommendation: `failure_class`, next compiler loop, task-close allowed, publication allowed, wait/stop reason, or blocked.
