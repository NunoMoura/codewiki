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

Project Configuration identifies the repository root, protected CodeWiki settings, Check defaults, model routes, source architecture, and bootstrap boundaries. Configuration digests bind every policy-sensitive attempt and cannot be weakened by clients, harnesses, installed packages, or untrusted repository content.

Project-wide Check defaults live in `.codewiki/config.json`; each installed Pack binding has one inherited `config.json`; and a Check directory may contain one optional sparse `config.json` override beside `CHECK.*`. Protected floors apply after all three project-owned layers. Pack and Check scope can narrow inherited applicability or input boundaries but cannot widen a trusted outer boundary.

Project configuration stores adapter, provider, model, execution-profile, budget, and fallback policy identities but never credentials. Check model routes are independent from work-producing Harness routes and have no implicit fallback to the active Harness model. A route change alters provenance and invalidates incompatible calibration and cached Results.

Bootstrap creates the compact native Knowledge shape and open editable Default Check Pack without authored projections. Source architecture declarations describe target dependency direction and are checked independently from temporary refactoring progress.
