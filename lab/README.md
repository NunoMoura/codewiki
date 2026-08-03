# CodeWiki Lab

The lab is a source-only research harness for improving loop exit conditions
before production behavior changes. It is not part of the Pi extension, prompt
surface, tool surface, or packed package runtime.

## Candidate edit scope

Experiment agents may edit only these candidate files during normal lab runs:

```text
lab/decision/loop.ts
lab/planning/loop.ts
lab/implementation/loop.ts
```

Each candidate file contains quality-network standards for one semantic loop.
The source representation is still a graph for hashing and scheduling.
Candidate files may change standard definitions, node scoring, costs, and
deterministic checks. Every node must declare its method, quality-standard type,
layer, cost, and repair target. Candidate files must not edit or import fixed
cases, score logic, loss matrices, objective logic, or host IO.

Locked evaluator files and candidate import allowlists are declared in
`lab/runner/contract.ts` and enforced by
`tests/lab/candidate-contract.test.mjs`. The contract also requires each loop
candidate to expose a versioned graph and core `hard_gate` plus
`input_contract` layers, with other layers declared by the candidate graph.

## Program and objective

`lab/program.md` is the single optimizer-facing instruction file. It defines the
candidate surface, quality-network rules, objective command, holdout
expectations, and trace-derived case path.

`npm run lab:graph` inspects production and candidate graphs by loop, layer,
node, version, and hash.

`npm run lab:objective` reports the scalar objective:

```text
0.25 * DEC + 0.25 * PEC + 0.25 * IEC + 0.15 * PCE + 0.10 * HCE - penalties
```

Without a sealed holdout bundle, the objective runs in `visible-only` mode and is
capped at 90. With `--file /path/outside/repo/holdout.json`, HCE is included and
the objective can reach 100.

## Metrics

- DEC measures Decision loop exit routing quality.
- PEC measures Planning loop exit routing quality.
- IEC measures Implementation loop exit routing quality.
- PCE measures whole-pipeline trace carryover.
- HCE measures sealed holdout confidence when an external bundle is mounted.

False pass is the highest-cost error because bad work escapes to the next loop.
False fail wastes work but preserves safety. False block interrupts autonomy but
is safer than false pass.

## Visible and hidden evaluation

`npm run lab` and `npm run lab:gate` run the repo-visible seed cases. They are
useful for regression, but they are not strong evidence because candidate agents
can inspect them.

Meaningful experiments must also run a sealed holdout bundle outside this
repository:

```bash
npm run lab:holdout -- --file /path/outside/repo/holdout.json --gate
```

or:

```bash
CODEWIKI_LAB_HOLDOUT_FILE=/path/outside/repo/holdout.json \
  npm run lab:holdout -- --gate
```

Holdout files must not be committed. `lab:holdout` and `lab:objective` reject
repo-local holdout files by default so candidate agents cannot inspect or edit
the private cases. Each holdout suite must include cases for Decision,
Planning, and Implementation; missing-loop suites fail the holdout gate. Use
`npm run lab:sealed-template -- --out-dir /path/outside/repo` to create
shape-valid starter templates, then replace every placeholder with private
human-authored cases before scoring. Use `npm run lab:sealed-check` to verify
filled bundles are outside the repo, placeholder-free, and include both pass
controls plus fail/block traps with expected standard failures and failure-class
labels.

`npm run lab:experiment` creates an isolated temp worktree for candidate runs,
applies optional candidate files only to `lab/<loop>/loop.ts`, runs visible lab
checks, and returns score-only summaries for sealed holdout or judge calibration
inputs. Candidate directories may contain only:

- `lab/decision/loop.ts`
- `lab/planning/loop.ts`
- `lab/implementation/loop.ts`

Example:

```bash
npm run lab:experiment -- \
  --candidate-dir /tmp/codewiki-candidate \
  --holdout /path/outside/repo/holdout.json \
  --judge-calibration /path/outside/repo/judge-calibration.json \
  --json --gate
```

`npm run lab:auto-experiment` is a budgeted harness for running one or more
candidate directories through `lab:experiment` without self-mutation. It writes
reports and copied candidate artifacts only to a temp or explicit output
directory, never edits `src/<loop>/loop.ts`, never commits, and keeps sealed
feedback at score-only granularity. Budget controls include
`--max-wall-clock-ms`, `--max-runs`, `--max-candidate-files`,
`--max-diff-bytes`, and
`--stop-on-first-promotion-eligible`.

Example:

```bash
npm run lab:auto-experiment -- \
  --candidates-root /tmp/codewiki-candidates \
  --output-dir /tmp/codewiki-auto-report \
  --max-runs 5 \
  --max-wall-clock-ms 600000 \
  --max-candidate-files 3 \
  --max-diff-bytes 120000 \
  --json
```

A reported best candidate is only eligible for promotion review. Promotion into
`src/<loop>/loop.ts` still requires the normal sealed holdout, optional judge
calibration, graph diff, objective threshold, and human review gates.

