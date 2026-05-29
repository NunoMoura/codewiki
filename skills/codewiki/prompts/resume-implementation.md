Implement roadmap task {{task.id}} for {{project.label}}.

Selected task:
{{task.summary_block}}

Latest evidence and temporary session usage:
{{evidence}}

{{follow_up_intent_section}}

Preflight:
- Deterministic preflight color: {{preflight.color}}

Context packet or fallback map:
{{task.context_block}}

Task delta:
{{task.delta_block}}

Task source refs:
{{task.refs_block}}

Rules:
- Execute one self-contained roadmap task from roadmap/build context.
- Use `codewiki_state` as the map and `codewiki_resume_context` as the high-signal restart packet when context is noisy, stale, or token-heavy; then read linked source-of-truth docs/builds/roadmap/validation/code directly before semantic edits.
- Use `codewiki_session` for focus and `codewiki_artifact_status` for narrow write scopes when overlap risk exists.
- Proceed only when the selected roadmap item is self-contained executable work. If it is a sprint/umbrella/container or mainly closes other tasks, stop and route grouping to sprint/planning instead.
- If task meaning or requirement approval is unclear, stop and route to decision. If knowledge or planning is stale, route to decision or planning.
- Derive tests or test-design evidence before behavior changes where practical.
- Implement surgically according to specs and roadmap; surface drift instead of silently choosing code over wiki.
- During implementation, use lint, typecheck, tests, runtime decision, and targeted scripts as short-cycle correction signals for mechanical quality.
- Compile an `implementation_build` with `codewiki_build kind="implementation"` after edits/checks and before requesting implementation validation.
- Request fresh validation from CodeWiki source refs when policy requires independent context. Validation gateway judges alignment/coherence and must start from artifacts, not builder chat.
- Do not use VCC recall, generic Pi compaction, or chat-history summaries as normal implementation memory; use CodeWiki resume context, CodeWiki-owned compaction, or `/wiki-resume --new` for fresh continuation.
- Do not close the task from builder context when policy requires fresh validation/content proof. Use `codewiki_roadmap action="update"` for builder evidence; use `action="close"` only after required pass proof exists.
- Keep public UX focused on wiki-bootstrap, wiki-status, wiki-config, wiki-resume, and /audit; Alt+W toggles the live status panel.
- Do not create a separate user-facing wiki-edit command; update roadmap/wiki artifacts automatically when user intent requires it.
- Rebuild generated outputs before finishing.
- Rerun deterministic status before summarizing.

Helper-safe next steps:
- Work only on selected task and listed source refs unless fresh state proves scope changed.
- Honor artifact-status conflicts; do not override another holder unless user/policy explicitly says so.
- Treat temporary session usage as coordination evidence, not canonical task truth.
- Preserve user follow-up intent as a requirement input, but record durable decisions through builds/tasks/docs.
- Record exact checks, changed files, acceptance mapping, and remaining risks in the implementation build.

Output format:
- Changes made
- Checks run
- `implementation_build` path
- Fresh validation handoff path/command if staged
- Task status recommendation: in_progress|done after validation|blocked
- Wiki updates made automatically, if any
- Remaining risks or follow-ups
