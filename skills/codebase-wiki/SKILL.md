---
name: codebase-wiki
description: Bootstrap and operate a repo-local docs-first codebase wiki. Use when a repo needs wiki scaffolding, generated docs metadata, docs linting, or docs-vs-code drift review around .docs/config.json and docs/index.md.
---

# Codebase Wiki

Use this skill when the task is about setting up or operating the repo-local codebase wiki contract shipped by this package.

## What this package provides

- `/wiki-bootstrap [project name] [--force]`
- `/wiki-rebuild`
- `/wiki-lint [show]`
- `/wiki-status`
- `/wiki-self-drift`
- `/wiki-code-drift`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`

## Default workflow

1. If the repo does not have `.docs/config.json`, bootstrap first.
   - Prefer the `codebase_wiki_bootstrap` tool when available.
   - Or tell the user to run `/wiki-bootstrap`.
2. After wiki-doc edits, rebuild generated outputs.
   - Prefer the `codebase_wiki_rebuild` tool when available.
   - Or tell the user to run `/wiki-rebuild`.
3. Inspect `.docs/lint.json`, `.docs/registry.json`, and `docs/index.md`.
4. For semantic review, use the scopes configured in `.docs/config.json` under `codebase_wiki`.
5. Keep `.docs/` generated. Do not hand-edit generated outputs unless fixing the generator itself.

## Wiki rules

- docs are source of truth for intended design
- code is implementation evidence
- one generated live index
- one schema/manual
- hidden machine metadata under `.docs/`
- archive historical docs instead of keeping stale live docs
- when docs and code disagree, either fix docs or track explicit drift

## Skill guidance for the agent

- Prefer package tools and commands over telling the user to edit `AGENTS.md`.
- Use `AGENTS.md` only for repo-specific policy layered on top of this package.
- If commands are missing after install, ask the user to run `/reload`.
- When bootstrapping into an existing repo, avoid overwriting files unless the user explicitly asks for `--force`.

## References

- [Package README](../../README.md)
