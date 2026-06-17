---
name: codewiki-planning
description: Run the CodeWiki planning loop. Use when exited decision rows must become executable work items, dependencies, path scopes, acceptance criteria, and a durable planning iteration.
---

# CodeWiki Planning

Use this skill after decision output exits successfully and needs executable work units.

## Ground rules

- In this repository, use the CLI adapter until repo-local CodeWiki dogfooding is explicitly enabled. Do not call CodeWiki `wiki_*` tools from this checkout before that step.
- Planning consumes `decision.iteration` output and emits `planning.iteration` output.
- Work items are referenced as `trace:<iteration-id>#work:<work-id>`.
- Work items need path scopes, acceptance criteria, verification refs, dependency refs, and component/source ownership alignment.
- Planning does not edit source files for implementation.

## Commands

Preview:

```bash
node --experimental-strip-types src/cli/index.ts plan --input planning.json
```

Append:

```bash
node --experimental-strip-types src/cli/index.ts plan --input planning.json --mode append --repo . --expected-bytes 0 --next-sequence 1
```

## Input shape

```json
{
  "traceId": "TRACE-...",
  "mode": "preview",
  "decisionEvents": [],
  "workItemInputs": [
    {
      "id": "WU-001",
      "title": "Implement the accepted change.",
      "decisionRefs": ["trace:TRACE-...:decision:iteration:1#row:DTR-001"],
      "outcome": "Observable outcome.",
      "acceptance": ["Specific acceptance criterion."],
      "componentRefs": ["component.api"],
      "pathScopes": ["src/api"],
      "verification": ["tests/scaffold.test.mjs"],
      "dependsOn": []
    }
  ]
}
```

## Workflow

1. Run `codewiki state` first.
2. Read exited decision iteration output and source-map ownership for touched paths.
3. Create self-contained work items only.
4. Include acceptance criteria that can be verified by tests, docs, content proof, or explicit evidence.
5. Preview planning.
6. If exit status is not `exit`, fix missing coverage, invalid refs, path conflicts, dependency cycles, or deferred work evidence.
7. Append only with expected trace offsets.
8. Route exited planning output to implementation.

## Stop conditions

Stop and route back to decision when accepted intent is missing, ambiguous, or contradicted by current docs. Block when work overlaps another unit without dependency ordering or lacks verifiable acceptance.
