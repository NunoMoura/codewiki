---
type: Concept
title: Lab
description: CodeWiki Lab is isolated maintainer infrastructure for calibrating Checks, routes, repair retrieval, and runtime changes against visible and sealed evidence before production promotion.
tags:
  - codewiki
  - system
  - lab
timestamp: 2026-06-30T00:00:00Z
codewiki_component: lab
codewiki_components:
  - lab
codewiki_source_patterns:
  - lab/**
codewiki_test_patterns:
  - tests/lab/**
codewiki_role: loop_exit_experimentation
codewiki_source_map:
  - id: lab
    source_patterns:
      - lab/**
    test_patterns:
      - tests/lab/**
    role: loop_exit_experimentation
---
# Lab

CodeWiki Lab is isolated maintainer infrastructure for improving Loop exit, routing, repair retrieval, and Runtime behavior before production promotion. It is not a fourth semantic Loop, user-project runtime variant, self-modifying system, or canonical truth store.

Packed product packages ship production code only. Lab fixtures, prompts, holdouts, optimizer logs, and experiment worktrees remain outside installed user-project behavior.

## Objective

```text
minimize risk-adjusted cost to authoritative exit
subject to non-worsening false-pass and escaped-regression rates
```

Primary measures, in priority order:

1. false passes;
2. escaped regressions;
3. false blocks;
4. repair iterations;
5. user interventions;
6. time to first useful feedback;
7. time to authoritative exit;
8. tokens/cost;
9. first-pass required-Check success;
10. long-term trace usefulness and recovery success.

Aggregate scores never hide a false-pass regression. Runtime authority, protected Checks, exact identity, and privacy boundaries remain fixed evaluator constraints.

## Experiment targets

Lab may test bounded changes to:

- trusted Check definitions and implementations;
- deterministic activation rules and approved thresholds;
- Loop Protocol wording;
- context compilation and bounded relationship query results;
- model route/tier calibration;
- repair feedback shape;
- Repair Episode retrieval and Repair Pattern routing;
- cancellation, scheduling, caching, and fan-out policy;
- Feedback Bundle sanitization;
- deterministic mechanisms proposed from repeated successful guidance.

Lab cannot let candidate code grade itself, mutate sealed fixtures, bypass static/sandbox gates, weaken authority, auto-promote, or run arbitrary imported executors/attesters.

## Improvement discipline

```text
diagnose recurring failure
→ map to issueClass and repairTarget
→ propose bounded repair
→ static/security/schema gates
→ isolated visible evaluation
→ sealed temporal/component holdout
→ promote through accountable Change or discard
```

Borrowed lessons from event-sourced self-improvement systems are limited to first-class failure facts, causal candidate lineage, fork/test/promote discipline, and held-out confirmation. CodeWiki does not adopt a mutable world graph, full cognition log, generic agent runtime, arbitrary behavior system, or executable self-modification.

## Evidence and labels

Cases may come from synthetic fixtures or sanitized Change-derived observations. Raw Change Trace history is evidence, never an automatic label.

Useful labels include:

- false pass discovered by later test, Integration, delivery, or outcome evidence;
- escaped regression;
- true block repaired by an authorized candidate;
- false block/intervention;
- downstream alignment drift;
- successful project-specific repair;
- harmful repair that fixed one Check but introduced another failure;
- runtime/environment/authority issue misclassified as candidate failure.

Issue origin remains tentative until grounded:

```text
project/candidate | codewiki | environment | authority | unknown
```

Maintainers must not teach agents to work around CodeWiki authority/runtime defects.

## Candidate-bound learning evaluation

Learning uses compact trace observations:

```text
candidate A
→ failed or indeterminate Check Result
→ issueClass + repairTarget
→ candidate B repairs A
→ later Check/Integration/delivery/outcome evidence
```

That relationship derives a Repair Episode. Several applicable Episodes may derive a Repair Pattern. Neither is canonical or automatically trusted.

Required ablation:

```text
A. current Exit Report feedback only
B. raw history excerpts
C. scoped retrieved Repair Episodes
D. issue-class-routed held-out-validated Repair Patterns
```

Use fixed candidate/Check identities, temporal and component holdouts, multiple seeds where models are stochastic, and explicit harmful-example retrieval. Raw history is included as a baseline, not recommended production context.

Candidate producers may receive selected repair evidence. Independent Model Checks never receive producer conversation or learning context. No learned evidence may suppress Checks, lower thresholds, alter deterministic activation, choose authority, or attest acceptance.

## Visible and sealed data

Visible fixtures provide fast regression but weak generalization evidence because experiment agents can inspect them. Sealed holdout bundles live outside repository and cover all three Loops, runtime/authority failures, competing candidate repairs, and downstream outcomes.

Current commands remain useful executable seams:

```bash
npm run lab:gate
npm run lab:pipeline -- --gate
npm run lab:holdout -- --file /path/outside/repo/holdout.json --gate
npm run lab:sealed-check -- --file /path/outside/repo/holdout.json
```

Holdout loaders reject repo-local files by default. Failed/blocked cases require expected issue labels so right route for wrong reason remains a loss.

Competitive fixtures must also compare CodeWiki with plain Pi, OpenClaw where applicable, and at least one specification-driven system on routine fixes, conflicting Changes, stale candidates, reverse traceability, interrupted work, failed workers, Integration conflicts, and unsafe release.

## Experiment isolation

Each generated experiment uses isolated worktree/scratch, strict editable allowlist, locked evaluators, import restrictions, budgets, and captured patch/evidence. Candidate branches require review; nothing merges, publishes, or releases automatically.

Credentials, private user-project content, full traces, prompts, reasoning, raw output, and repository identities do not enter shared Lab data. User-project findings arrive only through explicit reviewed Feedback Bundles or maintainers' local private fixtures.

## Promotion

A passing experiment proposes an accountable CodeWiki Change. Promotion requires:

- exact patch/candidate identity;
- static/schema/security/sandbox success;
- visible and sealed results;
- no false-pass/escaped-regression worsening;
- latency/token/resource tradeoff evidence;
- human review and normal repository validation;
- explicit publication/release approval when applicable.

Repeated successful prompt guidance should become deterministic project machinery only when held-out evidence shows it is stable and cheaper/safer. Promotion targets Knowledge, config, Loop Protocol, Check implementation, routing rule, or source code—not a free-floating Lesson store.

## Feedback Bundles

Lab may consume local user-reviewed Feedback Bundles containing allowlisted versions, coarse platform, Loop, built-in Check ids/versions, statuses, issue classes, repair targets, stable error codes, attempt sequence, persistence flags, coarse timing/token buckets, and sanitizer/redaction metadata.

Bundles exclude intent, Knowledge prose, source/diffs, paths, repository/remotes/branches, commits/trace ids, prompts/responses/reasoning, raw tool output, credentials, exact timestamps, and project-defined Check content by default. Initial transport is manual file generation and separate user approval.

## Current executable drift

Current `lab/**` models Loop exit through legacy weighted Quality Standard graphs, gate/loss scores, `lab/runner/quality-pack.ts`, and editable `loop.ts` files. Existing Lab candidate authority is `lab`, rollout is `observe`, and passing Lab evidence does not grant production authority. Existing DEC/PEC/IEC/PCE fixtures remain regression assets, but their architecture does not define the target production contract.

Migration must:

1. preserve useful visible/sealed fixtures and current measurements;
2. replace Standard/gate/network concepts with exact candidate/Check/Result/Exit Report contracts;
3. bind policy and identity versions in fixtures;
4. add passive Repair Episode projection before prompt injection;
5. run required four-way learning ablation;
6. add retrieval only when measured value exceeds cost/latency;
7. keep promotion accountable and non-automatic.

## Survival rule

If Lab and competitive fixtures do not show CodeWiki materially reducing drift, false acceptance, repeated repair, lost context, and Integration errors enough to offset ceremony and latency, CodeWiki should shrink into a thin Pi/OpenClaw extension.

## Related docs

- [Loop Exit](loop-exit.md)
- [Loop Contracts](loop-contracts.md)
- [Decision Loop](decision-loop.md)
- [Planning Loop](planning-loop.md)
- [Implementation Loop](implementation-loop.md)
- [Alignment Model](alignment-model.md)
- [Runtime](runtime.md)
