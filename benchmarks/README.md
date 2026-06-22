# CodeWiki Agent-OS Benchmarks

These benchmarks are the production-readiness proof gate for CodeWiki as an
agent OS. They do not test the future CodeWiki frontend. They test whether the
CodeWiki decision → planning → implementation workflow produces production-ready
software with less token spend and less elapsed time than comparable agent
workflows.

## Purpose

A run is useful only when a human can inspect the finished artifact and judge the
result. The benchmark tasks therefore use small visual games and functional apps
with explicit acceptance criteria, preview artifacts, and manual scoring.

The benchmark answers three questions:

1. Did the system produce production-ready code?
2. How many tokens did it spend per quality-adjusted production-ready result?
3. How much wall-clock time did it spend per quality-adjusted production-ready
   result?

No benchmark result should be treated as proof until it includes the source
artifact, checks, token counts, elapsed time, manual scores, and trace or session
refs.

## Layout

- `benchmarks/tasks/*.json` defines task prompts, acceptance criteria, scoring
  weights, and production gates.
- `benchmarks/results/*.json` stores completed benchmark run summaries.
- `benchmarks/score-agent-os.mjs` validates runs, computes quality-adjusted
  efficiency, and enforces the production benchmark gate.

Result files are intentionally small. Large screenshots, videos, hosted previews,
Git commits, and session logs should be referenced by URI or Git ref instead of
copied into the JSON result.

## Systems under test

Use stable system identifiers:

- `codewiki` — CodeWiki decision/planning/implementation workflow with trace
  evidence.
- `plain-pi` — a normal Pi agent workflow without CodeWiki semantic loops.
- `other` — any other baseline, with `systemDetail` explaining the setup.

The production gate compares `codewiki` against at least one baseline for each
eligible task.

## Quality score

Each run records scores from 0 to 5:

- `functional` — feature behavior and acceptance criteria.
- `visual` — visual quality, polish, layout, and animation where relevant.
- `ux` — controls, feedback, responsiveness, and error states.
- `maintainability` — simple structure, readable code, tests, and no unnecessary
  dependencies.
- `traceability` — documented process evidence, checks, refs, and reproducible
  provenance.

The scorer converts these fields to a 0–100 weighted quality score. Task files
may override weights, but the default is:

```text
functional 35%
visual 20%
ux 15%
maintainability 15%
traceability 15%
```

A production-ready run must set `productionReady: true`, pass all recorded checks,
meet the task quality gate, and satisfy every mandatory score floor.

## Efficiency metrics

The scorer reports:

```text
tokensPerQualityPoint = totalTokens / qualityScore
secondsPerQualityPoint = elapsedSeconds / qualityScore
```

For each task and system, the best production-ready run is the run with the
highest quality score, then lowest token efficiency value, then lowest speed
value.

The benchmark gate passes only when CodeWiki has production-ready runs for the
required tasks and beats or ties the baseline on both geometric-mean token
spend per quality point and geometric-mean seconds per quality point, without a
quality regression on any compared task.

## Commands

```bash
npm run benchmark:agent-os
npm run benchmark:agent-os:gate
```

The first command summarizes any available results and exits successfully when
no results exist yet. The gate command is stricter and fails until enough real
CodeWiki and baseline runs are present.

## Result schema

A minimal result file:

```json
{
  "schemaVersion": 1,
  "runId": "2026-06-22-codewiki-canvas-snake-01",
  "taskId": "canvas-snake",
  "system": "codewiki",
  "model": "example-model",
  "startedAt": "2026-06-22T10:00:00.000Z",
  "completedAt": "2026-06-22T10:18:00.000Z",
  "durationMs": 1080000,
  "tokens": { "input": 12000, "output": 7000, "total": 19000 },
  "productionReady": true,
  "checks": [
    { "name": "tests", "command": "npm test", "status": "pass" }
  ],
  "scores": {
    "functional": 5,
    "visual": 4,
    "ux": 4,
    "maintainability": 4,
    "traceability": 5
  },
  "artifacts": {
    "repo": "https://example.invalid/repo",
    "commit": "abc123",
    "preview": "https://example.invalid/preview",
    "traceRefs": ["TRACE-example"]
  }
}
```

Do not create synthetic winning results. Empty results mean the benchmark gate is
not satisfied yet.
