# codewiki Index

Generated: 2026-04-18T05:12:57Z

## Roadmap

- [Roadmap](roadmap.md) — 17 task(s); done=17

## Specs — Root

- [Product](specs/product.md) — codewiki gives Pi a repo-local, docs-first navigation and drift contract for development projects.

## Specs — Extension

- [Extension Runtime](specs/extension/overview.md) — Extension owns intelligent bootstrap, status, fix, review, and internal roadmap/session operations for repo-local codebase wikis discovered from current cwd or targeted explicitly by repo path/picker.
- [Roadmap State and TUI](specs/extension/roadmap-ui.md) — Derived roadmap-state metadata and first-party Pi widget rules for compact roadmap and task visibility inside codewiki.

## Specs — Package

- [Package Surface](specs/package/overview.md) — codewiki ships one extension and one skill as globally installable Pi package surface with repo-local wiki data.

## Specs — Shared

- [Shared Rules](specs/shared/overview.md) — Shared documentation contract for maintaining codewiki itself with research, specs, and roadmap.

## Specs — System

- [System Overview](specs/system/overview.md) — codewiki is organized around package surface, extension runtime, starter templates, and generated metadata.

## Specs — Templates

- [Templates and Rebuild](specs/templates/overview.md) — Starter templates and rebuild script define canonical on-disk contract for bootstrapped repos.

## Research

- [inspiration.jsonl](research/inspiration.jsonl) — 2 entries
  - RES-001 — Karpathy LLM Wiki pattern — Persistent compiled wiki sits between raw sources and query-time reasoning; index and chronological log matter because knowledge should compound instead of being re-derived every query.
  - RES-002 — lucasastorian/llmwiki implementation — Production implementation shows useful navigation ideas: path-based wiki tree, overview hub, log chronology, search/read/write MCP tools, citation rendering, and batch reads for broad navigation across many docs.
