# codewiki

Repo-local, docs-first wiki tooling for [Pi](https://github.com/mariozechner/pi-coding-agent).

Inspired by Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) and adapted for development-project documentation instead of general personal knowledge bases.

This package now ships:

- **one Pi extension**: `codewiki`
- **focused Pi skills**: `codewiki` plus workflow skills for planning, task execution, research, verification, and architecture review

That is the right shape for this package:

- the **extension** provides commands, tools, and runtime behavior
- the **skills** teach the agent the minimum workflow needed for each CodeWiki job

## What you get

### Commands

Public command surface is intentionally small. Canonical command router:

- `/wiki bootstrap [project name] [--force]`
  - starts CodeWiki in greenfield or brownfield projects through command-adapter backend setup/bootstrap calls
- `/wiki status [repo-path] [status|product|system|board|graph]`
  - opens the developer-facing CodeWiki status panel with health, focus, next action, blockers, validation signal, automation-readiness summary, and source refs
- `/wiki resume [--new] [TASK-###] [repo-path] [-- follow-up intent]`
  - queues agent continuation from CodeWiki source refs and the last known stable task state
- `/wiki config [show|auto|pin|off|minimal|standard|full] [repo-path]`
  - opens interactive CodeWiki configuration with option lists and toggles
- `/wiki system [diagram-kind-or-name]`
  - opens source-backed system diagram navigation from `.codewiki/kb/system/diagrams/*.yaml`, with focused lanes, ordered steps, state transitions, tree views, source refs, and Markdown detail preview
- `/wiki product [overview|users]`
  - opens source-backed product navigation for the product overview and user documents, including user-story previews and source refs

Compatibility shims remain available during migration:

- `/audit [--file-structure|--security|--alignment|--horizontal-alignment|--source-contract|--package|--changed|--task TASK-###|--layer product,system|--json]`
- `/wiki-bootstrap [project name] [--force]`
- `/wiki-status [repo-path]`
- `/wiki-config [show|auto|pin|off|minimal|standard|full] [repo-path]`
- `/wiki-resume [--new] [TASK-###] [repo-path] [-- follow-up intent]`
- `/wiki-ui`
  - deprecated shim; use `/wiki status`, `/wiki resume`, `/wiki config`, and `/audit` instead

### Internal agent tools

#### Normal workflow tools

- `wiki_state`
- `wiki_decide`
- `wiki_plan`
- `wiki_implement`
- `wiki_gate`
- `wiki_runtime`

#### Compatibility/expert aliases

During migration the low-level primitives remain registered with compatibility/deprecation metadata: `wiki_setup`, `wiki_bootstrap`, `wiki_resume_context`, `wiki_artifact_status`, `wiki_audit`, `wiki_build`, `wiki_diff_table`, `wiki_gc`, `wiki_gateway`, `wiki_roadmap`, `wiki_session`, and `wiki_agency`. They are for wrapper parity, debugging, and old-agent compatibility, not the normal agent surface.

All internal `wiki_*` tools accept optional `repoPath` so agents can target a repo explicitly when Pi is running outside that repo. Day-to-day execution should center on the six normal workflow tools: `wiki_state` for state and source-backed continuation, `wiki_decide` for decisions and decision builds, `wiki_plan` for roadmap/sprint alignment and planning builds, `wiki_implement` for implementation evidence and implementation builds, `wiki_gate` for audits/preflight/validation, and `wiki_runtime` for leases, session focus, wait/wake, agency scheduling, context boundaries, and lifecycle/archive coordination. Runtime artifact status lives under `.codewiki/session/queue.json` as gitignored coordination input; the graph exposes derived holder/waiter/conflict views. VCC recall and Pi compaction are recovery/overflow fallbacks, not the default continuation model.

### Static analysis entrypoints

The `knip` metadata in `package.json` is intentionally part of the package maintenance contract. It tells PyLens/Knip-style review runs that these files are roots, not dead code:

