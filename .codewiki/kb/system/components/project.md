---
type: System Component
title: Project Configuration
description: Owns repository discovery, protected configuration, Check defaults, model routes, bootstrap, and source architecture declarations.
status: stable
tags: [system, component]
codewiki_component: project
codewiki_source_patterns: ["src/project/**"]
codewiki_test_patterns: ["tests/project/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Project Configuration supplies the System responsibility required by this Story.
---
# Project Configuration

Project Configuration identifies the repository root, protected CodeWiki settings, Check defaults, model routes, source architecture, responsibility rules, and bootstrap boundaries. Configuration digests bind every policy-sensitive attempt and cannot be weakened by Clients, Workers, installed packages, or untrusted repository content.

Responsibility rules may define domain stewardship, review classes, scoped Authority Grants, independence requirements, and contribution-routing inputs. Profiles and ownership hints improve matching but grant no authority. Repository-provider access supplies coarse membership only; Runtime still authorizes each exact operation against current project policy and state.

Project-wide Check defaults live in `.codewiki/config.json`; each installed Pack binding has one inherited `config.json`; and a Check directory may contain one optional sparse `config.json` override beside `CHECK.*`. Protected floors apply after all three project-owned layers. Pack and Check scope can narrow inherited applicability or input boundaries but cannot widen a trusted outer boundary.

Project configuration stores provider, model, execution-profile, budget, and fallback policy identities but never credentials. Check model routes are independent from work-producing Managed Execution routes and have no implicit fallback to an authoring or repair route. A route change alters provenance and invalidates incompatible calibration and cached Results.

Canonical project-local layout is:

```text
.codewiki/
  config.json
  kb/
    product/
    system/
  traces/
    TRACE-CHG-<id>.jsonl
  check-packs/
  check-packs.lock.json
  views/
  runtime/
```

Knowledge under `kb/**`, Change Traces under `traces/**`, protected `config.json`, and tracked Check Pack definitions are source truth. `views/**` contains disposable projections. `runtime/**` contains private operational state that must remain recoverable from canonical project truth and exact receipts. Compact Evidence metadata enters Change Trace while large or private artifact bytes remain in their existing authority boundary; CodeWiki creates no canonical `.codewiki/evidence/` database or generic `.codewiki/changes.log`. Root `CHANGELOG.md` records package releases, not project Change history.

Bootstrap creates the compact native Knowledge shape and open editable Default Check Pack without authored projections. Source architecture declarations describe target dependency direction and are checked independently from temporary refactoring progress.
