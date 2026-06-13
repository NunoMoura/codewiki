# Use Loop-Governed Automation

As a user, I want an agent to advance CodeWiki work automatically while staying bounded by explicit loop, exit-condition, budget, and approval boundaries, so progress can continue without losing alignment with my intent.

## Acceptance signals

- Agents advance work through decision, planning, and implementation loop iterations.
- Runtime coordinates automation but does not own product truth.
- Users can configure automation mode, max parallel workers, worker isolation, budgets, and approval requirements.
- The agent stops or routes back on ambiguity, unsafe work, unmet exit conditions, budget exhaustion, no-progress churn, or missing approval.
- Users can see the next safe action, why it is safe, which exit condition controls it, and which refs prove it.
- Parallel workers use runtime claims and optional worktree isolation to avoid unsafe overlap.
- Context-heavy research or worker execution can run in fresh contexts and return compact loop-output evidence.
- Durable truth remains separated: KB/source/Git for project truth, JSONL traces for workflow/state truth, generated views for projections.

## Related docs

- [Agents](../users/agents.md)
- [Loop Model](../../system/loop-model.md)
- [Runtime](../../system/runtime.md)
- [API vNext Tool Surface](../../system/api-vnext-tools.md)
