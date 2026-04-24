---
id: roadmap.live
title: Roadmap
state: active
summary: Numbered, trackable delta tasks for codewiki.
owners:
- engineering
updated: '2026-04-24'
---

# Roadmap

Generated: 2026-04-24T03:05:08Z

Canonical source: [roadmap.json](../.wiki/roadmap.json)

Roadmap is freshest representation of gap between desired state in authored docs and current implementation reality.

## In progress

### TASK-020 — Refactor status panel around Wiki, Roadmap, Agents, and Channels

- Status: in_progress
- Priority: high
- Kind: architecture
- Summary: Refactor the status panel into a minimal control room with circle-only health, a repo-only header, wiki grouped as Product/System/Clients, a kanban-style roadmap by phase gate, named agents, a minimal channels list, and footer-only ambient summary while keeping authored `wiki/ux` on disk for now.
- Specs:
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
- Labels: status, wiki-status, panel-first, info-architecture, pi-tui
- Goal: Status becomes one minimal-header control room where `/wiki-status` and `Alt+W` open the same panel, the header shows only repo and a circle health indicator, `Wiki` groups authored truth into Product, System, and Clients buckets, `Roadmap` renders a kanban board that uses the same task progression model users understand (`Todo`, `Research`, `Implement`, `Verify`, `Done`), `Agents` shows stable agent names with current tasks, `Channels` stays minimal, and the optional summary remains in the Pi footer only while `/wiki-config` stays separate.
- Success signals:
  - The status panel header shows only repo name or switcher plus a circle health indicator; health words and colorized prose are not used in panel body text.
  - The `Wiki` tab groups rows into Product, System, and Clients sections, shows all relevant authored docs within each bucket, and uses circle indicators plus gray drift notes without spelling out color names.
  - The `Roadmap` tab renders a kanban-style board organized around `Todo`, `Research`, `Implement`, `Verify`, and `Done`, with task cards showing title, low-emphasis task id, assigned agent name when known, and blocker state via the traffic-light system only.
  - The `Agents` tab shows stable generated agent names with current task title and low-emphasis task id rather than raw session identifiers.
  - The `Channels` tab only shows an add-channel affordance plus the list of already added channels, while `/wiki-config` remains a separate command instead of panel-owned configuration.
- Non-goals:
  - Rename the authored `wiki/ux` folder in the same task.
  - Implement full third-party messaging integrations in the same task.
- Verification:
  - Run npm test after reshaping the status read model, panel rendering, command wiring, and footer summary behavior.
  - Dogfood `/wiki-status`, `Alt+W`, and `/wiki-config` in the package repo and confirm the kanban roadmap plus Product/System/Clients wiki grouping explain status more clearly than the previous list-based panel.
- Desired: Codewiki exposes one status control room whose information architecture is organized around Product/System/Clients wiki truth, named agent ownership, minimal channels, and one unified roadmap task progression model that users can read directly from the board.
- Current: Status now mostly matches the panel contract, but the roadmap still reflects the earlier review/close-candidate gate model rather than the unified Todo/Research/Implement/Verify/Done progression the user wants to read directly from task cards and task status.
- Closure: Close after the generated state, panel rendering, footer summary, and `/wiki-config` wiring all match the minimal header, grouped wiki, unified kanban roadmap progression, named agents, and minimal channels contract and pass live dogfooding.

### TASK-025 — Add proposal-to-roadmap promotion and causality-preserving dedupe

- Status: in_progress
- Priority: high
- Kind: agent-workflow
- Summary: Add proposal-to-roadmap promotion and causality-preserving dedupe so same-user parallel Pi sessions can work in one repo without duplicate tasks, visible collisions, or any user-facing need to manage internal roadmap mutation tools.
- Specs:
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
- Labels: roadmap, dedupe, causality, automation
- Goal: Users can open multiple Pi sessions on one repo and rely on the agent to coordinate roadmap/task intent automatically without being told to use internal tools.
- Success signals:
  - When new work overlaps existing roadmap delta, agent-side mutation flow updates, reopens, links, or merges existing tasks automatically instead of asking the user to choose internal roadmap tools.
  - User-facing notifications and status surfaces describe coordinated outcome in plain workflow terms, not internal tool names.
  - Same-user parallel session signals help the agent avoid duplicate task creation and reduce silent task-focus collisions.
- Non-goals:
  - Expose internal codewiki roadmap tools as part of user workflow.
  - Require users to manually arbitrate duplicate roadmap tasks across their own sessions.