- `src/index.ts` as the Pi extension and package facade
- `src/api/index.ts` and `src/api/tools.ts` as stable public API facades for adapters and scripts
- `src/build/index.ts` and `src/gateway/index.ts` as package-facing subsystem facades; validation gateway compatibility shims under `src/validation/**` do not own implementation behavior
- `scripts/*.mjs` as maintained CLI/script surfaces, including `scripts/codewiki-gateway.mjs`
- `tests/**/*.mjs` as the repository smoke and task regression suite


### Skills

- `/skill:codewiki`
- `/skill:codewiki-decision`
- `/skill:codewiki-planning`
- `/skill:codewiki-implementation`
- `/skill:codewiki-validation`

The main CodeWiki skill covers package invariants, bootstrap/status flow, sprint-aware routing, and loop selection. Focused compiler/gateway skills provide loop-specific guidance as they are split out:

- intelligent bootstrap/onboarding of a repo-local wiki
- sprint-aware routing for related executable cohorts without creating umbrella tasks
- tool catalog mapping normal `wiki_*` workflow tools to API/concept contracts, including `wiki_plan action="sprint"`
- skill-owned bootstrap/resume prompt templates consumed by source-owned command orchestration
- decision compiler guidance with semantic diff-table approval, KB edits, product/system propagation, and accepted `decision_build` handoffs
- planning compiler guidance for atomic roadmap tasks, `planning_build` evidence, validation, and implementation handoff
- implementation compiler guidance for one-task execution, TDD/test-design evidence, `implementation_build` before validation, and fresh validation handoff
- validation gateway guidance for build/task-close/drift/publication checks with no-mutation rules, audit refs, pass/fail/block semantics, and required proof
- research evidence that supports `.codewiki/kb`
- fresh-context task validation
- architecture review grounded in CodeWiki specs and roadmap tasks

## Simplified model

Codewiki now centers on a hidden `.codewiki` knowledge system plus derived graph state.

When maintaining this repository itself, `.codewiki/` is dogfood state, not package source code. Package source lives under `src/`, `skills/`, `scripts/`, `tests/`, and the root package files.

- **knowledge** — canonical markdown knowledge nodes under `.codewiki/kb/product/` and `.codewiki/kb/system/`
- **sources** — raw provenance under `.codewiki/sources/`
- **research** — optional compact source-support findings under `.codewiki/research/`
- **builds** — compiler handoff and implementation evidence under `.codewiki/builds/**`
- **validation** — hot fail/block/policy-required/current validation reports under `.codewiki/validation/**`
- **roadmap** — machine-managed tracked delta in `.codewiki/roadmap/queue.json`
- **task** — atomic work unit inside roadmap, canonically named `TASK-###`

Generated navigation and UI views are tool-owned:

- `.codewiki/index_graph.json` is the only generated graph/index read model
- `.codewiki/roadmap/tasks/**` holds generated task-local context shards
- top-level generated `wiki/**`, `.codewiki/roadmap/index.json`, and `.codewiki/roadmap/state.json` files are no longer emitted by default

View boundary rule: agents edit canonical truth and append evidence/events; views are rebuilt by tools only. Session mutation avoids view rebuilds, and task mutation can defer them with `refresh=false` when fresh views are not needed immediately.

Pi session linkage stays local and operational:

- Pi session JSONL remains Pi-owned
- codewiki appends custom session entries linking tasks to sessions
- current task focus is read live from Pi session state at runtime
- `.codewiki/index_graph.json` is the derived graph/index view compiled from knowledge, builds, validation, roadmap truth, and code/test metadata

Task identity:

- canonical task ids use `TASK-###`
- new appended tasks always use `TASK-###`
- legacy `ROADMAP-###` ids are not accepted by current runtime APIs

Working rule:

