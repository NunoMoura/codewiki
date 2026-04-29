---
name: codewiki
description: Bootstrap and operate a repo-local codebase wiki. Use when a repo needs intelligent wiki bootstrap, wiki status review, drift correction, idea/architecture review, or roadmap/task visibility improvements around `.wiki/config.json`, `.wiki/knowledge/**`, `.wiki/evidence/*.jsonl`, `.wiki/roadmap.json`, and `.wiki/roadmap-state.json`.
---

# Codewiki

Use this skill when the task is about setting up or operating the repo-local codebase wiki contract shipped by this package.

## What this package provides

Public commands:

- `/wiki-bootstrap [project name] [--force]`
- `Alt+W` to toggle the live status panel
- `/wiki-config`
  - interactive configuration panel for summary visibility, pinning, and panel density
- `/wiki-resume [TASK-###]`

Internal agent tools:

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_state`
- `codewiki_task`
- `codewiki_session`

## Default workflow

0. Package may be installed globally or project-locally.
   - If commands are missing after install, ask the user to run `/reload`.
1. If the repo does not have `.wiki/config.json`, start with `/wiki-bootstrap`.
   - Prefer `codewiki_setup` or `codewiki_bootstrap` internally depending on whether overwrite was requested.
   - On brownfield repos, expect bootstrap to infer first-pass boundary docs under `.wiki/knowledge/system/` from repo structure; then refine them to match real ownership seams.
2. Use `Alt+W` as the main status entrypoint and `/wiki-config` for status settings.
   - The panel should reflect deterministic status state live while `/wiki-config` opens the interactive configuration panel and controls summary visibility, pinning, panel density, and gateway policy.
3. If status comes back yellow or red, stay on `/wiki-status` first and inspect the deterministic status surface before deciding next action.
4. Use `/wiki-resume [TASK-###]` to resume implementation from current roadmap focus or to jump directly to a specific open task.
5. Token budget rule: do not read raw wiki truth, full lifecycle logs, or all task shards by default. Prefer, in order: compact state, current task context shard, latest lifecycle events, then targeted raw files only when needed.
6. For token-heavy wiki exploration, prefer the repo-local gateway (`node scripts/codewiki-gateway.mjs pack|tree`) so scripts can inspect `.wiki` and return only compact results. Treat `run` as a read-only fallback, not a security sandbox.
7. For `.wiki` writes outside first-party task/session tools, prefer transaction files through `node scripts/codewiki-gateway.mjs apply <transaction.json>`. This is the temporary codewiki adapter seam for future `think-code`; policy lives in `.wiki/config.json`.
8. Use `codewiki_state` as the primary read entrypoint for repo resolution, health, roadmap summary, focused session, and next-step guidance.
9. When drift review finds real unresolved delta not already tracked, prefer `codewiki_task` with `action='create'` to append structured roadmap tasks.
10. When an existing task needs rewrite, reprioritization, evidence, lifecycle advancement, or closure, prefer `codewiki_task` instead of manual roadmap JSON edits or split loop/session tools.
11. When starting or continuing work on a task, prefer `codewiki_session` so Pi session focus and runtime notes stay separate from canonical roadmap truth.
12. Treat `.wiki/knowledge/` as canonical knowledge and the rest of `.wiki/` as machine-managed operational state.

- Read side should prefer gateway-backed scripted exploration when raw `.wiki` reads would be token-heavy.
- Write side should stay gated through package mutation flows rather than ad hoc file edits to canonical roadmap/events state.
- Do not hand-edit generated read models unless fixing the generator itself.

13. Normal task execution is implement then verify. Research is optional structural evidence/sources when uncertainty or unsupported claims require it.
14. During implementation, use short-cycle feedback from lint/type/test/runtime tools (including Pi-lens when available) to correct mechanical code issues before asking codewiki to judge completion.
15. Verification should be fresh-context oriented and alignment-focused, not just lint-focused. Validate vertical alignment (`user intent -> knowledge -> architecture -> code -> evidence`) and horizontal coherence within each layer (docs vs docs, tasks vs tasks, evidence vs evidence, code ownership vs specs) instead of trusting the implementer's rationale.
16. If working on codewiki itself while codewiki is unstable, stop using codewiki tools for that refactor. Use plain repo tools, restore typecheck/test stability first, then update wiki/skill after checks pass.

## Wiki rules

- evidence = compact machine-managed validation capture under `.wiki/evidence/`
- knowledge under `.wiki/knowledge/` = intended product, clients, and system truth
- roadmap = machine-managed tracked delta from canonical knowledge to current reality
- task = atomic work unit inside roadmap and canonically uses `TASK-###`
- Pi sessions = execution history linked to tasks, not canonical roadmap truth
- code = implementation evidence
- one generated live index
- hidden knowledge + machine metadata under `.wiki/`
- keep plans and drift inside roadmap instead of separate top-level doc buckets
- keep decisions close to owning specs instead of one global ADR bucket by default

## Skill guidance for the agent

- Prefer package tools and commands over telling the user to edit `AGENTS.md`.
- Use `AGENTS.md` only for repo-specific policy layered on top of this package.
- Runtime should resolve the nearest ancestor containing `.wiki/config.json` from current cwd.
- If no wiki exists yet, `/wiki-bootstrap` should target enclosing git repo root when present, else current working directory.
- When bootstrapping into an existing repo, avoid overwriting files unless the user explicitly asks for `--force`.
- Canonical task ids use `TASK-###`, but legacy `ROADMAP-###` task lookups remain accepted during migration.

## References

- [Package README](../../README.md)
