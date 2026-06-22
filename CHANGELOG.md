# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added the agent-OS benchmark harness, detailed Tetris and flight-simulator
  task specs, isolated Pi session runner, and production benchmark gate command
  for quality-adjusted token/speed proof.

### Notes

- The benchmark gate intentionally fails until real CodeWiki and baseline run
  results exist; no synthetic benchmark proof is included.

## [0.3.0] - 2026-06-22

### Added

- Added the production-readiness gate for the Pi package: package install smoke, Pi RPC smoke, Pi mutation smoke, project-local install smoke, external lifecycle smoke, external failure smoke, readiness checklist, npm audit, and diff hygiene.
- Added trace-first runtime backend support for hosts, heartbeat cycles, trigger run planning, work-unit claim selection, leases, worker starts, worker result collection, and runtime board visibility.
- Added exact Pi extension surfaces for direct slash commands (`/wiki-state`, `/wiki-resume`, `/wiki-explain`, `/wiki-config`, `/wiki-bootstrap`) and model-facing tools (`wiki_state`, `wiki_config`, `wiki_decide`, `wiki_plan`, `wiki_implement`, `wiki_archive`).
- Added private pre-release package metadata and local pack/install gates for future npm distribution readiness.

### Changed

- Kept the package private and documented that the future npm registry package name is TBD because the unscoped `codewiki` name is already owned by another maintainer.
- Changed semantic trace output events from generic loop iteration names to split `loop` plus specific `event` facts such as `decision.rows_approved`, `planning.work_units_created`, and `implementation.evidence_accepted`.
- Kept runtime coordination events under `runtime.*` without semantic `loop` fields.
- Made `wiki_state` trace-derived only and kept source ownership in the KB source map and `/wiki-explain` path.
- Updated package documentation to avoid advertising a public npm install before the package is ready to publish.

### Removed

- Removed the repo-local CodeWiki extension shim and repo-local dogfood gate.
- Removed the grouped `/wiki ...` slash namespace in favor of direct `/wiki-*` commands.
- Removed the `_OLD_VERSION/**` archive after completing migration audit and production-readiness cleanup.

### Validation

- `npm run audit:codewiki` passed before this release preparation.
- `npm view codewiki` showed the unscoped package name belongs to another maintainer; no public publish target is selected yet.

## [0.1.2] - 2026-05-28

### Added

- Initial changelog baseline for the early scaffold package line.

### Notes

- Earlier development occurred before this changelog was introduced.
- The package remains private during current distribution-readiness work.
