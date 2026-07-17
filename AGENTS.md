# Repository Agent Guidance

CodeWiki is developed as a normal source package. This repository must not load or dogfood its own Pi extension during stabilization.

## Development workflow

- Use Pi native coding tools, pi-lens, normal file edits, tests, and Git.
- Do not call CodeWiki `wiki_*` tools or `/wiki-*` commands in this source checkout.
- Do not install CodeWiki under this repository's `.pi/` directory or add a local CodeWiki package/extension path.
- Do not recreate project-local `codewiki-*` skills, controller pins, Changes Backlog refs, or dogfood trace state.
- Use Pi native compaction.

## Sources of truth

- `.codewiki/kb/**` is intended product and system design truth.
- `src/**` and `tests/**` are executable truth.
- Git is history and checkpoint evidence.
- Generated views and runtime scratch are disposable.
- Trace behavior is product functionality tested in disposable external projects, not active workflow state for this repository.

Update KB and source/tests together when intended behavior changes. Surface drift instead of silently choosing one side.

## Extension testing and release

Build and pack reviewed candidates, then install them only into disposable external projects with isolated Pi settings. Verify prompt injection, tools, commands, dashboard behavior, guarded lifecycle writes, failures, and cleanup there. Release CodeWiki as a Pi extension only after stable external gates pass.
