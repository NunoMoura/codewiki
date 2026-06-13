# Loop Contracts

CodeWiki has exactly three semantic loops: decision, planning, and implementation. There is no fourth knowledge, validation, runtime, publication, roadmap, graph, or recovery loop.

Each semantic loop is defined by:

1. loop cycle;
2. loop output;
3. exit conditions.

Runtime is the outer control loop. It coordinates traces, scheduling, claims, workers, budgets, retention, and host integration, but it does not own semantic truth.

## Loop responsibilities

| Loop | Loop cycle | Loop output | Exit condition focus |
| --- | --- | --- | --- |
| Decision | Observe user intent, current KB/source/trace/Git refs, risks, alternatives, and route-back questions. | Accepted decision facts, requirements, KB/diagram propagation, risks, non-goals, assumptions, and planning questions. | Intent quality, current-state grounding, KB impact, risk/approval, and planning handoff readiness. |
| Planning | Observe accepted decision output and shape executable work. | Work units, acceptance criteria, dependencies, component refs, path scopes, verification strategy, conflicts, deferrals. | Decision coverage, acceptance clarity, dependency/path/component validity, and implementation/runtime readiness. |
| Implementation | Observe accepted planning output and change code/docs/tests. | Changed paths, checks, acceptance evidence, worker provenance, aggregate content proof, residual ownership, publication refs when needed. | Planning coverage, checks, AC evidence, TDD proof, component/path alignment, worker claim correlation, content proof, and closure readiness. |

## Knowledge propagation timing

Knowledge updates are part of the decision loop. CodeWiki does not add a separate knowledge-update loop between decision and planning.

The decision loop reads the current KB, source refs, active trace/work-queue facts, and Git/content refs, then records a compact current-state baseline in decision loop output. That baseline is the observed actual/pending state used to compare the user's desired state against reality.

The decision loop cannot exit unless every accepted semantic row has current-state refs and one of:

- updated KB refs and diagram refs;
- explicit no-KB-impact and/or no-diagram-impact rationale;
- route-back or deferral with owner, trigger, rationale, and evidence.

Planning starts only from an exited decision iteration. This keeps planning grounded in current semantic truth without adding another prompt-heavy loop.

KB truth during an active trace means accepted product/system intent, not implementation completion. Source/tests/Git prove implementation truth; traces state where work currently stands.

## Loop output and exit

A loop output is not durable truth until its iteration exits successfully and is appended to the trace. Failed, blocked, or route-back iterations record compact provenance and next actions, but downstream loops consume only exited upstream outputs.

A loop output should separate:

- high-signal facts needed by the next loop;
- exact canonical refs;
- unmet exit conditions;
- dropped noise that should not leave runtime temp;
- route-back questions that require earlier-loop authority.

## Exit result contract

Every loop iteration should include an exit result:

- `status`: `continue`, `exit`, `route_back`, or `blocked`;
- `conditions`: structured condition results;
- `remediation`: exact next actions for unmet conditions;
- `targetLoop`: required when routing back;
- `nextAction`: the next safe action;
- progress signals such as newly met conditions, changed refs, repeated failures, and budget concerns.

Boolean pass/fail is not enough for recovery or automation.

## Baseline exit-condition invariants

Every loop should enforce cheap structural invariants before deeper semantic checks:

- stable unique ids for decision facts, work units, acceptance criteria, and implementation changes;
- canonical refs for KB, trace, Git, digest, source, and test evidence;
- no unknown dependencies or dependency cycles;
- path-scope conflict detection across exact and hierarchical overlaps;
- component ownership alignment from the KB file-structure map to source paths and tests;
- optional repo-snapshot existence checks for changed source/docs/test and evidence paths;
- structured implementation check results with command, phase, acceptance criterion id, and pass/fail status;
- optional red/green TDD evidence when implementation policy requires it;
- structured acceptance evidence with summaries and canonical evidence refs;
- no downstream consumption of outputs from non-exited iterations.

