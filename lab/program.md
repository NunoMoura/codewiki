# CodeWiki Lab Program

This is the single optimizer-facing instruction file for CodeWiki lab experiments.
An experiment agent should be able to read this file, edit only the candidate
surface, and optimize the locked objective without needing private context.

## Goal

Minimize CodeWiki loop loss while preserving safety. A candidate is better only
if it improves route quality and right-reason failure activation without
increasing false passes, expected-pass regressions, package boundary risk, or
pipeline drift.

The long-term model is an interpretable quality network:

```text
loop artifact + trace context
  -> hard contract layer
  -> input contract layer
  -> trace/coverage/scope/specificity/evidence layers
  -> risk/project-fit/repairability layers
  -> pipeline carryover layer
  -> exit loss and repair targets
```

The network must stay auditable. Quality standards are small observable nodes,
not an opaque judge. Each node should have a clear failure mode, a
score/activation, a method, a gate, a timeout budget, a cost, evidence, a layer,
a standard type, and a repair target.

## Editable candidate surface

During normal experiments, edit only:

```text
lab/decision/loop.ts
lab/planning/loop.ts
lab/implementation/loop.ts
```

These files are the autoresearch-style candidate program. They may add, split,
remove, or refine quality-standard nodes and their scoring behavior. Every node
must declare `method`, `gate`, `standardType`, `layer`, `cost`, `timeoutMs`, and
`repairTarget`.

Do not edit fixed cases, score logic, holdout loading, pipeline logic, objective
logic, package config, or tests to make a candidate look better. Those files are
locked evaluator material and are enforced by `lab/runner/contract.ts` and
`tests/lab/candidate-contract.test.mjs`.

Non-deterministic nodes are judge nodes: each standard owns one specialized
rubric and one 0-100 score. Transport may batch judge requests, but semantics
stay per-standard.

## Objective command

Run the objective before and after candidate edits:

```bash
npm run lab:objective
```

With a sealed external holdout bundle:

```bash
npm run lab:objective -- --file /path/outside/repo/holdout.json --gate --require-holdout
```

The objective combines:

```text
0.25 * DEC
0.25 * PEC
0.25 * IEC
0.15 * PCE
0.10 * HCE
- complexity penalty
- brittleness penalty
```

Where:

- DEC = Decision Exit Condition score.
- PEC = Planning Exit Condition score.
- IEC = Implementation Exit Condition score.
- PCE = Pipeline Carryover Efficiency.
- HCE = sealed Holdout Confidence/Evaluation score.

If no sealed holdout is mounted, HCE is zero, mode is `visible-only`, and the
maximum meaningful score is capped at 90. Visible-only success is regression
evidence, not proof of generalization.

Hard objective gates:

- any false pass caps the score at 49;
- any expected-pass regression caps the score at 69;
- DEC, PEC, IEC, and PCE must stay at or above 95;
- HCE must stay at or above 90 when a sealed holdout is provided;
- package/Pi boundary and candidate-contract tests must pass.

## Local commands

Use these commands as the normal loop:

```bash
npm run lab:graph
npm run lab:objective
npm run lab:gate
npm run lab:pipeline -- --gate
npm run lab:promotion
npm run lab:experiment -- --json
npm run typecheck
```

For candidate changes, prefer the isolated experiment runner so candidate files
are applied only to `lab/<loop>/loop.ts` in a temp worktree:

```bash
npm run lab:experiment -- --candidate-dir /tmp/codewiki-candidate --json --gate
```

For multiple candidate directories, use the budgeted auto-experiment harness. It
runs only in temp/output directories, enforces run, wall-clock, candidate-file,
and diff-byte budgets, and reports the best candidate without promotion or
commits:

```bash
npm run lab:auto-experiment -- \
  --candidates-root /tmp/codewiki-candidates \
  --max-runs 5 \
  --max-wall-clock-ms 600000 \
  --max-candidate-files 3 \
  --max-diff-bytes 120000 \
  --json
```

Sealed feedback from `lab:auto-experiment` is always `score_only`; private case
text and command output must not appear in the report.

Create off-repo starter templates for private holdout and judge calibration
bundles with:

```bash
npm run lab:sealed-template -- --out-dir /path/outside/repo --json
npm run lab:sealed-check -- \
  --holdout /path/outside/repo/holdout.json \
  --judge-calibration /path/outside/repo/judge-calibration.json \
  --json --gate
```

