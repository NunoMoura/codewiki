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
- check results with commands, status, phases, criterion ids when relevant, and package pack verification for package/dependency changes;
- acceptance evidence mapped to planning acceptance criterion ids;
- TDD red/green proof when policy requires it;
- worker result summaries and claim/session provenance;
- normalized worker proof digests, changed-path sets, validation refs, and conflict findings;
- component/path alignment evidence;
- final aggregate content proof for worker or parallel outputs;
- residual issue coverage or explicit blockers;
- publication refs and approval refs when configured;
- agent production-quality assessment for maintainability, simplicity, style, error handling, sensitive surfaces, and uncertainty resolution;
- route-back questions for planning or decision when authority is missing;
- canonical refs proving the output.

Implementation output should not include full logs, private scratch, unbounded diffs, or product decisions made during coding.

## Exit quality standards

The implementation loop can exit only when loop-owned quality standards are met or explicitly routed back/blocked with authority:

| Quality standard | Mode | Required signal |
| --- | --- | --- |
| planning_coverage_complete | deterministic | Every planned work ref is covered by implementation evidence and no unknown planning refs are introduced. |
| scope_controlled | deterministic | Changed paths stay inside planned component/path scope and existing repo paths. |
| acceptance_evidence_complete | deterministic | Every planned acceptance criterion is covered by structured evidence refs. |
| verification_passed | deterministic | Required checks are structured, present, passing, cover planned verification refs/commands, and package/dependency changes include pack verification. |
| tdd_evidence_valid | deterministic | Required red/green proof maps to planned acceptance criteria. |
| content_proof_recorded | deterministic | Change-level proof, worker proof verdict/conflict checks, and aggregate content proof exist when required. |
| worker_claims_correlated | deterministic | Worker-produced evidence ties to active runtime claims and completed worker results. |
| source_ownership_aligned | deterministic | Changed source/test paths align with file-structure ownership and component test coverage. |
| production_quality_reviewed | agent | Agent assesses maintainability, simplicity, project style, and error handling as production-ready. |
| uncertainty_resolved | agent | No unresolved implementation uncertainty remains; planning, decision, or user authority is routed instead of drifting. |
| security_privacy_reviewed | agent, conditional | Security/privacy-sensitive changes include explicit review evidence. |
| accessibility_ui_reviewed | agent, conditional | UI/page changes include accessibility review evidence. |
| dependency_risk_controlled | agent, conditional | Dependency-surface changes include risk review evidence. |
| release_safety_approved | user, conditional | Release, publication, destructive, or externally visible refs require explicit user approval. |
| traceability_refs_canonical | deterministic | Implementation refs are canonical trace, KB, Git, digest, source, or test refs. |

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

Worker-local proof is provenance normalized by the implementation loop: changed paths are deduplicated, validation refs and checks are summarized, proof digests are stable, and overlap/base conflicts block aggregate closure. The implementation loop still needs final aggregate content proof after merging worker outputs.

## Repository snapshot and content proof

Implementation callers should provide two repo-derived facts when evaluating exit conditions:

- `existingPaths`: a project snapshot of active source/doc/test/package paths;
- `aggregateContentProof`: a deterministic digest or Git ref for the merged working tree content being accepted.

Core helpers provide these facts without making Git history or generated views truth:

- `collectProjectSnapshot()` lists normalized active repo paths for path-existence checks;
- `createWorkingTreeDigest()` hashes selected file contents deterministically;
- `createWorkingTreeContentProof()` wraps the digest as implementation content proof;
- `createImplementationMergeContentProof()` derives final merged proof paths from changes plus worker proof metadata and hashes the merged working tree unless a host supplies an explicit Git/content proof;
- `runWikiImplement()` combines snapshot, merge proof, implementation loop output, exit evaluation, and optional append into one core facade.

The digest should cover changed paths and evidence paths, not runtime temp or stored generated views. Direct local changes without per-change proof may receive the generated working-tree proof. Worker-local proof remains provenance; worker/parallel implementations still require final aggregate content proof over the merged output.

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
      "workerProofs": [],
      "workerProofConflicts": [],
      "aggregateContentProof": null,
      "qualityStandards": []
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
