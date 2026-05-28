---
id: spec.system.api
title: CodeWiki API
state: active
summary: Harness-independent API facade and tool contract for CodeWiki state, compilers, builds, validation, session queue, and publication support.
owners:
  - architecture
updated: "2026-05-27"
---

# CodeWiki API

## Responsibility

The CodeWiki API is the stable semantic contract implemented as `src/api/**` facade modules over focused concept use cases and agent-facing tools. Adapters, scripts, the local CodeWiki UI, CLI/MCP wrappers, skill helper tools, and future harness integrations call this facade or named concept contracts. Pi tools are one adapter over this API; they must not be the only way to access CodeWiki semantics.

The API should expose CodeWiki operations as typed capabilities instead of asking external access surfaces to edit `.codewiki/` internals directly.

## Capability groups

| Capability group | Responsibility |
| --- | --- |
| `codewiki.state` | Read compact project status, graph state, active work, focused session, and exact linked context. |
| `codewiki.resume_context` | Build bounded continuation prompts from graph, roadmap, task context shards, source refs, and recent build evidence so agents can restart or compact without chat-history memory. |
| `codewiki.decision` | User semantic approval, interactive diff/task approval surfaces, KB preflight, product/system propagation, KB updates, and decision builds. |
| `codewiki.diff_table` | Runtime surface for pending, editable decision rows before accepted rows compile into decision builds. |
| `codewiki.implementation` | Coordinate implementation work, evidence collection, and implementation builds. |
| `codewiki.roadmap` | Manage work truth: queue, status, priority, blockers, progress, and closure. |
| `codewiki.session_queue` | Manage session focus, artifact availability/in-use/waiting/conflict/stale status, wait/wake, context-boundary metadata, and isolation metadata for parallel session coordination across knowledge, roadmap, code, builds, validation, and state/source refs. |
| `codewiki.agency` | Plan and authorize bounded roadmap, sprint, or task automation through compiler selection, token, time, cost, write, session, risk, validation, policy, approval cadence, and configured agency level gates. |
| `codewiki.runtime` | Execute one bounded CodeWiki step from an authorized agency plan: claim scopes, invoke compiler/gateway preparation, request session boundaries, release claims, and return workflow-efficiency evidence or stop-gate proof. |
| `codewiki.session_boundary` | Request adapter-managed CodeWiki-owned compaction, new_session, context_refresh, external-orchestrator, or true transfer boundaries seeded by bounded CodeWiki resume context and, when allowed, a protocol-safe auto-pickup kickoff. Legacy session-handoff shims are not normal workflow tools. |
| `codewiki.build` | Read and write accepted compiler build briefs. |
| `codewiki.validation` | Run validation gateways and persist failed, blocked, or policy-kept reports. |
| `codewiki.state_engine` | Rebuild and read generated state/graph representations. |
| `codewiki.gc` | Classify, dry-run, ledger, and purge eligible CodeWiki builds, validation reports, roadmap archive detail, and runtime artifacts after archive commit proof exists. |
| `codewiki.ui` | Serve local-first UI read models and route UI actions through existing CodeWiki capabilities. |
| `codewiki.bootstrap` | Adopt or initialize repo-local CodeWiki state from skill-owned bootstrap/templates assets through application tools. |
| `codewiki.patch` | Apply validated CodeWiki patches or append-only source/research writes under policy. |
| `codewiki.publication` | Prepare commit, PR, issue, changelog, release, and push-readiness outputs from implementation evidence. |


## vNext tool surface

The reduced workflow-tool direction is tracked in [API vNext Tool Surface](api-vnext-tools.md). This overview keeps the stable API boundary, access surfaces, and write rules compact.

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

