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
| Decision | Observe user intent, current KB/source/trace/Git refs, risks, alternatives, work scale, planning depth, and route-back questions. | Accepted decision facts, requirements, KB/diagram propagation, risks, non-goals, assumptions, planning-depth guidance, and planning questions. | Intent quality, current-state grounding, KB impact, risk/approval, and planning handoff readiness. |
| Planning | Observe accepted decision output and shape executable work. | Work units or micro-plans, acceptance criteria, dependencies, component refs, path scopes, verification strategy, conflicts, deferrals, and optional triggers for recurring schedules, events, or hooks. | Decision coverage, acceptance clarity, planning-depth validity, dependency/path/component validity, trigger validity, and implementation/runtime readiness. |
| Implementation | Observe accepted planning output and change code/docs/tests. | Changed paths, checks, acceptance evidence, worker provenance, aggregate content proof, residual ownership, publication refs when needed. | Planning coverage, checks, AC evidence, TDD proof, component/path alignment, worker claim correlation, content proof, and closure readiness. |

## Knowledge propagation timing

Knowledge updates are part of the decision loop. CodeWiki does not add a separate knowledge-update loop between decision and planning.

The decision loop reads the current KB, source refs, active trace/work-queue facts, and Git/content refs, then records a compact current-state baseline in decision loop output. That baseline is the observed actual/pending state used to compare the user's desired state against reality.

The decision loop cannot exit unless every accepted semantic row has current-state refs and one of:

- updated KB refs and diagram refs;
- explicit no-KB-impact and/or no-diagram-impact rationale;
- route-back or deferral with owner, trigger, rationale, and evidence.

Planning starts only from an exited decision iteration. This keeps planning grounded in current semantic truth without adding another prompt-heavy loop. User-approved decision tables that change product/system behavior must be captured as `decision.rows_approved` and route to planning unless every approved row is explicitly non-executable or knowledge-only. Project-affecting work does not skip this handoff; tiny or small low-risk decisions use a micro-plan inside planning rather than a direct decision-to-implementation shortcut.

If an accepted decision needs recurrence, an event trigger, or a hook, planning owns the trigger. Planning records the schedule or event source, concurrency policy, run mode, run key template, owner, and acceptance criteria. Implementation proves that the trigger was enabled or consumed; runtime coordination code only processes heartbeats and starts runs from planned triggers.

KB truth during an active trace means accepted product/system intent, not implementation completion. Source/tests/Git prove implementation truth; traces state where work currently stands.

## Loop output and exit

A loop output is not durable truth until its iteration exits successfully and runtime appends it to the trace. Failed, blocked, or route-back iterations record compact provenance and next actions, but downstream loops consume only exited upstream outputs.

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

Host errors are not loop exit conditions. If a main, trace, or worker host cannot execute or coordinate work, runtime records or returns host-error metadata. Once a semantic loop runs and produces output, quality standards determine whether that loop exits, continues, routes back, or blocks.

## Weighted quality standards

A loop exit condition is the sum of weighted quality standards. Standards are the
editable quality surface: they define what must be true for a decision, plan, or
implementation output to leave its loop. Exit wiring, helper predicates,
component/source-map lookups, trace reading, and runner behavior live outside the
standards surface.

Each standard declares:

- stable id;
- description;
- mode: `deterministic`, `agent`, or `user`;
- weight;
- issue codes or predicates that make the standard unmet or blocked.

Production loop outputs carry the standard results for traceability and recovery.
The lab uses editable candidate standards and locked eval cases to improve DEC,
PEC, and IEC before promotion back into production code.

## Baseline exit-condition invariants

Every loop should enforce cheap structural invariants before deeper semantic checks:

- stable unique ids for decision facts, work units, acceptance criteria, and implementation changes;
- canonical refs for KB, trace, Git, digest, source, and test evidence;
- no unknown dependencies or dependency cycles;
- path-scope conflict detection across exact and hierarchical overlaps;
- component ownership alignment from the KB source map to source paths and tests;
- optional repo-snapshot existence checks for changed source/docs/test and evidence paths;
- structured implementation check results with command, phase, acceptance criterion id, and pass/fail status;
- optional red/green TDD evidence when implementation policy requires it;
- structured acceptance evidence with summaries and canonical evidence refs;
- no downstream consumption of outputs from non-exited iterations.

These invariants are deliberately cheap and token-efficient. They catch low-level drift before the agent spends context on deeper KB/source analysis.

## Worker-owned AC-ID TDD

