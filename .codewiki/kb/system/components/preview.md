---
type: System Component
title: Preview
description: Produces Candidate-bound local preview observations without granting semantic acceptance or publication authority.
status: stable
tags: [system, component]
codewiki_component: preview
codewiki_source_patterns: ["src/preview/**"]
codewiki_test_patterns: ["tests/project-server/preview-*.test.mjs"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Preview supplies the System responsibility required by this Story.
---
# Preview

Preview starts bounded local targets, captures browser observations, and returns exact Candidate-bound Evidence metadata. A preview is disposable and reconstructible; screenshots, recordings, pages, and logs remain outside canonical semantic authority.

Preview cannot pass a Check by itself, publish a product, mutate provider state, or reuse stale observations across Candidate identity.
