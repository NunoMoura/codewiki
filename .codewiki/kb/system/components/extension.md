---
type: Concept
title: Pi Extension
description: CodeWiki's optional Pi extension is a thin client/execution adapter to standalone Project Runtime; source-checkout self-hosting remains disabled until external gates pass.
tags:
  - codewiki
  - system
  - extension
timestamp: 2026-07-30T00:00:00Z
codewiki_component: pi
codewiki_components:
  - pi
codewiki_source_patterns:
  - src/pi/**
codewiki_test_patterns:
  - tests/helpers/pi-project-services.mjs
  - tests/runtime/pi-worker-start.test.mjs
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-install-smoke.mjs
  - tests/runtime/pi-install-scope.test.mjs
  - tests/runtime/pi-process-session.test.mjs
  - tests/runtime/pi-decision-research-claims-session.test.mjs
  - tests/runtime/process-worker-adapter.test.mjs
  - tests/runtime/pi-project-service-client.test.mjs
  - tests/runtime/pi-project-coordinator-daemon.test.mjs
  - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
  - tests/runtime/pi-rpc-smoke.mjs
  - tests/runtime/pi-tool-mutation-smoke.mjs
  - tests/runtime/pi-worker-reports.test.mjs
  - tests/runtime/package-install-smoke.mjs
  - tests/runtime/project-local-install-smoke.mjs
  - tests/runtime/external-package-lifecycle-smoke.mjs
  - tests/runtime/external-package-failures-smoke.mjs
codewiki_role: host_adapter
codewiki_source_map:
  - id: pi
    source_patterns:
      - src/pi/**
    test_patterns:
      - tests/helpers/pi-project-services.mjs
      - tests/runtime/pi-worker-start.test.mjs
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-install-smoke.mjs
      - tests/runtime/pi-install-scope.test.mjs
      - tests/runtime/pi-process-session.test.mjs
      - tests/runtime/pi-decision-research-claims-session.test.mjs
      - tests/runtime/process-worker-adapter.test.mjs
      - tests/runtime/pi-project-service-client.test.mjs
      - tests/runtime/pi-project-coordinator-daemon.test.mjs
      - tests/runtime/pi-multiprocess-coordinator-smoke.mjs
      - tests/runtime/pi-rpc-smoke.mjs
      - tests/runtime/pi-tool-mutation-smoke.mjs
      - tests/runtime/pi-worker-reports.test.mjs
      - tests/runtime/package-install-smoke.mjs
      - tests/runtime/project-local-install-smoke.mjs
      - tests/runtime/external-package-lifecycle-smoke.mjs
      - tests/runtime/external-package-failures-smoke.mjs
    role: host_adapter
---
# Pi Extension

## Boundary

CodeWiki's primary product is:

```text
standalone CLI
+ Project Runtime
+ dashboard
+ embedded published Pi SDK
```

`package.json` may retain `pi.extensions` for an optional thin conversational client. The extension is not CodeWiki's authority, canonical host, or source of project lifetime.

Pi integration under `src/pi/**` has two roles:

1. thin client for intent, authority, explanation, supervision, and dashboard access;
2. execution adapter creating bounded Candidate-producer and independent Model Check sessions on Runtime request.

Harness-neutral Runtime code must not import Pi SDK types.

## Ownership

Pi owns:

- providers and credentials;
- authentication plumbing and model transport;
- sessions and compaction;
- tool mechanics and extension loading;
- ordinary Skill discovery.

CodeWiki owns:

- versioned CodeWiki OS and Loop Protocol resources;
- exact typed session inputs and submission schemas;
- Runtime-selected routes and budgets;
- Change/operation/Candidate/Evidence/Result/Report identity;
- WorkState, Change Claims, Work Item Claims, Assignments, and Integration;
- canonical Git-backed writes and effects.

Sessions return bounded Candidate, Model Check, or worker material only. They cannot append operations, grant authority, alter Checks, choose Runtime Route, or attest acceptance.

## Semantic sessions

Decision, Planning, and Implementation Candidate producers use separate Pi SDK sessions with bounded repository tools and one closed role-specific submission tool.

Independent Model Checks never reuse producer sessions. Decision research claim-support uses a stricter in-memory tool-free session with exact Runtime-selected route, strict JSON, bounded bytes/time, cancellation, and no resource discovery.

Candidate producers receive versioned CodeWiki OS guidance, one exact Loop Protocol, current work, bounded relevant successful/harmful repair guidance, and scoped tools/Skills. Independent Model Checks receive no producer conversation or repair-learning context.

## Workers

Implementation workers use one harness-neutral Worker Workbench contract. Default Pi adapter may execute foreground child processes in explicit worktrees. Opt-in OCI adapter executes the same contract through a host-selected digest-pinned Docker/Podman image.

Runtime provisions exact Worker Workbench, acquires Work Item Claim authority, dispatches Assignment, validates immutable Worker Report, performs guarded Integration, and evaluates final integrated Candidate. The extension cannot select or provision trusted worker image automatically.

## Local daemon versus team state

One detached local project daemon may host Runtime for CLI, dashboard, and Pi clients. Leased loopback clients, generation fencing, bearer capability, event replay, and supervision protect local process ownership only.

Shared team acceptance synchronizes through provider-neutral Git `codewiki/state` expected-head CAS. Local daemon generation cannot make Change Claim or Work Item Claim globally visible by itself. Notifications and local event journals trigger verified refresh only.

## Commands

Current compatibility slash surface remains:

```text
/wiki-dashboard
/wiki-resume
/wiki-explain
/wiki-config
/wiki-bootstrap
```

Standalone CLI becomes primary host. Pi commands remain thin conveniences. Main-conversation semantic candidate tools are temporary peer-absent fallback and expose only Runtime-selected work.

## Distribution testing

Package remains `"private": true` under selected identity `@nunomoura/codewiki` and is not published to the npm registry yet. Extension behavior is tested only through project-local packed installs in disposable external projects with isolated Pi settings. Avoid global/user installs for normal mutation.

Current external smokes cover:

- package/Pi install resolution;
- Pi RPC commands;
- multi-process coordinator clients;
- isolated tool mutation;
- project-local package installation;
- external lifecycle and failure paths;
- Pi SDK semantic sessions and Worker Reports.

Current mutation smoke still proves legacy expected-byte/local-sequence behavior. That is executable drift; target external proof must exercise Change Trace Protocol v1 and remote expected-head state acceptance.

Real model/provider authentication, real OCI execution, trusted worker-image distribution, distributed state synchronization, archive/hydration, and production effect correlation remain external gates.

## Source-checkout boundary

During stabilization, this source checkout does not register, install, or load CodeWiki. This repository must not:

- register or load CodeWiki in `.pi/settings.json`;
- add `.pi/extensions/codewiki.ts` or a mutable local package path;
- install CodeWiki under repository `.pi/`;
- activate project-local CodeWiki Skills, prompts, tools, commands, or dashboard;
- recreate controller pins, Changes Backlog refs, dogfood Traces, or dogfood trace state;
- use CodeWiki-owned resume/compaction.

Normal development uses Pi native coding tools, Pi-Lens, `.codewiki/kb/**`, source/tests, Git, and Pi native compaction. Packed external projects test prompts, tools, commands, dashboard behavior, guarded lifecycle writes, failures, and cleanup.

Source-repository dogfood is not a release requirement. Reconsideration requires a new explicit Product/System decision after stable external gates pass. Historical controller approvals and Trace bytes grant no authority.

## Production readiness gates

Before publication or unattended operation require:

- clean Change Trace Protocol and native Loop-exit cuts;
- external provider/auth/cancellation/cleanup proof;
- real OCI proof for claimed container support;
- distributed Git synchronization and recovery proof;
- exact archive/hydration proof;
- no Runtime scratch leakage;
- package/security/peer-range review;
- explicit authority policy for destructive/external effects;
- explicit publication/release approval.

Installing a different package version while Pi runs requires full Pi restart; extension reload cannot guarantee imported module replacement.

## Related docs

- [CodeWiki OS and Loop Protocols](codewiki-os.md)
- [Loop Exit](loop-exit.md)
- [Worker Workbench](worker-workbench.md)
- [Model Routing](model-routing.md)
- [Change Traces](traces.md)
- [Runtime](runtime.md)
- [Session Coordination](session-coordination.md)
- [Adapters and UI](adapters-and-ui.md)
- [API Tool Surface](api-tools.md)
- [Clean-Cut Audit](../flows/clean-cut-audit.md)
