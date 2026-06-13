# Agents and Subagents

Agents use CodeWiki as persistent project memory and loop-governed orchestration state through host adapters. They need compact current state, clear source-of-truth boundaries, scoped runtime claims for parallel coordination, wait/wake signals, and explicit exit conditions before they change knowledge, source, tests, or publication state.

User-opened sessions and subagents run focused work from CodeWiki refs with fresh context windows when useful. They support research, architecture review, planning review, worker implementation, test work, and other bounded tasks where isolated context reduces token cost and parent-session bias.

## Success signals

- Agents start from compact `wiki_state` status/resume before broad reads.
- Agents follow loop outputs: decision output, planning output, implementation output, and trace-backed work views.
- Agents can advance work automatically only inside explicit token, time, risk, exit-condition, policy, and approval boundaries.
- Parallel agents can claim narrow work/path scopes and see overlap warnings or conflicts before work proceeds.
- Subagents return compact structured results rather than mutating canonical truth directly.
- Ambiguous intent escalates back to the decision loop instead of being guessed.

## Related docs

- [Low-Token Navigation](../stories/navigation.md)
- [Use Loop-Governed Automation](../stories/automation.md)
- [CodeWiki API](../../system/api.md)
- [Loop Model](../../system/loop-model.md)
- [Runtime](../../system/runtime.md)