- `.codewiki/kb/` = canonical desired state
- `.codewiki/sources/` = raw provenance
- `.codewiki/research/` = optional compact source-support findings
- `.codewiki/builds/implementation/**` = implementation evidence
- `.codewiki/validation/**` = hot fail/block/policy-required/current validation reports
- `.codewiki/roadmap/queue.json` = machine-managed tracked delta and task ordering from desired state to current reality
- `.codewiki/session/queue.json` = gitignored runtime session queue for artifact availability, in-use, waiting, conflict, stale, holder, and waiter status
- task = atomic work unit inside roadmap
- Pi session = native execution history linked to tasks

Goal quality rule:

- foundational docs should define clear goals, success signals, non-goals, and verification expectations
- roadmap tasks should capture the same shape in machine-managed metadata so implementation, review, and closure can follow explicit intent instead of guesswork

## Install

This package is designed to work well as a **global Pi package**.

Why:

- Pi packages can be installed globally via `~/.pi/agent/settings.json`
- Pi project settings are cwd-scoped, so repo binding should live in repo-local wiki config, not package install location
- runtime operations can discover the nearest ancestor containing `.codewiki/config.json`
- when current cwd is outside a repo wiki, commands can accept an explicit repo path or offer a repo picker in UI mode
- one global install can operate across many repos

### Recommended: global install

From git:

```bash
pi install git:github.com/NunoMoura/codewiki
```

From npm:

```bash
pi install npm:codewiki
```

From a local checkout:

```bash
pi install /absolute/path/to/codewiki
```

### Optional: project-local install

If you want the package source pinned in one repo's `.pi/settings.json`, you can still use `-l`:

```bash
pi install -l /absolute/path/to/codewiki
```

After install, run `/reload` if the session was already open.

## Runtime prerequisites

CodeWiki rebuild runs through the packaged TypeScript engine. Runtime requires Node.js 20.6 or newer.

## Package entrypoint and build posture

CodeWiki is packaged for Pi first. Pi loads the extension and skills from the `pi.extensions` and `pi.skills` metadata in `package.json`; `src/index.ts` is the extension source entrypoint.

The package intentionally does not declare an npm `main` or `module` entrypoint. The source is TypeScript consumed by Pi's package loader, not a compiled JavaScript library API. Package-local integrations that need a stable facade should import through `src/api/index.ts` or `src/api/tools.ts` from source-aware tooling.

The package also intentionally does not add a build pipeline. Release readiness is checked with:

```bash
npm run typecheck
npm run test:smoke
npm run test:pack
```

`npm run test:pack` runs `npm pack --dry-run` so packaging drift is caught without publishing. The changelog baseline lives in `CHANGELOG.md`; version bumps, publish, push, and release work require explicit release approval.

## Quick start

### New repo

1. Install the package once with `pi install <package-source>`.
2. Open Pi in the repo root, or in a subdirectory if you want bootstrap to target the enclosing git repo.
3. Run:

```text
/wiki bootstrap My Project
```

4. Let the intelligent onboarding follow-up inspect repo shape, infer greenfield vs brownfield signals, and ask only a few high-value questions when needed.
5. Refine the starter docs until they match real ownership seams.
6. Use:

```text
/audit --file-structure
/wiki config
/wiki status
/wiki resume
```

### Existing repo

If the repo already has a compatible wiki contract, open Pi anywhere inside that wiki tree and use the operational commands.

If the repo needs the contract created first, run:

```text
/wiki bootstrap
```

from the repo root, or from a subdirectory if you want bootstrap to target the enclosing git repo.

Minimum expected contract:

```json
{
  "docs_root": ".codewiki/kb",
  "specs_root": ".codewiki/kb",
  "research_root": ".codewiki/research",
  "roadmap_path": ".codewiki/roadmap/queue.json",
    "roadmap_retention": {
    "closed_task_limit": 50,
    "archive_path": ".codewiki/roadmap/archive.jsonl",
    "compress_archive": false
  },
  "meta_root": ".codewiki"
}
```

The TypeScript rebuild engine updates at least:

- `.codewiki/index_graph.json`

Repos may opt into generated markdown exports by setting `index_path` or `roadmap_doc_path`, but the default contract does not create top-level `wiki/**` files.

