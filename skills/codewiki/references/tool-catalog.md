# CodeWiki tool catalog

Use this catalog as the skill-facing map for normal internal `wiki_*` tools. Source-owned contracts live in package roots; Pi adapter files should resolve project/schema/UI concerns and delegate execution there.

## Normal workflow tools

| Tool | Application contract | Purpose | Safe mutation path |
| --- | --- | --- | --- |
| `wiki_state` | `src/state/tool.ts`, `src/state/resume-tool.ts` | Read graph-first state, focused lenses, task context, and source-backed continuation refs. | Read-only except optional generated-state rebuild through ports. |
| `wiki_decide` | `src/workflow/tool.ts`, `src/change/tool.ts`, `src/build/tool.ts` | Manage decision rows, approvals, KB mappings, propagation evidence, and decision-build creation. | Pending diff rows plus transient `decision_build` writes; canonical KB edits happen with normal file tools after approved rows. |
| `wiki_plan` | `src/workflow/tool.ts`, `src/roadmap/tool.ts`, `src/build/tool.ts` | Mutate roadmap task truth, sprint metadata, durable roadmap lifecycle, and planning-build handoffs. | Tasks use create/update/close/cancel/checkpoint; sprint metadata uses `action="sprint"`; planning builds are transient handoffs. |
| `wiki_implement` | `src/workflow/tool.ts`, `src/roadmap/tool.ts`, `src/build/tool.ts` | Record task-scoped TDD/code evidence and implementation-build creation without replacing file/code edit tools. | Appends builder evidence and writes transient `implementation_build`; task closure still needs validation evidence. |
| `wiki_gate` | `src/workflow/tool.ts`, `src/audit/tool.ts`, `src/gateway/tool.ts` | Run deterministic linter profiles, gateway preflight, validation reports, and linter/test evidence routing. | `action="preflight"` is read-only; report writes preserve pass/fail/block gateway evidence. Validators do not mutate source truth. |
| `wiki_runtime` | `src/workflow/tool.ts`, `src/session/tool.ts`, `src/session/artifact-status-tool.ts`, `src/agency/tool.ts`, `src/gc/tool.ts` | Manage session focus, leases, wait/wake, context boundaries, agency scheduling, and lifecycle/archive coordination. | Runtime coordination only except post-commit GC with archive evidence and restore ledger. |

## Compatibility/expert aliases

Low-level primitives remain registered during migration with compatibility/deprecation metadata so expert flows and older agents do not break: `wiki_setup`, `wiki_bootstrap`, `wiki_resume_context`, `wiki_artifact_status`, `wiki_audit`, `wiki_build`, `wiki_gateway`, `wiki_gc`, `wiki_roadmap`, `wiki_diff_table`, `wiki_session`, and `wiki_agency`.

Do not use these aliases as the normal agent surface. Prefer the six workflow tools above unless validating wrapper parity, debugging a primitive, or maintaining backwards compatibility.

## Post-commit GC path

Do not manually delete tracked `.codewiki` builds, validation reports, or roadmap truth. After a task-close, sprint-close, publication, or roadmap-end commit exists, use `wiki_runtime` with a GC dry-run. If tracked artifacts are eligible, purge only with the archive commit/tree evidence:

```json
{
  "gc": {
    "action": "purge",
    "include": ["tracked", "runtime"],
    "archive_sha": "<commit-containing-revive-context>",
    "tree_sha": "<tree-of-that-commit>"
  }
}
```

The GC ledger restores tracked files with `git restore --source=<archive-sha> -- <path>`. The ledger is not validation evidence and must not replace task-close/publication content evidence.

## Sprint metadata path

Do not create umbrella tasks for related work. When accepted intent forms a related executable cohort, use `wiki_plan`:

```json
{
  "action": "sprint",
  "sprint": {
    "title": "Skill loop restructure",
    "status": "active",
    "outcome": "Focused loop skills and tool contracts stay aligned.",
    "task_ids": ["TASK-093", "TASK-094", "TASK-095"],
    "scope": {
      "knowledge": ["skills/codewiki/**"],
      "code": ["src/workflow/**", "src/adapters/pi/tools/**", "tests/**"]
    },
    "gates": ["implementation-validation", "package-smoke"]
  }
}
```

Use this only after decision/planning acceptance. Keep task records self-contained and executable.
