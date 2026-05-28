# Changelog

All notable changes to this project will be documented in this file.

This project follows a docs-first release process: package readiness work records the intended npm/Pi package posture before publication. The package version is not bumped here because this is a release-readiness baseline, not a release.

## [Unreleased]

### Added

- Added this changelog as the baseline for future release notes.
- Documented the package entrypoint and build-script posture for the Pi package in `README.md`.
- Added static-analysis metadata so PyLens/Knip-style review runs treat the Pi extension, public API facades, scripts, and tests as entrypoints.

### Package readiness notes

- The package is loaded by Pi through `package.json` `pi.extensions` and `pi.skills` metadata.
- `src/index.ts` remains the Pi extension source entrypoint and re-exports the public API facade for package-local integrations.
- No npm `main` or `module` entrypoint is declared intentionally; the package is distributed as a Pi extension/skill package rather than a compiled JavaScript library.
- No build pipeline is added intentionally; validation uses `npm run typecheck`, smoke tests, and `npm pack --dry-run`.
- No release, publish, push, or version bump is performed by this baseline.

## [0.1.2] - 2026-05-28

### Added

- Initial changelog baseline for the existing `0.1.2` package line.
- Release-readiness documentation for intentional package metadata decisions surfaced by review tooling.

### Notes

- Earlier development occurred before this changelog was introduced.
- Future entries should describe user-visible package, command, tool, workflow, and validation changes before publication.