The generated files are shape-valid templates only. Replace placeholders with
private human-authored cases before using them as evidence. `lab:sealed-check`
verifies private bundles are outside the repo, placeholder-free, and contain
both expected-pass controls plus expected fail/block traps with expected standard
failures and failure-class labels.

When validating an enabled independent judge, first run the public protocol
smoke, then run sealed judge calibration with an off-repo human-labeled bundle.
Production judge providers receive one batch prompt per semantic loop attempt
after deterministic hard gates pass. Each batch must answer the per-standard
`agent_self_assessment` and `model_judge` rubrics without returning a global loop
pass. Each verdict must include a 0-100 score; passes below threshold or without
a score fail closed:

```bash
CODEWIKI_LOOP_QUALITY_JUDGE_URL=http://127.0.0.1:8787/judge \
  npm run lab:judge-smoke -- --json --gate
```

```bash
CODEWIKI_LOOP_QUALITY_JUDGE_URL=http://127.0.0.1:8787/judge \
  npm run lab:judge-calibration -- --file /path/outside/repo/judge-calibration.json --gate
```

`lab:promotion` is a report by default. Use `--gate` only when a sealed holdout
file and human-review ref are available:

```bash
npm run lab:promotion -- \
  --holdout /path/outside/repo/holdout.json \
  --judge-calibration /path/outside/repo/judge-calibration.json \
  --human-review-ref <ref> \
  --gate
```

Use full audit only after a candidate looks good:

```bash
npm run audit:codewiki
```

## Quality network rules

Good quality-standard nodes are semantic, scored, and repairable:

```text
implementation evidence links each claim to a changed file and a check result
planning work units have non-overlapping path scopes unless dependency-ordered
proposed changes include specific user and maintainer impact
trace facts survive decision -> planning -> implementation handoff
```

Bad nodes are brittle keyword games:

```text
contains the word "test" three times
has at least five bullets
mentions "risk" somewhere
```

The candidate loop files should use this shared layer vocabulary:

- `hard_gate`: production and schema contracts that cannot be averaged away;
- `input_contract`: required fields, refs, and work shape;
- `trace_fidelity`: canonical refs and trace handoff preservation;
- `coverage`: decision, planning, acceptance, and verification coverage;
- `specificity`: concrete non-placeholder intent, requirements, and evidence;
- `scope_control`: component/path/dependency boundaries;
- `evidence_quality`: proof, checks, acceptance evidence, and content proof;
- `risk_authority`: approvals, security/privacy, release, and risk boundaries;
- `project_fit`: maintainability, style, simplicity, and project benefit;
- `repairability`: routed blockers, uncertainty, rollback, and recovery paths;
- `pipeline_carryover`: cross-loop carryover signals;
- `exit_loss`: aggregate loss/threshold behavior.

Hard gates are not trainable preferences. Schema validity, trace append contract,
package boundaries, candidate edit boundaries, fake evidence rejection, and the
rule that runtime does not own semantic truth must remain non-negotiable.

Fail/block cases should name the standard ids that must activate and their
failure classes (`contract`, `specificity`, `traceability`, `authority`,
`scope`, `evidence`, `verification`, or `production_readiness`). A route-correct
failure that misses its expected standards is still a wrong-reason loss.

## Trace-derived training material

Raw CodeWiki traces are evidence, not automatic truth. Shared traces may become
training/evaluation cases only after they are sanitized, reduced to the relevant
loop or pipeline transition, and labeled from an observed downstream outcome.

Useful trace-derived labels include:

- exit passed, but later tests or pipeline evidence failed: false pass;
- exit blocked and user fixed the same issue: true block;
- exit passed and downstream work preserved the intent: likely true pass;
- implementation evidence dropped planning acceptance: pipeline carryover fail;
- user override or manual correction: strong review signal.

Never assume that a raw trace line is a correct label. Curated trace-derived
cases can become visible cases, sealed holdout cases, or project-local profile
cases.

Use the draft forge only as a review aid:

```bash
npm run lab:forge -- --json
```

It sanitizes semantic trace events into draft case material and marks every
suggested label as needing human review. It must not auto-commit cases, mutate
candidate files, or treat raw traces as training truth.

## Production and release boundary

The package should eventually ship a frozen production quality network in
`src/**`. Training/evolution stays in `lab/**`. Users receive improved networks
through reviewed CodeWiki releases, not through silent live mutation of their
installed package.

Promotion is a reviewed port from winning candidate nodes into production loop
code. `src/**` must not import `lab/**`.

Future user-project support should start as observe/score/explain and sanitized
case export. Project-local graph tuning should be opt-in and user-approved.
