# codewiki

CodeWiki is being rebuilt as a source-first package.

The old implementation archive has been removed after the migration audit. The rebuilt product surface is Pi-native tools/commands over the core facades; the CLI remains only a temporary development harness during stabilization.

## Current posture

- Package metadata exposes the Pi extension for external Pi installs through `pi.extensions`.
- Repo-local Pi settings load pi-lens and this package through the project-local package path (`..`, relative to `.pi/settings.json`) for controlled dogfooding; do not add a `.pi/extensions/codewiki.ts` shim.
- Project-local `.agents/skills/codewiki-*` skills are limited to semantic loop playbooks: decide, plan, and implement.
- `.codewiki/kb/**` remains source-of-truth documentation for intended product/system design.
- `.codewiki/traces/TRACE-*.jsonl` is the intended workflow/state truth model, following Pi's session JSONL pattern.
- `.codewiki/views/**` is generated/disposable projection output, not truth.
- Other `.codewiki` roots from earlier harness runs are archived migration state, not active execution truth during the rebuild.
- Pi native compaction should handle conversation compression. CodeWiki-owned refresh/compaction windows are disabled with the old extension.

## New source layout

```text
src/
  index.ts
  api/
  decision/
  planning/
  implementation/
  traces/
  views/
  knowledge/
  git/
  runtime/
  error-handling/
  cli/
  pi/
  project/
  utils/
```

The semantic loop roots are `decision`, `planning`, and `implementation`. Each loop is defined by its cycle, high-signal output, and exit conditions. `traces` owns append-only JSONL trace records. `views` owns generated projections such as status, resume, work-plan, work-queue, runtime-board, blockers, and conflicts. Runtime is the outer coordination layer for Triggers, Heartbeats, Runs, work-unit claim selection, leases, boundaries, budgets, policy, and temporary data. `error-handling` owns shared error contracts, normalization, and recovery hints.

Temporary trace scratch belongs under `.codewiki/runtime/tmp/<trace>/<loop>/`. It is cleaned on loop exit after durable trace/KB/source refs exist, preserved on continue/route-back/block when remediation needs it, replaced by superseding iterations, and removed at trace close.

The active migration record lives in `.codewiki/kb/system/migration-audit.md`. Do not restore the old implementation wholesale; recover any future idea only through a new accepted decision, targeted source changes, and tests.

## Requirements

CodeWiki source remains TypeScript-first during the rebuild. Npm packages are built to `dist/**` before packing because Node does not strip TypeScript inside `node_modules`; installed packages target Node.js `>=20.6.0`. Local source commands and tests still use `node --experimental-strip-types`, so use Node.js `>=22.6.0` for development on this scaffold.

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
npm run test:self-dogfood-ready
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
  `/wiki-state --board` without a model turn.
- `npm run test:pi-mutation`: isolated Pi extension tool mutation smoke;
  previews first, rejects unguarded append, appends with expected bytes/sequence,
  and verifies `/wiki-state`.
- `npm run test:project-local-install`: installs the packed package under a
  fresh project's `.pi/npm/node_modules/codewiki` path and verifies bootstrap,
  config write, and guarded decision append without controlled-test overrides.
- `npm run test:external-lifecycle`: packs and installs CodeWiki into a fresh
  external project, runs `/wiki-bootstrap`, guarded lifecycle appends, runtime
  host worker-output collection, release, and archive close.
- `npm run test:external-failures`: packs and installs CodeWiki into fresh
  external projects and verifies missing/malformed/blocked worker output,
  mixed worker outcomes, and worktree prepare/cleanup failure remediation.
- `npm run test:readiness`: package, state-shape, install-gate, and stale
  wording checks.
- `npm run test:self-dogfood-ready`: the heavy gate for fully enabling
  CodeWiki tools inside this repository; it runs the full package/Pi audit plus
  lab gates before repo-local self-dogfood policy can be changed.
- `npm run lab`: scores the Decision, Planning, and Implementation candidate
  exit standards with DEC, PEC, and IEC.
- `npm run lab:gate`: fails while any lab score exposes false-pass or
  expected-pass-regression gaps.
- `npm run lab:forge`: reduces `.codewiki/traces/TRACE-*.jsonl` into sanitized,
  human-labeled draft case material; it does not make raw traces truth.
- `npm run lab:pipeline -- --gate`: fails while pipeline carryover loses
  decision facts, planning refs, or implementation acceptance coverage.
- `npm run lab:graph`: inspects production and candidate quality graphs by
  loop, layer, node, version, and hash.
- `npm run lab:objective`: reports the scalar visible/sealed lab objective for
  the quality-graph candidate surface.
- `npm run audit:codewiki`: full validation/readiness/package/Pi/audit sequence
  run serially.

