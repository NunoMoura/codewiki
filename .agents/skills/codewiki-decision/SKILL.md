---
name: codewiki-decision
description: Run the CodeWiki decision loop. Use when intent, product/system direction, KB changes, risk, or semantic approval must become a durable decision iteration.
---

# CodeWiki Decision

Use this skill when the user request changes intended behavior, source-of-truth docs, system architecture, product meaning, or approval boundaries.

## Ground rules

- In this repository, use the CLI adapter until repo-local CodeWiki dogfooding is explicitly enabled. Do not call CodeWiki `wiki_*` tools from this checkout before that step.
- Decision owns semantic intent and knowledge impact.
- Planning owns executable work items.
- Implementation owns source/docs/tests changes.
- One decision cycle should become one `decision.iteration` trace event when appended.
- Decision output rows are referenced as `trace:<iteration-id>#row:<row-id>`.

## Commands

Preview:

```bash
node --experimental-strip-types src/cli/index.ts decide --input decision.json
```

Append:

```bash
node --experimental-strip-types src/cli/index.ts decide --input decision.json --mode append --repo . --expected-bytes 0 --next-sequence 1
```

## Input shape

```json
{
  "traceId": "TRACE-...",
  "mode": "preview",
  "tableInput": {
    "rows": [
      {
        "id": "DTR-001",
        "currentState": "What is true now.",
        "desiredState": "What should become true.",
        "rationale": "Why this change matters.",
        "approval": "accepted",
        "affectedLayers": ["system"],
        "sourceRefs": ["kb:system/api.md"],
        "proofRefs": ["src/api/index.ts"],
        "changeType": "maintenance"
      }
    ]
  }
}
```

## Workflow

1. Run `codewiki state` first.
2. Read only the KB/source refs needed to ground the proposed semantic delta.
3. Prepare compact decision rows with current state, desired state, rationale, impact, refs, and approval status.
4. Preview the decision iteration.
5. If exit status is not `exit`, fix missing refs, rationale, duplicated rows, or unresolved intent.
6. Append only after the user-approved row set and expected trace offsets are known.
7. Route exited decision output to planning.

## Stop conditions

Stop when intent is unclear, approval is missing, requested action is destructive, or the decision would contradict current truth without explicit approval.
