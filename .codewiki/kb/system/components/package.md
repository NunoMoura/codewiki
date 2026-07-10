---
type: Concept
title: Package Boundary
description: Package manifest, README, TypeScript entrypoint, and install/readiness contract for CodeWiki distribution.
tags:
  - codewiki
  - system
  - package
timestamp: 2026-07-01T00:00:00Z
resource: ../../README.md
codewiki_component: package
codewiki_source_patterns:
  - package.json
  - package-lock.json
  - tsconfig.json
  - tsconfig.build.json
  - src/index.ts
codewiki_test_patterns:
  - tests/scaffold.test.mjs
  - tests/runtime/package-install-smoke.mjs
  - tests/runtime/project-local-install-smoke.mjs
  - tests/runtime/external-package-lifecycle-smoke.mjs
  - tests/runtime/external-package-failures-smoke.mjs
  - tests/runtime/readiness-checklist.test.mjs
codewiki_role: package_entrypoint
codewiki_source_map:
  - id: package
    doc: README.md
    source_patterns:
      - package.json
      - package-lock.json
      - tsconfig.json
      - tsconfig.build.json
      - src/index.ts
    test_patterns:
      - tests/scaffold.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-local-install-smoke.mjs
      - tests/runtime/external-package-lifecycle-smoke.mjs
      - tests/runtime/external-package-failures-smoke.mjs
      - tests/runtime/readiness-checklist.test.mjs
    role: package_entrypoint
---
# Package Boundary

This concept anchors the package/distribution boundary inside the OKF bundle
while preserving `README.md` as the human package entrypoint.

The package component owns the npm manifest, lockfile, TypeScript entrypoint,
README distribution guidance, and install/readiness smoke coverage.

## Ownership note

OKF concept identity comes from this bundle path. CodeWiki source ownership can
still point at a non-KB artifact through the `codewiki_source_map[].doc`
extension. That keeps the OKF bundle self-describing without pretending the
README has moved under `.codewiki/kb`.

## Related docs

- [Extension](extension.md)
- [Source Map](source-map.md)
