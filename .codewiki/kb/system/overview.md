---
id: spec.system.overview
title: System Overview
state: active
summary: Target CodeWiki architecture during the rebuild: three compiler loops, JSONL traces, generated views, runtime coordination, Pi terminal surface, and Git content evidence.
owners:
  - architecture
updated: "2026-06-11"
---

# System Overview

CodeWiki is being rebuilt from a clean source scaffold. The old Pi extension is disabled and archived under `_OLD_VERSION/**`. This checkout uses `.codewiki/kb/**` as design truth while source is migrated module by module.

## Target mental model

CodeWiki has three semantic loops:

1. **Decision** — approve intent, requirements, tradeoffs, risks, and KB impact.
2. **Planning** — materialize approved intent into executable work units, ordering, conflicts, and verification strategy.
3. **Implementation** — change code/docs/tests, record evidence, run checks, and produce content proof.

Gates are loop exits. They validate whether a loop can promote to the next state, but they are not a fourth validation loop. Publication is an implementation-stage concern unless a future accepted decision creates a separate publish loop.

## Source-of-truth model

CodeWiki truth comes from:

- `.codewiki/kb/**` for current product/system knowledge;
- `.codewiki/traces/TRACE-*.jsonl` for workflow and state truth;
- source/tests for implementation content;
- Git for cold history, restore refs, commits, trees, and publication proof.

Generated state lives under `.codewiki/views/**` and is disposable. Deprecated graph, roadmap, build, validation, telemetry, and session files may be read only as migration compatibility artifacts. They are not target truth roots.

## Source roots

Target package roots are:

- `src/decision/**`
- `src/planning/**`
- `src/implementation/**`
- `src/traces/**`
- `src/views/**`
- `src/knowledge/**`
- `src/git/**`
- `src/runtime/**`
- `src/pi/**`
- `src/project/**`
- `src/utils/**`
- `src/api/**`

There is no target `src/views/**`, `src/traces/**`, `src/runtime/**`, `src/gateway/**`, `src/validation/**`, `src/state/**`, or `src/roadmap/**` root.

## Runtime model

Runtime coordinates execution. It owns boundaries, claims, leases, scheduling, automation policy, budgets, dispatch, lifecycle helpers, and temporary data. Runtime is not a semantic loop.

Temporary data lives under `.codewiki/runtime/tmp/<trace-id>/<loop>/`. Gate pass cleans loop temp after durable refs exist. Gate fail/block preserves loop temp for remediation. Superseding runs replace stale loop temp. Trace close cleans all remaining trace temp.

Pi native compaction is the only active compaction mechanism during the rebuild. CodeWiki-owned refresh windows and automatic resume pickup remain disabled until explicitly reintroduced.

## Generated views

Generated views answer current-state questions quickly:

- status
- resume
- work-plan
- blockers
- conflicts

A terminal board or kanban display, if added later, renders the work-plan view. It is not a separate truth concept.

## Related docs

- [File Structure](file-structure.md)
- [Traces](traces.md)
- [Compilers](compilers.md)
- [Runtime](runtime.md)
- [Validation Gateway](validation-gateway.md)
