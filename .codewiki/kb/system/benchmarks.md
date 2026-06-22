# Benchmarks

CodeWiki needs benchmark proof before public automation claims or public package
availability. The benchmark scope is CodeWiki as an agent OS: trace-backed
semantic loops, runtime coordination, evidence, and recovery. It does not cover
a future CodeWiki frontend.

## Benchmark objective

The production benchmark must prove that CodeWiki helps isolated Pi sessions
produce production-ready software more efficiently than comparable plain Pi
sessions. Efficiency is judged against quality-adjusted outputs, not raw token
count alone.

The target metrics are:

```text
tokens per quality-adjusted production-ready result
seconds per quality-adjusted production-ready result
```

## Harness boundary

The repository owns the benchmark harness, task prompts, scoring model, and gate.
It must not contain agent-created winning app artifacts as proof. Real benchmark
runs happen in separate Pi sessions and produce external or ignored artifacts
that a human reviews before writing final result JSON.

The same user prompt is sent to every system for a task. CodeWiki-vs-baseline
comparison comes from the session setup, extension availability, traces, and
workflow behavior, not from different prompts.

## Task shape

Required tasks are ambitious local full-stack browser products:

- `polished-tetris`: production Tetris with responsive frontend, deterministic
  engine, local API/persistence, replay seed support, and checks.
- `flight-simulator`: production browser flight simulator with responsive
  cockpit/HUD, deterministic physics and missions, local API/persistence,
  telemetry, and checks.

Each task records:

- prompt and user-facing goal;
- frontend requirements;
- backend/local API and persistence requirements;
- functional acceptance criteria;
- required artifact refs such as repo, commit, preview, screenshot, video, test
  output, session output, and trace refs;
- scoring weights and minimum production gate scores;
- required checks and manual review notes.

## Result shape

Each run records:

- system id, provider/model id, task id, run id, and timestamps;
- input/output/cache tokens and elapsed wall-clock time from Pi session JSON;
- pass/fail checks;
- manual quality scores for functional behavior, frontend, backend, UX,
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

Model choice is explicit per run. The current default benchmark model is
`openai-codex/gpt-5.5`, and future model comparisons should reuse the same task
set with separate result files instead of mixing model populations.

The benchmark harness lives under `benchmarks/**`. Benchmark result JSON files
are small auditable summaries; large artifacts stay as external refs or ignored
run outputs.

## Related docs

- [Loop Model](loop-model.md)
- [Alignment Model](alignment-model.md)
- [Runtime](runtime.md)
- [Implementation Loop](implementation-loop.md)
