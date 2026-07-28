---
type: Concept
title: Live Preview Runtime
description: CodeWiki binds approved frontend-impact work to loopback preview profiles, supervises native development servers, and opens browser sessions without creating another semantic authority.
tags:
  - codewiki
  - system
  - preview
  - browser
  - dashboard
timestamp: 2026-07-18T00:00:00Z
codewiki_component: preview-runtime
codewiki_components:
  - preview-runtime
codewiki_source_patterns:
  - src/preview/**
codewiki_test_patterns:
  - tests/runtime/preview-browser-adapter.test.mjs
  - tests/runtime/preview-profile.test.mjs
  - tests/runtime/preview-coordinator.test.mjs
  - tests/runtime/preview-evidence.test.mjs
  - tests/runtime/preview-integration.test.mjs
  - tests/runtime/dashboard-preview-control.test.mjs
  - tests/runtime/dashboard-dev-harness.test.mjs
codewiki_role: operational_preview
codewiki_source_map:
  - id: preview-runtime
    source_patterns:
      - src/preview/**
    test_patterns:
      - tests/runtime/preview-browser-adapter.test.mjs
      - tests/runtime/preview-profile.test.mjs
      - tests/runtime/preview-coordinator.test.mjs
      - tests/runtime/preview-evidence.test.mjs
      - tests/runtime/preview-integration.test.mjs
      - tests/runtime/dashboard-preview-control.test.mjs
      - tests/runtime/dashboard-dev-harness.test.mjs
    role: operational_preview
---
# Live Preview Runtime

## Responsibility

The Live Preview Runtime creates an automatic, explicit relationship between frontend-impact work and its visual result. It starts or attaches to one project-owned development server per profile/integration root, waits for a loopback readiness endpoint, opens isolated browser sessions per canonical UI target, and projects health and controls through the CodeWiki dashboard. It does not render an application, replace the project's native development server or HMR, infer semantic approval from pixels, or create another CodeWiki loop.

## Implementation status

Structured profiles, canonical `uiPreviewTargets[]`, deterministic profile/target digests, Planning-owned target bindings, Implementation Loop coordination, profile-level server deduplication across routes, package-script supervision, exact integration checkout state, contributor aggregation, readiness, browser adapters, side-effect-free Playwright preflight, cleanup, dashboard controls, source-only harness, and explicit target evidence capture are implemented. Legacy single-Sprint `preview` binding is removed.

Capture automates the accepted desktop/mobile viewports, records bounded redacted console and network observations, hashes each screenshot, and writes a correlated manifest under `.codewiki/runtime/preview-evidence/`. Capture remains operational evidence and does not append semantic trace truth or grant approval.

## Preview binding

A preview profile is project configuration. Version 1 accepts only a structured package-script reference, a loopback origin, an origin-relative readiness path, a bounded readiness timeout, a browser adapter, and an auto-open flag:

```json
{
  "preview": {
    "profiles": [
      {
        "id": "web",
        "runner": {
          "kind": "package_script",
          "script": "dev",
          "scriptDigest": "sha256:b16efac145e9242cfb05d739a8509ac7295f381108dce0f753e52a1aaf48e7a1"
        },
        "url": "http://127.0.0.1:3000",
        "readyPath": "/",
        "readyTimeoutMs": 30000,
        "browser": "system",
        "autoOpen": true
      }
    ],
    "uiPreviewTargets": [
      {
        "id": "dashboard-detail",
        "uiRef": ".codewiki/kb/product/uis/terminal.md#live-preview",
        "profileId": "web",
        "route": "/dashboard",
        "viewports": ["desktop", "mobile"],
        "scenario": "implemented-change"
      }
    ]
  }
}
```

Canonical KB UI refs own semantic preview targets. Project config binds each target id to one profile, origin-relative route, viewports, and optional bounded scenario/fixture identifier. Profiles describe how one development server runs; targets describe which UI route/state is shown. Several targets may share one profile, and several integrated Changes may contribute to one target.

Decision-approved Changes declare affected UI refs and visual outcome requirements. Planning selects exact target/profile bindings for Sprint and Work Item execution, freezes target and profile digests, and records contributing Change refs. Preview-bound frontend work includes `.codewiki/kb/product/DESIGN.md` among affected Knowledge refs. Knowledge/path inference may suggest targets but cannot authorize execution.

`runner.scriptDigest` freezes exact `package.json` script text and is rechecked before managed start. Changing runner or execution-capable profile fields changes profile digest; changing route/scenario/viewports changes target digest. Drift blocks prior Planning authority until a new exited plan accepts current digests. Arbitrary shell strings, inline commands, remote URLs, credentials, query strings, fragments, and unknown fields are rejected.

## Lifecycle

When a target's Change Trace reaches Implementation, Preview Coordinator validates its Planning binding against current target/profile digests and captures exact integration-root Git HEAD, committed tree, working-tree digest, dirty paths, and Change/Sprint/Work Item correlation before checking profile readiness. Disposable `.codewiki/runtime/**` artifacts and canonical `.codewiki/traces/**` workflow records are excluded from product-tree dirtiness because they belong to separate authority boundaries. A ready server is attached without ownership. Otherwise CodeWiki detects declared package manager, starts exact package script without shell, waits within timeout, and owns process group. Coordinator deduplicates server processes by profile/integration root while managing browser routes and evidence by UI target. Conflicting active bindings for one target id fail closed.

Dashboard groups preview state by canonical UI target and displays profile/target identity and digests, URL/route, integration root, process ownership, browser capability, contributing Changes and Sprints, visibility/conflict state, viewports, failures, logs, and captures. Open, Capture, Restart, and Stop use guarded same-origin operational APIs. Capture requires ready Playwright profile, successful preflight, verified browser, and exact accepted target binding. Stop suppresses automatic restart for Pi session until explicit restart. Closing dashboard does not stop active preview; no-longer-needed target/profile usage, Pi shutdown, or explicit Stop cleans managed resources. Capture summaries survive restart/Stop for coordinator session.

The dashboard is the user control and projection surface, but the Preview Coordinator owns process and browser lifecycle. Dashboard requests remain exact same-origin, capability-guarded operational mutations. Preview controls cannot append semantic trace records, approve an iteration, write source, raise runtime authority, expose a public tunnel, or connect to a non-loopback target.

## Browser adapters

The system-browser adapter is the universal baseline. It opens the ready loopback URL without taking browser automation authority.

The Playwright CLI adapter is an optional enhanced adapter. Before opening a browser, CodeWiki runs `playwright-cli --version` with a short timeout, disabled update notification, no shell, and no install action. A successful probe proves only that the CLI is available; the browser becomes verified only after Open succeeds. Until then, Capture remains disabled. If the CLI is absent, the development server remains ready, Open and Capture are disabled, and the dashboard shows explicit install commands. After installation, Restart reruns the capability check. A browser-launch failure retains a ready server, disables Capture, and shows browser-install guidance.

The adapter uses one isolated, bounded session identifier and structured CLI arguments to open a headed browser. Explicit Capture navigates that approved session to the loopback profile URL, applies each accepted viewport, writes exact-path screenshots, and reads bounded console and request observations. CodeWiki does not silently install a CLI, browser binary, or different adapter. A user may instead approve a profile revision that selects the system-browser adapter without automated capture.

Each capture manifest records canonical UI ref, target id/digest, profile id/digest, route, contributing Change Trace refs, relevant Implementation iteration refs, exact integration Git/tree and dirty state, visibility/conflict state, capture time, viewport, screenshot paths/digests, bounded redacted console/network observations, and manifest digest. Missing evidence is omitted rather than fabricated. Artifacts live under ignored runtime state and never become automatic semantic approval.

## Source dashboard development

The CodeWiki source repository must not load its own Pi extension or create active product traces. `npm run dashboard:dev -- --project <external-project>` starts the source dashboard against a disposable external fixture, runs the same Preview Coordinator and dashboard control API, adds development-only asset reload, and opens the dashboard through the same bounded browser adapter. Source and fixture roots must be separate; ancestor, descendant, and identical roots fail closed.

This standalone harness is the fast visual-development path. Packed installation into a disposable external project remains the integration gate for real trace binding, Pi lifecycle cleanup, dashboard controls, and extension behavior.

## Security limits

- Preview URLs use HTTP or HTTPS on `localhost`, `127.0.0.1`, or `::1` only.
- Startup requires project trust plus approval of the exact profile digest.
- Browser session identifiers are bounded and cannot contain shell syntax.
- Commands are spawned directly with argument arrays; no shell command string is accepted.
- Logs and browser observations are bounded and redacted before projection or retention.
- No public tunnel, iframe proxy, default personal browser profile, or remote debugging endpoint is enabled automatically.
- Preview failure blocks required visual evidence but does not rewrite semantic truth.

## Related docs

- [Adapters and UI Component](adapters-and-ui.md)
- [Client and Dashboard Architecture](terminal-ui.md)
- [Project Dashboard and Optional Pi Client](../../product/uis/terminal.md)
- [Implementation Loop](implementation-loop.md)