- Verification:
  - Run npm test after replacing duplicate-append rejection with agent-side coordination behavior.
  - Validate same-user parallel sessions can converge on one roadmap without user-visible internal-tool instructions.
- Desired: Parallel Pi sessions should feel collision-safe by default because the agent coordinates existing-task reuse and roadmap mutation internally, while user-facing feedback stays simple and workflow-oriented.
- Current: The internal tool surface is now collapsed behind codewiki_state/codewiki_task/codewiki_session, but same-user parallel-session convergence and duplicate-intent coordination still need stronger automation and clearer collision handling.
- Closure: Close after duplicate roadmap intent is coordinated internally by agent-side flow and user-facing behavior stays simple even under same-user parallel session overlap.

### TASK-026 — Build a task todo-research-implement-verify-done loop with evidence gates

- Status: in_progress
- Priority: high
- Kind: agent-workflow
- Summary: Strengthen task execution so roadmap tasks move through one parent-owned `todo -> research -> implement -> verify -> done` progression with structured evidence, low-friction phase drivers, and blocked state treated as a card signal rather than a separate board column.
- Specs:
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - skills/codewiki/SKILL.md
  - README.md
- Labels: tasks, review, testing, closure
- Goal: Focused roadmap tasks use one clear progression model that humans and agents both understand: `todo`, `research`, `implement`, `verify`, and `done`, with `blocked` represented as task evidence or card state rather than a competing main phase.
- Success signals:
  - A task can start at `todo`, move into `research`, then `implement`, then `verify`, and finally `done` without requiring a separate hidden review or close-candidate phase.
  - Runtime phase handling is compartmentalized enough that research, implement, and verify behavior can evolve independently without rewriting the whole loop.
  - Structured evidence still records what changed, which checks ran, and why verification passed, failed, or blocked.
  - Failure or blocked outcomes send the task back to the right actionable state without silently closing it or forcing users to reason about a second parallel status model.
- Non-goals:
  - Adopt external verification packages as a hard dependency in this task.
  - Build a generic multi-agent framework or expose worker roles as a new user-facing workflow.
  - Let child execution directly mutate roadmap truth or close tasks without parent coordination.
- Verification:
  - Run npm test after replacing the review/close-candidate loop with the unified todo-research-implement-verify-done progression.
  - Extend smoke coverage to exercise research start, implement pass, verify pass-to-done, and blocked verification evidence.
  - Dogfood one roadmap task through todo, research, implement, verify, and done with status or resume output showing the active state clearly.
- Desired: Focused tasks drive a repeatable parent-owned loop that first gathers task context, then implements required delta, then verifies it, and finally lands in done with structured evidence — all using one progression model shared by task status and the roadmap board.
- Current: Runtime and generated read models still carry the earlier implement/review/verify/close-candidate gate model, which now conflicts with the desired unified todo-research-implement-verify-done task progression.
- Closure: Close after runtime logic, generated state, tests, and live dogfooding all reflect the unified loop and evidence-backed done transition cleanly.

## Todo

### TASK-028 — Add git-backed revision correlation and freshness tracking across wiki state

- Status: todo
- Priority: high
- Kind: architecture
- Summary: Deepen codewiki integration with git by anchoring heartbeat, evidence, status, and task state to commits plus authored-spec digests so drift and resume logic can detect stale intent safely.
- Specs:
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - README.md
- Labels: git, versioning, freshness, correlation, digests
- Desired: Heartbeat, evidence, status, and roadmap/task read models carry git commit anchors plus semantic spec digests so codewiki can correlate intent changes, invalidate stale analysis, and resume work with confidence.
- Current: codewiki tracks authored intent and roadmap state, but it does not yet anchor drift analysis and resume logic to git history or explicit spec revisions.
- Closure: Close after the runtime and read models expose git-backed freshness signals, spec/task revision anchors, and deterministic stale-state guidance for heartbeat and resume flows.

### TASK-029 — Add agent execution visibility to status read model and panel

- Status: todo
- Priority: high
- Kind: architecture
- Summary: Expose who is doing what and when by deriving named agent execution rows with task ownership, mode, status, last action, and constraints into the status panel and roadmap cards.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
- Labels: agents, status, sessions, coordination
- Goal: Users can open the `Agents` tab or the roadmap kanban and immediately understand which named agent owns which task, how that work is being executed, and what constraints or triggers are shaping it.
- Success signals:
  - The status read model emits stable generated agent names instead of raw session ids as the primary label, while still retaining session linkage internally when needed.
  - The `Agents` tab shows rows like `Otter | Improve status panel - TASK-020`, with the task title emphasized more than the task id.
  - Roadmap task cards can show the assigned agent name when known without expanding into raw session metadata.
  - Users can tell whether work is active, blocked, idle, waiting for review, or complete without inspecting raw Pi session history.
