---
name: codewiki-implementation
description: Run the CodeWiki implementation loop. Use when exited planning work must become source/docs/tests changes with checks, acceptance evidence, content proof, and a durable implementation iteration.
---

# CodeWiki Implementation

Use this skill when executing a planning work item in source, tests, or KB docs.

## Ground rules

- In this repository, use the CLI adapter until repo-local CodeWiki dogfooding is explicitly enabled. Do not call CodeWiki `wiki_*` tools from this checkout before that step.
- Implementation consumes `planning.iteration` output and emits `implementation.iteration` output.
- Changes are referenced as `trace:<iteration-id>#change:<change-id>`.
- Edit only files required by the selected work item and its acceptance criteria.
- Prefer tests or explicit verification evidence before broad edits.
- Implementation evidence must include changed paths, checks, acceptance mapping, and content proof when source files change.

## Commands

Preview:

```bash
node --experimental-strip-types src/cli/index.ts implement --input implementation.json --repo .
```

Append:

```bash
node --experimental-strip-types src/cli/index.ts implement --input implementation.json --mode append --repo . --expected-bytes 0 --next-sequence 1
```

## Input shape

```json
{
  "repoRoot": ".",
  "traceId": "TRACE-...",
  "mode": "preview",
  "planningEvents": [],
  "changeInputs": [
    {
      "id": "CHG-001",
      "planningRefs": ["trace:TRACE-...:planning:iteration:1#work:WU-001"],
      "changedPaths": ["src/api/index.ts"],
      "summary": "What changed.",
      "checks": [
        {
          "command": "npm test",
          "status": "passed"
        }
      ],
      "acceptanceEvidence": [
        {
          "criterionId": "AC-001",
          "evidence": ["tests/scaffold.test.mjs"]
        }
      ]
    }
  ]
}
```

## Workflow

1. Run `codewiki state` first.
2. Read planning work refs, source-map ownership, and candidate files.
3. Make surgical edits only.
4. Run targeted checks, then broader required checks.
5. Prepare implementation change evidence with planning refs, changed paths, checks, acceptance evidence, and notes.
6. Preview implementation.
7. If exit status is not `exit`, fix missing coverage, invalid refs, failed checks, drift outside ownership, or missing proof.
8. Append only with expected trace offsets.

## Stop conditions

Stop and route back to planning when work is not self-contained or acceptance cannot be verified. Route back to decision when product/system meaning changed beyond planning scope.
