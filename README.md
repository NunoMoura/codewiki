# codewiki

CodeWiki is being rebuilt as a source-first, project-scoped development operating system.

The approved target is one CodeWiki project control plane with a local dashboard and Pi conversational/execution adapters. Pi remains the primary agent engine, but no individual Pi session owns project scheduling or truth. The CLI remains only a temporary development/test client during stabilization.

## Current posture

- CodeWiki is developed with Pi native coding tools, pi-lens, normal Git review, source, and tests.
- Package metadata exposes the future Pi extension through `pi.extensions`, but this source repository does not install or load CodeWiki itself during stabilization.
- Repo-local Pi settings load pi-lens only. No CodeWiki controller pin, project-local CodeWiki skills, prompt injection, dashboard, commands, or `wiki_*` tools are active here.
- `.codewiki/kb/**` is source-of-truth documentation for intended product/system design.
- `src/**` and `tests/**` are executable truth; Git is history and checkpoint evidence.
- This source checkout keeps no active dogfood Change Traces or `.codewiki/traces/TRACE-*.jsonl` instance state. Trace behavior is tested in disposable external projects.
- `.codewiki/views/**` and other generated roots are disposable outputs, not truth.
- Pi native compaction handles conversation compression.
- Decision, Planning, and Implementation production standards remain strict package behavior, but candidates cannot grade or operate their own source checkout.

## Work and project control plane

CodeWiki's approved product architecture has four dashboard destinations: Work, Product, System, and Design. Work contains separate Backlog, Planning, and Implementation workspaces. Product contains Users, Stories, and Dictionary; Dictionary renders the canonical `.codewiki/kb/lexicon.md` rather than copying vocabulary into dashboard state. Runtime owns the portfolio pipeline; a Change remains the durable accountable carrier of one intended product or system delta and opens as a cross-cutting dossier rather than owning a private pipeline.

Backlog is a generated and guarded intake surface over persisted pending Change revisions. `wiki_change` can draft, revise, validate, link, split, merge, defer, reject, withdraw, and query revisions under exact Change-Trace-store guards. Submission grants no semantic approval or execution authority. CodeWiki has no hidden Git-ref Change store or backwards-compatibility importer; pre-release history remains available through Git.

Planning observes a bounded project-wide portfolio of approved Changes and owns Sprint creation. One Change may span several Sprints, and one Sprint may coordinate several Changes. Every Work Item has one owning Change and may contribute explicitly to others. Runtime should schedule a compatible set of independent Decision and Work Item jobs while serializing one accepted project Planning writer, conflicting paths, shared integration, commits, and publication.

Implementation presents Work Items, Assignments, worker sessions, isolation, integration, checks, evidence, and Git proof. Worker completion remains candidate transport evidence. The Implementation loop alone accepts realization. Isolated worker output never appears as integrated product state.

`WorkState` is the disposable typed project projection joining Change Traces with Knowledge, source ownership, source/tests/Git, configuration, integration, and bounded runtime observations. `WorkStateSession` streams JSONL append boundaries incrementally; memory loss causes a normal rebuild. SQLite is not required.

Target runtime topology is one project-scoped control plane with concurrent dashboard, Pi, CLI/test, and future clients. It owns intake, WorkState refresh, compatible-job scheduling, semantic-session and worker lifecycle, guarded writes, integration, and live projections. No Pi conversation owns runtime lifetime.

The executable control-plane seam now consists of the transport-neutral `ProjectCoordinator` kernel plus the `@nunomoura/codewiki/coordinator` project service. The service elects one live process through an exclusive project lock, binds only to `127.0.0.1`, publishes private endpoint metadata, requires bearer and exact-generation capabilities, fences stale owners against the current lock on every request, registers leased Pi/dashboard/CLI clients, and replaces dead generations without reusing identity. The kernel enforces supervised or unattended admission, deduplicates jobs, requires durable recovery for writes, admits bounded compatible lanes, serializes shared resources and integration targets, and exposes exact held reasons. `RuntimeReactor.selectRuntimeReactions()` derives several compatible runtime-owned reactions while retaining the singular selector as a bounded job primitive.

The SDK adapter creates bounded in-memory Pi SDK sessions for read-only Decision, Planning, and Implementation review, exposes only project-scoped read tools plus one closed candidate-submission tool, and returns candidates to runtime-owned exact-reaction jobs. The Pi SDK remains an optional peer during the architecture spike; disposable SDK fixtures must install it explicitly and use Node.js 22.19 or newer.