- Non-goals:
  - Build a generic multi-agent framework detached from roadmap truth.
  - Expose raw Pi session JSON as the primary user-facing agents surface.
- Verification:
  - Run npm test after adding agent execution rows to generated status state and panel rendering.
  - Dogfood the `Agents` tab in the package repo with at least one active manual session and confirm ownership is legible.
- Desired: Status surfaces make execution ownership explicit through stable agent identity so users can see who is doing what without reading session ids.
- Current: codewiki already tracks task focus and parallel-session facts, but it still surfaces execution through session-like labels rather than user-friendly named agents tied to tasks.
- Closure: Close after generated state and panel rendering expose named agents clearly in both the `Agents` tab and roadmap cards.

### TASK-030 — Define pluggable channel routing for agent communications

- Status: todo
- Priority: medium
- Kind: architecture
- Summary: Define a pluggable channels contract while keeping the first `Channels` tab minimal: add-channel affordance plus the list of already added channels.
- Specs:
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - README.md
- Labels: channels, status, communications, pluggable
- Goal: Users can understand which channels already exist and add new ones later without mixing personal delivery secrets into repo-owned wiki state.
- Success signals:
  - The first `Channels` tab only needs an add-channel affordance plus the list of already added channels.
  - Channel routing metadata distinguishes repo-owned status from user-owned targets, credentials, and personal delivery preferences.
  - The channel model remains pluggable so new transports can be added later without changing roadmap or task truth semantics.
- Non-goals:
  - Ship production integrations for every external transport in the first pass.
  - Store private channel credentials inside repo-owned wiki files.
- Verification:
  - Run npm test after introducing the channel read-model shape and panel rendering.
  - Dogfood the `Channels` tab with the built-in panel or footer channel plus at least one configurable placeholder transport.
- Desired: Users can see existing communication routes and grow new delivery transports later through one stable channel model.
- Current: codewiki currently communicates through Pi surfaces only and does not yet expose a minimal first-class channels list with an add affordance.
- Closure: Close after the status contract, generated state, and panel rendering expose a minimal add-plus-list channels surface that future transports can plug into.

### TASK-031 — Rename UX pillar to Clients in authored wiki taxonomy

- Status: todo
- Priority: medium
- Kind: migration
- Summary: Track the deferred authored taxonomy rename so status surfaces can say Clients now while the on-disk authored pillar remains `wiki/ux` until a later migration.
- Specs:
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
- Labels: clients-pillar
- Goal: codewiki can eventually rename the authored `wiki/ux` pillar to `wiki/clients` with a deliberate migration path.
- Success signals:
  - The future migration updates authored docs, templates, and package docs to `clients`.
  - Existing repos using `wiki/ux` have a compatibility or migration path.
  - Display-only translation from `UX` to `Clients` is no longer needed after the migration.
- Non-goals:
  - Perform the full authored-folder rename before the client taxonomy is settled.
- Verification:
  - Dogfood the migration in the package repo or a sandbox repo before closing the task.
- Desired: The authored wiki taxonomy names the client layer directly instead of overloading `ux`.
- Current: Panel and status language can move to `Clients` now, but the authored pillar still lives at `wiki/ux`.
- Closure: Close after authored taxonomy, templates, and migration handling support `wiki/clients` cleanly.

## Blocked

_None._

## Done

### TASK-001 — Finish simplified research/specs/roadmap refactor

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Replace legacy top-level taxonomy with simplified contract across templates, runtime prompts, README, and package docs.
- Specs:
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/templates.ts
  - extensions/codewiki/index.ts
  - README.md
  - skills/codewiki/SKILL.md
- Evidence: RES-001, RES-002
- Labels: refactor, v2
- Desired: Package ships one clear model: research evidence, spec truth, roadmap delta.
- Current: Starter templates, runtime prompts, package docs, and self-wiki now use research/specs/roadmap as canonical model.
- Closure: Done for current package contract. Future roadmap work continues on automation, brownfield mapping, and history strategy.

### TASK-002 — Generate brownfield spec hierarchy from repo structure

- Status: done
- Priority: high
- Kind: bootstrap
- Summary: Setup/bootstrap now infer first-pass boundary specs from meaningful repo structure so brownfield repos start closer to real ownership seams.
- Specs:
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/templates.ts
  - scripts/smoke-test.mjs