- Product/system changes flow through the decision capability after explicit user semantic approval. Interactive adapters should capture that approval as row-level approve, edit, reject, or defer actions instead of relying on prose-only blanket approval.
- Code/test changes flow through implementation loops.
- Roadmap changes record work truth, not full requirements briefs.
- Roadmap task creation must check active work for related intent and refine matching tasks before creating duplicates.
- Parallel sessions should mark affected artifacts in the session queue before non-trivial overlapping decision, roadmap, build, validation, or code edits.
- Artifact status records are temporary coordination records; they do not replace roadmap tasks, builds, validation, git, or code review.
- Session queue callers may register wait entries when overlapping write artifact status blocks needed scopes. Waits have TTL/heartbeat, can be cancelled through release, and become ready when blockers release or expire. Adapter sessions that own waits should subscribe to queue changes and wake the agent; passive queue state is not enough for parallel work.
- Ready waits are wake signals, not stale-context revival. Wake messages should name wait id, task/build refs, and scopes, then require current state and artifact-status re-check before writing.
- Session queue callers may provide role/worktree metadata for builder, validator, publisher, or observer sessions so status and generated state views can explain isolation without making artifact status records the filesystem source of truth.
- Parallel write roles should follow [Role Worktree Isolation](worktree-isolation.md): per-task role worktrees/refs by default, root worktree for coordination/publishing, and solo-mode only when safe.
- Coordination/publication should expose worktree-factory, publisher-queue, and exact wait/wake blocker semantics; artifact status shows metadata but Git refs remain content proof.
- Validation callers may provide isolation metadata such as fresh-context status, worktree path, branch, base/head/validated SHA, and clean worktree result when independence matters.
- Validation callers must provide fresh-context, clean-worktree, and checked-SHA evidence for implementation, task-close, publication, publish, and release profiles; otherwise the API records a `block` verdict.
- Gated agency runs must respect token, time, cost, write, session, risk, validation, policy, approval cadence, and configured agency level gates. Supported levels are `task`, `sprint`, and `roadmap`; each grants continuation permission only up to its boundary and never bypasses hard stop gates. Runtime execution then performs at most one bounded step and must stop on unavailable claims, unsupported harness capabilities, validation blocks, destructive/publication gates, or exhausted budgets.
- Session-boundary callers must provide reason, source refs, expected output, mode, agency level, and approval cadence when agency owns continuation. CodeWiki-owned compaction and `context_refresh` are same-agent soft context hygiene seeded by `codewiki_resume_context`; `new_session` is hard replacement-session hygiene when policy needs it; `handoff` is transfer to another session, agent, or role. In Pi today, `ctx.newSession()` creates a fresh replacement session in the current process/terminal, not a new terminal tab; no portable terminal-tab launcher exists in the extension API. True separate process isolation needs an explicit external-orchestrator or worker adapter path.
- Tool-context Pi boundaries must return visible results and must not call `ctx.compact()` before the agent sees them. Normal CodeWiki continuation uses `codewiki_resume_context` directly or through CodeWiki-owned compaction, not VCC recall, generic Pi compaction, or injected slash-command chat. Pi `sendUserMessage` follow-ups do not execute registered slash commands, so adapter code must not inject legacy `/wiki-session-handoff` text as a recovery mechanism. Same-session auto-pickup after CodeWiki compaction must use a source-backed custom kickoff or equivalent user-role-safe boundary with `triggerTurn=true`; if the adapter cannot guarantee that boundary, it must block or show fallback instructions instead of calling continuation from an assistant leaf.
- Pending diff tables are runtime/session decision surfaces; accepted rows become decision build truth. The CodeWiki UI, Pi TUI, and compact status-panel diff affordances can show row/task cards and approve, edit, reject, defer, or attach alternatives to pending rows before builds are compiled.
- Builds are accepted loop handoff briefs and should expose explicit consumes/produces edges plus loop-start, validation, and next-loop isolation policy.
- During CodeWiki self-refactors, deprecated aliases and shim tools are removed when a direct replacement exists; if callers break, fix them at the replacement surface instead of keeping compatibility wrappers.
- Config schema v4 defines quiet rebuild defaults, scoped agency budgets, agency level/approval cadence, context reset auto-pickup policy, parallelism/session-per-sprint policy, and hot/warm/cold/purge garbage-collection windows.
- Tracked CodeWiki garbage collection must run after an archive/close/publication commit exists. The GC capability requires archive commit/tree proof, supports dry-run, writes a restore ledger with removed paths and `git restore --source=<archive-sha> -- <path>` commands, and applies tracked deletions only in a separate GC commit.
- Ignored runtime/session artifacts may be purged under runtime policy, but manual deletion of tracked `.codewiki` builds, validation reports, or roadmap truth is not an API-compliant GC path.
- Generated state/graph index is never hand-edited.
- Failed, blocked, policy-required, current-publication, release, or audit-mode validation reports persist under `.codewiki/validation/**`; pass reports should be evicted after safe Git archival/publication.
- Deprecated `.codewiki/index/**` and default `.codewiki/evidence/**` paths must not be created by normal API flows.
- Commit, push, release, and remote updates require implementation evidence plus validation/policy approval.

## API boundary

The API facade lives under `src/api/**`. It re-exports stable package/tool use-case entrypoints from concept roots such as `src/roadmap/tool.ts`, `src/session/tool.ts`, `src/state/tool.ts`, `src/build/tool.ts`, and `src/validation/tool.ts`. Concept roots call focused use cases for builds, validation, roadmap/session operations, state/graph work, and CodeWiki runtime behavior. Adapters, scripts, UI transport, CLI/MCP wrappers, and skills translate external inputs and outputs into the API facade or explicit concept contracts. `src/runtime/**` owns CodeWiki bounded execution orchestration and harness capability ports; local filesystem, Git, process, persistence, patch application, and state rebuild/query services remain in their existing concept roots until an external adapter needs its own boundary. Residual `src/application/**` and `src/domain/**` owner paths are retired.

The API should stay stable while adapter protocols change.

## Related docs

- [CodeWiki UI](control-room-ui.md)
- [Adapters](adapters.md)
- [Agency Controller](agency.md)
- [Role Worktree Isolation](worktree-isolation.md)
- [Compilers](compilers.md)
