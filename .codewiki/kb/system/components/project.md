---
type: System Component
title: Project Configuration
description: Owns repository discovery, protected configuration, bootstrap, model routes, and source architecture declarations.
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

Project Configuration identifies the repository root, protected CodeWiki settings, model routes, source architecture, and bootstrap boundaries. Configuration digests bind every policy-sensitive attempt and cannot be weakened by clients, harnesses, or untrusted repository content.

Bootstrap creates the compact native Knowledge shape without authored projections. Source architecture declarations describe target dependency direction and are checked independently from temporary refactoring progress.
