---
id: spec.system.trace-graph
title: Trace Graph and Lifecycle Trace Schema
state: active
summary: Trace-primary state model where one lifecycle trace records a change from decision to production-ready code, and the generated graph relates traces through semantic project relationships.
owners:
  - architecture
  - product
updated: "2026-06-04"
diagram_refs:
  - architecture:telemetry
  - data-model:telemetry_trace
  - key-flow:lifecycle_trace
---

# Trace Graph and Lifecycle Trace Schema

## Responsibility

CodeWiki uses traces as the durable accountability record for software work. One trace represents one decision or change journey from initial user intent through decision, planning, implementation, gates, and production-ready or published content evidence.

The trace file is the compact source record. The graph is a generated projection over trace files, the trace catalog, runtime state, roadmap truth, KB truth, source/tests, and Git refs. Tools read compact graph views first, then expand exact trace JSON pointers only when needed.

## Trace lifecycle model

A trace is not a per-loop artifact. A trace contains the whole lifecycle for one accountable change:

```text
user intent
  -> decision section
  -> planning section
  -> implementation section
  -> production-ready or publication evidence
```

Top-level `lifecycle` is the agent-facing control plane. It owns:

- aggregate trace status;
- production/publication status;
- active loops and active gates;
- blockers and route-back targets;
- next safe actions;
- risk and risk approvals;
- recovery cursor;
- close/readiness state.

Loop sections are the evidence/data plane. They own loop-specific records and gate history:

- `decision` owns decision table rows, approvals, KB patch evidence, propagation/no-impact evidence, product/system impact, alternatives, risks, downstream planning questions, and decision gate history;
- `planning` owns work partitioning, task/sprint alignment, parallelization contract, path-conflict matrix, lease plan, route-back triggers, verification strategy, and planning gate history;
- `implementation` owns work-unit evidence, changed code/test/doc refs, linters/tests, implementation gate history, and optional publication stage.

Multiple loops may be active inside one trace at the same time. Tools must route from `lifecycle.active_loops[]`, not from a single `current_phase` field.

## Canonical trace file

Hot trace files live under `.codewiki/telemetry/TRACE-*.json`. The canonical shape is:

```json
{
  "schema_version": 1,
  "trace_id": "TRACE-20260604-example",
  "title": "Short accountable change title",
  "summary": "Compact lifecycle summary.",
  "lifecycle": {
    "status": "active|blocked|production_ready_unpublished|publish_blocked|published|closed",
    "active_loops": [
      {
        "loop": "decision|planning|implementation",
        "run_id": "RUN-001",
        "state": "active|waiting_gate|blocked|repairing",
        "cursor": "#/planning/runs/0",
        "next_action": "Exact safe next action."
      }
    ],
    "active_gates": [],
    "blockers": [],
    "route_back": [],
    "next_safe_actions": [],
    "risk": "low|medium|high",
    "recovery_cursor": "#/lifecycle/active_loops/0"
  },
  "relations": [
    {
      "target_trace": "TRACE-20260604-other",
      "rel": "depends_on|refines|supersedes|conflicts_with|blocks|unblocks|extracts_from|follow_up_to|releases_with",
      "state": "active|satisfied|blocked",
      "rationale": "Why this trace relationship matters."
    }
  ],
  "scope": {
    "task_refs": [],
    "sprint_refs": [],
    "knowledge_refs": [],
    "diagram_refs": [],
    "source_refs": [],
    "test_refs": [],
    "path_scopes": []
  },
  "decision": {
    "status": "not_started|proposed|approved|kb_applied|gate_passed|blocked",
    "decision_table": {
      "schema_version": 1,
      "id": "DT-20260604-example",
      "title": "Decision approval surface title",
      "scope": {},
      "source_refs": [],
      "status": "draft|pending|partially_approved|approved|rejected|deferred",
      "rows": [],
      "created_at": "2026-06-04T00:00:00Z",
      "updated_at": "2026-06-04T00:00:00Z"
    },
    "approvals": [],
    "kb_patch_refs": [],
    "row_to_kb_mappings": [],
    "propagation": {},
    "risk_assessment": [],
    "benefits": [],
    "alternatives": [],
    "downstream_planning_questions": [],
    "gate_history": []
  },
  "planning": {
    "status": "not_started|active|gate_passed|blocked",
    "work_units": [],
    "parallelization": {
      "path_conflicts": [],
      "waves": [],
      "session_count": 0,
      "lease_plan": [],
      "route_back_triggers": [],
      "publisher_serialization": []
    },
    "verification_strategy": [],
    "gate_history": []
  },
  "implementation": {
    "status": "not_started|active|gate_passed|production_ready|blocked",
    "work_units": [],
    "code_refs": [],
    "test_refs": [],
    "gate_evidence": [],
    "gate_history": [],
    "publication": {
      "mode": "off|manual|auto|dry-run",
      "status": "not_configured|ready|blocked|published",
      "gate_history": [],
      "git_refs": {},
      "package_refs": [],
      "remote_refs": []
    }
  },
  "accountability": {
    "user_approval_refs": [],
    "pi_session_refs": [],
    "agent_summaries": [],
    "content_proofs": []
  },
  "compaction": {
    "default_view": ["#/title", "#/summary", "#/lifecycle", "#/relations", "#/scope"],
    "expand_only_by_pointer": true
  }
}
```

