---
name: codewiki-archive
description: Handle CodeWiki retention and archival workflow. Use when closing traces, creating retention stubs, recording restore refs, or planning hydrate/restore work.
---

# CodeWiki Archive

Use this skill when active trace or knowledge state needs a retention stub, restore reference, or archival handoff.

## Ground rules

- In this repository, use the CLI adapter. Do not call archived `wiki_*` tools while the extension is disabled.
- Archive work is a retention pipeline, not destructive cleanup.
- Never rewrite old trace lines.
- Keep enough refs to hydrate or restore archived state.
- Use Git refs, trace heads, checkpoints, and KB refs as restore evidence.

## Commands

```bash
node --experimental-strip-types src/cli/index.ts archive --input archive.json
```

## Input shapes

Retention stub preview:

```json
{
  "action": "retention_stub",
  "mode": "preview",
  "records": [],
  "gitRestoreRef": "refs/codewiki/archive/TRACE-...",
  "headRef": "TRACE-..."
}
```

Trace close append:

```json
{
  "action": "close",
  "mode": "append",
  "repoRoot": ".",
  "expectedBytes": 0,
  "records": [],
  "gitRestoreRef": "refs/codewiki/archive/TRACE-...",
  "reason": "Trace finished and retained."
}
```

Hydrate plan:

```json
{
  "action": "hydrate",
  "mode": "preview",
  "stub": {
    "traceId": "TRACE-...",
    "title": "Archived trace",
    "headRef": "TRACE-...",
    "gitRestoreRef": "refs/codewiki/archive/TRACE-...",
    "createdAt": "2026-06-11T00:00:00.000Z"
  },
  "archivedRecords": []
}
```

## Workflow

1. Run `codewiki state` and identify trace lifecycle status.
2. Confirm no active semantic or runtime work still needs hot records.
3. Preview retention stubs from trace records and restore refs.
4. Append `trace_close` only with expected-byte preflight.
5. Preserve trace head, first kept record, checkpoint summary, close reason, and Git restore ref.
6. Treat generated views as disposable and reproducible from hot or hydrated traces.
7. Record any restore/hydrate requirements before deleting or moving hot artifacts.

## Stop conditions

Stop when restore refs are missing, trace lifecycle is still active, checkpoint state is ambiguous, or archival would remove the only copy of needed context.
