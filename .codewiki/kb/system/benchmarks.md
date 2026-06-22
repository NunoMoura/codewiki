# Benchmarks

CodeWiki needs benchmark proof before public automation claims or public package
availability. The benchmark scope is CodeWiki as an agent OS: trace-backed
semantic loops, runtime coordination, evidence, and recovery. It does not cover
a future CodeWiki frontend.

## Benchmark objective

The production benchmark must prove that CodeWiki can produce production-ready
software more efficiently than comparable agent workflows. Efficiency is judged
against quality-adjusted outputs, not raw token count alone.

The target metrics are:

```text
tokens per quality-adjusted production-ready result
seconds per quality-adjusted production-ready result
```

## Task shape

Benchmark tasks should be visual or functional projects that a user can judge by
running the result. Preferred tasks are browser games, interactive tools, and
small apps with clear acceptance criteria, visible polish, and deterministic
checks.

Each task records:

- prompt and user-facing goal;
- required features;
- visual and functional acceptance criteria;
- required artifact refs such as repo, commit, preview, screenshot, or video;
- scoring weights and minimum production gate scores;
- required checks and manual review notes.

## Result shape

Each run records:

- system id, model, task id, run id, and timestamps;
- total input/output tokens and elapsed time;
- pass/fail checks;
- manual quality scores for functional behavior, visuals, UX,
  maintainability, and traceability;
- artifact refs and CodeWiki trace refs when the system is CodeWiki;
- `productionReady: true` only when the result is shippable for the task.

Traceability matters because CodeWiki's core value is not only the final code;
it is the observable decision → planning → implementation path that explains why
the code can be trusted.

## Gate rule

The benchmark gate fails until real results exist. It passes only when CodeWiki
has production-ready results for the required tasks, each compared task has at
least one baseline production-ready result, CodeWiki has no quality regression
on any compared task, and CodeWiki beats or ties the baseline on geometric-mean
quality-adjusted token and speed efficiency.

The benchmark harness lives under `benchmarks/**`. Benchmark result JSON files
are small auditable summaries; large artifacts stay as external refs or Git refs.

## Related docs

- [Loop Model](loop-model.md)
- [Alignment Model](alignment-model.md)
- [Runtime](runtime.md)
- [Implementation Loop](implementation-loop.md)
