---
name: codewiki
description: Router and invariants for repo-local CodeWiki operation. Use when a repo needs .codewiki bootstrap, status review, roadmap visibility, compiler routing, validation, graph-backed context, or CodeWiki-specific implementation work.
id: skill.codewiki
title: codewiki skill
state: active
summary: Main CodeWiki entry skill for bootstrap, status, invariants, and loop routing.
owners: [maintainers]
updated: "2026-05-17"
---

# CodeWiki

Use this as the main CodeWiki entry skill. It owns first contact, bootstrap/status flow, core invariants, and routing to focused compiler or gateway skills. It should not duplicate detailed loop instructions.

## When to use

Use the main skill when the repo needs:

- `.codewiki` setup, bootstrap, onboarding, or starter taxonomy guidance;
- status/roadmap/session visibility before choosing work;
- routing between decision, planning, implementation, and validation loops;
- CodeWiki invariants for canonical vs generated vs runtime state;
- artifact-status coordination policy before broad edits;
- a safe answer about whether a request belongs in a task, sprint metadata, build, validation report, or package source.

For loop-specific work, load the focused skill and only the package-local assets needed for that loop:

- `../codewiki-decision/SKILL.md` — capture semantic intent, approved rows, product/system KB changes, propagation evidence, and `decision_build`.
- `../codewiki-planning/SKILL.md` — shape validated decisions into executable tasks, sprint-aware planning, and `planning_build`.
- `../codewiki-implementation/SKILL.md` — execute one atomic task, emit `implementation_build`, and request fresh validation.
- `../codewiki-validation/SKILL.md` — validate builds, task close, graph/drift, and publication/readiness gates without mutating truth.
- `bootstrap/onboarding.md` and `bootstrap/starter-taxonomy.md` — repo-local wiki onboarding prompts and path-class starter guidance.
- `references/tool-catalog.md` — skill-facing map from `codewiki_*` tools to `src/application/tools/**` contracts, including safe sprint metadata usage.
- `playbooks/architecture.md`, `playbooks/research.md`, and `playbooks/view-audit.md` — focused review/playbook modes.

When package-local assets need repo specs, use `codewiki_state` to locate the installed repo's `.codewiki/kb/**` sources instead of relying on package-relative `.codewiki` links.

## First read and bootstrap

1. Run `codewiki_state` when `.codewiki/config.json` exists or may exist. Treat it as the routing map, not final truth.
2. If the repo has no CodeWiki config, use `/wiki-bootstrap` or internal `codewiki_setup`/`codewiki_bootstrap`.
3. If commands are missing after install, ask the user to run `/reload`.
4. Use `/wiki-ui` for the rich local Control Room; use `Alt+W` and `codewiki_state` for compact status.
5. Use `bootstrap/onboarding.md` after bootstrap to infer project shape, ask only high-value questions, and propose next status/resume action.

## Package surface

Public commands:

- `/audit [flags]`
- `/wiki-bootstrap [project name] [--force]`
- `/wiki-config`
- `/wiki-resume [--new] [TASK-###] [repo-path] [-- follow-up intent]`
- `/wiki-ui [repo-path] [port]`
- `Alt+W` to toggle the compact live status panel

Internal agent tools:

- `codewiki_setup`
- `codewiki_bootstrap`
- `codewiki_state`
- `codewiki_resume_context`
- `codewiki_artifact_status`
- `codewiki_audit`
- `codewiki_build`
- `codewiki_validation`
- `codewiki_roadmap` (tasks and sprint metadata)
- `codewiki_gc` (post-commit garbage collection with archive proof and restore ledger)
- `codewiki_diff_table`
- `codewiki_session`
- `codewiki_agency`

Daily default flow: `codewiki_state` for routing, `codewiki_resume_context` for high-signal continuation from CodeWiki source refs, CodeWiki-owned compaction for same-session soft context refresh, `codewiki_artifact_status` for overlap coordination, loop-specific tools for compiler work, `codewiki_audit`/`codewiki_validation` for gates, `/wiki-resume --new` when policy needs a hard replacement session, fresh validator contexts for validation gates, and `codewiki_gc` after close/publication commits when hot `.codewiki` state has eligible trash. Do not use VCC recall, generic Pi compaction, or chat-history summaries as normal CodeWiki memory.

