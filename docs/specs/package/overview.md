---
id: spec.package.overview
title: Package Surface
state: active
summary: codewiki ships one extension and one skill as globally installable Pi package surface with repo-local wiki data.
owners:
- architecture
updated: '2026-04-17'
---

# Package Surface

## Public shape

Package should expose:

- one extension: `codewiki`
- one skill: `codewiki`
- no split install story across many tiny extensions
- global install should work cleanly
- project-local install remains optional when teams want pinned shared setup

## Why this shape

- users get one reload target
- runtime commands and tools stay together
- skill teaches agent when to use package contract
- package can be installed once globally while still operating on many repos

## Install boundary

Runtime should bind to repo-local `.docs/config.json`, not `.pi/settings.json`.

Discovery rule:

- resolve the nearest ancestor containing `.docs/config.json` from current cwd
- if no wiki exists yet, `/wiki-bootstrap` targets enclosing git repo root when present, else current working directory

## Brownfield bootstrap goal

Bootstrap should be able to infer first-pass `docs/specs/**` ownership docs from meaningful repo boundaries so existing repos start from something closer to real architecture than generic placeholders.

## Public UX shape

- public commands stay limited to `/wiki-bootstrap`, `/wiki-status`, `/wiki-fix`, and `/wiki-review`
- deeper composability lives in internal tools and prompts

## Model naming

- roadmap stays the top-level container for delta/work
- task is the atomic work unit and canonically uses `TASK-###`
- Pi sessions stay native JSONL execution history linked to tasks through custom entries and live runtime reads

## Compatibility goal

A repo using this package should only need:

- `.docs/config.json`
- `scripts/rebuild_docs_meta.py`
- `docs/research/`
- `docs/specs/`
- `docs/roadmap.json`
- `.docs/roadmap-state.json`

## Related docs

- [Product](../product.md)
- [System Overview](../system/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../roadmap.md)