## Recommended dogfooding workflow

When maintaining `codewiki` itself, use the package on its own repo.

Recommended loop:

1. Edit live docs or runtime code.
2. Run:

```text
/wiki-config
/wiki-config pin /home/nunoc/projects/codewiki
```

3. If status comes back yellow or red, inspect it through:

```text
/wiki-status
```

4. When roadmap work is ready to continue, run:

```text
/wiki-resume
```

5. Let the agent use internal roadmap/task tools when work maps to existing tasks or when unresolved delta should become a new task.

Working rule for this repo:

- edit canonical sources (`README.md`, knowledge docs under `.codewiki/kb/`, `.codewiki/roadmap/queue.json`, runtime code)
- rebuild generated outputs when fresh views are needed, not after every small canonical mutation
- do not hand-edit generated `.codewiki/index_graph.json`

## Why one extension and focused skills

### One extension

There is no real user value in splitting bootstrap and runtime operations into separate extensions.

One extension is simpler because:

- one package surface
- one reload target
- one place for commands and tools
- fewer moving parts for users
- easier community adoption

Internally, the code can still be modular. In this repo, bootstrap logic is implemented as helper modules behind one extension entrypoint.

### Focused skills

Skills are better than telling users to patch `AGENTS.md` for package behavior.

Why:

- skills are the native Pi mechanism for reusable, on-demand task instructions
- Pi keeps descriptions in context and loads full skill files only when needed
- the package can ship workflow guidance with the extension
- focused skills avoid one monolithic prompt while preserving shared CodeWiki invariants
- `AGENTS.md` is better for repo-specific local policy layered on top

Use `AGENTS.md` for project conventions. Use packaged skills for package behavior.

## How it works

### Bootstrap and onboarding

`/wiki bootstrap` is the canonical public onboarding entrypoint. The `/wiki-bootstrap` shim remains available for compatibility. Bootstrap safely adopts or scaffolds the repo-local wiki contract, reuses an existing ancestor wiki root when one is already present, and supports `--force` only when the user explicitly wants starter files overwritten.

Internally, agent tools may still use `wiki_setup` as a safe non-overwriting adopt step and `wiki_bootstrap` for explicit starter scaffolding.

Starter bootstrap includes:

- `.codewiki/config.json`
- `.codewiki/sources/`
- `.codewiki/research/`
- `.codewiki/kb/product/**`
- flat `.codewiki/kb/system/*.md` files
- `.codewiki/roadmap/queue.json`
- `.codewiki/roadmap/tasks/`
- generated `.codewiki/index_graph.json`

### Status, fix, and review

`/wiki-ui` is deprecated and returns a warning that points to Pi-hosted CodeWiki commands. Browser Control Room source is no longer the active product direction.

`/wiki status` opens the current compact status surface when custom UI is available and falls back to command output when it is not. The `/wiki-status` shim remains available for compatibility.

The always-on status summary is optional. When enabled it uses Pi's status area for a one-line summary instead of a tall above-editor dock. `/wiki-config` owns summary visibility, pinning, and panel density through an interactive settings panel.

`/wiki status` is the canonical compact inspection command. It opens the live status surface, shows roadmap and drift state, and is the right default when the next action is not yet obvious.

`/audit` is the deterministic evidence command. It runs the same source-owned audit engine used by gateways and tools; omit flags for the full audit, or select scoped profiles such as `--file-structure`, `--security`, `--alignment`, `--horizontal-alignment`, `--source-contract`, `--package`, `--changed`, `--task TASK-###`, and `--layer product,system`.

`/wiki config`, `/wiki status`, `/wiki resume`, and `/audit` all accept an optional repo path when relevant. If Pi is running outside a repo with `.codewiki/`, pass the target repo path explicitly. In UI mode, commands can also offer a repo picker when no repo-local wiki is found from current cwd.

