---
type: System Component
title: Checks
description: Owns Check and Check Pack contracts, bounded execution, Results, Gate Reports, caching, and fail-fast reduction.
status: stable
tags: [system, component]
codewiki_component: checks
codewiki_source_patterns: ["src/checks/**"]
codewiki_test_patterns: ["tests/checks/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Checks supplies the System responsibility required by this Story.
---
# Checks

Checks is a root domain alongside Changes and Loops. A Check defines one exact pass/fail boundary for one stage subject. A Check Pack groups Checks under Decision, Planning, Implementation, or Review. Checks owns portable file contracts, discovery, bounded input, generic execution coordination, exact Results, cache identity, and Gate reduction; concrete Pi and sandbox transports remain with Managed Execution.

## Project files

Active project Check content uses one direct, user-editable layout:

```text
.codewiki/check-packs/
  decision/
    default/
      <check-id>/
        check.json
        CHECK.md | CHECK.mjs
    <pack-name>/
      <check-id>/
        check.json
        CHECK.md | CHECK.mjs
  planning/
    default/
    <pack-name>/
  implementation/
    default/
    <pack-name>/
  review/
    default/
    <pack-name>/
.codewiki/check-packs.lock.json
```

A Pack is its stage-local grouping directory; there is no additional `checks/` level or required local Pack manifest. Every Check directory contains `check.json` and exactly one implementation file. `CHECK.mjs` is a Code Check. `CHECK.md` is a Model Check.

CodeWiki materializes one deliberately empty bare-bones `default/` Pack directory for each stage only during project bootstrap. Empty defaults establish the editable stage layout without inventing a hidden standard or requiring an execution capability. Users may add Checks, replace a default, or delete any default or every Check. Startup and upgrade never recreate a deliberately removed default. If a stage contains no Checks, its Gate Report remains `status: passed`, carries `selectedCheckCount: 0`, and includes warning code `no_checks_configured` with message `No <Stage> Checks are configured. Gate passed without running Checks.` There is no `passed_with_warning` status. An empty named Pack emits a Pack-specific warning. Neither condition creates a synthetic Result or stops CodeWiki.

Outside one-time bootstrap, CodeWiki never autonomously authors, edits, installs, updates, or restores Check Pack files. Users edit them directly or perform explicit creation, marketplace installation, and update actions through the authenticated CodeWiki App. A user-controlled external agent may follow the same public schemas and documentation and edit the same files. Folder presence defines the active stage set; there is no protected Check floor, enforcement tier, activation ceremony, or hidden hardcoded catalog.

## One Check, one contract

Each Check declares one atomic requirement, one pass condition, one fail condition, one stable failure code, and one feedback contract. Atomic means one exact input maps to one declared decision boundary and one feedback response; implementation may inspect several facts internally. A pass contains no feedback. A fail contains exactly one failure object. Multiple locations or factual details may support that one failure, but different failure codes or feedback responses require separate Checks.

Checks have two independent axes:

```text
implementation: code | model
measurement:    binary | quantitative
```

A binary Check returns one boolean value. A quantitative Check returns one finite number, and `check.json` defines its minimum, maximum, or both. Checks derives pass or fail from the value and threshold; the Check cannot report a contradictory verdict. Every completed Result retains its exact measurement, threshold, Check and configuration digests, bounded input digest, execution identity, and either no feedback or one failure object.

Model Check `CHECK.md` defines Requirement, Pass, Fail, and Feedback sections. Checks supplies one fixed bounded structured-output protocol that the rubric cannot redefine. The Check runs in one isolated, tool-free model session over exact bounded input. Lack of proof within valid supplied input follows the authored fail condition. The configured Check model route is separate from work-producing routes and may require a distinct model or provider according to project configuration; no ambient Worker route, tools, memory, or fallback is inherited.

A Code Check consumes the language-neutral Check Input and returns one bounded Check Output from an admitted sandbox. It must be deterministic and hermetic over declared input; Runtime enforces time, resource, output, filesystem, and process bounds plus network denial. It receives no host credentials, canonical-write authority, or unsandboxed fallback. Marketplace Code Checks are supplied as prebundled files rather than install-time executable dependencies.

## Execution and performance

Checks snapshots exact stage files and configuration before each Gate attempt. A mid-run stage subject, Pack, input, or route change makes the attempt stale; Runtime discards it and starts from a fresh snapshot when still eligible. Pack parsing and validation compile once per content digest. Result cache keys bind stage subject, Check, configuration, selected input, Evidence, execution identity, and model route. Only completed pass or fail Results are cacheable.

Checks do not declare dependencies on other Checks. Pack order cannot create hidden prerequisites; each Check consumes only its declared bounded inputs, and Gate reduction uses stable Check identity.

Execution is bounded and fail-fast:

```text
resolve exact cache hits
→ run uncached Code Checks in bounded parallel
→ stop before Model Checks when any Code Check fails or stops
→ otherwise run uncached Model Checks in bounded parallel
→ stop launching queued work after a conclusive failure or stop condition
```

Completed Results remain visible and reusable. Running work is cancelled best-effort. Stable Check identity orders persisted output; completion races do not redefine Check identity or feedback.

## Gate outcomes

A Check Result exists only when one Check completed as `passed` or `failed`. Timeout, cancellation, unavailable model or sandbox, invalid output, exhausted budget, failed input collection, or unrecoverable staleness is a stopped Check Run and produces no semantic Check Result. Runtime may perform bounded retries for transient failures; exhaustion stops the Gate attempt while preserving canonical state and exposing an exact recovery action.

A Gate Report is `passed`, `failed`, or `stopped`. A stage Gate passes only when every present Check passes, fails when any Check fails, and stops when a required valid Result cannot be produced. Zero present Checks is the explicit exception: it passes with the non-blocking `no_checks_configured` warning. Malformed Check content stops the affected Gate but never crashes Server, Runtime, other projects, or read-only inspection.

Gate Reports carry Results, completed and cancelled execution facts, cache use, warnings, exact stage and subject identity, and stopped reason when applicable. A Gate never chooses the next stage or performs an effect. Runtime applies the fixed lifecycle. Failed Results provide their exact feedback to the responsible Loop; stopped execution provides operational recovery to the User rather than fabricated semantic feedback to an Agent.
