# CodeWiki Agent-OS Benchmarks

These benchmarks are the production-readiness proof gate for CodeWiki as an
agent OS. They do not test the future CodeWiki frontend. They test two layers:
first, whether each CodeWiki loop exit rejects shallow outputs cheaply; second,
whether the full decision → planning → implementation workflow helps Pi sessions
produce production-ready software with less token spend and less elapsed time
than comparable plain Pi sessions.

## Benchmark model

The loop-exit debug benchmark runs inside this repository because it is a cheap,
deterministic test of CodeWiki's own exit conditions. App benchmarks are
different: the agent in this repository must not create winning app artifacts or
run the app benchmark for itself. The repository owns the app benchmark harness
only:

1. define two stable, detailed prompts;
2. start isolated Pi sessions for each system under test;
3. record elapsed time and Pi JSON token usage;
4. preserve session/project artifacts for review;
5. accept human-filled quality scores after inspection;
6. score CodeWiki against baselines only from real completed runs.

The same `prompt.md` is sent to every system for a task. CodeWiki-vs-baseline
comparison comes from the session setup, not different user prompts.

## Layout

- `benchmarks/score-loop-exits.mjs` runs adversarial fixtures against the
  decision, planning, and implementation exit evaluators and reports current
  semantic gaps.
- `benchmarks/tasks/*.json` defines task prompts, frontend/backend requirements,
  acceptance criteria, scoring weights, and production gates.
- `benchmarks/prepare-agent-os-run.mjs` creates a run directory with the shared
  prompt, system notes, and a result template.
- `benchmarks/run-agent-os-sessions.mjs` launches isolated Pi benchmark sessions
  and captures session JSON, elapsed time, and token counts.
- `benchmarks/score-agent-os.mjs` validates human-scored results, computes
  quality-adjusted efficiency, and enforces the production benchmark gate.
- `benchmarks/results/*.json` stores completed, reviewed benchmark summaries.
- `benchmarks/runs/` is ignored scratch output for prepared/launched sessions.

Do not commit generated app source archives or synthetic result files as proof.
Commit final result JSON only after a real run and human review.

## Loop exit debug benchmark

Run:

```bash
npm run benchmark:loops
npm run benchmark:loops:gate
```

The loop benchmark contains complete fixtures that should pass, invalid fixtures
that should fail or block, and adversarial shallow fixtures that currently expose
known semantic gaps. The gate is allowed to fail during hardening; it becomes a
production-readiness gate when all known gaps are closed.

The benchmark reports standard mode counts (`deterministic`, `agent`, `user`) so
we can see whether quality is enforced by cheap checks first and agent-dependent
checks only where semantic judgment is unavoidable.

## Self-improving loop hardening

The autoresearch-inspired workflow for loop hardening is:

1. keep the adversarial fixture corpus fixed for one experiment;
2. let an agent patch only loop exit/quality-standard code and matching tests;
3. run `npm run benchmark:loops` and normal tests under a fixed wall-clock/token
   budget;
4. keep the patch only if it closes a gap without creating regressions,
   increasing agent-mode standards unnecessarily, or weakening app benchmarks;
5. add the closed gap as a permanent regression fixture before starting the next
   experiment.

This makes loop improvement iterative and measurable without fabricating app
benchmark proof.

## Current required app tasks

- `polished-tetris` — production Tetris with polished responsive frontend,
  deterministic engine, local persistence/API, replay seed support, and tests.
- `flight-simulator` — production browser flight simulator with polished cockpit
  frontend, deterministic physics/missions, local persistence/API, telemetry,
  and tests.

## Systems under test

Use stable system identifiers:

- `codewiki` — Pi session with CodeWiki installed as a project-local package.
- `plain-pi` — isolated Pi session with CodeWiki disabled/not installed.
- `other` — any other baseline, with `systemDetail` explaining the setup.

## Quality score

Each reviewed run records scores from 0 to 5:

- `functional` — end-to-end feature behavior and acceptance criteria.
- `frontend` — visual polish, responsiveness, rendering quality, controls, and
  accessibility for the browser UI.
- `backend` — local API/data layer, persistence, validation, deterministic
  seeds/replays/missions, and corrupt-data recovery.
- `ux` — flow, feedback, learnability, error states, and reviewer usability.
- `maintainability` — simple structure, readable code, tests, and no unnecessary
  dependencies.
- `traceability` — session evidence, CodeWiki traces when applicable, checks,
  refs, limitations, and reproducible provenance.

Default weights:

```text
functional 25%
frontend 20%
backend 20%
ux 10%
maintainability 10%
traceability 15%
```

A production-ready run must set `productionReady: true`, pass all recorded
checks, meet the task quality gate, and satisfy every mandatory score floor.

## Commands

Prepare one run directory without launching Pi:

```bash
npm run benchmark:agent-os:prepare -- --task polished-tetris --system codewiki
```

Dry-run the full session matrix and inspect generated commands:

```bash
npm run benchmark:agent-os:run -- --dry-run
```

Launch real isolated sessions for both systems and both required tasks:

```bash
npm run benchmark:agent-os:run -- --systems codewiki,plain-pi --repetitions 1
```

Score completed, reviewed results:

```bash
npm run benchmark:agent-os
npm run benchmark:agent-os:gate
```

The scorer exits successfully with empty results. The gate is strict and fails
until enough real CodeWiki and baseline results exist.

## Result schema

A minimal reviewed result file:

```json
{
  "schemaVersion": 1,
  "runId": "2026-06-22-codewiki-polished-tetris-01",
  "taskId": "polished-tetris",
  "system": "codewiki",
  "model": "openai-codex/gpt-5.5",
  "startedAt": "2026-06-22T10:00:00.000Z",
  "completedAt": "2026-06-22T10:18:00.000Z",
  "durationMs": 1080000,
  "tokens": {
    "input": 12000,
    "output": 7000,
    "cacheRead": 0,
    "cacheWrite": 0,
    "total": 19000
  },
  "productionReady": true,
  "checks": [{ "name": "tests", "command": "npm test", "status": "pass" }],
  "scores": {
    "functional": 5,
    "frontend": 4,
    "backend": 4,
    "ux": 4,
    "maintainability": 4,
    "traceability": 5
  },
  "artifacts": {
    "repo": "https://example.invalid/repo",
    "commit": "abc123",
    "preview": "npm start",
    "screenshotOrVideo": "artifact://screenshot.png",
    "testOutput": "artifact://test-output.txt",
    "sessionOutput": "benchmarks/runs/.../session.jsonl",
    "traceRefs": ["TRACE-polished-tetris"],
    "sessionRefs": ["pi-session-id"]
  }
}
```

Do not create synthetic winning results. Empty results mean the benchmark gate is
not satisfied yet.