`/wiki resume` is the implementation segue. With no argument it resumes the current focused roadmap task when one exists, otherwise it picks the next open task from the roadmap working set. Pass `TASK-###` to force a specific open task. Add `--new` only when policy needs a hard Pi replacement session; normal same-terminal context cleanup uses CodeWiki-owned compaction seeded by the same bounded resume packet.

`/wiki resume` runs inside the parent-owned task loop. Runtime status and resume output show the active task status plus latest structured evidence summary. Internal agent flows should read state through `wiki_state`, record task progress and implementation evidence through `wiki_implement`, manage roadmap lifecycle through `wiki_plan`, coordinate overlapping parallel work through `wiki_runtime`, and validate through `wiki_gate`.

For token efficiency, agents should avoid raw wiki truth, full lifecycle logs, chat-history archaeology, and all task shards as default context. Prefer compact `wiki_state` lenses, `/wiki resume`, CodeWiki-owned compaction, the current task context shard, or latest lifecycle events first; expand to targeted raw specs/code only when task status, gates, or stale revision requires exact source.

The Pi adapter customizes compaction after the agent loop ends. Loop-boundary tools such as `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_gate`, and task close/cancel request a soft context refresh after their visible result, while high context-window usage can trigger the same refresh automatically. The compaction summary is not chat-memory truth; it is a regenerated CodeWiki resume packet from graph, roadmap, task context, and recent build evidence.

### Status summary and panel

The extension renders an optional one-line status summary plus a compact status panel opened through `/wiki status`. These surfaces read `.codewiki/index_graph.json`, prefer the current repo under cwd, keep the most recently resolved wiki repo visible across global and new-session starts when cwd is elsewhere, can still fall back to a pinned repo, and support three panel densities:

- `minimal`
- `standard`
- `full`

Use `/wiki config` to open the interactive configuration panel. Direct args like `/wiki-config pin /path/to/repo` remain available as fallback for scripting or non-UI flows.

### Runtime operations

Per Pi's settings model, project settings are loaded from `<cwd>/.pi/settings.json`, while packages can also be installed globally. codewiki therefore binds runtime to repo-local wiki config, not to Pi install location.

Runtime rule:

- first resolve the nearest ancestor containing `.codewiki/config.json` from current cwd
- if no repo-local wiki exists from current cwd, `/wiki-status`, `/wiki-config`, and `/wiki-resume` may target an explicit repo path instead
- in UI mode, those commands may offer a picker across candidate repos discovered below current cwd
- summary visibility and pinned-repo fallback are user-owned UI preferences, not repo-owned wiki files
- if no wiki exists yet, `/wiki bootstrap` targets the enclosing git repo root when present, else the current working directory

It then uses that repo config to:

- find authored docs, source/research support, roadmap, and optional generated markdown export paths
- run the packaged TypeScript rebuild engine
- read `.codewiki/index_graph.json`
- build semantic audit scopes from `.codewiki/config.json`
- append structured roadmap tasks to `.codewiki/roadmap/queue.json` when audits uncover real unresolved delta
- update or close existing roadmap tasks through package-native mutation tools instead of manual JSON edits
- append Pi custom session entries that link current session to roadmap tasks
- read active task context from Pi session state at runtime
- maintain `.codewiki/index_graph.json` so the first-party summary/panel surfaces and any future third-party UI can read compact views without mutating canonical files

That means one global package install can operate across many repos, while each repo keeps its own hidden `.codewiki/` contract.

### Runtime policy and patches

codewiki's local gateway is a transitional adapter, not the long-term generic sandbox. The intended split is:

- `.codewiki/config.json` declares codewiki policy: readable paths, direct writable paths, generated read-only paths, caps, and runtime adapter metadata.
- source-owned CodeWiki application APIs validate and apply codewiki patches; `scripts/codewiki-gateway.mjs` is an optional local wrapper that can print the semantic capability manifest with `node scripts/codewiki-gateway.mjs manifest [repo]`. It refuses runtime `npx` fallbacks and gates local JavaScript execution behind explicit `CODEWIKI_ALLOW_UNSAFE_RUN=1 ... unsafe-run`; prefer think-code for sandboxed analysis.
- a future `think-code` executor can provide generic sandbox isolation while reusing the same repo-local policy, capability manifest, and patch schema.

