---
type: System Component
title: Checks
description: Owns Check, Check Pack, Pack Skill snapshot, Check SDK, bounded execution, Result, Gate Report, caching, and fail-fast contracts.
status: stable
tags: [system, component]
codewiki_component: checks
codewiki_source_patterns: ["src/checks/**"]
codewiki_test_patterns: ["tests/checks/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Checks supplies the System responsibility required by this Story.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Checks supplies the portable authoring, composition, input, output, and sandbox contracts required by this Story.
---
# Checks

Checks is a root domain alongside Changes and Stage Loops. A Check defines one pass/fail boundary for one exact stage subject. A stage-local Check Pack groups Checks and may contain one optional producer Skill. Checks owns file contracts, discovery, bounded input, Skill snapshots, Check SDK, execution coordination, Results, cache identity, and Gate reduction; Runtime owns concrete transports.

## Project files

```text
.codewiki/check-packs/<stage>/<pack>/
  skill/                       # optional
    <skill-name>/
      SKILL.md
      <Agent Skill resources>
  <check-id>/
    check.json
    CHECK.md | CHECK.mjs
.codewiki/check-packs.lock.json
```

A Pack is its stage-local directory; there is no extra `checks/` level or required local manifest. The optional reserved `skill/` directory contains exactly one Agent Skill directory whose name matches `SKILL.md` frontmatter. That directory may contain scripts, references, assets, and other standard Skill files. Every other Pack-root directory is one Check with `check.json` and exactly one implementation: `CHECK.mjs` for Code or `CHECK.md` for Model. Checks have no runtime resource tree; authored libraries and reusable Check code are bundled into `CHECK.mjs`.

Bootstrap creates one empty editable `default/` Pack per stage once, without a hidden Skill or Check. Users may add, replace, or delete any content, and upgrade never restores it. A stage with zero Checks passes with `selectedCheckCount: 0` and warning `no_checks_configured`, including when a Skill-only Pack exists. Empty named Packs warn without creating synthetic Results or a separate status.

After bootstrap, only direct project-file edits or explicit authenticated App actions create, install, update, or restore Pack files. A user-controlled external Agent may edit them as the User's chosen editor. Folder presence defines the active set; no protected floor, enforcement tier, activation ceremony, or hidden catalog exists.

## Pack Skills

A Pack Skill shapes producer behavior but never judges output. Project Server supplies exact Skills from current stage Packs to a work-producing Agent in stable Pack-ID order with no hidden precedence. Each immutable bounded snapshot binds stage, Pack, Skill name, complete file manifest and digests, and aggregate digest to the producer attempt and receipt. Ambient Run Process and delegated-product Skills stay disabled for Backend-owned production; one Runtime Plugin loads exact snapshots through DSH. A delegated route is eligible only when its adapter receipts the supplied bytes.

Pack Skills are harness-neutral Agent Skills, not CodeWiki or Cordis plugins, product settings, or package hooks. Scripts and setup guidance run only when the producer invokes them through tools already admitted for its stage attempt or Implementation Assignment. `allowed-tools` cannot create absent tools, credentials, network, write capability, lifecycle transitions, or effects. Code and Model Check executors receive no Pack Skill, resource, producer memory, or tool.

A Skill change stales affected producer work but remains separate from Check Pack and Result cache identity. Changing guidance does not invalidate a completed Result over an otherwise identical exact subject; newly produced subjects naturally receive new identity. Conflicting Skills remain visible project configuration rather than hidden precedence. Post-Gate Outcome Diagnostics may propose a non-authoritative exact Skill diff with supporting Result and base-digest references, but the proposal is ordinary Change Intake Material and can change project files only through the normal four-stage lifecycle and an authenticated expected-head write.

## One Check, one contract

Each registered top-level Check declares one atomic requirement, pass condition, fail condition, stable failure code, and feedback contract. Its implementation may inspect several facts or compose several Checks internally, but only the registered boundary returns one measurement and at most one failure object. Multiple supporting locations are allowed; different authoritative failure codes or feedback responses require separate registered Checks.

Checks have independent implementation and measurement axes:

```text
implementation: code | model
measurement:    binary | quantitative
```

A binary Check returns one boolean. A quantitative Check returns one finite number, while `check.json` defines its minimum, maximum, or both. Checks derives pass or fail and rejects contradictory verdicts. Each completed Result retains exact measurement, threshold, Check and configuration digests, input digest, execution identity, and either no feedback or one failure.

Model `CHECK.md` defines ordered Requirement, Pass, Fail, and Feedback sections. Checks supplies the fixed bounded structured-output protocol. The Check runs in one isolated tool-free session over exact input; lack of proof follows the authored fail condition. Its route is independent from producer and Implementation Worker routes, with no inherited tools, Skill, memory, context query, programmatic runtime, or fallback.

Code `CHECK.mjs` consumes language-neutral Check Input and returns bounded Check Output through an admitted sandbox. It is deterministic and hermetic over declared snapshot-bound input. Project Server enforces time, resource, output, filesystem, and process bounds plus network denial. No host credentials, canonical-write authority, package installation, or host fallback enters the sandbox. Marketplace Code Checks arrive self-contained and prebundled.

## Check Author SDK and composition

The SDK exposes two authoring primitives. A Probe gathers bounded snapshot-bound facts without deciding pass or fail. A Check evaluates facts as a binary or quantitative judgment. Probes may be shared and memoized within one Invocation while retaining provenance, coverage, truncation, and staleness. Checks may invoke Probes and compose Checks with deterministic all, any, none, count, iteration, and score semantics.

Registration provides the authority boundary. The default top-level Check beside `check.json` alone receives independent Result, cache, retry, stable failure-code, feedback, and Gate identity. Imported or nested Checks inherit its immutable context, limits, and cancellation and return only local outcomes and findings. They create no platform Result or runtime dependency. Installed Checks never resolve another installed Check by Pack identity.

Check Authors keep source, tests, fixtures, and dependencies in their own package or repository. Ordinary pure libraries, Probes, and Checks are bundled into one readable self-contained `CHECK.mjs`. Active Packs receive no author source, test, fixture, dependency installation, or Check resource tree. Developer tooling may validate, bundle, run fixtures, preview through an admitted sandbox, and replay historical Invocations, but cannot install, activate, mutate, or route Packs.

The SDK exposes one reserved read-only `codewiki` binding over declared OKF Knowledge, repository files, code, tests, local revisions and commits, pull-request Evidence, Change and Work Item state, and Alignment facts. It supports horizontal inspection within a layer and vertical traversal from Knowledge through source ownership, tests, revisions, accepted work, Evidence, and Results. Every bounded query page identifies query and complete snapshot digests, source references, deterministic ordering, provenance, coverage, unknowns, truncation, cursor position, query-engine identity, and staleness. The trusted host records each query for Result provenance. The SDK builds diagnostics and wraps the final measurement in fixed Check Output; it exposes no producer context, live repository mutation, provider network, credential, Gate, lifecycle, effect, or persistent program state.

## Execution and Gate outcomes

Checks snapshots exact stage subject, Check files, inputs, Evidence, configuration, and execution identities. Mid-run change makes the attempt stale. Pack parsing compiles once per content digest. Cache keys bind subject, Check, configuration, selected input, Evidence, execution identity, and model route; only completed pass or fail Results are cacheable.

Installed Checks declare no runtime dependencies. Pack order cannot create prerequisites. Source-level composition is permitted because the complete closure is bundled before installation. Execution resolves exact cache hits, runs uncached Code Checks in bounded parallel, stops before Model Checks after Code failure or stop, otherwise runs Model Checks in bounded parallel, and stops launching queued work after a conclusive outcome. Running work receives best-effort cancellation; stable registered Check identity orders persisted output.

A Result exists only when one registered Check completes `passed` or `failed`. Timeout, cancellation, unavailable execution, invalid output, exhausted budget, failed input collection, incomplete snapshot query, or unrecoverable staleness produces no Result. Project Server may retry transient failure within bounds; exhaustion stops the Gate while preserving canonical state.

A Gate Report is `passed`, `failed`, or `stopped`. It passes only when all present Checks pass, fails when any Check fails, and stops when a required valid Result cannot be produced. Zero Checks is the explicit passing warning case. Malformed Check or Pack Skill content stops only the affected stage operation that requires it and never crashes another project or read-only inspection.

Gate Reports carry Results, execution and cancellation facts, cache use, warnings, exact stage and subject identity, and any stop reason. Gates never choose stages or perform effects. Project Server applies fixed lifecycle transitions. Failed Results return exact semantic feedback to the responsible Stage Loop; stopped runs return operational recovery to the User.