- Evidence: RES-001, RES-002
- Labels: brownfield, bootstrap
- Desired: Existing repos get useful boundary-shaped specs on first pass.
- Current: Setup/bootstrap now infer first-pass boundary specs and brownfield drift scopes from repo structure before humans refine the docs.
- Closure: Done for first-pass ownership inference. Future work can improve deeper heuristics for repos whose real seams only appear below top-level boundaries.

### TASK-003 — Emit roadmap-ready tasks from drift audits

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Self-drift and code-drift flows should output roadmap task objects so unresolved deltas can be promoted with minimal manual rewriting.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - skills/codewiki/SKILL.md
  - scripts/smoke-test.mjs
- Evidence: RES-001
- Labels: roadmap, automation
- Desired: Audit output converts directly into `.wiki/roadmap.json` task entries.
- Current: Drift prompts now instruct roadmap task-object emission and package tool appends structured tasks with automatic TASK ids and rebuild.
- Closure: Done for append-new-task flow. Future work can add update/close mutation support for existing roadmap tasks.

### TASK-004 — Decide compact history strategy after archive deprecation

- Status: done
- Priority: medium
- Kind: process
- Summary: Need explicit answer for how historical docs changes are preserved once archive is no longer default top-level bucket.
- Specs:
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/templates.ts
- Labels: history, archive
- Desired: History stays cheap and accessible without reviving bulky archive docs.
- Current: Package now explicitly documents git for full diffs, `.wiki/events.jsonl` for compact lifecycle events, and `.wiki/roadmap-events.jsonl` for roadmap mutation history.
- Closure: Done by deciding against a separate compact-history artifact by default and documenting lightweight history expectations in shared/template/package docs.

### TASK-005 — Support roadmap update and close mutations

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: After append flow, package should let agents update or close existing roadmap tasks without manual roadmap JSON editing.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/index.ts
- Labels: roadmap, automation, follow-up
- Desired: Agents can append, update, and close roadmap tasks through package-native workflow.
- Current: Runtime now supports append plus mutation of existing task ids through codewiki_roadmap_update with automatic rebuilds.
- Closure: Done via codewiki_roadmap_update, mutation history/events logging, and smoke coverage for closing an appended task.

### TASK-006 — Link Pi sessions to roadmap tasks

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Keep Pi session JSONL native, append custom task-link entries, and read active task focus directly from Pi session state instead of maintaining repo-owned session caches.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - skills/codewiki/SKILL.md
  - README.md
- Labels: sessions, roadmap, pi
- Desired: Task work can be resumed across Pi sessions without replacing Pi session JSONL format.
- Current: Extension now appends Pi custom task-link entries, resolves current task focus from the live Pi session branch, and no longer maintains a repo-owned task-session index file.
- Closure: Done for native Pi session linkage and runtime focus overlay. Future work can add richer historical analytics if needed, but session truth stays in Pi sessions.

### TASK-007 — Expand smoke coverage for full public command surface

- Status: done
- Priority: medium
- Kind: testing
- Summary: Smoke tests should fail if any documented public command disappears from the packaged extension.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
- Code:
  - scripts/smoke-test.mjs
- Labels: testing, dogfood, public-surface
- Desired: Packaged smoke checks cover the documented command surface closely enough to catch accidental public API drift.
- Current: Smoke tests now assert every documented command and tool name, and they exercise setup/bootstrap, roadmap append, session-link, and inferred brownfield starter behavior.
- Closure: Done for current public surface. Extend the assertions whenever new commands or tools are added.

### TASK-008 — Support global install with cwd-based wiki discovery

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Extension runtime should load from a global Pi package install while discovering the active repo-local wiki from current cwd.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
- Code:
  - extensions/codewiki/project-root.ts
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codewiki/SKILL.md
- Labels: pi, install, discovery
- Desired: One global package install should work across many repos while runtime state stays repo-local.
- Current: Runtime now discovers the nearest ancestor with `.wiki/config.json`, setup/bootstrap fall back to enclosing git repo root when no wiki exists yet, and nested-cwd smoke coverage protects the model.
- Closure: Done for the global-install plus repo-local discovery architecture adopted in this package.

