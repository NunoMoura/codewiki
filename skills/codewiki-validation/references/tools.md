# Validation gateway tools

Use these tools to validate submitted CodeWiki artifacts. Validation mode may write validation reports, but it must not mutate canonical knowledge, roadmap task truth, builds, source code, or tests.

## Required sequence

1. `wiki_state`
   - First read for repo health, graph/build/task routing, stale generated state, and artifact status.
   - Use `refresh=true` when validating submitted refs, task close, graph/drift audit, or publication gate.
   - Use `taskId` when validating implementation or task-close.

2. Direct reads of submitted refs
   - Read the build/report/task/source refs named by the request or user.
   - Do not rely on builder chat context.
   - Treat `.codewiki/index_graph.json` and generated task views as routing/read models, not canonical proof.

3. `wiki_audit`
   - Run required audit profiles or cite existing audit refs before a pass verdict when policy requires them.
   - Common profile sets:
     - decision/planning: `alignment`, `generated-parity`, plus scoped/changed checks when relevant;
     - implementation: `alignment`, `changed`, plus `horizontal-alignment` when KB/code/source coherence is the risk surface and `source-contract` when API/tool/package surfaces changed;
     - task-close: `alignment`, `changed`, `task`, `generated-parity`;
     - graph/drift: `graph-audit`, `drift-audit`, `horizontal-alignment`, `source-contract`, `generated-parity` or configured equivalents;
     - publication/release: package/security/publication policy profiles when available.

4. `wiki_gateway`
   - Use `preflight_only=true` to return gateway preflight without writing a report. Preflight checks source readability, accepted upstream builds, required audits, task ids, content proof strategy, stale refs, close/publication blockers, and risk approval policy.
   - Record verdict when policy requires a report, verdict is `fail`/`block`, task-close/publication needs proof, or submitted refs expected an explicit report.
   - Required fields: `profile`, `task_id` if any, `source`, `verdict`, `rationale`, `checks`, `issues`, `audit_refs`/`audit_reports`, `failed_criteria`, `blocking_questions`, optional `failure_class`, optional `recommended_next_loop`, optional `stop_reason`, and `isolation` when required.
   - Implementation pass requires `isolation.fresh_context=true`, explicit `clean` value, and checked content proof (`validated_sha`, `tree_sha`, `working_tree_digest`, or equivalent allowed by policy).
   - Task-close/publication/publish/release pass requires `isolation.fresh_context=true`, `clean=true`, immutable proof (`validated_sha`, `head_sha`, `published_sha`, `tree_sha`, `package_digest`, `archive_ref`, or `remote_ref`), and publication readiness when publishing.
   - Mechanical/docs and code-local tiers do not need extra user approval beyond accepted semantics, but still require normal gateway proof. Semantic-system tiers need accepted decision/planning evidence. Security, migration, publication, release, and destructive tiers require explicit user approval evidence before promotion.
- A GC restore ledger is not validation/content proof. Pre-commit tracked GC blocks close/publication readiness; post-commit GC is hygiene that must name the archive commit/tree and preserve restore commands.

## Fresh validator context

When the current session is not an acceptable validator context, stop and restart validation from the source/build refs, task id, audit expectations, changed paths, checks, and expected `wiki_gateway` output. Do not use builder chat memory as proof.

## Forbidden tools/actions in validation mode

- Do not call `wiki_build`; compilers produce builds.
- Do not call `wiki_diff_table`; decision compilers capture semantic proposals.
- Do not call `wiki_roadmap action="create"`, `update`, `close`, or `cancel`; parent/compiler/closer handles task mutation after validation.
- Do not hand-edit `.codewiki/kb/**`, `.codewiki/roadmap/**`, `.codewiki/builds/**`, source code, tests, or generated views.
- Do not mark work pass without required audits and proof.

## Deterministic verdict checklist

Return `fail` when:

- a requirement or acceptance criterion is contradicted by source truth;
- evidence mapping is wrong or incomplete;
- checks prove behavior broken;
- horizontal or vertical alignment is false;
- implementation changed scope beyond non-goals.

Return `block` when:

- required source/build refs are missing;
- policy profile or required audits are missing;
- fresh-context isolation is required but absent;
- content proof is missing or too weak for the boundary;
- high-risk work lacks accepted semantic traceability or explicit user approval evidence required by its risk tier;
- publication readiness is missing when publication/publish/release is being validated;
- tracked CodeWiki artifacts were purged before the archive/close/publication commit or without restore-ledger proof;
- task is an umbrella/container/sprint coordinator;
- sibling tasks overlap without explicit dependency/split rationale;
- validator cannot safely inspect enough source to decide.

Return `pass` only when:

- required refs and audits are present;
- vertical and horizontal alignment checks pass;
- each acceptance criterion has evidence;
- non-goals and scope are preserved;
- task-boundary gate passes where applicable;
- fresh-context, clean-state, and content-proof requirements are satisfied.

## Output fields to preserve

Every report/rationale should name:

- validation profile;
- source/build refs checked;
- task id when applicable;
- audit refs/reports;
- checks run or reviewed;
- vertical/horizontal alignment status;
- failed criteria or blocking questions;
- isolation role, `fresh_context`, `clean`, builder/validator separation notes;
- checked proof refs: SHA/tree/digest/package/archive/remote;
- GC finding when relevant: not required, safe post-commit cleanup, deferred, or blocked;
- next routing recommendation, including `failure_class`, `recommended_next_loop`, and `stop_reason` when fail/block routing is known.
