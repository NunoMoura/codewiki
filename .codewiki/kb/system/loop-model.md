# Loop Model

CodeWiki is a trace-backed software-development OS built around loops.

The target product vocabulary is:

```text
runtime outer loop
semantic loop
loop cycle
loop output
exit conditions
trace iteration
```

Older migration vocabulary is not part of the desired-state model and must not define product concepts or source layout.

## Runtime outer loop

Runtime is the outer control loop. It is not a semantic loop and it does not own product truth.

```text
while project has active traces:
  fold traces
  inspect current state and exit conditions
  choose next semantic loop or runtime coordination action
  run one semantic loop iteration or append one runtime coordination event
  repeat
```

Runtime coordinates claims, scheduling, worker dispatch, temporary data, budgets, stop conditions, retention, and host integration. Accepted product/system truth remains in KB, source, tests, Git, and traces.

## Semantic loops

There are exactly three semantic loops:

1. Decision
2. Planning
3. Implementation

Each semantic loop is defined by the same three sections:

1. **Loop cycle** — what the agent repeats while inside the loop.
2. **Loop output** — the high-signal packet the loop is trying to produce.
3. **Exit conditions** — the conditions that decide whether the loop can exit, must continue, must route back, or is blocked.

## Loop cycle

A loop cycle is the agent's repeated work inside one semantic loop:

```text
observe durable refs
act inside loop authority
update loop output
check exit conditions
append trace iteration
continue, exit, route back, or block
```

The loop cycle is where noisy work happens: reading, comparing, editing, testing, asking questions, dispatching workers, and resolving findings. Noise belongs in chat, tools, or runtime temp. It should not become durable truth unless distilled into loop output or compact route-back provenance.

## Loop output

Loop output is the high-signal handoff packet produced by a semantic loop. It must be small enough for the next loop to consume without transcript replay, but structured enough for trace replay and recovery.

A good loop output contains:

- accepted facts;
- canonical refs;
- coverage maps;
- risks and blockers;
- unresolved questions;
- authority boundaries;
- next-loop context;
- evidence required by exit conditions.

A loop output must not contain:

- full chat transcript;
- private scratch reasoning;
- full logs;
- duplicate prose;
- stale generated views;
- raw tool spam;
- non-canonical refs in `refs`.

The loop output is high-signal because exit conditions force it to be high-signal. If required signal is missing, the loop continues or routes back.

## Exit quality standards

Exit conditions are the loop's quality and safety contract. In source, they are represented as loop-owned quality standards. They answer:

```text
Can this loop safely exit?
Can the next loop trust this output?
If not, what exact condition is unmet?
```

Quality standards should be deterministic when possible. Agent-judgment standards and user-approval standards are allowed only when their quality value is worth the token and UX cost.

Loop exit results use four statuses:

| Status | Meaning |
| --- | --- |
| `continue` | Same loop can remediate unmet conditions. |
| `exit` | Conditions are met; loop output is accepted for downstream use. |
| `route_back` | Earlier loop authority is required. |
| `blocked` | External user, resource, policy, or runtime wait is required. |

Semantic uncertainty becomes an explicit unmet quality standard, route-back, or user-approval block, not hidden confidence.

## Progress boundaries

Loop systems need more than max-iteration caps. Every iteration should capture progress signals that help runtime detect useful motion versus churn:

- newly met exit conditions;
- changed canonical refs;
- repeated failure signatures;
- unchanged state digests;
- budget spent without new evidence;
- next safe action.

Runtime may stop, block, or ask for user approval when iterations consume budget without moving conditions toward exit.

## Trace iterations

A semantic loop iteration is the durable trace boundary. JSONL trace files are append-only; old iterations are never rewritten.

```text
line 10: implementation.iteration -> route_back decision
line 11: decision.iteration -> exit
line 12: planning.iteration -> exit
line 13: implementation.iteration -> exit
```

Current state is derived by folding the trace and selecting the latest relevant accepted/active iteration plus runtime coordination events.

## Iteration event shape

Target trace iteration events follow this conceptual shape:

```json
{
  "type": "trace_event",
  "loop": "implementation",
  "event": "implementation.iteration",
  "refs": ["src/example.ts", "tests/example.test.ts", "sha256:..."],
  "data": {
    "iteration": 4,
    "trigger": "worker_results",
    "output": {},
    "exit": {
      "status": "continue",
      "conditions": [],
      "targetLoop": null,
      "nextAction": "Collect final aggregate content proof."
    },
    "progress": {
      "changedRefs": [],
      "newlyMetConditions": [],
      "repeatedFailures": []
    }
  }
}
```

`refs` contain canonical artifact refs only. Loop output, exit condition results, remediation, commands, summaries, and progress details belong in `data`.

## Route-back rules

The workflow is not a straight pipeline. Later loops can route back when authority belongs earlier:

- implementation can route back to planning for scope/order/path/test strategy changes;
- implementation can route back to decision for ambiguity, product/API contract changes, risk, or user approval;
- planning can route back to decision for under-specified requirements or conflicting intent;
- decision cannot be bypassed when a new product/system decision is needed.

Route-back appends a new iteration in the target loop. It never mutates an old iteration.

## Related docs

- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API Tool Surface](api-tools.md)
