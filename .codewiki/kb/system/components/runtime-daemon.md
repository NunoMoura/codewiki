# Runtime Component

## Responsibility

Runtime folds traces, chooses the next safe action, coordinates claims and workers, enforces progress boundaries, manages temporary data, and orchestrates retention. It does not own semantic truth and is not a fourth semantic loop.

## Owned paths

- `src/runtime/**` owns scheduler, dispatcher, claims, leases, policy, budget, lifecycle, and temporary data helpers.
- `.codewiki/runtime/tmp/**` stores active scratch only.

## Contracts

- Runtime may append coordination events, but semantic truth exits through decision, planning, or implementation iterations.
- Runtime append must obey config policy: `manual` automation and `observe` agency block coordination writes, while preview may still show the plan.
- Runtime must stop or block on unsupported host capability, exhausted budgets, repeated no-progress iterations, stale claims, or required user approval.
- Runtime temporary data must be deleted after loop exit or trace close once durable refs exist.

## Flow links

- [Runtime dispatch](../flows/runtime-daemon-dispatch.md)
- [Artifact claim wait/wake](../flows/artifact-claim-wait-wake.md)

## Related docs

- [Runtime](../runtime.md)
- [Loop Model](../loop-model.md)
- [Traces](../traces.md)
