---
name: codebase-wiki
description: Bootstrap and operate a repo-local docs-first codebase wiki. Use when a repo needs intelligent wiki bootstrap, wiki status review, drift correction, idea/architecture review, or roadmap/task visibility improvements around `.docs/config.json`, `docs/specs/**`, `docs/research/*.jsonl`, `docs/roadmap.json`, and `.docs/roadmap-state.json`.
---

# Codebase Wiki

Use this skill when the task is about setting up or operating the repo-local codebase wiki contract shipped by this package.

## What this package provides

Public commands:

- `/wiki-bootstrap [project name] [--force]`
- `/wiki-status [docs|code|both]`
- `/wiki-fix [docs|code|both]`
- `/wiki-review [idea|architecture]`

Internal agent tools:

- `codebase_wiki_setup`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`
- `codebase_wiki_roadmap_append`
- `codebase_wiki_task_session_link`

## Default workflow

0. Package may be installed globally or project-locally.
   - If commands are missing after install, ask the user to run `/reload`.
1. If the repo does not have `.docs/config.json`, start with `/wiki-bootstrap`.
   - Prefer `codebase_wiki_setup` or `codebase_wiki_bootstrap` internally depending on whether overwrite was requested.
   - On brownfield repos, expect bootstrap to infer first-pass boundary specs from repo structure; then refine them to match real ownership seams.
2. Use `/wiki-status [docs|code|both]` as the main health command.
   - It should rebuild metadata, inspect deterministic issues, list specs with mapped code paths, and queue semantic review.
3. If status comes back yellow or red, use `/wiki-fix [docs|code|both]`.
   - Use repo evidence first and ask only high-value clarifying questions when ambiguity materially changes the fix.
4. Use `/wiki-review [idea|architecture]` for higher-level assessment.
5. When drift review finds real unresolved delta not already tracked, prefer `codebase_wiki_roadmap_append` to append structured roadmap tasks.
6. When starting or continuing work on a task, prefer `codebase_wiki_task_session_link` so Pi session history links back to roadmap tasks.
7. Keep `.docs/` generated. Do not hand-edit generated outputs unless fixing the generator itself.

## Wiki rules

- research = compact evidence capture
- specs = intended system truth
- roadmap = top-level container for delta/work from specs to current reality
- task = atomic work unit inside roadmap and canonically uses `TASK-###`
- Pi sessions = execution history linked to tasks, not canonical roadmap truth
- code = implementation evidence
- one generated live index
- hidden machine metadata under `.docs/`
- keep plans and drift inside roadmap instead of separate top-level doc buckets
- keep decisions close to owning specs instead of one global ADR bucket by default

## Skill guidance for the agent

- Prefer package tools and commands over telling the user to edit `AGENTS.md`.
- Use `AGENTS.md` only for repo-specific policy layered on top of this package.
- Runtime should resolve the nearest ancestor containing `.docs/config.json` from current cwd.
- If no wiki exists yet, `/wiki-bootstrap` should target enclosing git repo root when present, else current working directory.
- When bootstrapping into an existing repo, avoid overwriting files unless the user explicitly asks for `--force`.
- Canonical task ids use `TASK-###`, but legacy `ROADMAP-###` task lookups remain accepted during migration.

## References

- [Package README](../../README.md)
