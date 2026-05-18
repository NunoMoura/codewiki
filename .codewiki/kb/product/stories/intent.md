---
id: spec.product.stories.intent
title: Maintain Fresh Intent
state: active
summary: CodeWiki should capture, challenge, and preserve current project intent so
  future work starts from agreed solutions instead of chat archaeology.
owners:
- product
updated: '2026-05-09'
code_paths:
- skills/codewiki-feedback/SKILL.md
---

# Maintain Fresh Intent

As a maintainer or agent, I want CodeWiki to capture and challenge current project intent before downstream documentation or code changes, so future work uses agreed solutions instead of rediscovering goals from chat history or raw diffs.

## Acceptance signals

- Product and system knowledge describe the desired current state.
- The feedback loop surfaces tradeoffs, blind spots, pitfalls, simpler alternatives, and conflicts before intent is accepted.
- Diff tables show current state, proposed state, rationale, affected layers, risk, and user action before canonical edits are applied.
- Accepted feedback decisions become feedback builds before documentation changes.
- Obsolete details are removed or converted into compact historical summaries.
- Roadmap work records priority, status, blockers, progress, and closure while linking to accepted builds and specs instead of carrying full requirements briefs.

## Related docs

- [Maintainers](../users/maintainers.md)
- [Product](../overview.md)
- [System Overview](../../system/overview.md)
- [Compilers](../../system/compilers.md)
- [Builds](../../system/builds.md)