Current patch shape:

```json
{
  "version": 1,
  "summary": "Update CodeWiki source support.",
  "ops": [
    {
      "kind": "patch",
      "path": ".codewiki/kb/system/overview.md",
      "oldText": "old exact text",
      "newText": "new exact text"
    },
    {
      "kind": "append_jsonl",
      "path": ".codewiki/sources/runtime.jsonl",
      "value": { "summary": "Source support entry" }
    }
  ]
}
```

The gateway applies only validated writes under configured `.codewiki` paths and rebuilds views after successful writes. Generated files such as `.codewiki/index_graph.json` are read-only patch targets.

## Philosophy

This package assumes:

- `.codewiki/kb/` is canonical truth for intended product, clients, and system design
- `.codewiki/evidence/**` is deprecated as a default active surface; use implementation builds, hot validation reports, sources, or research roots instead
- `.codewiki/roadmap/queue.json` is freshest tracked delta between authored docs and code, kept as a hot working set rather than unbounded history
- closed tasks older than the configured retention window move losslessly to `.codewiki/roadmap/archive.jsonl` by default
- Pi sessions are execution history, not canonical roadmap truth
- history defaults to git for full diffs and optional canonical archive artifacts; package does not generate a raw event log by default
- code is implementation evidence
- generated views replace top-level markdown index exports by default
- machine metadata stays hidden under `.codewiki/`
- plans and drift are better modeled as roadmap tasks than as separate top-level doc buckets
- archive clearing is explicit only; normal compaction never deletes archived closed-task snapshots

## Repo layout

```text
src/
  index.ts
  mutation-queue.ts
  project/
    bootstrap.ts
    context.ts
    root.ts
    templates.ts
    local/
  domain/
    shared/
  application/
    graph/
    knowledge/
    local/
    tools/
  adapters/
    pi/
  ui/
    web/
skills/
  codewiki/
    SKILL.md
    playbooks/
      architecture.md
      research.md
      view-audit.md
    references/
      tool-catalog.md
  codewiki-decision/
    SKILL.md
    references/
      tools.md
  codewiki-planning/
    SKILL.md
    references/
      tools.md
  codewiki-implementation/
    SKILL.md
    references/
      tools.md
  codewiki-validation/
    SKILL.md
    references/
      tools.md
tests/
  smoke/
    package-smoke.test.mjs
  run.mjs
scripts/
  check-architecture.mjs
  codewiki-gateway.mjs
  token-benchmark.mjs
.codewiki/        # dogfood state for this repo, not package source
LICENSE
README.md
package.json
```

## Development

Install this repo globally while developing:

```bash
pi install /absolute/path/to/codewiki
```

Or install it project-locally if you want this repo alone to pin the package source:

```bash
pi install -l /absolute/path/to/codewiki
```

Type-check the package with the project-local TypeScript compiler:

```bash
npm run typecheck
```

Smoke-test the package locally:

```bash
npm test
```

That runs:

- a package manifest check
- a `DefaultResourceLoader` package-load smoke test
- a starter wiki bootstrap + rebuild smoke test
- an `npm pack --dry-run` tarball validation

Measure approximate token expenditure for the current wiki:

```bash
npm run benchmark:tokens
npm run benchmark:tokens -- --json
```

The benchmark compares raw wiki truth, raw implementation/verification lifecycle artifacts, generated views, task context shards, and a synthetic compact agent-default packet. Use it to keep optimizing normal agent paths toward lower context usage without requiring users to define explicit token budgets.

If `pi-coding-agent` is not installed in a standard local/global location, set:

```bash
PI_CODING_AGENT_ROOT=/absolute/path/to/@earendil-works/pi-coding-agent npm test
```

## License

MIT
