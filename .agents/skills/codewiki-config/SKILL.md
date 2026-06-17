---
name: codewiki-config
description: Inspect and resolve CodeWiki configuration. Use when automation policy, retention policy, host behavior, worker limits, approval boundaries, or adapter settings affect a task.
---

# CodeWiki Config

Use this skill when a task depends on automation, agency, approval cadence, host policy, runtime limits, worktree isolation, retention, or adapter settings.

## Ground rules

- In this repository, use the CLI adapter until repo-local CodeWiki dogfooding is explicitly enabled. Do not call CodeWiki `wiki_*` tools from this checkout before that step.
- Config influences how loops, runtime, archive, and host adapters coordinate; it does not replace trace truth.
- Prefer previewing resolved config before changing behavior.
- Keep policy explicit when user approval, destructive action, or host boundaries matter.

## Commands

Defaults:

```bash
node --experimental-strip-types src/cli/index.ts config
```

With patch input:

```bash
node --experimental-strip-types src/cli/index.ts config --input config.json
```

## Input shape

```json
{
  "patch": {
    "runtime": {
      "maxWorkers": 2,
      "agency": "delegate",
      "worktreeIsolation": "auto",
      "budgets": {
        "maxIterations": 2,
        "maxChangedFiles": 12
      },
      "approval": {
        "cadence": "on_risk",
        "destructiveAction": "ask"
      }
    },
    "retention": {
      "hotTraceLimit": 20,
      "requireCloseRecord": true
    },
    "hosts": {
      "pi": { "enabled": false },
      "mcp": { "enabled": false }
    }
  }
}
```

## Workflow

1. Resolve current config before runtime, archive, or host-adapter work.
2. Check worker limits, agency level, approval cadence, budgets, retention settings, and host options before planning automation.
3. Validate config output before assuming a policy is active.
4. Keep user approval explicit for risky or irreversible operations.
5. Update docs/tests with config behavior when adding new policy fields.

## Stop conditions

Stop when config is invalid, a policy field is ambiguous, host behavior would differ from core semantics, or a risky action lacks explicit approval.