Judge workers have a protocol smoke command that sends synthetic, non-private
loop packets and requires one verdict per semantic standard id:

```bash
CODEWIKI_LOOP_QUALITY_JUDGE_URL=http://127.0.0.1:8787/judge \
  npm run lab:judge-smoke -- --json --gate
```

Judge workers have a separate sealed calibration command:

```bash
CODEWIKI_LOOP_QUALITY_JUDGE_URL=http://127.0.0.1:8787/judge \
  npm run lab:judge-calibration -- \
  --file /path/outside/repo/judge-calibration.json \
  --gate
```

Judge calibration bundles are also off-repo by default. They contain
human-labeled non-deterministic standard cases and report score, false passes,
and over-blocks. Any judge false pass fails calibration because false pass is the
highest-cost error.

Security scanner/evaluator routes have a separate sealed calibration command:

```bash
npm run lab:security-calibration -- \
  --file /path/outside/repo/security-calibration.json \
  --json --gate
```

The bundle must bind `codewiki.security-scanner-suite@3.0.0` and
`codewiki.atomic-security-scanner-check@2.0.0`, name each route's exact evaluator
identity, and provide one observation per route for every case. Every scanner
family requires a human-labeled pass control, defect trap, and unavailable case;
at least one trap must be critical. Observations bind source, report, scanner-request, environment, scanner configuration,
and evaluator configuration digests, scanner/evaluator identity, Evidence refs, latency,
cost, and limitations. Reports keep
false passes, false failures, escaped critical defects, `indeterminate` rate,
latency, and cost separate per route. Any false pass or escaped critical defect
blocks promotion regardless of aggregate score. Bundles remain external and
must not be committed. The command evaluates receipts only; it does not execute
scanners, create CodeWiki Results, or grant promotion authority.

When a production judge provider is enabled, deterministic hard gates run first.
If they pass, CodeWiki sends one batch prompt per semantic loop attempt. The
batch contains loop evidence plus per-standard rubrics for `agent_self_assessment`
and `model_judge` standards, and the provider must return one verdict plus one
0-100 score per standard id. A judge pass below the node threshold, or a judge
pass without a score, fails closed. The judge is evidence only; CodeWiki still
owns route semantics and human authority remains required for release/destructive
decisions.

## Trace forge

`npm run lab:forge -- --json` reads `.codewiki/traces/TRACE-*.jsonl` and
reduces semantic loop events into sanitized draft case material. Every suggested
label is marked as needing human review; raw traces are evidence, not automatic
truth. The forge is locked evaluator tooling and is outside the candidate-editable
surface.

## Pipeline carryover lab

Per-loop scores DEC, PEC, and IEC test whether each loop exits correctly. They do
not prove that trace facts survive across the whole pipeline.

`npm run lab:pipeline` runs the pipeline carryover lab and reports PCE, Pipeline
Carryover Efficiency. PCE uses production-shaped trace events to check that:

- decision facts appear in planning work;
- planning work references proposed changes;
- implementation evidence preserves expected facts;
- implementation evidence references planning work;
- implementation evidence covers planning acceptance criteria.

This is still a visible seed suite, not hidden proof, but it tests trace handoff
fidelity rather than one loop's local exit condition.

## Implementation review lab coverage

Owned implementation review has both common language-agnostic checks and
optional language-specific packs. Lab and regression coverage must preserve
three invariants:

- pi-lens and pi-posher are not runtime dependencies;
- clean low-level tool output is evidence, not implementation correctness; and
- false-pass traps must cover missing acceptance evidence even when linters or
  type checks pass.

Broader language packs remain promotion-blocked until sealed evidence covers the
new pack's false-pass and false-block behavior. Visible tests may prove the pack
shape, but they are not enough to silently widen production review behavior.

## Promotion checklist

A lab candidate is eligible for production review only when all are true:

1. The target DEC, PEC, IEC, PCE, or HCE score improves, or a known false-pass
   class is eliminated.
2. False passes do not increase.
3. Expected-pass regressions do not increase.
4. Locked cases, score logic, objective logic, and loss weights are unchanged.
5. Repo-visible seed cases pass.
6. Graph introspection is reviewed with `npm run lab:graph`.
7. Pipeline carryover cases pass under `npm run lab:pipeline -- --gate`.
8. External holdout cases pass under
   `lab:objective -- --file /path/outside/repo/holdout.json --gate --require-holdout`.
9. If a quality judge is enabled, sealed judge calibration passes under
   `lab:judge-calibration -- --file /path/outside/repo/judge-calibration.json --gate`.
10. `npm run lab:promotion` reports eligible with a sealed holdout,
   optional judge calibration, a human-review ref, and `--gate` when a judge
   calibration gate is required.
11. Normal tests and package/readiness checks pass.
12. A human reviews the diff before promotion into `src/<loop>/**`.

Promotion is a port into production standards or a frozen production quality
graph, not an automatic merge from lab code. `lab:promotion` records the
required visible gate, PCE, sealed holdout, objective threshold, graph diff, and
human-review gates in one report.