Implementation workers remain on a separate adapter path. The elected project service now derives ready Work Items from current WorkState, checks current automation, agency, supervision, capacity, Git-base, dirty-path, and worktree-isolation policy, appends exact Assignment claims under CAS, persists canonically digest-bound private dispatch packets, prepares explicit worktrees, and schedules compatible process workers through coordinator lanes. A replacement generation can recover an active claim from its canonical packet digest and immutable Worker report without treating runtime scratch as authority. Pi sessions submit bounded reconciliation triggers through leased clients. Exact matched reports enter only the selected Implementation review and contribute to its deterministic semantic job identity; worker output remains candidate evidence. Completed claims release only after canonical Implementation acceptance becomes visible, while blocked, failed, or cancelled reports release without becoming implementation truth. Graceful service shutdown now aborts active foreground workers, escalates from `SIGTERM` to bounded `SIGKILL`, waits for child exit, and persists cancelled reports for recovery. Each reconciliation also removes pre-Claim and terminal unsuccessful private artifacts idempotently, prunes runtime-local orphan worktrees through the structured Git runner, and preserves active-Claim, completed, or ambiguous evidence. Integration scheduling, completed-artifact cleanup after exact Git proof, abrupt-death process observation, dashboard-service consolidation, and container isolation remain next control-plane slices.

Worker dispatch already resolves a deterministic execution policy before claim append and child-process creation. Provider, model, thinking level, allowed tools, timeout, pricing snapshot, budget, and policy digest travel through handoff, start, observation, and guarded resume. Attached supervision and usage telemetry are mandatory. Policy drift, route mismatch, missing usage, exhausted limits, monitoring loss, detached execution, or invalid escalation stops the attempt without granting semantic authority.

## New source layout

```text
src/
  index.ts
  api/
  decision/
  planning/
  implementation/
  loops/
  dashboard/
  traces/
  views/
  work-state/
  knowledge/
  git/
  runtime/
  error-handling/
  cli/
  pi/
  project/
  utils/
```

The semantic loop roots are `decision`, `planning`, and `implementation`. Runtime is their project-scoped event-driven outer control plane. Each semantic loop owns typed inputs, outputs, quality standards, and exits. `traces` owns one append-only JSONL journey per persisted Change. `work-state` derives shared project state; `views` render Backlog, Planning, Implementation, Change dossiers, quality, blockers, and outcomes.

Current `runRuntimeSemanticExecutor()` remains the singular compatibility primitive. `runRuntimeSelectedSemanticReaction()` executes one exact coordinator-selected invariant, while `runtime-reaction-jobs.ts` maps Decision, Planning, and Implementation-review selections to typed lanes, deterministic idempotency keys, conflict refs, and durable recovery probes. Harness-neutral daemon lifecycle and process discovery live under `src/runtime/**`; the executable Pi launcher dynamically loads the optional SDK semantic adapter. The service advertises whether semantic execution is service-owned or requires candidate fallback. Thin Pi clients hide semantic tools and submit only bounded triggers when daemon execution is available; peer-absent installs expose only the runtime-selected candidate tool. Bounded generation-scoped event replay carries coordinator transitions and exact runtime-observed WorkState digests to leased Pi and dashboard clients. Monotonic cursors support replay; overflow or generation replacement requires canonical snapshot refresh. Event payloads remain operational invalidations, never truth. Clients cannot supply observation time, Change/trace identity, selection, or append authority. `ImplementationWorkerDispatcher` turns current WorkState into guarded claims and exact harness-neutral Assignments, binds private recovery packets to canonical claim digests, schedules worktree-only Pi process workers through typed coordinator jobs, recovers exact results for Implementation review, and schedules deterministic terminal release jobs after review or failure handling. Cancellation hardening, integration, crash-window cleanup, and containers remain pending.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<change-trace>/<loop>/`. It remains non-authoritative and is cleaned only after durable trace/KB/source/Git or recovery refs exist.

The active migration record lives in `.codewiki/kb/system/flows/migration-audit.md`. Do not restore the old implementation wholesale; recover any future idea only through a new accepted decision, targeted source changes, and tests.

## Requirements

CodeWiki source remains TypeScript-first during the rebuild. Npm packages are built to `dist/**` before packing because Node does not strip TypeScript inside `node_modules`; harness-neutral installed APIs target Node.js `>=20.6.0`. Local source commands and tests use `node --experimental-strip-types`, so use Node.js `>=22.6.0` for development. The optional `./pi-sdk` adapter follows Pi's stronger requirement and fails closed below Node.js 22.19.0.

## OKF compatibility

CodeWiki exports and validates `.codewiki/kb/**/*.md` as Open Knowledge Format v0.1. Change Trace files remain outside OKF: `.codewiki/traces/TRACE-*.jsonl` is workflow truth and is filtered before OKF parsing.

```ts
import { runWikiOkf } from "@nunomoura/codewiki";