Trace files are ref-first and compact. They store summaries, JSON pointers, stable refs, digests, and small excerpts only when required for validation. They do not store full Pi transcripts, raw logs, full diffs, whole KB documents, or full source snapshots.

## Decision Table v1

The Decision Table is the canonical decision-loop approval structure. It replaces the old decision-table concept; it is not a textual diff and must not be implemented as a compatibility shim around older artifact names.

Table fields:

- `schema_version`: Decision Table schema version.
- `id`: stable table id.
- `title`: short human title.
- `scope`: product/system/source/test/doc scope for the table.
- `source_refs`: compact refs grounding the proposed decision.
- `status`: `draft`, `pending`, `partially_approved`, `approved`, `rejected`, or `deferred`.
- `rows`: ordered Decision Table rows.
- `created_at` and `updated_at`: timestamps for lifecycle and auditability.

Row fields:

- `id`: stable row id.
- `question`: decision question the row resolves.
- `state_delta.current`: current project state.
- `state_delta.desired`: desired project state.
- `proposed_change`: agreed change when approved.
- `rationale`: why the change should happen.
- `impact.product`, `impact.system`, `impact.source`, `impact.tests`, and `impact.docs`: affected layers and no-impact rationale where relevant.
- `risk.level` and `risk.notes`: risk classification and reason.
- `options`: alternatives with ids, labels, and tradeoffs.
- `approval.status`, `approval.actor`, and `approval.decided_at`: approval state and evidence.
- `evidence_refs`: refs to KB, diagram, trace, gate, source, test, or Git evidence.
- `expected_outcome`: expected final state.
- `validated_outcome`: validator-confirmed final state when available.
- `follow_up_refs`: roadmap tasks, traces, or questions produced by the row.

Decision Tables live under `trace.decision.decision_table` for the accountable change. Pending UI/runtime state may hold drafts, but accepted rows must be represented in the trace decision section before planning or implementation consumes them.

## Publication

Publication is not a fourth canonical loop by default. Publication belongs under `implementation.publication` and is controlled by CodeWiki config:

- `off` means implementation can become production-ready without publishing;
- `manual` means CodeWiki records readiness and waits for explicit publish action;
- `dry-run` exercises publish gate evidence without pushing/releasing;
- `auto` may publish only after configured gates and risk approvals pass.

The lifecycle distinguishes `production_ready_unpublished`, `publish_blocked`, `published`, and `closed` so tools do not treat unpublished readiness as shipped code.

A separate publish loop requires a future approved decision.

