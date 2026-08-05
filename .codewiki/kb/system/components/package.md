---
type: Concept
title: Package Boundary
description: Package manifest, README, TypeScript entrypoint, and install/readiness contract for CodeWiki distribution.
tags:
  - codewiki
  - system
  - package
timestamp: 2026-07-30T00:00:00Z
resource: ../../README.md
codewiki_component: package
codewiki_source_patterns:
  - package.json
  - package-lock.json
  - tsconfig.json
  - tsconfig.build.json
  - src/index.ts
  - src/runtime/coordinator-entrypoint.ts
  - src/runtime/implementation-worker-adapter.ts
  - src/runtime/container-worker-adapter.ts
  - src/runtime/container-worker-options.ts
  - src/runtime/container-worker-git.ts
  - src/runtime/oci-container-command.ts
  - src/runtime/implementation-worker-report-store.ts
  - src/runtime/implementation-worker-dispatch.ts
  - src/runtime/implementation-worker-jobs.ts
  - src/runtime/implementation-worker-review.ts
  - src/runtime/implementation-worker-integration.ts
  - src/runtime/project-branch-merge.ts
  - src/runtime/project-branch-merge-git.ts
  - src/runtime/project-branch-push.ts
  - src/runtime/project-branch-push-operations.ts
  - src/runtime/project-branch-push-manifest.ts
  - src/runtime/product-publication.ts
  - src/runtime/product-publication-proof.ts
  - src/runtime/product-publication-contract.ts
  - src/runtime/product-publication-artifact.ts
  - src/runtime/product-publication-manifest.ts
  - src/runtime/product-release.ts
  - src/runtime/product-release-proof.ts
  - src/runtime/product-release-contract.ts
  - src/runtime/product-release-manifest.ts
  - src/runtime/project-coordinator-daemon.ts
  - src/runtime/project-coordinator-events.ts
  - src/runtime/project-coordinator-process.ts
  - src/pi/project-coordinator-daemon.ts
  - src/pi/process-worker-adapter.ts
  - src/runtime/runtime-reaction-jobs.ts
codewiki_test_patterns:
  - tests/scaffold-core.test.mjs
  - tests/runtime/package-install-smoke.mjs
  - tests/runtime/project-coordinator.test.mjs
  - tests/runtime/project-coordinator-service.test.mjs
  - tests/runtime/project-coordinator-process.test.mjs
  - tests/runtime/project-coordinator-events.test.mjs
  - tests/runtime/implementation-worker-dispatch.test.mjs
  - tests/runtime/implementation-worker-jobs.test.mjs
  - tests/runtime/implementation-worker-integration.test.mjs
  - tests/runtime/project-branch-merge.test.mjs
  - tests/runtime/project-branch-push.test.mjs
  - tests/runtime/product-publication.test.mjs
  - tests/runtime/product-release.test.mjs
  - tests/runtime/process-worker-adapter.test.mjs
  - tests/runtime/container-worker-adapter.test.mjs
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
      - src/runtime/coordinator-entrypoint.ts
      - src/runtime/implementation-worker-adapter.ts
      - src/runtime/container-worker-adapter.ts
      - src/runtime/container-worker-options.ts
      - src/runtime/container-worker-git.ts
      - src/runtime/oci-container-command.ts
      - src/runtime/implementation-worker-report-store.ts
      - src/runtime/implementation-worker-dispatch.ts
      - src/runtime/implementation-worker-jobs.ts
      - src/runtime/implementation-worker-review.ts
      - src/runtime/implementation-worker-integration.ts
      - src/runtime/project-branch-merge.ts
      - src/runtime/project-branch-merge-git.ts
      - src/runtime/project-branch-push.ts
      - src/runtime/project-branch-push-operations.ts
      - src/runtime/project-branch-push-manifest.ts
      - src/runtime/product-publication.ts
      - src/runtime/product-publication-proof.ts
      - src/runtime/product-publication-contract.ts
      - src/runtime/product-publication-artifact.ts
      - src/runtime/product-publication-manifest.ts
      - src/runtime/product-release.ts
      - src/runtime/product-release-proof.ts
      - src/runtime/product-release-contract.ts
      - src/runtime/product-release-manifest.ts
      - src/runtime/project-coordinator-daemon.ts
      - src/runtime/project-coordinator-events.ts
      - src/runtime/project-coordinator-process.ts
      - src/pi/project-coordinator-daemon.ts
      - src/pi/process-worker-adapter.ts
      - src/runtime/runtime-reaction-jobs.ts
    test_patterns:
      - tests/scaffold-core.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-coordinator.test.mjs
      - tests/runtime/project-coordinator-service.test.mjs
      - tests/runtime/project-coordinator-process.test.mjs
      - tests/runtime/project-coordinator-events.test.mjs
      - tests/runtime/implementation-worker-dispatch.test.mjs
      - tests/runtime/implementation-worker-jobs.test.mjs
      - tests/runtime/implementation-worker-integration.test.mjs
      - tests/runtime/project-branch-merge.test.mjs
      - tests/runtime/project-branch-push.test.mjs
      - tests/runtime/product-publication.test.mjs
      - tests/runtime/product-release.test.mjs
      - tests/runtime/process-worker-adapter.test.mjs
      - tests/runtime/container-worker-adapter.test.mjs
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

