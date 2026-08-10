---
type: System Component
title: Verification
description: Owns shared Check, obligation, Observation, Result, Exit Report, policy resolution, and generic evaluator-port machinery.
status: stable
tags: [system, component]
codewiki_component: verification
codewiki_source_patterns: ["src/verification/**"]
codewiki_test_patterns: ["tests/verification/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Verification supplies the System responsibility required by this Story.
---
# Verification

Verification resolves immutable Candidate-specific Exit Policy, evaluates atomic Checks through injected ports, records independent Results, and reduces one exact Exit Report. It is shared machinery, not a fourth semantic Loop.

## Check ecosystem

A Check is one atomic versioned requirement evaluated against one exact Candidate. A Check Pack groups Checks for distribution and inherited configuration; an installed Pack binding contributes available Checks to the project Check Catalog. The Catalog is capability inventory, while Resolved Exit Policy is the immutable set selected for one Candidate. Catalog growth never changes an already resolved policy or creates a new blocker for that Candidate.

Project Check content uses this tracked layout:

```text
.codewiki/config.json
.codewiki/check-packs/<binding-id>/config.json
.codewiki/check-packs/<binding-id>/checks/<check-id>/CHECK.*
.codewiki/check-packs/<binding-id>/checks/<check-id>/config.json   # optional sparse override
.codewiki/check-packs.lock.json
```

Every Check directory contains exactly one evaluator. `CHECK.md` is a Model Check rubric, `CHECK.mjs` is the preferred Node code evaluator, and another `CHECK.<language>` is valid only when an admitted isolated execution adapter supports that exact format. The evaluator extension determines its kind; identity derives from Pack binding and directory path. Check bodies contain no frontmatter. The Check format defines no fixtures, cases, or semantic assets because every evaluation receives a real Candidate and admitted project input. Digest-pinned executable dependencies remain part of the Pack execution closure rather than hidden Check input.

CodeWiki-provided Default Checks use the same open, project-local format as imported and Custom Checks. Maintainers may inspect and edit them, producing a new project content digest. Protocol identity, admission, sandboxing, protected policy, and Result validation are Runtime and Verification invariants rather than editable Checks.

## Configuration and applicability

Configuration resolves in this order:

```text
project Check defaults
→ Pack binding defaults
→ optional sparse Check override
→ protected project floors
```

Resolution is semantic rather than a generic deep merge. A Check may narrow Pack applicability and input scope but cannot escape them; requested capabilities require explicit admission; budgets remain within protected maxima; model routes remain within project allowlists; and protected enforcement floors cannot be weakened. Project and Pack defaults prevent repeated configuration, while the optional colocated file records only one Check's differences.

Candidate applicability always uses Development stage and at least one explicit Change kind. Repository path scope, deterministic language facts, and Change type are optional narrowing filters. A sparse Check configuration may inherit Change kinds from project or Pack defaults, but its resolved configuration must contain a non-empty explicit list; an “all kinds” choice expands to the current closed Change-kind vocabulary rather than a wildcard. Repository scopes are Git-relative exact files or directory prefixes. Absolute paths, parent traversal, symlink escape, regular expressions, and globs are rejected. Missing Candidate Change kind makes policy unresolved, while unknown or incomplete optional facts widen selection conservatively rather than omit a possibly applicable Check.

Applicability scope decides whether a Check is selected, input scope decides what it may inspect, and execution capabilities decide what its evaluator may do. These scopes remain distinct in authored configuration, resolved policy, execution receipts, and projections.

Enforcement is project-owned: `observe` records without affecting exit, `warn` returns feedback while permitting exit, and `require` makes failure or indeterminacy block exit. Package publication or installation cannot grant blocking authority. No policy means unresolved, never zero required Checks.

## Candidate evaluation

Verification presents each selected evaluator with one bounded invocation assembled from the exact Candidate, applicable repository state, admitted Evidence, relevant Knowledge, and resolved configuration. Decision receives accepted intended paths and ownership, Planning receives Work Item and component paths, and Implementation receives the exact Candidate Git diff. Unexpected changed paths re-resolve policy and make stale Results unusable.

A Model Check is one isolated, tool-free evaluation. `CHECK.md` states the requirement and its pass, fail, indeterminate, and feedback criteria; Runtime assembles deterministic bounded context before invocation. The configured Check model route is independent from the work-producing Harness model. Missing context, unsupported structured output, or insufficient model capability yields indeterminate or unavailable rather than autonomous scope expansion or silent fallback.

A code Check is arbitrary sandboxed program code, not assumed deterministic. It consumes the language-neutral Check invocation and returns a plain bounded observation through its admitted language adapter. No mandatory CodeWiki runtime SDK is required. Versioned schemas, type declarations, templates, validators, sandbox runs, and historical replay form developer tooling; optional language helpers may exist only as zero-authority wrappers over the public protocol. Missing sandbox or runtime support yields unavailable and never falls back to host execution.

Both evaluator kinds return one Check Observation with `pass`, `fail`, or `indeterminate`, a bounded summary, and actionable findings or reason. They cannot create a canonical Result, claim authority, change enforcement, route Runtime, mutate canonical state, or supply Runtime-owned identity. Runtime validates exact Candidate, policy, Check, input, route, sandbox, freshness, provenance, and output bindings before Verification records a Check Result. Runtime validates admissibility, not the semantic truth of arbitrary model or package code.

`unavailable`, `pending`, `excluded`, `stale`, and `unresolved` are Runtime or projection states rather than evaluator outcomes. Missing, stale, partial, unavailable, contradictory, or unusable required Evidence yields waiting or indeterminate. Evaluators, collectors, adapters, formats, shadow runs, historical replays, and calibration reports preserve `grantsResult: false`; only Runtime admission of a bound production Observation can create a canonical Result.

Views project Resolved Exit Policy, Check Results, and Exit Report; they never infer readiness from raw Catalog entries. Findings route as bounded feedback to the work-producing Harness. Any repair produces a new Candidate, invalidates stale Results, and re-enters the same policy and evaluation path.

Verification imports neither Runtime nor Loop implementations. Loop packages own Candidate meaning, Loop-specific Check composition, interpretation, and route recommendations; Verification owns common policy, invocation, Observation, Result, and reduction contracts.
