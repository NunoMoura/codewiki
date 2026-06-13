# Maintain Fresh Intent

As a maintainer or agent, I want CodeWiki to capture and challenge current project intent before planning or code changes, so future work uses agreed solutions instead of rediscovering goals from chat history or raw diffs.

## Acceptance signals

- Product and system knowledge describe the desired current state.
- The decision loop surfaces tradeoffs, blind spots, pitfalls, simpler alternatives, and conflicts before intent exits.
- Decision output records decision question, current and desired project state, proposed change, rationale, affected layers, risk, options, evidence refs, and user action before downstream work starts.
- Exited decision output maps to KB/diagram refs before planning.
- Obsolete details are removed or converted into compact historical summaries through retention.
- Work state is represented through trace-backed planning output, work-plan views, and work-queue views, not roadmap truth.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Product](../overview.md)
- [Decision Loop](../../system/decision-loop.md)
- [System Overview](../../system/overview.md)
