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

A Pack is its stage-local directory; it has no extra `checks/` level or local manifest. Optional `skill/` contains one standard Agent Skill directory. Every other root directory is one Check with `check.json` and exactly one `CHECK.mjs` or `CHECK.md`. Code dependencies are bundled into self-contained `CHECK.mjs`.

Bootstrap creates one empty editable `default/` Pack per stage once. Users may replace or delete all content; upgrades never restore it. Zero Checks passes with `selectedCheckCount: 0` and `no_checks_configured`, including Skill-only Packs, without synthetic Results.

After bootstrap, only direct file edits or authenticated App actions change Packs. Folder presence defines active policy; no protected floor, tier, activation ceremony, or hidden catalog exists.

Project Server resolves every active Pack in one stage into one deterministic stage-wide Check Pack policy snapshot. Implementation uses the same resolved policy for every Work Unit Candidate. Planning, Work Units, workers, routes, and models cannot select bespoke Pack subsets or variants. Only exact Gate Evaluation Package inputs vary by Work Unit. Deterministic Check applicability may return `not_applicable`; it does not create another policy. Editing an Implementation Pack creates a new stage-wide snapshot and stales affected remaining Results uniformly.

## Pack Skills

A Pack Skill guides production but never judges output. Project Server supplies exact current stage Skills in stable Pack-ID order. Each bounded snapshot binds stage, Pack, name, complete file manifest, and digests to producer attempt and receipt. Ambient Skills stay disabled; delegated routes qualify only when their adapter receipts supplied bytes.

Pack Skills are harness-neutral Agent Skills, not plugins or settings. Their files run only through tools already admitted for the attempt. `allowed-tools` creates no capability. Check executors receive no Skill, producer memory, or tool.

Skill changes stale affected production but stay outside Result cache identity. Conflicts remain visible configuration. Outcome Diagnostics may propose an exact Skill diff only as ordinary Change Intake.

## One Check, one contract

Each registered top-level Check declares one atomic requirement, pass condition, fail condition, stable failure code, and feedback contract. Its implementation may inspect several facts or compose several Checks internally, but only the registered boundary returns one measurement and at most one failure object. Multiple supporting locations are allowed; different authoritative failure codes or feedback responses require separate registered Checks.

Checks have independent implementation and measurement axes:

```text
implementation: code | model
measurement:    binary | quantitative
```

A binary Check returns one boolean. A quantitative Check returns one finite number, while `check.json` defines its minimum, maximum, or both. Checks derives pass or fail and rejects contradictory verdicts. Each completed Result retains exact measurement, threshold, Check and configuration digests, input digest, execution identity, and either no feedback or one failure.

Model `CHECK.md` defines ordered Requirement, Pass, Fail, and Feedback sections. Checks supplies the fixed bounded structured-output protocol. Every top-level Model Check invocation runs in its own fresh isolated tool-free DSH Agent Session over exact declared Gate Evaluation Package input; independent Checks may run in bounded parallel. Lack of proof follows the authored fail condition. Its route is independent from producer and Implementation Worker routes, with no inherited tools, Skill, memory, material query, programmatic runtime, compaction continuation, other Check result, or fallback.

Code `CHECK.mjs` consumes language-neutral Check Input and returns bounded Check Output through an admitted sandbox. It is deterministic and hermetic over declared snapshot-bound input. Project Server enforces time, resource, output, filesystem, and process bounds plus network denial. No host credentials, canonical-write authority, package installation, or host fallback enters the sandbox. Marketplace Code Checks arrive self-contained and prebundled.

## Check Author SDK and composition

A Probe gathers bounded facts without judging; a Check returns binary or quantitative judgment. Probes may be memoized within one Invocation while retaining provenance and coverage. Checks compose through deterministic all, any, none, count, iteration, and score semantics.

Only the registered top-level Check beside `check.json` receives Result, cache, retry, failure-code, feedback, and Gate identity. Nested Checks inherit immutable context and limits and return local findings only. Installed Checks never resolve another installed Check by Pack identity.

Authors retain source, tests, fixtures, and dependencies externally and bundle active Code Checks into readable self-contained `CHECK.mjs`. Developer tooling may validate, bundle, sandbox-preview, and replay Invocations, but cannot mutate or route Packs.

The reserved read-only `codewiki` binding queries only declared Gate Evaluation Package inputs: Knowledge, repository, revisions, Evidence, Change and Work Unit state, and Alignment. Horizontal and vertical queries retain package/snapshot digests, sources, order, provenance, coverage, unknowns, truncation, cursor, engine, and staleness. Host records each query. SDK returns fixed Check Output and exposes no producer material, live mutation, network, credential, lifecycle, effect, or persistent state.

## Execution and Gate outcomes

Project Server freezes one immutable Gate Evaluation Package at Candidate checkpoint; Checks receives only its declared exact subject, Check files, inputs, Evidence, configuration, and execution identities. Producer Project Material Generations remain separate and cannot become implicit Check input. Mid-run change makes the attempt stale. Pack parsing compiles once per content digest. Cache keys bind Candidate subject, Check, configuration, selected input, Evidence, execution identity, and model route; only completed pass or fail Results are cacheable.

Installed Checks declare no runtime dependencies. Pack order cannot create prerequisites. Source-level composition is permitted because the complete closure is bundled before installation. Execution resolves exact cache hits, runs uncached Code Checks in bounded parallel, stops before Model Checks after Code failure or stop, otherwise runs Model Checks in bounded parallel, and stops launching queued work after a conclusive outcome. Running work receives best-effort cancellation; stable registered Check identity orders persisted output.

A Result exists only when one registered Check completes `passed` or `failed`. Timeout, cancellation, unavailable execution, invalid output, exhausted budget, failed input collection, incomplete snapshot query, or unrecoverable staleness produces no Result. Project Server may retry transient failure within bounds; exhaustion stops the Gate while preserving canonical state.

A Gate Report is `passed`, `failed`, or `stopped`. It passes only when all present Checks pass, fails when any Check fails, and stops when a required valid Result cannot be produced. Zero Checks is the explicit passing warning case. Malformed Check or Pack Skill content stops only the affected stage operation that requires it and never crashes another project or read-only inspection.

Gate Reports carry Results, execution and cancellation facts, cache use, warnings, exact stage and subject identity, and any stop reason. Gates never choose stages or perform effects. Project Server applies fixed lifecycle transitions. Failed Results return exact semantic feedback to the responsible Stage Loop; stopped runs return operational recovery to the User.