const validation = runWikiOkf({ action: "validate", files });
const exported = runWikiOkf({ action: "export", files });
const consumed = runWikiOkf({ action: "consume", files: exported.files });
```

`validate` and `export` default to CodeWiki KB scope and only include `.codewiki/kb/**/*.md`. `consume` defaults to generic OKF bundle scope for imported OKF markdown. Unknown producer frontmatter fields are preserved during consume/export round trips. OKF compatibility is format-level only; CodeWiki does not depend on BigQuery, Gemini, Google Cloud Knowledge Catalog, or the Google OKF reference agent.

## DESIGN.md compatibility

`/wiki-bootstrap` creates `.codewiki/kb/product/DESIGN.md` using Google's open DESIGN.md alpha format. The file combines normative machine-readable colors, typography, spacing, radii, and component tokens with human-readable brand rationale, iconography rules, and durable visual-reference URLs or repository paths. CodeWiki's additional OKF concept fields coexist in the format's extensible YAML frontmatter, so one file serves both design agents and Knowledge Base navigation. Existing DESIGN.md files are preserved unless normal explicit bootstrap force behavior applies.

Validate one with the official tool when available:

```bash
npx @google/design.md lint .codewiki/kb/product/DESIGN.md
```

## Live Preview targets and profiles

Declare project-native server profiles and canonical UI targets in `.codewiki/config.json`:

```json
{
  "preview": {
    "profiles": [
      {
        "id": "web",
        "runner": {
          "kind": "package_script",
          "script": "dev",
          "scriptDigest": "sha256:b16efac145e9242cfb05d739a8509ac7295f381108dce0f753e52a1aaf48e7a1"
        },
        "url": "http://127.0.0.1:3000",
        "readyPath": "/",
        "readyTimeoutMs": 30000,
        "browser": "system",
        "autoOpen": true
      }
    ],
    "uiPreviewTargets": [
      {
        "id": "dashboard-detail",
        "uiRef": ".codewiki/kb/product/uis/terminal.md#live-preview",
        "profileId": "web",
        "route": "/dashboard",
        "viewports": ["desktop", "mobile"],
        "scenario": "implemented-change"
      }
    ]
  }
}
```

`wiki_config` and dashboard settings expose computed profile and target digests. Profiles define how one native development server runs; canonical UI targets define which route, scenario, and viewports are shown. Decision-approved frontend Changes declare affected UI refs. Planning freezes exact target/profile digests plus contributing Change, Sprint, and Work Item refs before Implementation. Several targets may share one profile process, and several integrated Changes may contribute to one target. `runner.scriptDigest` remains SHA-256 of exact `package.json` script text and is rechecked before managed start.

Profiles that explicitly select `"browser": "playwright"` also expose a guarded Capture action after readiness. CodeWiki first probes `playwright-cli --version` without a shell, update check, or install side effect. The CLI is a soft CodeWiki dependency but a hard dependency for automated Capture. Capture stays disabled until Open verifies the browser session. If the CLI or browser is unavailable, the dashboard keeps the development server ready and shows explicit installation guidance; Restart reruns the probe.

Capture reuses the isolated Playwright CLI session, applies accepted viewports, writes screenshots and a manifest under `.codewiki/runtime/preview-evidence/`, and records bounded redacted console/network observations. Target manifests correlate canonical UI target/profile digests, route, exact integration Git/tree state, contributing Change Traces and relevant Implementation iterations. CodeWiki never installs Playwright or a browser silently, and capture never grants semantic approval.

## Development commands

```bash
npm run typecheck
npm run build
npm test
npm run test:pack
npm run test:pi-install
npm run test:pi-rpc
npm run test:pi-multiprocess
npm run test:pi-mutation
npm run test:coordinator
npm run test:pi-sdk
npm run test:pi-sdk-package
npm run test:project-local-install
npm run test:external-lifecycle
npm run test:external-failures
npm run test:readiness
npm run lab
npm run lab:gate
npm run lab:forge -- --json
npm run lab:pipeline -- --gate
npm run lab:graph
npm run lab:objective
npm run audit:codewiki
```

Smoke command roles:

- `npm run test:pi-install`: isolated Pi install smoke with temporary Pi settings.
- `npm run test:pi-rpc`: temp-project Pi RPC smoke for `/wiki-bootstrap` and
  `/wiki-dashboard --no-open` dashboard command rendering without a model turn.
- `npm run test:pi-multiprocess`: packs CodeWiki into a disposable external project, starts two real Pi RPC processes plus the dashboard, proves all three share one coordinator generation, then proves supervisor loss pauses new execution and cleanup leaves no daemon.
- `npm run test:pi-mutation`: isolated Pi extension tool mutation smoke;
  previews first, submits semantic candidates without repository authority,
  verifies runtime-owned byte/sequence guards, and reads resulting state through
  `wiki_state`.
- `npm run test:coordinator`: proves multi-client supervision, compatible Decision and Work Item concurrency, serialized Planning/integration/effect lanes, automatic WorkState claim and Assignment dispatch, canonical packet binding, worktree preparation, exact semantic reaction execution, trace-bound runtime job evidence, no-reinvoke restart recovery, pre-append generation fencing, authenticated loopback access, private endpoint metadata, client leases, live-owner exclusion, stale-generation fencing, and dead-process takeover.
- `npm run test:pi-sdk`: unit-proves bounded embedded semantic-session roles,
  exactly-one candidate submission, lifecycle observations, payload limits, and
  project-root containment without starting a model turn.
- `npm run test:pi-sdk-package`: packs CodeWiki, installs it with an explicit
  optional Pi SDK peer in a disposable external project, imports `./pi-sdk`, and
  proves the closed adapter path without starting a model turn.
- `npm run test:project-local-install`: installs the packed package under a
  fresh project's `.pi/npm/node_modules/@nunomoura/codewiki` path and verifies bootstrap,
  config write, and guarded decision append without controlled-test overrides.
- `npm run test:external-lifecycle`: packs and installs CodeWiki into a fresh
  external project, runs `/wiki-bootstrap`, guarded lifecycle appends, runtime
  host worker-output collection, release, and archive close.
- `npm run test:external-failures`: packs and installs CodeWiki into fresh
  external projects and verifies missing/malformed/blocked worker output,
  mixed worker outcomes, and worktree prepare/cleanup failure remediation.
- `npm run test:readiness`: package, state-shape, install-gate, and stale
  wording checks.
- Dormant `self-dogfood:*` scripts remain release-engineering experiments only. They are not normal development commands and must not install CodeWiki into this source checkout.
- Stable extension candidates are packed and exercised through the Pi install, RPC, mutation, project-local, lifecycle, and failure smokes in disposable external projects.
- `npm run lab`: scores the Decision, Planning, and Implementation candidate
  exit standards with DEC, PEC, and IEC.
- `npm run lab:gate`: fails while any lab score exposes false-pass or
  expected-pass-regression gaps.
- `npm run lab:forge`: reduces `.codewiki/traces/TRACE-*.jsonl` into sanitized,
  human-labeled draft case material; it does not make raw traces truth.
- `npm run lab:pipeline -- --gate`: fails while pipeline carryover loses
  decision facts, planning refs, or implementation acceptance coverage.
- `npm run lab:graph`: inspects production and candidate quality graphs by
  loop, layer, node, version, hash, and shared pack identity/authority/rollout.
- `npm run lab:objective`: reports the scalar visible/sealed lab objective for
  the quality-graph candidate surface.
- `npm run audit:codewiki`: full validation/readiness/package/Pi/audit sequence
  run serially.

`src/cli/index.ts` exists only as a temporary development/test harness while the Pi adapter stabilizes. It is not the intended agent-facing CodeWiki OS, and the npm package currently does not expose a CLI binary.

## Pi usage

CodeWiki is not published to the npm registry yet. Its selected registry identity is `@nunomoura/codewiki`, but package metadata keeps `"private": true` so npm refuses publication during stabilization. Current distribution testing uses packed/local package installs only, so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented.

Avoid global/user installs for normal mutation workflows. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi package installation by default and point users back to a project-local packed/local package install until a registry package exists.

CodeWiki does not provide a sandbox. It writes project-local `.codewiki/**` state
and is intended to be compatible with external sandbox, worktree, container, or
agent-harness isolation.

Repo-local Pi settings intentionally load pi-lens only. Do not install CodeWiki, add a controller pin, or add a repo-local `.pi/extensions/codewiki.ts` shim in this source checkout. Consuming projects use reviewed packed artifacts through project-local Pi installation.

Current packed installs expose `/wiki-*` commands and runtime-routed capabilities through the Pi extension. `wiki_state`, `wiki_change`, and `wiki_config` remain generally active. Runtime owns exact Change/Sprint/Work Item/Assignment context, freshness, routing, sequence, parents, source ownership, and trace bytes. Available slash commands are `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`.

Target extension behavior is a thin client of one project service. It ensures or discovers the dashboard, submits intent and exact authority, registers supervision, and reads compact state. Runtime-created embedded sessions perform bounded read-only Decision, Planning, and Implementation review; process/container workers perform Assignment-scoped implementation. Main conversations do not become hidden semantic hosts.

Backlog, Planning, and Implementation are project-wide Work surfaces. Change detail is a dossier joining intent, authority, impact, Planning coverage, Assignment/integration evidence, Git proof, and history. Dev Log stays bounded, redacted, operational, and non-authoritative. After installing a different packed runtime, fully restart Pi rather than relying on `/reload` to replace cached package modules.

## Trace archive cleanup

Completed Change Traces should not stay hot forever. After implementation realization, outcome disposition, and source commit, runtime can invoke the guarded archive API to close/compact a hot `TRACE-*.jsonl` into a replayable stub (`trace_head`, retention checkpoint, and `trace_close`) while a Git restore ref preserves full history. Archive remains testable as a registered adapter but is not normally model-active.

Hydration validates the stub against archived records before restoring full detail. Compaction is therefore cleanup of hot state, not unrecoverable deletion. When cleanup is required, Implementation quality can require an archive disposition: either `post_commit_compact` with `afterCommit: true`, or an explicit `retain_hot` reason.

## Review evidence configuration

CodeWiki owns Implementation review. External tools such as TypeScript, ESLint, Biome, Ruff, Pyright, Go, Cargo, Clippy, and ShellCheck are evidence sensors only; a clean tool run does not prove implementation correctness. Implementation exit still requires acceptance evidence links, changed-path scope, checks, content proof where required, and CodeWiki quality-network gates.

CodeWiki detects the language of changed files by path and extension, similar to Pi-lens file-kind dispatch. A mixed TypeScript/Python/Go/Rust/shell project does not need per-language setup for pack selection: by default, CodeWiki enables all built-in packs and runs only the packs matching the changed paths. Project config is an override for teams that want to disable, allowlist, require, or budget packs.

Project config lives at `.codewiki/config.json`. Config keys are strict at every nesting level; unknown or misspelled keys fail with their full path instead of being ignored. Review behavior is controlled under `quality.review`:

```json
{
  "quality": {
    "review": {
      "enabled": true,
      "autoEvidence": true,
      "includeCachedEvidence": true,
      "timeoutMs": 15000,
      "fastTimeoutMs": 3000,
      "maxCachedEvidenceAgeMs": 600000,
      "enabledPacks": [
        "tsjs.typescript",
        "tsjs.lint",
        "python.ruff",
        "python.pyright",
        "go.test",
        "go.vet",
        "rust.cargo-test",
        "rust.cargo-clippy",
        "shell.shellcheck"
      ],
      "disabledPacks": [],
      "requiredPacks": []
    }
  }
}
```

Pack ids and evidence commands:

| Pack id | Evidence source |
| --- | --- |
| `tsjs.typescript` | project `typecheck` script or local TypeScript `tsc` |
| `tsjs.lint` | project-local ESLint, Biome, or `npm run lint` |
| `python.ruff` | `ruff check --output-format=json` |
| `python.pyright` | `pyright --outputjson` |
| `go.test` | `go test ./...` |
| `go.vet` | `go vet ./...` |
| `rust.cargo-test` | `cargo test --message-format=json` |
| `rust.cargo-clippy` | `cargo clippy --all-targets --all-features --message-format=json` |
| `shell.shellcheck` | `shellcheck --format=json` |

CodeWiki does not install these tools. Missing tools produce `not-run` review evidence with a reason such as missing executable, missing script, or no matching changed files. `wiki_implement.reviewEvidence.skippedPacks` reports packs skipped because they were disabled, not enabled, or had no matching changed files. The Pi edit hook uses the same changed-path language detection for fast review evidence and caches fast findings for Implementation exit.

`requiredPacks` hardens evidence policy for teams that want CI-like gates. A required pack must be enabled and cannot be disabled. When a required pack is relevant to changed files, `fail`, `blocked`, `not-run`, or `no-evidence` status becomes a blocking CodeWiki diagnostic. This does not make the external tool semantically authoritative; it only requires that the configured evidence sensor ran successfully.

Common recipes:

Optional allowlist for a TypeScript-only project:

```json
{
  "quality": {
    "review": {
      "enabledPacks": ["tsjs.typescript", "tsjs.lint"]
    }
  }
}
```

Python project with Ruff only:

```json
{
  "quality": {
    "review": {
      "enabledPacks": ["python.ruff"],
      "disabledPacks": ["python.pyright"]
    }
  }
}
```

Go and Rust project, but skip slower Clippy in normal implementation runs:

```json
{
  "quality": {
    "review": {
      "enabledPacks": ["go.test", "go.vet", "rust.cargo-test"],
      "disabledPacks": ["rust.cargo-clippy"]
    }
  }
}
```

Disable automatic exit evidence while still allowing explicit review reports supplied to `wiki_implement`:

```json
{
  "quality": {
    "review": {
      "autoEvidence": false
    }
  }
}
```

Disable cached fast-edit evidence at Implementation exit:

```json
{
  "quality": {
    "review": {
      "includeCachedEvidence": false
    }
  }
}
```

Require TypeScript and lint evidence to run for changed TypeScript/JavaScript files:

```json
{
  "quality": {
    "review": {
      "enabledPacks": ["tsjs.typescript", "tsjs.lint"],
      "requiredPacks": ["tsjs.typescript", "tsjs.lint"]
    }
  }
}
```

Disable project review policy entirely. Explicit `reviewEvidenceReports` passed directly to `wiki_implement` are still validated as implementation evidence if provided by the caller:

```json
{
  "quality": {
    "review": {
      "enabled": false
    }
  }
}
```

`wiki_implement` returns a compact `reviewEvidence` summary with selected pack ids, report counts, check status counts, diagnostic counts, and blocking diagnostics. `wiki_state` includes trace-backed review summaries and cached fast-review blockers so agents can explain why Implementation is blocked without digging through raw tool output.

## Production readiness and automation gates

Current supported posture:

- Project-local packed/local package installation in disposable external projects; no public npm publish yet.
- Supervised `/wiki-*` and `wiki_*` use in external controlled tests only; the CodeWiki source checkout does not self-host.
- Guarded trace mutation with expected byte and sequence checks.
- Runtime worker output treated as untrusted transport until `wiki_implement`
  validates implementation evidence.
- External sandbox, worktree, container, or agent-harness isolation supplied by
  the user or host environment.

Still gated before production automation:

- Unattended runtime worker start.
- Auto-merge or auto-publish.
- Treating worker completion as semantic truth without implementation preview.
- Global/user CodeWiki installs for normal mutation workflows.
- Public claims that CodeWiki is more token- or speed-efficient than baseline
  agent workflows.

Before enabling unattended worker start or auto-merge, require: multiple successful
external package lifecycle smokes, passing failure-path package smokes, no project-root
ambiguity, no `.codewiki/runtime` scratch leakage after checks, archive/hydrate
validation green, explicit user approval policy for destructive or externally
visible actions, and passing DEC, PEC, and IEC lab gates for core loop exit
quality. Full app benchmarks are deferred until loop exits are hardened.

### Source-repository extension policy

The CodeWiki source repository does not install or load CodeWiki during stabilization. This avoids circular authority, stale controller schemas, prompt injection from an older build, and candidate code evaluating its own workflow state.

Development uses Pi native coding tools, pi-lens, KB updates, source/tests, and Git. Extension behavior is tested only through packed installs in disposable external projects. Stable candidates may be released as normal Pi packages after external install, RPC, mutation, lifecycle, failure, dashboard, and package gates pass.

For the fast dashboard visual-development loop, run:

```bash
npm run dashboard:dev -- --project /tmp/codewiki-dashboard-fixture
```

The project path must identify an existing disposable fixture outside the CodeWiki source tree. The harness opens the loopback dashboard through the system browser by default and reloads changed dashboard assets automatically. Use `--browser playwright` when `@playwright/cli` and its browser are already installed, or `--no-open` for manual and automated checks. This standalone harness does not register Pi commands, load the CodeWiki extension, or create source-checkout workflow state.

Repo-local self-hosting is not required for release. Reintroducing it would require a new explicit decision; historical pins, traces, and approvals grant no authority.
