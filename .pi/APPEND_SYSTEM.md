# CodeWiki Project Boundary

This repository is rebuilding CodeWiki from a clean source scaffold.

- `src/`, `tests/`, `README.md`, and `package.json` are the active package source.
- `_OLD_VERSION/` is archived previous implementation code used only as a migration reference.
- `.codewiki/kb/**` is source-of-truth documentation for intended product/system design.
- Other `.codewiki/**` roots such as roadmap, builds, validation, runtime, session, and generated graph files are legacy dogfood state during the rebuild and must not be treated as active workflow truth.

Do not use CodeWiki `wiki_*` tools for this repository while the extension is disabled. Use normal file edits, tests, Git, and Pi native compaction only.
