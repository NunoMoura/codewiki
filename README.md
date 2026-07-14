# codewiki

CodeWiki is being rebuilt as a source-first package.

The old implementation archive has been removed after the migration audit. The rebuilt product surface is Pi-native tools/commands over the core facades; the CLI remains only a temporary development harness during stabilization.

## Current posture

- Package metadata exposes the Pi extension for external Pi installs through `pi.extensions`.
- Repo-local Pi settings load pi-lens plus the verified controller installed at `.pi/npm/node_modules/codewiki`. Mutable source is never loaded through `..`, and no `.pi/extensions/codewiki.ts` shim is allowed.
- Project-local `.agents/skills/codewiki-*` skills are limited to semantic loop playbooks: decide, plan, and implement.
- `.codewiki/kb/**` remains source-of-truth documentation for intended product/system design.
- `.codewiki/traces/TRACE-*.jsonl` is the intended workflow/state truth model, following Pi's session JSONL pattern.
- `.codewiki/views/**` is generated/disposable projection output, not truth.
- Other `.codewiki` roots from earlier harness runs are archived migration state, not active execution truth during the rebuild.
- Pi native compaction should handle conversation compression. CodeWiki-owned refresh/compaction windows are disabled with the old extension.
- Decision, Planning, and Implementation production standards are strict immutable `kernel` quality packs in `enforce` mode. Lab candidates use the same closed schema with `authority: lab` and `rollout: observe`; lab results cannot replace kernel standards or advance the pinned controller.

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

The active migration record lives in `.codewiki/kb/system/flows/migration-audit.md`. Do not restore the old implementation wholesale; recover any future idea only through a new accepted decision, targeted source changes, and tests.

## Requirements

CodeWiki source remains TypeScript-first during the rebuild. Npm packages are built to `dist/**` before packing because Node does not strip TypeScript inside `node_modules`; installed packages target Node.js `>=20.6.0`. Local source commands and tests still use `node --experimental-strip-types`, so use Node.js `>=22.6.0` for development on this scaffold.

## OKF compatibility

CodeWiki exports and validates `.codewiki/kb/**/*.md` as Open Knowledge Format v0.1. Trace files remain outside OKF: `.codewiki/traces/TRACE-*.jsonl` is workflow truth and is filtered before OKF parsing.

```ts
import { runWikiOkf } from "codewiki";

const validation = runWikiOkf({ action: "validate", files });
const exported = runWikiOkf({ action: "export", files });
const consumed = runWikiOkf({ action: "consume", files: exported.files });
```

`validate` and `export` default to CodeWiki KB scope and only include `.codewiki/kb/**/*.md`. `consume` defaults to generic OKF bundle scope for imported OKF markdown. Unknown producer frontmatter fields are preserved during consume/export round trips. OKF compatibility is format-level only; CodeWiki does not depend on BigQuery, Gemini, Google Cloud Knowledge Catalog, or the Google OKF reference agent.

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
npm run test:self-dogfood-candidate
npm run self-dogfood:baseline:create -- --review-ref <ref> --approved-by <name>
CODEWIKI_BASELINE_MANIFEST=<path> npm run self-dogfood:baseline:verify
npm run self-dogfood:controller:install
CODEWIKI_BASELINE_MANIFEST=<path> npm run test:self-dogfood-shadow
CODEWIKI_BASELINE_MANIFEST=<path> npm run test:self-dogfood-ready
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
- `npm run test:self-dogfood-candidate`: runs the full package/Pi audit and lab
  gates for the current candidate without granting it authority over itself.
- `npm run self-dogfood:baseline:create -- --review-ref <ref> --approved-by
  <name>`: refuses a dirty checkout, reruns candidate gates, packs the reviewed
  commit, and writes a host-owned ignored manifest under `.pi/npm/codewiki-baselines/**`
  containing the Git tree content proof, package SHA-256, review identity, and
  gate results.
- `npm run self-dogfood:baseline:verify`: requires
  `CODEWIKI_BASELINE_MANIFEST`, verifies the manifest, tarball bytes, Git commit,
  and tree, and can enforce a clean candidate checkout.
- `npm run self-dogfood:controller:install`: checks the tracked controller pin,
  rebuilds the reviewed commit in a detached temporary worktree, requires an
  exact package byte count and SHA-256 match, and installs that artifact under
  `.pi/npm/node_modules/codewiki` without loading mutable source.
- `npm run test:self-dogfood-shadow`: installs the verified package under a
  disposable project's `.pi/npm`, runs baseline `wiki_state`, read-only
  `wiki_config`, and `wiki_decide` preview calls, and proves the source config and
  traces kept the same digest.
- `npm run test:self-dogfood-ready`: requires a clean candidate plus a verified
  baseline manifest, reruns candidate gates, and then runs the disposable shadow
  smoke. Passing plus the verified installer and explicit approval permits only
  supervised pinned-controller activation.
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

