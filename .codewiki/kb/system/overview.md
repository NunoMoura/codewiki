# System Overview

CodeWiki is being rebuilt from a clean source scaffold. The old implementation archive has been removed after migration audit; the new Pi extension is package-installable, and repo-local CodeWiki dogfooding stays disabled while production readiness is hardened. This checkout uses `.codewiki/kb/**` as design truth while source stabilizes. The current migration inventory and remaining gaps are tracked in [Migration Audit](migration-audit.md).

## Target mental model

CodeWiki has one runtime outer loop and three semantic loops.

Runtime outer loop:

```text
read traces/views -> choose next action -> run semantic iteration or runtime coordination -> append trace -> repeat
```

Semantic loops:

1. **Decision** — accept intent, requirements, tradeoffs, risks, and KB impact.
2. **Planning** — turn accepted decisions into executable work units, ordering, conflicts, path scopes, and verification strategy.
3. **Implementation** — change code/docs/tests, record evidence, run checks, aggregate workers, and produce content proof.

Each semantic loop is defined by:

1. loop cycle;
2. loop output;
3. exit conditions.

Older migration vocabulary must not define product concepts, source layout, or tool boundaries. Desired-state docs and tools use loop vocabulary.

## Source-of-truth model

CodeWiki truth comes from:

- `.codewiki/kb/**` for hot product/system knowledge;
- `.codewiki/traces/TRACE-*.jsonl` for append-only workflow and state truth;
- `.codewiki/kb/system/source-map.yaml` for doc/source/test/view/event ownership mapping;
- source/tests for implementation content;
- Git for cold history, restore refs, commits, trees, and publication proof.

Generated views live under `.codewiki/views/**` and are disposable derived calculations/caches over traces and sources. Runtime temp under `.codewiki/runtime/tmp/**` is scratch only. Historical dogfood files outside the active roots are not target truth roots.

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
- `src/error-handling/**`
- `src/pi/**`
- `src/project/**`
- `src/utils/**`
- `src/api/**`

There is no target package root for split evaluation, stored state, graph projections as truth, roadmap state, or old artifact state.

## Runtime model

Runtime coordinates execution and owns trace writes. It owns boundaries, claims, leases, work-unit claim selection, heartbeat/watch coordination, worker liveness, automation policy, budgets, worker-start handoff, lifecycle helpers, retention orchestration, and temporary data. Runtime is the outer control loop, not a semantic loop. Main host, trace host, and worker host are host roles that drive or execute runtime instructions; they are not separate runtimes.

Temporary data lives under `.codewiki/runtime/tmp/<trace-id>/<loop>/`. Loop exit deletes loop temp after durable refs exist. Continue/blocked/route-back can preserve loop temp for remediation. Superseding iterations replace stale temp. Trace close cleans all remaining temp.

Pi native compaction is the only active compaction mechanism during the rebuild. CodeWiki-owned refresh windows and automatic resume pickup remain disabled until explicitly reintroduced.

## Generated views

Generated views answer current-state questions quickly:

- status;
- resume;
- work-plan;
- work-queue;
- quality;
- blockers;
- conflicts.

A terminal board or kanban display, if added later, renders trace-backed views. It is not a separate truth concept.

## Loop contracts

The decision loop owns semantic KB propagation. There is no separate knowledge-update loop between decision and planning. Decision loop output includes KB propagation or explicit no-impact rationale. Planning starts only from exited decision output plus updated KB refs.

Loop output becomes downstream context only when exit conditions return `exit`. Continue, blocked, and route-back iterations record compact provenance and next actions, but they do not promote downstream-consumable truth.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [Migration Audit](migration-audit.md)
- [Source Map](source-map.md)
- [API Tool Surface](api-tools.md)
