# CodeWiki tool catalog

Use this catalog as the skill-facing map for internal `codewiki_*` tools. Source-owned contracts live in `src/application/tools/**`; Pi adapter files should resolve project/schema/UI concerns and delegate execution there.

| Tool | Application contract | Purpose | Safe mutation path |
| --- | --- | --- | --- |
| `codewiki_setup` | `src/application/tools/bootstrap.ts` | Adopt CodeWiki without overwriting starter files. | Delegates through bootstrap tool contract; root resolution and Pi UI stay adapter-owned. |
| `codewiki_bootstrap` | `src/application/tools/bootstrap.ts` | Scaffold starter CodeWiki files. | Delegates through bootstrap tool contract; root resolution and Pi UI stay adapter-owned. |
| `codewiki_state` | `src/application/tools/state.ts` | Read graph-first state; `graph` uses the compact five-family lens, while explicit `trace`/`audit` includes expand exact refs after adapter reload. | Read-only except optional generated-state rebuild through ports. |
| `codewiki_resume_context` | `src/application/tools/resume-context.ts` | Build bounded resume packets from graph, roadmap, task context, and source refs. | Read-only except optional generated-state rebuild; Pi may inject this packet through CodeWiki-owned compaction for soft context refresh. |
| `codewiki_artifact_status` | `src/application/tools/artifact-status.ts` | Manage runtime artifact status. | Runtime coordination only; not roadmap truth. |
| `codewiki_audit` | `src/application/tools/audit.ts` | Run deterministic audit profiles. | Read-only evidence; validation decides verdict. |
| `codewiki_build` | `src/application/tools/build.ts` | Write compiler build handoffs. | Writes transient build artifacts and optional generated refresh. |
| `codewiki_validation` | `src/application/tools/validation.ts` | Preflight gateway metadata/risk or write validation reports. | `preflight_only=true` is read-only; report writes preserve pass/fail/block gateway evidence. Validators do not mutate source truth. |
| `codewiki_gc` | `src/application/tools/gc.ts` | Dry-run or purge eligible CodeWiki artifacts after archive proof. | Use post-commit only: tracked purge requires `archive_sha`/`tree_sha`, writes a restore ledger first, and records a separate GC deletion commit; runtime cleanup is limited to ignored session-boundary artifacts. |
| `codewiki_task` | `src/application/tools/task.ts` | Mutate roadmap task truth and sprint metadata. | Tasks use create/update/close/cancel/checkpoint; sprint metadata uses `action="sprint"` and `sprint` input. |
| `codewiki_diff_table` | `src/application/tools/diff-table.ts` | Manage pending decision diff rows. | Pending semantic diff state only; accepted rows compile into decision builds. |
| `codewiki_session` | `src/application/tools/session.ts` | Manage runtime session focus. | Runtime focus only; not roadmap truth. |
| `codewiki_agency` | `src/application/tools/agency.ts` | Plan bounded observe/maintain/work cycles. | Planning-only; parent agent owns canonical writes. |

## Post-commit GC path

Do not manually delete tracked `.codewiki` builds, validation reports, or roadmap truth. After a task-close, sprint-close, publication, or roadmap-end commit exists, run `codewiki_gc` with `action="dry-run"`. If tracked artifacts are eligible, purge only with the archive commit/tree proof:

```json
{
  "action": "purge",
  "include": ["tracked", "runtime"],
  "archive_sha": "<commit-containing-revive-context>",
  "tree_sha": "<tree-of-that-commit>"
}
```

The GC ledger restores tracked files with `git restore --source=<archive-sha> -- <path>`. The ledger is not validation proof and must not replace task-close/publication content proof.

## Sprint metadata path

Do not create umbrella tasks for related work. When accepted intent forms a related executable cohort, use:

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
      "code": ["src/application/tools/**", "src/adapters/pi/tools/**", "tests/**"]
    },
    "gates": ["implementation-validation", "package-smoke"]
  }
}
```

Use this only after decision/planning acceptance. Keep task records self-contained and executable.
