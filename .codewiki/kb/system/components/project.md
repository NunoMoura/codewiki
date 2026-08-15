---
type: System Component
title: Project Configuration
description: Owns repository discovery, model routes, budgets, bootstrap, Check Pack paths, and source architecture declarations.
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

Project Configuration identifies the repository root, CodeWiki settings, Worker and Check model routes, budgets, source architecture, responsibility rules, and bootstrap boundaries. Project-owned structured configuration errors preserve exact invalid paths, bounded values, recovery guidance, and causes. Configuration digests bind every sensitive attempt; operation payloads, Workers, installed packages, and Check output cannot override canonical configuration.

Responsibility rules may define domain stewardship, review classes, scoped Authority Grants, independence requirements, and contribution-routing inputs. Profiles and ownership hints improve matching but grant no authority. Repository-provider access supplies coarse membership only; Runtime still authorizes each exact operation against current project policy and state.

Check requirements do not live in `.codewiki/config.json`. They are ordinary tracked files under `.codewiki/check-packs/<stage>/<pack>/<check-id>/`. Folder presence defines the active stage set. There is no protected Check floor, required default, applicability catalog, enforcement tier, or activation transaction. Users may edit or delete all Packs. Runtime snapshots exact files and configuration for each Gate, and a changed snapshot invalidates incompatible cached Results.

Project configuration stores provider, model, execution-profile, budget, bounded retry, and route identities but never credentials. Worker and Check model policies share provider transport primitives while retaining separate route selection, context, tools, memory, and budgets. Check routes have no implicit fallback to a Worker model. A route change alters execution identity and invalidates incompatible calibration and cached Results.

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
    decision/
      default/
      <pack-name>/
    planning/
      default/
      <pack-name>/
    implementation/
      default/
      <pack-name>/
    review/
      default/
      <pack-name>/
  check-packs.lock.json
  views/
  runtime/
```

Knowledge under `kb/**`, Change Traces under `traces/**`, `config.json`, and tracked Check files are source truth. `views/**` contains disposable projections. `runtime/**` contains private operational state recoverable from canonical project truth and exact receipts. Compact Evidence metadata enters Change Trace while large or private artifact bytes remain in their existing authority boundary; CodeWiki creates no canonical `.codewiki/evidence/` database or generic `.codewiki/changes.log`. Root `CHANGELOG.md` records package releases, not project Change history.

Bootstrap creates the compact native Knowledge shape and one empty bare-bones editable `default/` Pack directory per stage. This happens once. Missing or deleted defaults are never recreated on startup or upgrade. A stage with no Checks remains valid and its Gate passes with a visible warning. Source architecture declarations describe target dependency direction and are checked independently from temporary refactoring progress.
