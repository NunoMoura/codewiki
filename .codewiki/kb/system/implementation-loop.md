# Implementation Loop

The implementation loop owns code, docs, tests, checks, worker evidence, acceptance proof, and final content proof. It turns accepted planning output into verified project changes.

## Loop authority

The implementation loop owns:

- source/docs/test edits;
- local TDD execution when required;
- worker result aggregation;
- runtime claim correlation;
- check results;
- acceptance evidence;
- component/path alignment proof;
- aggregate content proof;
- residual issue coverage;
- publication readiness when configured.

The implementation loop does not own new product decisions or planning scope changes. It routes back instead.

## Loop cycle

One implementation cycle does this work:

```text
observe accepted planning output + source/test/Git/runtime refs
claim or receive worker work when needed
change code/docs/tests inside planned scope
run checks and collect evidence
aggregate worker outputs and final content proof
update implementation output
check implementation exit conditions
append implementation.iteration
continue, exit, route back, or block
```

Implementation should keep noisy logs and scratch under runtime temp or external tool output. The loop output should contain only the evidence required to prove exit conditions.

## Loop output

Implementation loop output is the high-signal packet needed to close or publish the trace:

- covered planning refs;
- changed code/docs/test paths;
- check results with commands, status, phases, and criterion ids when relevant;
- acceptance evidence mapped to planning acceptance criterion ids;
- TDD red/green proof when policy requires it;
- worker result summaries and claim/session provenance;
- component/path alignment evidence;
- final aggregate content proof for worker or parallel outputs;
- residual issue coverage or explicit blockers;
- publication refs when configured;
- route-back questions for planning or decision when authority is missing;
- canonical refs proving the output.

Implementation output should not include full logs, private scratch, unbounded diffs, or product decisions made during coding.

## Exit conditions

The implementation loop can exit only when these conditions are met or explicitly blocked with routeable evidence:

| Condition | Required signal |
| --- | --- |
| planning_coverage | Every executable planning work unit and acceptance criterion is covered or explicitly blocked. |
| changed_paths_valid | Changed paths are canonical and within planned component/path scopes. |
| test_evidence_valid | Code changes have matching test evidence in allowed test paths. |
| checks_valid | Required checks pass; failed checks are allowed only as explicit red-phase TDD proof. |
| acceptance_evidence_valid | Evidence maps to known planning acceptance criterion ids. |
| tdd_valid | Required red/green proof exists for each relevant criterion. |
| worker_claims_valid | Worker results reference active claims matching worker id, work-unit id, and planning refs. |
| worker_results_resolved | Worker failures/blockers are resolved, routed back, or explicitly blocked. |
| aggregate_content_proof_valid | Final merged content proof exists when worker/parallel changes are involved. |
| residuals_owned | Remaining actionable issues are fixed, owned, deferred with authority, or blocked. |
| publication_ready | Publication requirements are met when configured. |

## Exit statuses

- `continue`: same implementation loop can add code/tests/evidence, rerun checks, collect proof, or resolve worker issues.
- `exit`: implementation output is accepted and the trace can close or publish according to policy.
- `route_back`: planning or decision authority is needed.
- `blocked`: user, external resource, runtime worker, merge conflict, or policy wait prevents progress.

## Route-back rules

Implementation routes back to planning when:

- acceptance criteria are insufficient;
- path scopes are wrong or too narrow;
- dependency order is wrong;
- test strategy is missing or infeasible;
- work must split/merge.

Implementation routes back to decision when:

- product/API behavior is ambiguous;
- risk or migration impact changes;
- user approval is required;
- implementation reveals a conflicting requirement;
- KB/system target needs a decision-level change.

## Runtime and workers

Runtime coordinates implementation work but does not own implementation evidence.

```text
work-queue -> runtime claim -> worker session -> worker result -> implementation output
```

Worker-local proof is provenance. The implementation loop still needs final aggregate content proof after merging worker outputs.

## Repository snapshot and content proof

Implementation callers should provide two repo-derived facts when evaluating exit conditions:

- `existingPaths`: a project snapshot of active source/doc/test/package paths;
- `aggregateContentProof`: a deterministic digest or Git ref for the merged working tree content being accepted.

Core helpers provide these facts without making Git history or generated views truth:

- `collectProjectSnapshot()` lists normalized active repo paths for path-existence checks;
- `createWorkingTreeDigest()` hashes selected file contents deterministically;
- `createWorkingTreeContentProof()` wraps the digest as implementation content proof;
- `runWikiImplement()` combines snapshot, proof, implementation loop output, exit evaluation, and optional append into one core facade.

The digest should cover changed paths and evidence paths, not runtime temp or stored generated views. Direct local changes without per-change proof may receive the generated working-tree proof. Worker-local proof remains provenance; worker/parallel implementations still require final aggregate content proof.

## Trace iteration data

Implementation iterations should record compact facts:

```json
{
  "event": "implementation.iteration",
  "loop": "implementation",
  "data": {
    "iteration": 1,
    "trigger": "planning_exit",
    "output": {
      "changes": [],
      "checks": [],
      "acceptanceEvidence": [],
      "workerResults": [],
      "aggregateContentProof": null
    },
    "exit": {
      "status": "exit",
      "conditions": []
    },
    "progress": {}
  },
  "refs": []
}
```

## Related docs

- [Loop Model](loop-model.md)
- [Planning Loop](planning-loop.md)
- [Runtime](runtime.md)
- [Traces](traces.md)
- [Worktree Isolation](worktree-isolation.md)
