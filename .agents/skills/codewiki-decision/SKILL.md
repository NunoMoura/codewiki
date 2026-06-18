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
        "decisionKind": "debug",
        "currentState": "What is true now.",
        "desiredState": "What should become true.",
        "rationale": "Why this change matters.",
        "targetRefs": ["src/runtime/host-runner.ts"],
        "hypothesis": "What may be broken or unsafe.",
        "invariant": "The expected safety or behavior boundary.",
        "probe": "How to prove or disprove the hypothesis.",
        "expectedSafeBehavior": "What should happen if the invariant holds.",
        "stopCondition": "When to stop debugging.",
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

## Decision kinds

Every new approved row should include `decisionKind`. This is not an execution mode; `mode: preview|append` still controls mutation. The kind only shapes decision-loop thinking, table rendering, and kind-specific quality standards.

Use the narrowest kind that fits:

- `debug`: unknown cause or suspected invariant break. Require target refs, hypothesis, invariant/failure boundary, probe or repro plan, expected safe behavior, and stop condition.
- `fix`: known defect. Require reproduction, expected behavior, and regression coverage plan.
- `harden`: known risk class or safety boundary. Require safety boundary, failure/abuse modes, negative test plan, and downstream impact.
- `improve`: user/developer outcome improvement. Require current pain, desired outcome, success signal, and non-goals.
- `migrate`: behavior-preserving migration/refactor. Require source behavior, target behavior, preserved invariants, equivalence proof/checks, and rollback or containment plan.
- `docs` / `release`: use shared decision standards unless one of the narrower kinds is more accurate.

Do not create `wiki_debug`, a debug loop, or runtime debug truth. Debugging remains decision → planning → implementation with `decisionKind: "debug"`.

## Workflow

1. Run `codewiki state` first.
2. Read only the KB/source refs needed to ground the proposed semantic delta.
3. Classify each row by `decisionKind` before writing the table.
4. Prepare compact decision rows with shared fields: current state, desired state, rationale, impact, refs, risk, recommendation, agent assessment, and approval status.
5. Add the kind-specific fields required for the selected `decisionKind`.
6. Preview the decision iteration.
7. If exit status is not `exit`, fix missing refs, rationale, duplicated rows, shared quality gaps, or kind-specific quality gaps.
8. Append only after the user-approved row set and expected trace offsets are known.
9. Route exited decision output to planning.

## Stop conditions

Stop when intent is unclear, approval is missing, requested action is destructive, or the decision would contradict current truth without explicit approval.
