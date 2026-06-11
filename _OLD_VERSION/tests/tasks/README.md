# Task Acceptance Tests

Task-specific tests belong under `tests/tasks/TASK-###/` when a roadmap task needs dedicated acceptance coverage.

Each task folder should contain:

- one or more `*.test.mjs` files that prove the task's acceptance criteria,
- a `trace.json` file linking the task id, requirement ids, knowledge specs, code paths, and checks.

Long-lived behavior that should survive after the task closes can be promoted or copied into `tests/smoke/` or a future regression suite while keeping the task trace as historical implementation evidence.
