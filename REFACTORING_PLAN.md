# CodeWiki Refactoring Plan

## Purpose

This temporary document tracks executable drift from accepted `.codewiki/kb/**` architecture. CodeWiki Runtime is not active in this source checkout. Source and tests are executable truth; Git records checkpoints. Delete this file when completion conditions pass.

## Ratified target

CodeWiki is a standalone local-first intent-to-production application:

```text
CodeWiki-owned Clients          External Agent Clients       Channels
App | CLI | Pi TUI              Claude Code | Codex          Slack | GitHub | WhatsApp | OpenClaw
          \                              |                              /
           +---------------- CodeWiki Host Service --------------------+
                                      |
                              per-project Runtime
                    authority | provenance | claims | workbenches
                    Integration | Verification | guarded effects
                              /                 \
                 semantic Loops                 Managed Execution
          Decision | Planning | Implementation       Pi SDK
                                      |
                   Knowledge | Change Trace | Git | Evidence
```

One versioned Host command/query/event protocol serves every binding. MCP `2026-07-28` is the preferred stateless Agent Client binding where supported. CLI remains deterministic human, scripting, confirmation, and compatibility access. Host owns transport, pairing, registry, channel delivery, redaction, deduplication, and reconnect. Runtime owns meaning, actor authority, admission, provenance, persistence, scheduling, Integration, Verification routing, and effects. Pi is the sole shipped fully managed execution engine.

Every observed Git state receives positive provenance accounting:

```text
exact Runtime Candidate Manifest + custody
  → controlled provenance
  → managed when complete Pi receipt exists
  → MCP-mediated when admitted external Agent Client operations exist

no exact custody match
  → external provenance
  → immutable External Candidate Capture
  → exact accepted-Change admission or Change Intake
  → fresh Verification before certification
```

Branch names, commits, authors, trailers, Git notes, and producer claims cannot prove provenance. External work may be useful and certifiable, but inherits no execution proof. Divergence pauses protected effects and is never silently adopted, overwritten, discarded, or certified.

## Target source topology

```text
src/
  host/
    protocol/
    registry/
    pairing/
    delivery/
    channels/
    mcp/
  clients/
    app/
    cli/
    pi/
  execution/
    ports.ts
    pi/
  runtime/
    admission/
    claims/
    workbenches/
    workers/
    integration/
    persistence/
    synchronization/
    recovery/
    effects/
  changes/
    intake/
    triage/
    trace/
  decision/
  planning/
  implementation/
  verification/
  evidence/
  work-state/
  alignment/
  knowledge/
  api/
  project/
  preview/
  git/
  utils/

benchmarks/
tests/
```

`src/clients/**` contains CodeWiki-owned interaction surfaces. Claude Code and Codex are external Agent Clients served by `src/host/mcp/**`, not execution adapters. `src/execution/pi/**` contains the only concrete managed agent/model engine. Runtime imports neutral execution ports, never Pi implementation. Verification imports neither Runtime nor Loop implementations.

## Clean-cut rules and budgets

Use breaking clean cuts. No compatibility aliases, old-path re-exports, dual contracts, transitional writes, stale package roots, or global prose replacement. Build a new HEAD-anchored manifest before structural source moves; preserve `.tmp-worktrees/deep-clean-file-budget.json` and `/tmp/codewiki-kb-pre-clean-cut.diff` as historical evidence only.

Ratification checkpoint before executable clean cuts:

| Area | Ratification | After trace-host cut | Hard cap |
| --- | ---: | ---: | ---: |
| tracked total | 655 | 641 | 575 |
| `src/**` | 375 | 367 | 315 |
| `tests/**` | 211 | 204 | 190 |
| `benchmarks/**` | 0 | 0 | 10 |
| `scripts/**` | 1 | 1 | 1 |
| `lab/**` | 0 | 0 | 0 |
| packed files | 753 | 737 | 650 |

The trace-host cut is recorded by `.tmp-worktrees/trace-host-clean-cut-manifest.json`, exhaustively anchored to `fafafc8` with 639 keeps and 16 deletions. Its green checkpoint is 943 full-suite tests, 116 coordinator tests, a passing packed-install smoke test, and zero production audit vulnerabilities.

Rules:

- Until caps pass, each source slice adds no more files than it deletes or merges and should reduce net count.
- Moves improve ownership but do not count as reduction.
- Merge only one responsibility and lifecycle; never combine unrelated code to hit a number.
- Delete stale architecture before adding replacement breadth whenever dependencies permit.
- Host/App/MCP work consumes old Dashboard, trace-host, Client/Harness, Quality, View, and compatibility footprint; caps do not increase.
- `test:coordinator` remains focused and is not rerun inside `audit:codewiki`.

## Work slices

### 1. Ratify architecture and replace stale vocabulary

- [x] Define standalone App, Host Service, per-project Runtime, Pi Managed Execution, stateless MCP Agent Clients, and capability-scoped channels in Knowledge.
- [x] Replace generic Harness desired-state ownership with Host, Client, Execution Port, Managed Execution, Agent Host, and Agent Client concepts.
- [x] Define controlled, managed, MCP-mediated, and external provenance plus External Candidate Capture.
- [x] Make Runtime—not Loops—invoke shared Verification and select routes.
- [x] Preserve Clients as CodeWiki-owned App, CLI, and Pi interaction surfaces.
- [ ] Update README and package description after executable topology exists; do not advertise unfinished capability.

### 2. Execute deletion-first ownership cut

- [x] Create and execute the reviewed `fafafc8`-anchored trace-host keep/delete manifest covering every tracked file in that slice.
- [x] Delete remaining Pi/Dashboard trace-host shell, lifecycle branches, HTTP controls, tests, exports, and assets that depend on hidden semantic sessions.
- [ ] Create a new reviewed HEAD-anchored keep/move/merge/delete manifest before the next structural source move.
- [ ] Delete hidden semantic-loop tools from conversational Pi registration.
- [ ] Delete legacy Quality, generic View authority, obsolete Loop compatibility, and old Trace/ChangeRecord paths as replacement consumers land.
- [ ] Move surviving Pi execution modules from `src/harnesses/pi/**` to `src/execution/pi/**` and ports to `src/execution/ports.ts`; rename public Harness vocabulary atomically.
- [ ] Move container/worktree execution custody to Runtime workbench/isolation ownership.
- [ ] Move Dashboard foundations directly into `src/clients/app/**` and Host responsibilities into `src/host/**`; no old Dashboard protocol survives.
- [ ] Update package exports, scripts, tests, and packed-install gates in the same cuts.

### 3. Define Host and Client protocol

- [ ] Define versioned command, bounded query, durable operation, and event envelopes.
- [ ] Bind principal, project, target, expected digest, idempotency key, expiry, capability, and bounded payload on every mutation.
- [ ] Separate transport deduplication from Runtime semantic idempotency.
- [ ] Implement one machine-level Host registry over separate per-project Runtime processes.
- [ ] Implement loopback binding, token/origin checks, pairing, stable actor mappings, reconnect cursors, deep links, redaction, and durable delivery.
- [ ] Ensure browser or terminal closure cannot stop accepted work.
- [ ] Make adapter capability declaration intersect actor authority, project policy, and current Runtime guards.

### 4. Build CodeWiki App and first-party Clients

- [ ] Replace Dashboard-local workflow/session truth with persisted Runtime projections and operations.
- [ ] Implement App surfaces for Change, Decision, Planning, Implementation, Work Items, Candidates, provenance, Checks, Evidence, Exit Reports, Repair, Integration, and effects.
- [ ] Keep CLI as full deterministic operational and high-authority confirmation surface.
- [ ] Keep Pi TUI as optional expert Client; it cannot double as controlled execution.
- [ ] Validate keyboard, assistive technology, reduced motion, contrast, bounded rendering, reconnect, reset, and actionable failure states.

### 5. Implement stateless MCP Agent Client binding

- [ ] Implement modern MCP `2026-07-28` as preferred binding; isolate legacy compatibility only when exact external-client gates require it.
- [ ] Expose a small stable catalog over Host API for intake, bounded context, work admission, workbench operations, status, submission, and cancellation.
- [ ] Carry explicit project, Change, attempt, claim, workbench, expected-tree, and idempotency identities on calls; never rely on MCP session state.
- [ ] Return durable CodeWiki operation IDs; MCP disconnect cannot cancel accepted work.
- [ ] Treat `clientInfo`, JSON-RPC IDs, instructions, and elicitation as non-authoritative.
- [ ] Provide project integration that strongly directs Claude Code and Codex through MCP using required server configuration, read-only native mutation policy, and supported hooks, while acknowledging those controls are not a universal security boundary.
- [ ] Classify any resulting unmatched tree as external provenance rather than silently inheriting mediated custody.
- [ ] Test exact supported Claude Code and Codex versions in disposable external projects.

