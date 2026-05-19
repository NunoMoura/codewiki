---
id: spec.system.api
title: CodeWiki API
state: active
summary: Harness-independent application-tool contract for CodeWiki state, compilers, builds, validation, session queue, and publication support.
owners:
  - architecture
updated: "2026-05-19"
code_paths:
  - src/application
  - src/domain
  - src/adapters
---

# CodeWiki API

## Responsibility

The CodeWiki API is the stable semantic contract implemented as agent-facing application tools. Adapters, the local CodeWiki UI, CLI/MCP wrappers, skill helper tools, and future harness integrations call these tools. Pi tools are one adapter over this API; they must not be the only way to access CodeWiki semantics.

The API should expose CodeWiki operations as typed capabilities instead of asking external access surfaces to edit `.codewiki/` internals directly.

## Capability groups

| Capability group | Responsibility |
| --- | --- |
| `codewiki.state` | Read compact project status, graph state, active work, focused session, and exact linked context. |
| `codewiki.feedback` | Compatibility capability for proposed intent, diff tables, and accepted feedback builds. |
| `codewiki.diff_table` | Compatibility runtime surface for pending, editable feedback rows before accepted rows compile into feedback or decision builds. |
| `codewiki.documentation` | Compatibility capability for applying accepted feedback to product/system knowledge and producing documentation builds. |
| `codewiki.decision` | vNext capability for user semantic approval, KB preflight, product/system propagation, KB updates, and decision builds. |
| `codewiki.implementation` | Coordinate implementation work, evidence collection, and implementation builds. |
| `codewiki.roadmap` | Manage work truth: queue, status, priority, blockers, progress, and closure. |
| `codewiki.session_queue` | Manage session focus, artifact availability/in-use/waiting/conflict/stale status, wait/wake, context-boundary metadata, and isolation metadata for parallel session coordination across knowledge, roadmap, code, builds, validation, and state/source refs. |
| `codewiki.agency` | Run bounded roadmap, sprint, or task automation through token, time, cost, write, session, risk, validation, policy, and approval gates. |
| `codewiki.session_boundary` | Request adapter-managed new_session, context_refresh, external-orchestrator, or true handoff boundaries with bounded kickoff context. Existing `codewiki_session_handoff` remains a compatibility tool. |
| `codewiki.build` | Read and write accepted compiler build briefs. |
| `codewiki.validation` | Run validation gateways and persist failed, blocked, or policy-kept reports. |
| `codewiki.state_engine` | Rebuild and read generated state/graph representations. |
| `codewiki.gc` | Classify, dry-run, ledger, and purge eligible CodeWiki builds, validation reports, roadmap archive detail, and runtime artifacts after archive commit proof exists. |
| `codewiki.ui` | Serve local-first UI read models and route UI actions through existing CodeWiki capabilities. |
| `codewiki.bootstrap` | Adopt or initialize repo-local CodeWiki state from skill-owned bootstrap/templates assets through application tools. |
| `codewiki.patch` | Apply validated CodeWiki patches or append-only source/research writes under policy. |
| `codewiki.publication` | Prepare commit, PR, issue, changelog, release, and push-readiness outputs from implementation evidence. |


## vNext tool surface

The vNext API should reduce the common public and agent tool surface while keeping low-level primitives available internally or through compatibility aliases.

Preferred public/user-facing commands:

| Command | Responsibility |
| --- | --- |
| `/wiki status` | Read current project state, health, next action, and active blockers. |
| `/wiki decide` | Capture or approve semantic decisions at the right abstraction layer. |
| `/wiki work` | Run one bounded planning/implementation/closure step under gates. |
| `/wiki audit` | Run deterministic audits or validation-ready checks. |
| `/wiki maintain` | Refresh generated state, run safe GC planning, or repair non-semantic drift. |

Preferred agent workflow tools:

| Tool | Responsibility |
| --- | --- |
| `codewiki_state` | Compact state/graph/task/session read. |
| `codewiki_decision` | Decision proposal, approval, KB update, and decision-build orchestration. |
| `codewiki_work` | Planning/implementation/closure orchestration for one bounded work item. |
| `codewiki_gate` | Preflight, audit, validation, and policy checks. |
| `codewiki_maintenance` | Generated-state refresh, GC, archive, and non-semantic repair. |
| `codewiki_coordination` | Artifact status, waits/wakes, context boundaries, handoffs, and isolation coordination. |

Low-level primitives such as diff-table mutation, raw build writing, validation report writing, artifact status mutation, task mutation, session-boundary staging, graph rebuild, and GC ledger writes should become internal implementation details for these workflow tools unless a compatibility, audit, or expert/debug surface explicitly needs them.

Each workflow tool owns one user-level phase and exposes source refs, policy outcomes, and recovery steps; no opaque do-everything API.

## Access paths

| Access surface | Path |
| --- | --- |
| CodeWiki UI | Local browser command center over the same API and generated state. |
| Pi | Extension commands, tools, compact visual status UI, CodeWiki UI launcher, skills, and session integration. |
| Claude Code | CLI or MCP adapter over the same API. |
| Codex | CLI or MCP adapter over the same API. |
| Other agents | CLI, MCP, or package API. |
| Humans | Local CodeWiki UI, CLI/status output, generated docs, and host-native compact panels. |

