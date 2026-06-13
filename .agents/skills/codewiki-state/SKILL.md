---
name: codewiki-state
description: Inspect CodeWiki state before acting. Use when checking status, resume context, work queue, blockers, source ownership, or next safe loop action in this repository.
---

# CodeWiki State

Use this skill before decision, planning, implementation, runtime dispatch, archive work, or any migration step that needs current CodeWiki context.

## Ground rules

- In this repository, use the CLI adapter. Do not call archived `wiki_*` tools while the extension is disabled.
- Treat `.codewiki/traces/TRACE-*.jsonl` as workflow/state truth.
- Treat `.codewiki/kb/**` and `src/**` as active source truth.
- Treat generated views as disposable projections.
- Treat source ownership as coming from `.codewiki/kb/system/source-map.yaml`.

## Commands

```bash
node --experimental-strip-types src/cli/index.ts state --repo .
node --experimental-strip-types src/cli/index.ts state --repo . --trace TRACE-...
node --experimental-strip-types src/cli/index.ts state --repo . --source src/api/index.ts
```

## Workflow

1. Run `state` before choosing a loop action.
2. Inspect `status`, `resume`, `workQueue`, `blockers`, and `sourceOwners`.
3. If a blocker exists, route to the loop named by the blocker instead of guessing.
4. If source ownership is unclear, update the source map before broad edits.
5. Use source-map ownership for current responsibility; use traces for what happened and why.

## Stop conditions

Stop and ask when trace selection is ambiguous, source ownership is missing, or state contradicts the requested action.
