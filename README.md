# codewiki

CodeWiki is being rebuilt as a source-first package.

The old implementation archive has been removed after the migration audit. The rebuilt product surface is Pi-native tools/commands over the core facades; the CLI remains only a temporary development harness during stabilization.

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

## Changes Backlog and control center

The Changes Backlog is a generated view over persisted Change Traces whose current Decision state is pending. Change is the accountable carrier of intent; Decision is the loop that refines, validates, and approves an exact revision, not another entity. First explicit persistence creates one append-only JSONL Change Trace. That trace follows the same Change through approval, Planning-created Sprints and Work Items, runtime Assignments, Implementation realization, outcome disposition, and retention. A validation card still shows Current state, Proposed change, Agent opinion, content revision, record revision, digest, lifecycle status, and validation state from one bounded projection.

`wiki_change` can draft, revise, validate, link, split, merge, defer, reject, withdraw, and query Change revisions under exact Change-Trace-store head and record-revision guards. Bounded feedback intake deterministically reinforces a match or creates only a pending unvalidated Change. It cannot approve intent, create Planning truth, launch workers, edit source, publish, or advance a controller. CodeWiki has no hidden Git-ref Change store or backwards-compatibility importer; pre-release history remains available through normal Git history.

Planning observes a bounded project-wide portfolio of approved Changes and owns Sprint creation. One Change may span several Sprints, and one Sprint may coordinate several Changes. Every Work Item has exactly one owning Change and may contribute explicitly to others; runtime grants bounded Assignment attempts. `WorkState` is the disposable typed projection joining Change Traces with KB, source ownership, source/tests/Git, configuration, and runtime observations. `WorkStateSession` streams each JSONL trace once and then parses only appended bytes while runtime stays alive; loss of memory causes a normal rebuild. SQLite is not required.

In a consuming project, an eligible Pi TUI session opens the dashboard automatically once. Its Work Pipeline uses one card per Change journey, with attached Sprints, Work Items, Assignments, Knowledge, files, previews, evidence, and outcomes. Five independent bars remain Change orange, Decision yellow, Planning green, Implementation blue, and Committed teal. Blockers render as `✕ Blocked — reason`. Resume, Change, and Resolve Blocker use a guarded same-session `pi.sendUserMessage()` bridge. Configuration remains a grouped bounded form; raw JSON and Close Dashboard are not settings UX.

Worker dispatch resolves a deterministic execution policy before claim append and child-process creation. The selected provider, model, thinking level, allowed tools, timeout, immutable pricing snapshot, budget, and policy digest travel through handoff, start, observation, and guarded resume. Attached supervision and usage telemetry are mandatory. Policy drift, route mismatch, missing usage, exhausted limits, monitoring loss, detached execution, or invalid escalation stops the attempt without granting semantic authority.

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

The semantic loop roots are `decision`, `planning`, and `implementation`. Runtime is their supervised event-driven outer loop. Each semantic loop owns typed inputs, typed outputs, quality standards, and exit conditions. `traces` owns one append-only JSONL journey per persisted Change. `work-state` derives shared current project state; `views` render bounded projections such as Change Journey, Sprints, work plan/queue, runtime, blockers, and conflicts. Runtime owns triggers, Assignment claims, workers, integration, budgets, policy, guarded appends, and temporary data. `error-handling` owns shared errors and recovery hints.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<change-trace>/<loop>/`. It remains non-authoritative and is cleaned only after durable trace/KB/source/Git or recovery refs exist.

The active migration record lives in `.codewiki/kb/system/flows/migration-audit.md`. Do not restore the old implementation wholesale; recover any future idea only through a new accepted decision, targeted source changes, and tests.

## Requirements

CodeWiki source remains TypeScript-first during the rebuild. Npm packages are built to `dist/**` before packing because Node does not strip TypeScript inside `node_modules`; installed packages target Node.js `>=20.6.0`. Local source commands and tests still use `node --experimental-strip-types`, so use Node.js `>=22.6.0` for development on this scaffold.

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

## Live Preview profiles

Declare profiles in `.codewiki/config.json`:

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
    ]
  }
}
```

`wiki_config` and dashboard settings expose computed profile digests. Target architecture separates profiles (how one native development server runs) from canonical KB UI targets (which route, scenario, and viewports are shown). Decision-approved frontend Changes declare affected UI refs; Planning freezes exact target/profile digests for implementation. Several targets may share one profile, and several integrated Changes may contribute to one UI route. `runner.scriptDigest` remains SHA-256 of exact `package.json` script text and is rechecked before managed start. Current single-Sprint binding is a compatibility implementation pending this Change-rooted target migration.

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
npm run test:pi-mutation
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
- `npm run test:pi-mutation`: isolated Pi extension tool mutation smoke;
  previews first, rejects unguarded append, appends with expected bytes/sequence,
  and verifies internal state through `wiki_state`.
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

Installed package use should be through Pi-owned `/wiki-*` commands and runtime-routed capabilities, not the transitional CLI. `wiki_state`, `wiki_change`, and `wiki_config` remain generally active; runtime derives WorkState and activates at most one registered Decision, Planning, or Implementation host adapter. Unrelated loop schemas and archive lifecycle stay out of model context. Available slash commands are `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`. Dashboard opens automatically once for an eligible Pi TUI session; `/wiki-dashboard` reopens it, `--no-open` returns URL, and `--stop` stops local host.

Change Trace Detail follows one Change journey. Planning-created Sprints and Work Items, Assignment attempts, aggregate Integration and Exit Review, evidence, and outcome disposition remain attached to that identity. Activity Feed explains progress, impact, and next action. Dev Log stays bounded, redacted, operational, and non-authoritative. After installing a different packed runtime, fully restart Pi rather than relying on `/reload` to replace cached package modules.

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