### TASK-009 — Prototype roadmap browsing interactions for Pi

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: Extension delivered roadmap-browsing groundwork that validated task inspection flows before the public UX was later consolidated into fewer commands.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codewiki/SKILL.md
- Labels: roadmap, tui, pi
- Desired: Users should be able to inspect live roadmap/task state without leaving Pi or manually opening wiki/roadmap.md in another tool.
- Current: The roadmap browser work validated task inspection and task-detail rendering, and that groundwork now informs the simpler consolidated UX.
- Closure: Done for the initial browsing prototype. Future work can surface roadmap/task navigation again if it materially improves the simpler command model.

### TASK-010 — Consolidate public UX into four intelligent wiki commands

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Refactor the public command surface down to /wiki-bootstrap, /wiki-status, /wiki-fix, and /wiki-review while keeping roadmap/task/session internals and granular tools behind the scenes.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
- Code:
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codewiki/SKILL.md
- Labels: ux, commands, agent-workflow
- Desired: Users should only need four strong commands, while Pi still uses internal roadmap/task/session primitives and tools behind the scenes.
- Current: The extension now exposes a four-command public UX, /wiki-bootstrap queues intelligent onboarding, /wiki-status queues evidence-backed health review, /wiki-fix queues corrective work, and /wiki-review queues senior idea/architecture analysis.
- Closure: Done for the first simplified public UX pass. Future work can refine prompts, heuristics, and TUI presentation without re-expanding the command surface.

### TASK-011 — Add roadmap-state read model and first-party roadmap widget

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Generate a read-only roadmap-state UI model and render a compact first-party roadmap widget so users can track focused, in-progress, and next tasks inside Pi without expanding the public command surface or persisting session caches.
- Specs:
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - README.md
- Labels: roadmap, tui, ux
- Desired: Roadmap progress should be readable inside Pi through a compact working-set widget and a stable read-only UI state file that other extensions can consume.
- Current: The extension now generates .wiki/roadmap-state.json as roadmap/task UI state, overlays live current-session focus from Pi at runtime, and keeps default roadmap presentation focused on active, in-progress, and next tasks instead of dumping the full roadmap.
- Closure: Done for the production roadmap TUI pass with runtime session overlay. Future work can add deeper drill-down interactions on top of the same read contract without changing canonical storage or the four-command public UX.

### TASK-012 — Rename package surface from codebase-wiki to codewiki

- Status: done
- Priority: high
- Kind: migration
- Summary: Rename package, extension, skill, tool, repo, and runtime identifiers from codebase-wiki/codebase_wiki to codewiki.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
- Code:
  - package.json
  - extensions/codewiki/index.ts
  - extensions/codewiki/bootstrap.ts
  - skills/codewiki/SKILL.md
  - scripts/smoke-test.mjs
  - README.md
- Labels: rename, package-surface, migration
- Desired: Public package surface uses one short canonical name: codewiki.
- Current: Package, repo, tool, skill, and runtime identifiers now use codewiki consistently.
- Closure: Done by renaming package metadata, extension/skill dirs, tool ids, widget keys, smoke tests, docs, and git remote references.

### TASK-013 — Review codewiki skill and global AGENTS alignment

- Status: done
- Priority: medium
- Kind: docs
- Summary: Review codewiki skill guidance and global AGENTS overlay against the Karpathy-style baseline and align naming around codewiki.
- Specs:
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - skills/codewiki/SKILL.md
  - README.md
- Labels: agents, skill, docs
- Desired: Skill and global agent overlay stay concise, consistent, and aligned with the renamed codewiki workflow.
- Current: Repo skill now uses codewiki naming, while global AGENTS was reviewed against the Karpathy-inspired baseline and renamed from codebase-wiki references to codewiki.
- Closure: Done for naming/alignment review; remaining `.wiki` migration work is tracked separately.

### TASK-014 — Support self-dogfood migration to wiki and .wiki

- Status: done
- Priority: high
- Kind: migration
- Summary: Let codewiki discover and operate a self-hosted repo using wiki/.wiki so this repo can dogfood the agreed structure.
- Specs:
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
- Code:
  - extensions/codewiki/project-root.ts
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/index.ts
  - extensions/codewiki/templates.ts
  - scripts/smoke-test.mjs
- Labels: dogfood, wiki-root, migration
- Desired: Codewiki can discover and operate repo-local wikis under wiki/.wiki so this package can dogfood its own agreed structure.
- Current: Runtime now discovers `.wiki/config.json` first with legacy `.docs/config.json` fallback, starter templates default to wiki/.wiki, and this repo itself now runs from wiki/.wiki.
- Closure: Done by adding dual-path config discovery, switching starter defaults to wiki/.wiki, migrating this repo from docs/.docs to wiki/.wiki, and extending smoke coverage for the new structure.