All access surfaces must preserve the same `.codewiki/` semantics.

## Write rules

- Product/system changes flow through feedback and documentation loops in compatibility mode; vNext product/system changes flow through the decision capability after explicit user semantic approval.
- Code/test changes flow through implementation loops.
- Roadmap changes record work truth, not full requirements briefs.
- Roadmap task creation must check active work for related intent and refine matching tasks before creating duplicates.
- Parallel sessions should mark affected artifacts in the session queue before non-trivial overlapping documentation, roadmap, build, validation, or code edits.
- Artifact status records are temporary coordination records; they do not replace roadmap tasks, builds, validation, git, or code review.
- Session queue callers may register wait entries when overlapping write artifact status blocks needed scopes. Waits have TTL/heartbeat, can be cancelled through release, and become ready when blockers release or expire. Adapter sessions that own waits should subscribe to queue changes and wake the agent; passive queue state is not enough for parallel work.
- Ready waits are wake signals, not stale-context revival. Wake messages should name wait id, task/build refs, and scopes, then require current state and artifact-status re-check before writing.
- Session queue callers may provide role/worktree metadata for builder, validator, publisher, or observer sessions so status and generated state views can explain isolation without making artifact status records the filesystem source of truth.
- Parallel write roles should follow [Role Worktree Isolation](worktree-isolation.md): per-task role worktrees/refs by default, root worktree for coordination/publishing, and solo-mode only when safe.
- Coordination/publication should expose worktree-factory, publisher-queue, and exact wait/wake blocker semantics; artifact status shows metadata but Git refs remain content proof.
- Validation callers may provide isolation metadata such as fresh-context status, worktree path, branch, base/head/validated SHA, and clean worktree result when independence matters.
- Validation callers must provide fresh-context, clean-worktree, and checked-SHA evidence for implementation, task-close, publication, publish, and release profiles; otherwise the API records a `block` verdict.
- Gated agency runs must respect token, time, cost, write, session, risk, validation, policy, and approval gates.
- Session-boundary callers must provide reason, source refs, expected output, and mode. `new_session` and `context_refresh` are same-agent context hygiene; `handoff` is transfer to another session, agent, or role. In Pi today, `ctx.newSession()` creates a fresh replacement session in the current process/terminal, not a new terminal tab; no portable terminal-tab launcher exists in the extension API. True separate process isolation needs an explicit external-orchestrator or worker adapter path.
- Tool-context Pi boundaries stage durable artifacts. Tool-context `sendUserMessage` follow-ups do not execute registered slash commands, so new_session and context_refresh boundaries must not be injected as `/wiki-session-handoff` chat. The adapter may prefill the editor with the compatibility command when UI exists, but command-context execution is still the only current Pi path to `ctx.newSession()`. `/wiki-session-handoff` is a compatibility executor, not a user workflow surface.
- Pending diff tables are runtime/session decision surfaces; accepted rows become decision build truth in the target model or feedback build truth in compatibility mode. The CodeWiki UI diff surface and compact status-panel diff affordance can approve, reject, defer, or attach alternatives to pending rows.
- Builds are accepted loop handoff briefs and should expose explicit consumes/produces edges plus loop-start, validation, and next-loop isolation policy.
- During CodeWiki self-refactors, public tool behavior stays frozen except critical blocker fixes; vNext capabilities are introduced behind compatibility aliases and become default only after documentation, tests, and validation pass.
- Config schema v4 defines quiet rebuild defaults, scoped agency budgets, parallelism/session-per-sprint policy, and hot/warm/cold/purge garbage-collection windows.
- Tracked CodeWiki garbage collection must run after an archive/close/publication commit exists. The GC capability requires archive commit/tree proof, supports dry-run, writes a restore ledger with removed paths and `git restore --source=<archive-sha> -- <path>` commands, and applies tracked deletions only in a separate GC commit.
- Ignored runtime/session artifacts may be purged under runtime policy, but manual deletion of tracked `.codewiki` builds, validation reports, or roadmap truth is not an API-compliant GC path.
- Generated state/graph index is never hand-edited.
- Failed, blocked, policy-required, current-publication, release, or audit-mode validation reports persist under `.codewiki/validation/**`; pass reports should be evicted after safe Git archival/publication.
- Deprecated `.codewiki/index/**` and default `.codewiki/evidence/**` paths must not be created by normal API flows.
- Commit, push, release, and remote updates require implementation evidence plus validation/policy approval.

## API boundary

The API belongs in `src/application/tools/**` and domain contracts. Application tools call focused use cases for builds, validation, roadmap/session operations, state/graph work, and local runtime behavior. Adapters, UI transport, CLI/MCP wrappers, and skills translate external inputs and outputs into those tools. Local runtime services handle filesystem, Git, process, persistence, patch application, and state rebuild/query ports until an external adapter needs its own boundary.

The API should stay stable while adapter protocols change.

## Related docs

- [CodeWiki UI](control-room-ui.md)
- [Adapters](adapters.md)
- [Agency Controller](agency.md)
- [Role Worktree Isolation](worktree-isolation.md)
- [Compilers](compilers.md)
