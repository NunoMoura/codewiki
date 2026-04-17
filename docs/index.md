# codebase-wiki Docs Index

Generated: 2026-04-17T08:55:31Z

## Roadmap

- [Roadmap](roadmap.md) — 9 item(s); done=7, todo=2

## Specs — Root

- [Product](specs/product.md) — codebase-wiki gives Pi a repo-local, docs-first navigation and drift contract for development projects.

## Specs — Extension

- [Extension Runtime](specs/extension/overview.md) — Extension owns setup, bootstrap, roadmap browsing, rebuild, lint, status, and semantic audit prompting for repo-local codebase wikis discovered from current cwd.

## Specs — Package

- [Package Surface](specs/package/overview.md) — codebase-wiki ships one extension and one skill as globally installable Pi package surface with repo-local wiki data.

## Specs — Shared

- [Shared Rules](specs/shared/overview.md) — Shared documentation contract for maintaining codebase-wiki itself with research, specs, and roadmap.

## Specs — System

- [System Overview](specs/system/overview.md) — codebase-wiki is organized around package surface, extension runtime, starter templates, and generated metadata.

## Specs — Templates

- [Templates and Rebuild](specs/templates/overview.md) — Starter templates and rebuild script define canonical on-disk contract for bootstrapped repos.

## Research

- [inspiration.jsonl](research/inspiration.jsonl) — 2 entries
  - RES-001 — Karpathy LLM Wiki pattern — Persistent compiled wiki sits between raw sources and query-time reasoning; index and chronological log matter because knowledge should compound instead of being re-derived every query.
  - RES-002 — lucasastorian/llmwiki implementation — Production implementation shows useful navigation ideas: path-based wiki tree, overview hub, log chronology, search/read/write MCP tools, citation rendering, and batch reads for broad navigation across many docs.
