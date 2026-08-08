---
type: System Component
title: API
description: Exposes thin harness-neutral commands and bounded query contracts over semantic owners.
status: stable
tags: [system, component]
codewiki_component: api
codewiki_source_patterns: ["src/api/**"]
codewiki_test_patterns: ["tests/api/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: API supplies the System responsibility required by this Story.
---
# API

The API exposes stable typed operations for bounded reads and authenticated requests. It delegates semantics and authority to their owning packages and never becomes a second scheduler, store, policy engine, or Loop implementation.

Query responses identify their exact snapshot and limits. Mutation requests reject unknown fields and caller-supplied Runtime-owned identity, time, route, or authority.