## Trace DAG graph

The generated graph is a trace DAG. Primary graph records are traces. Graph records do not include redundant `kind: trace` fields. Edges connect traces with semantic project relationships, not internal workflow plumbing:

- `depends_on`
- `refines`
- `supersedes`
- `conflicts_with`
- `blocks`
- `unblocks`
- `extracts_from`
- `follow_up_to`
- `releases_with`

Loop-to-loop progress lives inside a trace. The graph answers how decisions and change journeys relate across the project.

## Graph views

Views are generated compact projections, not durable truth. Required trace-first views include:

- `status` — health, active traces, blockers, and next safe actions;
- `resume` — lifecycle summary plus exact pointers needed for safe continuation;
- `decision-queue` — traces with decision work not closed;
- `lineage` — semantic relationships between traces;
- `work-ready` — runnable implementation work with scopes and gates;
- `blockers` — route-backs, gate findings, and user questions;
- `path` — traces touching a path or glob;
- `task` — traces tied to a roadmap task;
- `gate` — current and historical gate verdicts by trace;
- `runtime` — active leases, workers, jobs, and heartbeats from runtime state;
- `publication` — production-ready and published content evidence chains.

Default Graph lens output returns headers, lifecycle, blockers, next actions, and JSON pointers. Tools expand full sections only on explicit pointer or focused view request. Decision Table `evidence_refs` should use ArtifactRef-shaped entries when a row needs typed refs instead of plain strings.

## Hot and cold traces

Hot truth lives in `.codewiki/kb/**` plus active `.codewiki/telemetry/TRACE-*.json` trace files. A trace remains full hot JSON while any of these are true:

- decision, planning, implementation, publication, route-back, or remediation work is active or blocked;
- a gate report, compiler output, or current policy still requires direct trace content;
- an open roadmap task, sprint, lease, wait/wake record, or migration compatibility reader references it;
- it is recently closed and has not reached the approved retention/cold-archive trigger;
- it is unpublished or production-ready content still awaiting publication evidence.

Cold truth lives in Git refs and immutable content evidence. A closed production-ready or published trace may be cold-archived only after the trace is committed, no active policy/gate/task depends on full JSON, and `.codewiki/telemetry/catalog.json` stores compact canonical metadata for the cold trace:

- trace id, title, summary, lifecycle state, and relations;
- task/path/KB/source/test indexes needed for graph rebuild;
- restore refs: commit SHA, tree SHA, original path, and content digest;
- cold-archive reason and deletion/restore ledger ref when tracked hot JSON was purged.

Generated graph entries may reference cold trace details as `git:<commit_sha>:<path>#<pointer>`. Tools hydrate cold details with Git only on demand. The catalog is not a replacement for open/current gate or compiler-output evidence; if policy still needs the artifact hot, record a deferral instead of deleting.

## Storage backend

JSON trace files and `telemetry/catalog.json` are canonical Git-tracked truth. `index_graph.json` is generated. An optional gitignored `.codewiki/cache/graph.sqlite` may index traces, edges, refs, and JSON pointers for large repos; SQLite recursive CTEs can serve lineage queries. SQLite or embedded graph databases must not become canonical truth unless a future approved decision changes the storage contract.

## Transitional migration rules

During the refactor, CodeWiki uses the existing Pi extension and existing tools as the bootstrap system. New trace-aware behavior may be integrated progressively. The agent must tell the user when a `/reload` is required, and only after reload may the agent rely on newly loaded commands, skills, prompt contract, or tool schemas.

Safe session refresh is an early migration priority. Until resume tooling is trace-aware, the decision/build handoff must include a compact source-backed packet that preserves approved rows, KB refs, trace refs, risks, blockers, and next planning actions.

## Related docs

- [Compilers](compilers.md)
- [Gateway](validation-gateway.md)
- [Graph](graph.md)
- [Compiler Output Artifacts](builds.md)
- [Runtime](runtime.md)
- [File Structure](file-structure.md)