### TASK-015 — Add wiki-code implementation resume command

- Status: done
- Priority: medium
- Kind: agent-workflow
- Summary: Expose a user-facing wiki-code command that resumes the focused roadmap task or picks the next open task and queues implementation work.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - skills/codewiki/SKILL.md
  - README.md
- Labels: commands, roadmap, implementation
- Desired: Users can jump back into roadmap-driven implementation with one command while wiki mutations remain automatic behind agent intent.
- Current: The extension now exposes /wiki-code, which resumes the current focused task or picks the next open task, links session focus, and queues implementation from roadmap/spec truth.
- Closure: Done by adding /wiki-code, documenting the five-command public UX, and covering resume behavior in smoke tests.

### TASK-016 — Add explicit repo targeting and fallback project picker for wiki commands

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Let global wiki commands accept an explicit repo path, offer a project picker when cwd has no wiki, and explain global-vs-local targeting clearly in command errors.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
- Code:
  - extensions/codewiki/project-root.ts
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
- Labels: global-install, targeting, ux
- Desired: Wiki commands stay globally available in Pi while safely targeting either nearest repo-local wiki from cwd or an explicitly chosen repo.
- Current: Status, fix, review, and code commands now accept explicit repo paths, discover candidate repos below current cwd for UI picker fallback, and report clearer global-vs-local targeting guidance when no wiki is found.
- Closure: Done by adding explicit path parsing for public commands, repo discovery + picker fallback, clearer missing-target errors, smoke coverage for path/picker/error behavior, and matching docs/spec updates.

### TASK-017 — Add explicit repo targeting to internal codewiki tools

- Status: done
- Priority: high
- Kind: agent-workflow
- Summary: Let internal codewiki tools accept explicit repo paths so global installs work cleanly for tool-driven mutations outside repo cwd.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
- Code:
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
- Labels: global-install, tools, targeting
- Desired: Internal codewiki tools can target the intended repo explicitly even when Pi is running from outside that repo.
- Current: Setup, bootstrap, rebuild, status, roadmap append/update, and task-session link now accept optional repoPath and smoke coverage verifies explicit cross-cwd targeting.
- Closure: Done by adding optional repoPath fields to internal tool schemas, resolving target repos from repoPath when provided, documenting the behavior, and extending smoke tests across explicit tool targeting flows.

### TASK-018 — Design and implement status dock v1