## Core invariants

- `.codewiki/kb/**` is canonical intended knowledge.
- `.codewiki/roadmap/queue.json` is canonical roadmap truth for tasks, ordering, and sprint metadata. Mutate it through CodeWiki tools only.
- `.codewiki/roadmap/tasks/**` and `.codewiki/index_graph.json` are generated read models. Never hand-edit them.
- `.codewiki/session/**` and `.codewiki/runtime/**` are operational coordination state, not durable product truth.
- `.codewiki/builds/**` contains transient compiler handoff artifacts. Compile durable changes into knowledge, roadmap, code, tests, validation, or publication proof.
- `.codewiki/validation/**` contains fail/block/policy-required/current validation reports.
- Tracked `.codewiki` garbage collection is post-commit: first commit the close/publication/archive state that can revive the work, then run `codewiki_gc` with archive commit/tree proof and commit the ledger/deletions separately.
- Tests live in code/test directories, not in `.codewiki/kb/**` or roadmap task folders.
- Git remains the full history mechanism; do not duplicate raw event history inside CodeWiki.
- In this repository, `.codewiki/**` is dogfood state and `src/**`, `skills/**`, `scripts/**`, `tests/**`, `README.md`, and `package.json` are product/package source.

## Task and sprint routing

A roadmap task is one self-contained executable unit with a direct outcome, acceptance criteria, non-goals, verification, and independent validation evidence. Do not create a task only to coordinate, sequence, collect, or close other tasks.

Sprint metadata is the grouping mechanism for related executable tasks. Route work to sprint-aware planning when accepted intent creates:

- three or more related executable tasks;
- a multi-loop cohort with a shared outcome and ordered handoffs;
- shared budget, gates, validation/publication risk, or cross-task sequencing;
- related work that would otherwise tempt an umbrella/container task.

Do not hand-edit sprint metadata. Use the roadmap mutation tool from planning and keep semantic sprint scope decisions traceable to a decision or planning build.

## Compiler routing

```text
decision compiler -> decision_build
  -> planning compiler -> planning_build + roadmap tasks / sprint metadata
    -> implementation compiler -> implementation_build
      -> validation gateway -> pass | fail | block
```

Routing rules:

- Ambiguous intent, changed requirements, risk approval, or unclear task meaning goes to the decision loop.
- Accepted semantic intent and knowledge changes become `decision_build`.
- Roadmap task shaping and sprint-aware cohort decisions go through planning and `planning_build`.
- Code/test/docs execution happens in implementation and emits `implementation_build` before validation.
- Independent checks happen in validation from exact refs, audits, and required proof.
- Post-close/post-publication maintenance runs `codewiki_gc action="dry-run"` after immutable commit proof exists, then purges or records defer/block evidence; never pre-commit purge tracked build/validation/roadmap artifacts.

## Coordination and memory

- Keep current user intent, focused task, loaded graph/build refs, and small decisions in chat context only.
- Persist durable intent in knowledge, roadmap tasks/sprints, builds, validation reports, and source code/tests.
- Use `codewiki_session` for runtime focus; it is not roadmap truth.
- Use `codewiki_artifact_status` before non-trivial semantic writes when another session may touch overlapping paths, task state, build refs, or validation refs.
- Agents may refresh context through CodeWiki-owned compaction or start a new session when their context window is noisy, stale, or token-heavy; restart from CodeWiki refs.
- Do not use session-handoff shims for same-agent context hygiene. Reserve handoff language for true transfer between distinct sessions, agents, or roles; use CodeWiki refs plus artifact status/wait-wake coordination for parallel work.

## Agency policy

Agency modes are bounded:

- `observe`: read status/graph only and report next action.
- `maintain`: refresh/audit graph/index state and propose safe maintenance within budget.
- `work`: resume a task or compiler workflow only inside explicit cycle, wall-time, write, session, and risk budgets.

Stop on budget exhaustion, medium/high risk beyond budget, ambiguity, destructive action, failed checks, missing approval, or unavailable required validation proof.