Planning assigns stable acceptance criterion ids to every executable work unit, including micro-plans. A micro-plan is a compact one-unit planning output for tiny or small low-risk work; it preserves the DTR → WU → AC chain without introducing a direct implementation bypass. Implementation workers own their local TDD cycle by default: they may create the tests, implement the change, and submit local check evidence for the work unit they claimed. Worker results are aggregated into one implementation output only when they reference an active runtime claim that matches worker id, work-unit id, and planning refs.

The implementation loop owns final trust and aggregate coverage. Worker-local success is never enough to exit implementation.

Implementation evidence must map back to planned acceptance criterion ids:

```text
DTR -> WU -> AC -> red check -> green check -> acceptance evidence -> changed paths -> local content proof -> aggregate content proof
```

When TDD proof is required by policy, red checks must fail before implementation and green checks must pass after implementation. Red check failures are accepted only when explicitly marked with `phase: "red"`; other failed checks block exit. TDD checks should carry `criterionId` so exit conditions can prove red/green coverage for each planned acceptance criterion.

Worker-local content proof is provenance, not closure proof. Worker/parallel implementation requires final aggregate content proof after merge.

## Component and source-map alignment

The source map at `.codewiki/kb/system/source-map.yaml` is the active component contract. Component entries declare one owning doc, owned source/docs paths, and owned test paths for a system area.

Planning output should include `componentRefs` that point to component ids from that map. Planning exit conditions validate that declared path scopes and verification refs fit those components. Implementation derives the same component requirements from exited planning iterations.

Implementation exit conditions validate the aggregate output against the component contract:

- changed code and docs must be inside planned component source paths or owning doc;
- changed test paths must be inside planned component test paths;
- code changes must have matching test evidence under component test paths;
- when a repo path snapshot is supplied, changed paths and path-based evidence refs must exist;
- unknown or incomplete source-map component entries prevent exit.

Component ids are trace data, not trace refs. Trace `refs` continue to carry only canonical artifacts: KB paths, source/test paths, trace ids, Git refs, and content digests.

## Trace goal closure and runtime work queue

A trace represents one accountable goal. The trace may close only when that goal is satisfied by the DTR → WU → implementation evidence chain, or when remaining work is explicitly deferred/scheduled with owner, trigger, rationale, and evidence. Decision rows covered only by documentation updates do not satisfy a source-bearing goal unless the decision itself is docs-only or planning records a non-executable/knowledge-only resolution.

Recurring or triggered work closes through a trigger trace plus independent run traces. The trigger trace proves the standing decision and trigger. Each run trace proves one due execution and links back through lineage refs; it is not a sub-trace.

The archive close path must block incomplete goals. Derived views may surface `needs_decision`, `needs_planning`, `needs_implementation`, `blocked`, `deferred`, `finished`, `closed_complete`, or `closed_incomplete`; those statuses are view calculations, not workflow truth.

The decision loop must check active trace goals before approving a new row. Semantic overlap with an active trace should be merged, superseded, deferred, ordered by dependency, or explicitly justified as non-conflicting before planning starts. Runtime/main-host checks may detect cheap operational overlap such as path conflicts, but semantic contradiction remains a decision quality-standard concern.

The current state of work is not stored in a separate roadmap board. The `work-queue` and trace-board views derive it from hot trace files.

```text
all TRACE-*.jsonl -> work-queue view -> runtime work-unit claim selection -> work-unit claim trace events -> host worker start
```

The work queue classifies accepted decisions and planning work units as backlog, waiting, ready, claimed, blocked, or done. Planning dependencies decide waiting vs ready. Runtime claim events or live leases decide claimed. Claim expiry or release returns work to ready unless another active blocker exists. Implementation exit decides done. Path conflicts are claim-selection constraints, not durable workflow truth by themselves.

## Trace write contract

One JSONL trace line should be one durable semantic iteration or one runtime coordination event. It is not full chat, scratch state, or a full artifact dump.

Trace writes are runtime-owned. A semantic loop iteration produces compact loop output, exit condition results, progress signals, and canonical refs; runtime validates and appends that report. Runtime coordination events are also appended by runtime.

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

Do not add loops to compensate for weak loop outputs or weak exit conditions. Add compact outputs, exact refs, and stronger weighted standards. Downstream loops should read the previous loop output and touched refs, not reload full chat history.

Preview results are validation drafts for the agent. Append only meaningful trace facts, keep loop outputs compact, run cheap deterministic checks before expensive agent-judgment standards, and let views cache derived status/progress for hosts and renderers.

## Related docs

- [Loop Model](loop-model.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