- Status: done
- Priority: critical
- Kind: agent-workflow
- Summary: Replace the flat wiki-status experience with a status-state read model and a unified persistent dock that highlights spec drift, roadmap coverage, and next action at a glance.
- Specs:
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/system/templates/overview.md](../.wiki/knowledge/system/templates/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - README.md
- Labels: status-dock, ux, drift, roadmap
- Desired: Codewiki exposes one primary status dock UX backed by a reusable status read model, with compact bars, spec drift rows, roadmap coverage, persistent dock configuration, and a clear next step.
- Current: Codewiki now generates `.wiki/status-state.json`, renders one persistent status dock above the editor, lets `/wiki-status` act as expanded inspector plus dock control surface, and shows drift/roadmap/next-step data from one shared read model.
- Closure: Done by drafting Status Dock v1 spec, generating status-state during rebuild, replacing the old roadmap-only widget with the persistent status dock, adding dock auto|pin|off|minimal|standard|full controls, updating docs/templates, and extending smoke coverage for the new UX.

### TASK-019 — Keep status dock visible across new global sessions and replace wiki-status follow-up with roadmap next task

- Status: done
- Priority: high
- Kind: ux
- Summary: Keep the status dock visible across global/new-session fallback and make /wiki-status surface the next roadmap task directly in deterministic output.
- Specs:
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - README.md
- Labels: status-dock, wiki-status, ux
- Desired: The dock remains visible at session start by resolving a usable repo context even from global cwd, and /wiki-status returns deterministic roadmap-next-task guidance without relying on a queued agent follow-up.
- Current: The dock now remembers the most recently resolved repo for auto-mode fallback outside repo cwd, and /wiki-status shows the next roadmap task directly without semantic follow-up queuing.
- Closure: Added last-resolved repo persistence for dock fallback, removed /wiki-status follow-up queuing, surfaced roadmap-task output in status text, updated docs/specs, rebuilt wiki metadata, and passed npm test.

### TASK-021 — Migrate codewiki to a .wiki-only knowledge contract

- Status: done
- Priority: critical
- Kind: migration
- Summary: Complete the .wiki-only migration closure by removing remaining registry/backlinks compatibility artifacts, cleaning stale generated outputs, and verifying the live repo runs cleanly on the graph-first derived contract.
- Specs:
  - [README.md](../README.md)
- Code:
  - extensions/codewiki/index.ts
  - extensions/codewiki/bootstrap.ts
  - extensions/codewiki/templates.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
  - skills/codewiki/SKILL.md
  - .wiki
- Evidence: RES-001, RES-002
- Labels: migration, dogfood, .wiki-only, graph, cleanup
- Goal: codewiki dogfoods a .wiki-only canonical knowledge base with hidden markdown knowledge nodes, a goal-first roadmap, portable events, and derived UI views, while stale public wiki outputs and deprecated compatibility code are removed once migration is complete.
- Success signals:
  - Canonical repo truth lives under .wiki/knowledge, .wiki/sources, .wiki/evidence, .wiki/roadmap.json, and .wiki/events.jsonl.
  - Rebuild/runtime can read the new contract, produce derived graph/views, and drive the TUI without requiring wiki/index.md or wiki/roadmap.md as canonical inputs.
  - codewiki repo content is migrated to the new contract and dogfoods it successfully.
  - README, starter templates, and skill guidance teach the new .wiki-only model and read-open/write-gated agent workflow.
  - Migration cleanup removes stale or deprecated code paths, config fields, docs, and generated artifacts that only served the old wiki/** contract.
- Non-goals:
  - Designing every future third-party export format in this task.
  - Building a heavy visual graph UI before the new contract is stable.
- Verification:
  - Run npm test after runtime/template/rebuild migration.
  - Dogfood status/startup/resume behavior against the migrated codewiki repo and confirm the TUI reads from derived .wiki views.
  - Audit repo for leftover wiki/**-canonical assumptions and remove or downgrade them only if still needed for temporary migration compatibility.
- Desired: codewiki dogfoods a .wiki-only canonical knowledge base with hidden markdown knowledge nodes, a goal-first roadmap, portable events, and derived UI views, while stale public wiki outputs and deprecated compatibility code are removed once migration is complete.
- Current: codewiki now runs on .wiki-only canonical knowledge and graph-first derived views. Runtime/templates/bootstrap/config/docs no longer depend on registry/backlinks compatibility artifacts, stale files were removed, and remaining legacy wiki/product|ux path checks are intentionally isolated read-compat for old repo classification only.
- Closure: Closed after removing registry/backlinks from live contract, starter template, bootstrap output expectations, repo config, and docs; deleting stale derived files; verifying rebuild/test pass; and isolating the only remaining old-path logic to narrow legacy-read compatibility instead of canonical truth.

### TASK-022 — Make goal quality first-class across foundational docs and task metadata

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Made goal quality first-class across foundational docs, starter templates, roadmap task metadata, generated views, and smoke coverage.
- Specs:
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/templates.ts
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - README.md
- Labels: goals, intent, verification, foundations
- Desired: Foundational docs and generated task scaffolding capture sharp goals, success criteria, non-goals, and verification expectations that agents can reuse without guessing intent.
- Current: Foundational docs, starter templates, roadmap task schema, generated roadmap/read-model outputs, and smoke coverage now carry structured goal metadata for outcome, success signals, non-goals, and verification.
- Closure: Closed after adding first-class task goal metadata to extension/runtime schemas, roadmap rendering/read models, starter templates, README guidance, and smoke coverage while keeping legacy tasks backward-compatible.

### TASK-023 — Add multi-cadence heartbeat drift analysis across product, system, UX, and code

- Status: done
- Priority: critical
- Kind: architecture
- Summary: Refined heartbeat lanes so freshness is modeled as work-first: each lane now advertises causal work triggers, fallback max-age protection, and work-based stale reasons surfaced in generated status state and runtime status views.
- Specs:
  - [.wiki/knowledge/system/overview.md](../.wiki/knowledge/system/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
- Labels: heartbeat, drift, automation, cadence
- Desired: Heartbeat lanes use work-triggered freshness policies grounded in spec changes, code changes, roadmap/task mutations, rebuilds, and verification events, with elapsed time acting only as fallback protection.
- Current: Heartbeat lane metadata now includes freshness basis, trigger lists, fallback max-age semantics, and runtime stale-reason reporting that prefers risky spec/task signals over elapsed time. Status summary, text, and panel output describe work-triggered vs fallback-age staleness.
- Closure: Closed after updating rebuild generation, starter templates, runtime status rendering, and smoke coverage so heartbeat freshness is grounded in real repo work first and wall-clock age only acts as backup protection.

### TASK-024 — Turn status surfaces into a resume-first startup control room

- Status: done
- Priority: high
- Kind: ux
- Summary: Turned status surfaces into a resume-first startup control room by adding a deterministic generated resume view to status-state and making runtime summary, dock, panel, and text output prioritize focused work, verification cues, and heartbeat context over passive health-only reporting.
- Specs:
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/rebuild_docs_meta.py
  - scripts/smoke-test.mjs
- Labels: status, resume, startup, tui
- Desired: Status surfaces act as startup control room that automatically helps user resume most relevant task, review, or verification step based on current focused work and heartbeat freshness.
- Current: Status generation now emits a resume block with source, heading, command, verification cue, and heartbeat context. Runtime status surfaces consume that view, override it with live focused-task context when present, and present resume guidance before generic next-step output.
- Closure: Closed after updating rebuild generation, starter templates, runtime status rendering, and smoke coverage so startup status deterministically guides users toward the most relevant task or stale heartbeat lane with verification-aware resume cues.

### TASK-027 — Collapse public command surface around /wiki-bootstrap, /wiki-status, /wiki-resume, and /wiki-config

- Status: done
- Priority: high
- Kind: migration
- Summary: Remove deprecated public commands so codewiki's visible workflow converges on bootstrap, status, resume, and config with Alt+W as the status shortcut.
- Specs:
  - [.wiki/knowledge/product/overview.md](../.wiki/knowledge/product/overview.md)
  - [.wiki/knowledge/system/package/overview.md](../.wiki/knowledge/system/package/overview.md)
  - [.wiki/knowledge/system/extension/overview.md](../.wiki/knowledge/system/extension/overview.md)
  - [.wiki/knowledge/clients/overview.md](../.wiki/knowledge/clients/overview.md)
  - [.wiki/knowledge/clients/surfaces/status-panel.md](../.wiki/knowledge/clients/surfaces/status-panel.md)
  - [.wiki/knowledge/clients/surfaces/roadmap.md](../.wiki/knowledge/clients/surfaces/roadmap.md)
  - [.wiki/knowledge/system/rules/overview.md](../.wiki/knowledge/system/rules/overview.md)
- Code:
  - extensions/codewiki/index.ts
  - scripts/smoke-test.mjs
  - README.md
  - skills/codewiki/SKILL.md
- Labels: commands, ux, status, resume, migration
- Goal: Users can operate codewiki through four primary public entrypoints: `/wiki-bootstrap` for setup, `/wiki-status` for inspection, `/wiki-resume` for continuing roadmap execution, and `/wiki-config` for configuration.
- Success signals:
  - `/wiki-status` and `Alt+W` expose the same status panel without requiring panel-owned configuration.
  - `/wiki-resume` replaces `/wiki-code` as the canonical roadmap resume command, with `/wiki-code` retained only as a compatibility alias while migration is active.
  - `/wiki-config` remains the clear configuration entrypoint even if some settings later become context-linked from status tabs.
  - `/wiki-review` and `/wiki-fix` are no longer required to use codewiki's core workflow; if kept temporarily, they route into the same underlying review or resume flows.
  - Bootstrap remains explicit and available when a repo has no wiki yet.
- Non-goals:
  - Remove compatibility aliases before their replacements are stable.
  - Introduce `/wiki-pause` as a public command before autonomous execution needs a real stop affordance.
- Verification:
  - Run npm test after updating command registration, help text, docs, and compatibility aliases.
  - Dogfood a fresh session with `/wiki-status` and `/wiki-resume` and confirm the simpler command model is sufficient for core workflow.
- Desired: The public package contract converges on explicit bootstrap plus separate commands for status, resume, and configuration.
- Current: The runtime now exposes only /wiki-bootstrap, /wiki-status, /wiki-resume, /wiki-config, and Alt+W. Deprecated /wiki-fix, /wiki-review, and /wiki-code registrations are removed, status recommendations emit canonical commands, and docs/tests/specs all teach the same four-entry workflow.
- Closure: Closed after removing deprecated public command registrations, updating generated recommendations plus docs/specs/tests to the canonical four-command surface, and verifying rebuild + npm test pass.

## Related docs

- [Wiki Index](index.md)
- [Product](../.wiki/knowledge/product/overview.md)
- [Clients Overview](../.wiki/knowledge/clients/overview.md)
- [System Overview](../.wiki/knowledge/system/overview.md)
