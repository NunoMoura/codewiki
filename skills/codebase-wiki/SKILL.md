---
name: codebase-wiki
description: Bootstrap and operate a repo-local docs-first codebase wiki. Use when a repo needs wiki scaffolding, generated docs metadata, docs linting, or docs-vs-code drift review around `.docs/config.json`, `docs/specs/**`, `docs/research/*.jsonl`, and `docs/roadmap.json`.
---

# Codebase Wiki

Use this skill when the task is about setting up or operating the repo-local codebase wiki contract shipped by this package.

## What this package provides

- `/wiki-setup [project name]`
- `/wiki-bootstrap [project name] [--force]`
- `/wiki-rebuild`
- `/wiki-lint [show]`
- `/wiki-status`
- `/wiki-roadmap [ROADMAP-###]`
- `/wiki-self-drift`
- `/wiki-code-drift`
- `/wiki-task <task-id> [focus|progress|blocked|done|spawn]`
- `codebase_wiki_setup`
- `codebase_wiki_bootstrap`
- `codebase_wiki_rebuild`
- `codebase_wiki_status`
- `codebase_wiki_roadmap_append`
- `codebase_wiki_task_session_link`

## Default workflow

0. Package may be installed globally or project-locally.
   - If commands are missing after install, ask the user to run `/reload`.
1. If the repo does not have `.docs/config.json`, set it up first.
   - Prefer `codebase_wiki_setup` as the safe default.
   - Or tell the user to run `/wiki-setup` from repo root, or from a subdirectory if the enclosing git repo should own `docs/` and `.docs/`.
   - On brownfield repos, expect setup/bootstrap to infer first-pass boundary specs from repo structure; then refine them to match real ownership seams.
2. If the user explicitly wants starter docs overwritten, use bootstrap instead.
   - Prefer `codebase_wiki_bootstrap` with `force=true` only when overwrite was requested.
   - Or tell the user to run `/wiki-bootstrap`.
3. After wiki-doc edits, rebuild generated outputs.
   - Prefer the `codebase_wiki_rebuild` tool when available.
   - Or tell the user to run `/wiki-rebuild`.
4. Inspect `.docs/lint.json`, `.docs/registry.json`, `docs/index.md`, and `docs/roadmap.md`.
   - When the user wants to browse roadmap tasks in the terminal, tell them to run `/wiki-roadmap`.
5. For semantic review, use the scopes configured in `.docs/config.json` under `codebase_wiki`.
6. When drift review finds real unresolved delta not already tracked, prefer `codebase_wiki_roadmap_append` to append structured roadmap tasks.
7. When starting or continuing work on a task, prefer `codebase_wiki_task_session_link` so Pi session history links back to roadmap tasks.
8. Keep `.docs/` generated. Do not hand-edit generated outputs unless fixing the generator itself.

## Wiki rules

- research = compact evidence capture
- specs = intended system truth
- roadmap = numbered delta tracker from specs to current reality
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
- If no wiki exists yet, `/wiki-setup` and `/wiki-bootstrap` should target enclosing git repo root when present, else current working directory.
- When bootstrapping into an existing repo, avoid overwriting files unless the user explicitly asks for `--force`.

## References

- [Package README](../../README.md)
