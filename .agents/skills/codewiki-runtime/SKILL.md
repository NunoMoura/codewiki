---
name: codewiki-runtime
description: Coordinate CodeWiki runtime work. Use when inspecting queue readiness, planning dispatch, claiming/releasing worker work, or coordinating outer-loop execution without changing semantic truth.
---

# CodeWiki Runtime

Use this skill when work needs scheduling, dispatch, claims, releases, or worker coordination.

## Ground rules

- In this repository, use the CLI adapter. Do not call archived `wiki_*` tools while the extension is disabled.
- Runtime is the outer control loop, not a semantic loop.
- Runtime may append coordination events, but semantic truth remains in decision, planning, and implementation iterations.
- Dispatch only ready work from the work queue.
- Respect path conflicts and active claims.

## Commands

Preview dispatch:

```bash
node --experimental-strip-types src/cli/index.ts runtime --input runtime.json
```

Append claim events:

```bash
node --experimental-strip-types src/cli/index.ts runtime --input runtime.json --mode append --repo .
```

## Input shape

```json
{
  "action": "dispatch",
  "mode": "preview",
  "queue": {
    "traceIds": [],
    "summary": {
      "backlog": 0,
      "waiting": 0,
      "ready": 0,
      "claimed": 0,
      "blocked": 0,
      "done": 0
    },
    "items": []
  },
  "maxWorkers": 1
}
```

Append mode also needs `nextSequenceByTrace`, `expectedBytesByTrace`, and `repoRoot`.

## Workflow

1. Run `codewiki state` and inspect `workQueue`.
2. Preview runtime dispatch with a worker limit.
3. Verify selected work is ready, unclaimed, and path-conflict safe.
4. Append claim events only with expected trace sequences and expected byte offsets.
5. Feed claim events back into state before starting workers.
6. Release or expire claims when workers finish, fail, or time out.

## Stop conditions

Stop when the queue has blockers, path conflicts, missing expected offsets, expired claim ambiguity, or no ready work.