### 6. Harden Managed Execution

- [ ] Pin supported Pi SDK version and update package ranges deliberately.
- [ ] Require explicit ResourceLoader, tool allowlist, isolated agent directory, Runtime-owned worktree, CodeWiki context envelope, exact model route, budgets, cancellation, and disabled ambient prompts/extensions/skills/settings/project-agent config.
- [ ] Define execution receipts binding Pi version, route, tools, context, claim, worktree, base, timing, cancellation, usage, and output.
- [ ] Route Decision, Planning, Implementation, Repair, research, assisted authoring, and Model Checks through managed Pi ports where model execution is required.
- [ ] Keep Pi sessions disposable; canonical continuity uses Change, Candidate, Work Item, operation, and Exit Report identity.
- [ ] Missing exact capability yields unavailable or indeterminate without fallback or policy weakening.

### 7. Activate Runtime-owned parallel workbenches

- [ ] Make isolated worktrees mandatory for every controlled Candidate producer, including serial execution.
- [ ] Keep `runtime.maxWorkers = 1` as safe concurrency default.
- [ ] For `maxWorkers > 1`, claim independent ready Work Items and require one isolated worktree, assignment, worker identity, cancellation path, report, and usage receipt per claim.
- [ ] Integrate compatible reports deterministically with expected-head CAS, then verify combined Candidate.
- [ ] Deny canonical descendant scheduling, mutable workspace sharing, implicit authority renewal, canonical writes, and effects from workers or Agent Clients.
- [ ] Implement cancellation, crash recovery, stale claim recovery, conflict handling, and workbench cleanup.

### 8. Implement total provenance and External Candidate Intake

- [ ] Define Candidate Manifest and External Candidate Capture schemas with repository, base, head, tree, scope, custody, provenance, and digest bindings.
- [ ] Recognize controlled provenance only from exact persisted Runtime custody.
- [ ] Detect local dirty trees, direct commits, pushes, PRs, and synchronized branch divergence against accepted state.
- [ ] Capture tracked changes under Runtime-owned refs/worktrees without mutating user branch; require explicit selection for untracked files.
- [ ] Route exact accepted-Change captures through Candidate admission and fresh Verification.
- [ ] Route missing-intent or out-of-scope captures through Change Intake, deduplication, triage, proposed Change, and explicit acceptance.
- [ ] Separate GitHub issue intake from GitHub PR/commit/push Candidate intake.
- [ ] Project required CodeWiki GitHub Check and branch protection where configured; detect administrator overrides as external divergence on next synchronization.

### 9. Finish Change, WorkState, Alignment, and synchronization cuts

- [ ] Move canonical Change protocol, encoding, manifests, reduction, and replay to `src/changes/trace/**`.
- [ ] Move Alignment Graph and bounded queries to `src/alignment/**`.
- [ ] Keep canonical current projection in `src/work-state/**`.
- [ ] Delete intermediate `src/change-trace/**`, legacy `src/traces/**`, obsolete WorkState paths, and generic `src/views/**` after callers move.
- [ ] Preserve append-only history, deterministic replay, expected-head CAS, provenance, remote synchronization, and recovery behavior.
- [ ] Stabilize read-only bounded snapshot-bound context, state, attention, explanation, and Change queries with coverage, truncation, provenance, and staleness.

### 10. Complete Check Pack and Verification execution

Already complete: local Pack catalog and configuration contracts; conservative Candidate applicability; Candidate-bound policy persistence; Check Invocation/Observation; admitted Results; complete Exit Reports; structured findings; Repair Profiles; Repair Frontiers; Repair Briefs/Bundles; native Verification projection.

Remaining:

