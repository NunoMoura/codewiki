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
  - src/runtime/coordinator-api.ts
  - src/runtime/project-coordinator-daemon.ts
  - src/runtime/project-coordinator-events.ts
  - src/runtime/project-coordinator-process.ts
  - src/pi/project-coordinator-daemon.ts
  - src/runtime/runtime-reaction-jobs.ts
codewiki_test_patterns:
  - tests/scaffold-core.test.mjs
  - tests/runtime/package-install-smoke.mjs
  - tests/runtime/project-coordinator.test.mjs
  - tests/runtime/project-coordinator-service.test.mjs
  - tests/runtime/project-coordinator-process.test.mjs
  - tests/runtime/project-coordinator-events.test.mjs
  - tests/runtime/pi-project-coordinator-daemon.test.mjs
  - tests/runtime/runtime-reaction-jobs.test.mjs
  - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
  - tests/runtime/pi-sdk-semantic-session.test.mjs
  - tests/runtime/pi-sdk-package-smoke.mjs
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
      - src/runtime/coordinator-api.ts
      - src/runtime/project-coordinator-daemon.ts
      - src/runtime/project-coordinator-events.ts
      - src/runtime/project-coordinator-process.ts
      - src/pi/project-coordinator-daemon.ts
      - src/runtime/runtime-reaction-jobs.ts
    test_patterns:
      - tests/scaffold-core.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-coordinator.test.mjs
      - tests/runtime/project-coordinator-service.test.mjs
      - tests/runtime/project-coordinator-process.test.mjs
      - tests/runtime/project-coordinator-events.test.mjs
      - tests/runtime/pi-project-coordinator-daemon.test.mjs
      - tests/runtime/runtime-reaction-jobs.test.mjs
      - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
      - tests/runtime/pi-sdk-semantic-session.test.mjs
      - tests/runtime/pi-sdk-package-smoke.mjs
      - tests/runtime/project-local-install-smoke.mjs
      - tests/runtime/external-package-lifecycle-smoke.mjs
      - tests/runtime/external-package-failures-smoke.mjs
      - tests/runtime/readiness-checklist.test.mjs
    role: package_entrypoint
---
# Package Boundary

This concept anchors the package/distribution boundary inside the OKF bundle
while preserving `README.md` as the human package entrypoint.

The package component owns the npm manifest, lockfile, TypeScript entrypoints, README distribution guidance, optional execution-adapter peers, and install/readiness smoke coverage.

The root entrypoint remains harness-neutral and exports the transport-neutral `ProjectCoordinator` kernel. `./coordinator` exposes the detached project-service host/client boundary: daemon ensure/start/stop, exclusive election, private endpoint discovery, authenticated loopback transport, leased client registration, bounded generation-scoped event replay, remote inspection, capability-advertised semantic execution, candidate fallback, generation fencing, exact semantic reaction scheduling, and trace-backed restart recovery. `src/runtime/project-coordinator-daemon.ts` owns harness-neutral daemon lifecycle; `src/pi/project-coordinator-daemon.ts` is the executable launcher that dynamically loads `./pi-sdk` when its optional peer is available. During the architecture spike, `@earendil-works/pi-coding-agent` remains an optional peer and development dependency rather than a production dependency. Peer-absent packed installs start the coordinator without semantic adapters instead of silently pulling a second Pi runtime.

The Pi SDK subpath requires Node.js 22.19 or newer even while the harness-neutral core retains its broader engine range. Promotion to a production dependency or separate adapter package requires clean security audit, package-size review, external install proof, model/auth proof, cancellation and cleanup proof, and no duplicate-host resolution ambiguity.

## Development and release posture

CodeWiki is developed with Pi native coding tools, pi-lens, Git, source, tests, and the canonical Knowledge Base. The source repository must not install or load its own mutable extension during stabilization. It keeps no active dogfood Changes Backlog or trace instance state.

Extension behavior is verified by packing the candidate and installing it into disposable external projects with isolated Pi settings. Those tests may exercise tools, prompt injection, commands, dashboards, trace lifecycle, and failure handling without granting the candidate authority over its source checkout.

A stable release may be published or installed as a normal Pi package through `package.json` `pi.extensions`. Repo-local self-hosting, if ever restored, requires a separate explicit decision after external release gates pass; it is not part of ordinary development.

## Ownership note

OKF concept identity comes from this bundle path. CodeWiki source ownership can
still point at a non-KB artifact through the `codewiki_source_map[].doc`
extension. That keeps the OKF bundle self-describing without pretending the
README has moved under `.codewiki/kb`.

## Related docs

- [Extension](extension.md)
- [Source Map](source-map.md)