The package component owns the npm manifest, lockfile, standalone CLI and Project Runtime entrypoints, dashboard assets, README distribution guidance, versioned CodeWiki OS and Loop Protocol resources, optional thin Pi extension, optional execution-adapter peers, and install/readiness smoke coverage. Pi continues to own providers, authentication, model transport, tool mechanics, sessions, compaction, extensions, and ordinary Skill discovery.

The approved primary boundary is the CodeWiki CLI, Project Runtime, dashboard, and embedded published Pi SDK. Current package exports remain executable drift until that standalone boundary is complete. The root entrypoint remains harness-neutral and exports only transport-neutral core and Runtime contracts; Pi-specific hosts, sessions, and adapters must stay behind an explicit Pi subpath. The root must not re-export Pi-native Decision hosts or other adapter-specific Loop composition. `src/runtime/**` itself remains generic control-plane code rather than a second Decision, Planning, or Implementation package. The root entrypoint exports the transport-neutral `ProjectCoordinator` kernel. `src/runtime/coordinator-entrypoint.ts` is the explicit package-export facade for `./coordinator`, which exposes the detached project-service host/client boundary: daemon ensure/start/stop, exclusive election, private endpoint discovery, authenticated loopback transport, leased client registration, bounded generation-scoped event replay, remote inspection, capability-advertised semantic execution, candidate fallback, exact Assignment-worker scheduling through harness-neutral process or OCI adapters, generation fencing, exact semantic reaction scheduling, and trace-backed restart recovery. The OCI adapter is opt-in and requires the host to supply a digest-pinned worker image; package installation does not install Docker/Podman, pull an image, select credentials, or enable container execution automatically. `src/runtime/project-coordinator-daemon.ts` owns harness-neutral daemon lifecycle; `src/pi/project-coordinator-daemon.ts` is the executable launcher that dynamically loads `./pi-sdk` when its optional peer is available and installs the worktree-isolated Pi process worker adapter. During the architecture spike, `@earendil-works/pi-coding-agent` remains an optional peer and development dependency rather than a production dependency. Peer-absent packed installs start the coordinator without semantic adapters instead of silently pulling a second Pi runtime.

The Pi SDK subpath requires Node.js 22.19 or newer even while the harness-neutral core retains its broader engine range. Promotion to a production dependency or separate adapter package requires clean security audit, package-size review, external install proof, model/auth proof, cancellation and cleanup proof, and no duplicate-host resolution ambiguity.

## Development and release posture

CodeWiki is developed with Pi native coding tools, pi-lens, Git, source, tests, and the canonical Knowledge Base. The source repository must not install or load its own mutable extension during stabilization. It keeps no authoritative dogfood Change operations, state refs, controller pins, or Runtime instance state.

Extension behavior is verified by packing the candidate and installing it into disposable external projects with isolated Pi settings. Those tests may exercise tools, prompt injection, commands, dashboards, Change operation lifecycle, Git synchronization, and failure handling without granting the candidate authority over its source checkout.

A stable release may retain `package.json` `pi.extensions` for the optional thin client while shipping the standalone CLI/Runtime/dashboard as the primary product. Repo-local self-hosting, if ever restored, requires a separate explicit Decision after external release gates pass; it is not part of ordinary development.

## Ownership note

OKF concept identity comes from this bundle path. CodeWiki source ownership can
still point at a non-KB artifact through the `codewiki_source_map[].doc`
extension. That keeps the OKF bundle self-describing without pretending the
README has moved under `.codewiki/kb`.

## Related docs

- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Extension](extension.md)
- [Source Map](source-map.md)
