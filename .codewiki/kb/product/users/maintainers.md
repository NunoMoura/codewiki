---
id: spec.product.users.maintainers
title: Maintainers
state: active
summary: Human maintainers who use CodeWiki to keep project intent, work state, and
  evidence trustworthy.
owners:
- product
updated: '2026-05-16'
code_paths:
- tests/smoke/package-smoke.test.mjs
- src/state/lint.ts
code_paths_mode: explicit_override
---

# Maintainers

Maintainers use CodeWiki to keep current intent, roadmap work, implementation evidence, and publication readiness close to the repository.

They need CodeWiki to answer:

- what is current,
- what changed,
- what is planned,
- what needs a decision,
- what gates limit agent autonomy,
- what evidence supports closure, commit, push, or release.

## Success signals

- Maintainers can inspect project state without reading raw generated files.
- Product and system knowledge stay current rather than historical.
- Roadmap work captures active priority, progress, blockers, and closure instead of burying plans in prose.
- Accepted builds provide briefed intent, implementation specs, and implementation evidence.
- Validation reports make blocked, failed, or policy-kept handoffs explicit.

## Related docs

- [Product](../overview.md)
- [Maintain Fresh Intent](../stories/intent.md)
- [Use Gated Agency](../stories/automation.md)
- [Pi TUI Diagram Rendering](../uis/terminal.md)
