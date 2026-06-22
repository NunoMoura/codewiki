# Runtime Component

## Responsibility

Runtime folds traces, chooses the next safe action, coordinates claims and workers, validates append safety, writes trace records, enforces progress boundaries, manages temporary data, and orchestrates retention. It does not invent semantic truth and is not a fourth semantic loop.

## Owned paths

- `src/runtime/**` owns work-unit claim selection, work-unit claim helpers, claims, leases, policy, budget, lifecycle, and temporary data helpers.
- `.codewiki/runtime/tmp/**` stores active scratch only.

## Contracts

- Runtime appends coordination events and semantic loop reports. Semantic truth is produced only by decision, planning, or implementation loops.
- Runtime append must obey config policy: `manual` automation and `observe` agency block coordination writes, while preview may still show the plan.
- Runtime must stop or block on unsupported host capability, exhausted budgets, repeated no-progress iterations, stale claims, or required user approval.
- Runtime temporary data must be deleted after loop exit or trace close once durable refs exist.

## Flow links

- [Runtime work-unit claims](../flows/runtime-work-unit-claims.md)
- [Artifact claim wait/heartbeat](../flows/artifact-claim-wait-heartbeat.md)

## Related docs

- [Runtime](../runtime.md)
- [Loop Model](../loop-model.md)
- [Traces](../traces.md)
