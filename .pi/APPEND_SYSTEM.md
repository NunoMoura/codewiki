# CodeWiki Source Repository Boundary

This repository develops CodeWiki as a normal source package. It must not load or dogfood its own Pi extension during stabilization.

- `.codewiki/kb/**` is intended product/system design truth.
- `src/**` and `tests/**` are executable truth.
- Git is history and checkpoint evidence.
- Use Pi native coding tools, pi-lens, normal file edits, tests, and Pi native compaction.
- Do not call CodeWiki `wiki_*` tools or `/wiki-*` commands in this checkout.
- Do not install CodeWiki under this repository's `.pi/` directory or recreate controller pins, project-local CodeWiki skills, Changes Backlog refs, or dogfood traces.
- Test the Pi extension only through packed installs in disposable external projects.
- Generated views, runtime scratch, and other `.codewiki/**` state outside `kb/` are not source truth.