CodeWiki is not published to the npm registry yet. Current distribution testing uses packed/local package installs only, so the package, Pi settings, and `.codewiki/**` state all belong to the repository being documented. The future registry package name is still TBD because the unscoped `codewiki` npm name is already owned by another maintainer.

Avoid global/user installs for normal mutation workflows. Mutation-capable `/wiki-*` commands and `wiki_*` tools enforce project-local Pi package installation by default and point users back to a project-local packed/local package install until a registry package exists.

CodeWiki does not provide a sandbox. It writes project-local `.codewiki/**` state
and is intended to be compatible with external sandbox, worktree, container, or
agent-harness isolation.

Repo-local Pi settings load the verified controller beside pi-lens. The reviewed baseline, shadow, and installer gates pass, and `.pi/codewiki-controller.json` lets fresh clones rebuild and verify the exact reviewed tarball with `npm run self-dogfood:controller:install` before starting Pi. Self-dogfood loads only `.pi/npm/node_modules/codewiki`; it never loads mutable source through `..`. Do not add a repo-local `.pi/extensions/codewiki.ts` shim.

Installed package use should be through Pi-owned `/wiki-*` commands and the small model-facing `wiki_*` tool set, not through the transitional CLI or archived tools. Runtime coordination remains backend/host plumbing rather than a normal agent tool. Available slash commands are `/wiki-dashboard`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, and `/wiki-bootstrap`; the older grouped namespace command has been deprecated. `/wiki-dashboard` opens the local read-only Sprints Queue in a browser. Agents use internal `wiki_state` for trace reads; mutation-capable tools still require explicit expected byte/sequence checks.

Implementation Trace Detail presents one trace-level Implementation Loop with Task Assignment worker attempts beneath it, followed by aggregate Integration and Exit Review. The Activity Feed explains meaningful progress, impact, and next action in plain language. The Dev Log provides bounded, redacted operational diagnostics for active, blocked, or failed work without becoming semantic evidence. Dashboard startup verifies that pipeline state is served; after installing a different pinned runtime, fully restart Pi rather than relying on `/reload` to replace cached package modules.

## Trace archive cleanup

Completed traces should not stay hot forever. After implementation evidence exits and the source changes are committed, the post-commit archive step can run `wiki_archive` with a Git restore ref for that commit. The archive step closes and compacts the hot `TRACE-*.jsonl` file into a minimal replayable stub (`trace_head`, retention checkpoint, and `trace_close`) while the full trace body remains recoverable from Git.

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

- Project-local packed/local package installation; no public npm publish yet.
- Supervised `/wiki-*` and `wiki_*` use in external, controlled, and this
  pinned-controller project.
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

Self-dogfood status: supervised pinned-controller autoload is enabled for
reviewed commit `f87088c3927f69e7635ca4826656998651e41c6c` and package SHA-256
`0b1837165ab04a1433a32e9ae54c4ec06591d88be637169b4abe6440f3eb6b2e`.
The controller was rebuilt byte-for-byte from Git history and installed under
`.pi/npm`; mutable candidate source cannot grade itself. The earlier
`trace:TRACE-self-dogfood-reenabled-v1#change:CHG-self-dogfood-reenable-approved`
remains historical evidence, not approval for another controller.

The self-dogfood re-enable gate is:

1. A reviewed clean commit is packed with
   `npm run self-dogfood:baseline:create -- --review-ref <ref> --approved-by
   <name>`. Its host-owned ignored manifest under
   `.pi/npm/codewiki-baselines/**` pins the commit, Git tree content proof,
   package byte count, SHA-256, reviewer, and passing candidate gates.
2. With `CODEWIKI_BASELINE_MANIFEST` pointing at that manifest,
   `npm run test:self-dogfood-ready` verifies the immutable controller, requires
   a clean candidate checkout, reruns candidate gates, and executes shadow
   reads/previews. The mutable candidate checkout does not judge itself.
3. `npm run self-dogfood:controller:install` reconstructs the pinned commit in a
   detached worktree, verifies exact package bytes and SHA-256, and installs only
   that artifact under `.pi/npm`.
4. Disposable external dogfood covers successful lifecycle runs, append
   conflicts, malformed worker output, worktree failures, and cleanup.
5. The baseline package produces acceptable read-only and preview results in
   shadow mode before it may append this repository's trace truth.
6. No generated/disposable `.codewiki/**` roots outside `config.json`, `kb/`,
   `traces/`, and `views/` are treated as active truth.
7. Explicit approval enables only supervised use: preview before append,
   expected byte/sequence guards, no unattended worker start, no auto-merge, and
   no auto-publish.

Current repo operating guidance permits supervised CodeWiki use through the
pinned controller: read state first, preview before every append, preserve
expected byte/sequence guards, and continue using normal Git/tests for source
verification. Unattended workers, auto-merge, and auto-publish remain disabled.