- [ ] Replace active legacy Quality and Custom Check consumers with native Verification, then delete old contracts and modules.
- [ ] Materialize Default Pack and exact local/npm/Git installation with `.codewiki/check-packs.lock.json`, no lifecycle scripts, immutable integrity, and trust approval.
- [ ] Run every code Check in admitted sandbox; no sandbox yields unavailable.
- [ ] Run every Model Check tool-free with exact Pi route, bounded context, structured output, and isolation; missing capability yields indeterminate or unavailable.
- [ ] Keep Check evaluator route independent from authoring or repair route.
- [ ] Implement deterministic forms, developer mode, and explicit Managed Execution-assisted authoring over same tracked files.
- [ ] Preserve exactly one Result per selected Check and existing fail-closed reduction.
- [ ] Preserve only SARIF, JUnit XML, LCOV, Cobertura, CycloneDX, SPDX, Pact, OpenAPI, and provider-check receipt as bounded Evidence formats.

### 11. Normalize repair, discovery, and improvement

- [ ] Define versioned producer-neutral Discovery Finding and shared worker Observation schemas.
- [ ] Keep current Candidate failure in `Result → Exit Report → Repair Bundle → repaired Candidate`.
- [ ] Route new or out-of-scope work through Discovery Finding and Change Intake Material.
- [ ] Keep required out-of-scope blockers blocked until dependency Change or explicit scope expansion is accepted.
- [ ] Name deliberate operational discovery Improvement Assessment.
- [ ] Never let discovery classification convert failing required Check into pass.
- [ ] Never let installed CodeWiki automatically file work against upstream CodeWiki.

### 12. Build external product Benchmarks

- [ ] Move supported measurement code from `src/benchmarks/**` to repository-root `benchmarks/**` and do not ship it.
- [ ] Compare same Agent Host or managed agent, model route, task, repository, tools, network, budget, timeout, concurrency, retries, environment, and trials in `alone` and `codewiki` modes.
- [ ] Use external fixtures and oracles; operational discovery is not Benchmarking.
- [ ] Benchmark digest-bound repair variants without automatic promotion.
- [ ] Block release on false exits, unauthorized effects, or escaped critical defects regardless of aggregate score.

### 13. Add collaboration channels incrementally

- [ ] Add first-party Slack and GitHub adapters after Host protocol stabilizes.
- [ ] Permit Change Intake from any paired channel capable of bounded authenticated input, including WhatsApp.
- [ ] Keep submitting intake distinct from accepting Change or granting protected authority.
- [ ] Evaluate optional OpenClaw connector before native broad-channel expansion.
- [ ] Add native WhatsApp only when demand justifies credential, delivery, and maintenance cost.
- [ ] Never inject ambient channel history, secrets, or full diffs into Managed Execution by default.

### 14. External proof and release gates

- [ ] Run real Gitleaks, Semgrep, and offline Trivy profiles with exact receipts.
- [ ] Run sealed scanner/evaluator calibration against independent human-labeled cases.
- [ ] Prove provider authentication, actor authority, expected-head mutation, Pi credential isolation, MCP-mediated workbench custody, and OCI execution externally.
- [ ] Build and pack reviewed candidates, then install only in disposable external projects with isolated Pi settings.
- [ ] Verify Host/App/CLI/Pi/MCP lifecycle, Check Packs, assisted authoring, managed receipts, external capture, guarded writes, failure paths, and cleanup.
- [ ] Resolve optional Pi SDK dependency advisories or document accepted external constraints.
- [ ] Publish, release, deploy, mutate providers, or expose public network only with explicit maintainer approval.

## Per-slice gates

```text
focused tests
Knowledge profile and diagram validation
TypeScript LSP diagnostics
typecheck
full test suite
build
packed-package smoke
npm audit --omit=dev
git diff --check
pi-lens diagnostics
```

Commit and push every green slice unless explicitly held. Source-repository CodeWiki dogfooding remains prohibited; extension tests run only from packed installs in disposable external projects.

## External blockers

External proof does not block local clean cuts:

- real Gitleaks, Semgrep, Trivy, OCI, provider/user-auth, channel ingress, and sealed calibration;
- automatic distributed expiry without trusted remote time;
- public network exposure and provider delivery credentials;
- optional Pi SDK dependency advisories;
- Graphify adapters and controlled paired Benchmark environments.

## Completion and deletion condition

Delete this file when:

- target topology and dependency boundaries are realized;
- Host Service, Clients, Runtime, Managed Execution, provenance, MCP, and Verification contracts are executable;
- legacy Harness, Dashboard, trace-host, Quality, Trace, ChangeRecord, generic View, compatibility, and self-dogfood paths are gone;
- source, tests, packed output, and Knowledge agree;
- all hard file budgets and external packed-install gates pass;
- no remaining local task needs this tracker.