`src/cli/index.ts` exists only as a temporary development/test harness while the Pi adapter stabilizes. It is not the intended agent-facing CodeWiki OS, and the npm package currently does not expose a CLI binary.

## Pi usage

CodeWiki is not published to the npm registry yet. Current distribution testing uses packed/local package installs only, so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented. The future registry package name is still TBD because the unscoped `codewiki` npm name is already owned by another maintainer.

Avoid global/user installs for normal mutation workflows. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi package installation by default and point users back to a project-local packed/local package install until a registry package exists.

CodeWiki does not provide a sandbox. It writes project-local `.codewiki/**` state
and is intended to be compatible with external sandbox, worktree, container, or
agent-harness isolation.

Repo-local Pi settings load `pi-lens` plus this package through the local package path (`..`, relative to `.pi/settings.json`) for controlled dogfooding. Pi resolves relative package paths against the settings file, so `.` would point at `.pi/` rather than the package root. Do not add a repo-local `.pi/extensions/codewiki.ts` shim; the checkout should exercise the same package manifest path that packed/local installs use. Rebuild `dist/**` and restart/reload Pi before relying on the repo-local extension after source changes.

Installed package use should be through Pi-owned `/wiki-*` commands and the small model-facing `wiki_*` tool set, not through the transitional CLI or archived tools. Runtime coordination remains backend/host plumbing rather than a normal agent tool. Available slash commands are `/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`; the older grouped namespace command has been deprecated. Prefer read-only `/wiki-state` and `/wiki-explain` during early package use; mutation-capable tools still require explicit expected byte/sequence checks.

## Trace archive cleanup

Completed traces should not stay hot forever. After implementation evidence exits and the source changes are committed, the post-commit archive step can run `wiki_archive` with a Git restore ref for that commit. The archive step closes and compacts the hot `TRACE-*.jsonl` file into a minimal replayable stub (`trace_head`, retention checkpoint, and `trace_close`) while the full trace body remains recoverable from Git.

Hydration validates the stub against archived records before restoring full detail. Compaction is therefore cleanup of hot state, not unrecoverable deletion. When cleanup is required, Implementation quality can require an archive disposition: either `post_commit_compact` with `afterCommit: true`, or an explicit `retain_hot` reason.

## Review evidence configuration

CodeWiki owns Implementation review. External tools such as TypeScript, ESLint, Biome, Ruff, Pyright, Go, Cargo, Clippy, and ShellCheck are evidence sensors only; a clean tool run does not prove implementation correctness. Implementation exit still requires acceptance evidence links, changed-path scope, checks, content proof where required, and CodeWiki quality-network gates.

CodeWiki detects the language of changed files by path and extension, similar to Pi-lens file-kind dispatch. A mixed TypeScript/Python/Go/Rust/shell project does not need per-language setup for pack selection: by default, CodeWiki enables all built-in packs and runs only the packs matching the changed paths. Project config is an override for teams that want to disable, allowlist, require, or budget packs.

Project config lives at `.codewiki/config.json`. Review behavior is controlled under `quality.review`:

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

- Project-local packed/local package installation; no public npm publish yet.
- Supervised `/wiki-*` and `wiki_*` use inside the repository being documented.
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

### Self-dogfood re-enable gate

Fully using CodeWiki `wiki_*` tools inside this repository is a separate,
supervised self-dogfood step from public production automation. It is not enabled
merely because the package can be built.

Self-dogfood status: enabled for this source checkout by
`trace:TRACE-self-dogfood-reenabled-v1#row:DTR-self-dogfood-reenable-approved`
after `npm run test:self-dogfood-ready` passed and the gate implementation trace
reported matching content proof.

The self-dogfood re-enable gate remains the ongoing safety bar:

1. `npm run test:self-dogfood-ready` passes from a clean checkout state.
2. The latest self-repo CodeWiki implementation trace covers every touched source,
   test, README, and KB path and its content proof matches the current files.
3. No generated/disposable `.codewiki/**` roots outside `config.json`, `kb/`,
   `traces/`, and `views/` are treated as active truth.
4. Repo-local Pi still loads CodeWiki only through the project-local package path
   in `.pi/settings.json`; no `.pi/extensions/codewiki.ts` shim or global/user
   install is used for mutation workflows.
5. A durable decision trace explicitly approves self-dogfood re-enable and states
   the remaining limits: preview before append, expected byte/sequence guards,
   no unattended worker start, no auto-merge, and no auto-publish.

Current repo operating guidance allows supervised CodeWiki Pi-tool dogfood in
this checkout. Start with read-only `wiki_state`, then use preview-mode
`wiki_decide`, `wiki_plan`, or `wiki_implement` before any guarded append. Keep
expected-byte/sequence guards, project-local install scope, and manual review of
mutation previews. Do not enable unattended worker start, auto-merge, or
auto-publish without a new gate and decision trace.