These invariants are deliberately cheap and token-efficient. They catch low-level drift before the agent spends context on deeper KB/source analysis.

## Worker-owned AC-ID TDD

Planning assigns stable acceptance criterion ids to every executable work unit. Implementation workers own their local TDD cycle by default: they may create the tests, implement the change, and submit local check evidence for the work unit they claimed. Worker results are aggregated into one implementation output only when they reference an active runtime claim that matches worker id, work-unit id, and planning refs.

The implementation loop owns final trust and aggregate coverage. Worker-local success is never enough to exit implementation.

Implementation evidence must map back to planned acceptance criterion ids:

```text
DTR -> WU -> AC -> red check -> green check -> acceptance evidence -> changed paths -> local content proof -> aggregate content proof
```

When TDD proof is required by policy, red checks must fail before implementation and green checks must pass after implementation. Red check failures are accepted only when explicitly marked with `phase: "red"`; other failed checks block exit. TDD checks should carry `criterionId` so exit conditions can prove red/green coverage for each planned acceptance criterion.

Worker-local content proof is provenance, not closure proof. Worker/parallel implementation requires final aggregate content proof after merge.

## Component and file-structure alignment

The file-structure map at `.codewiki/kb/system/diagrams/file-structure-map.yaml` is an active component contract, not only a rendered diagram. Component entries declare KB refs, owned source/docs paths, and owned test paths for a system area.

Planning output should include `componentRefs` that point to component ids from that map. Planning exit conditions validate that declared path scopes and verification refs fit those components. Implementation derives the same component requirements from exited planning iterations.

Implementation exit conditions validate the aggregate output against the component contract:

- changed code and docs must be inside planned component ownership paths or KB refs;
- changed test paths must be inside planned component test paths;
- code changes must have matching test evidence under component test paths;
- when a repo path snapshot is supplied, changed paths and path-based evidence refs must exist;
- unknown or incomplete component map entries prevent exit.

Component ids are trace data, not trace refs. Trace `refs` continue to carry only canonical artifacts: KB paths, source/test paths, trace ids, Git refs, and content digests.

## Runtime work queue

The current state of work is not stored in a separate roadmap board. It is computed by folding hot trace files.

```text
all TRACE-*.jsonl -> work-queue projection -> runtime dispatch plan -> claims/spawn workers
```

The work queue classifies accepted decisions and planning work units as backlog, waiting, ready, claimed, blocked, or done. Planning dependencies decide waiting vs ready. Runtime claim events or live leases decide claimed. Claim expiry or release returns work to ready unless another active blocker exists. Implementation exit decides done. Path conflicts are scheduler constraints, not durable workflow truth by themselves.

## Trace write contract

One JSONL trace line should be one durable semantic iteration or one runtime coordination event. It is not full chat, scratch state, or a full artifact dump.

Trace writes are orchestrator-owned. A semantic loop iteration appends compact loop output, exit condition results, progress signals, and canonical refs.

`refs` must contain canonical artifact refs only, such as KB paths, source/test paths, trace event ids, Git refs, restore refs, or content digests. Commands, prose summaries, acceptance text, and remediation details belong in `data`, not `refs`.

## Recovery contract

A resume agent should be able to replay a trace and answer:

1. What is the latest iteration for each semantic loop?
2. Which loop is active now?
3. Which loop outputs have exited and are safe to consume?
4. Which exit conditions remain unmet?
5. Which route-back or blocked iteration explains current remediation?
6. Which KB/source/test/Git refs prove the current state?
7. What is the next safe action?

Accepted loop outputs provide vertical alignment:

```text
user intent -> decision output -> planning output -> implementation output -> Git/content proof
```

Exit-condition findings and checkpoints provide recovery alignment after errors, failed iterations, context loss, or agent replacement.

## Token-efficiency rule

Do not add loops to compensate for weak loop outputs or weak exit conditions. Add compact outputs, exact refs, and stronger exit conditions. Downstream loops should read the previous loop output and touched refs, not reload full chat history.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
