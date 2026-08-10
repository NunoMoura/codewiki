---
type: System Component
title: Harnesses
description: Implements Runtime-selected Candidate producer, Check evaluator, worker, and assisted-authoring execution ports.
status: stable
tags: [system, component]
codewiki_component: harnesses
codewiki_source_patterns: ["src/harnesses/**"]
codewiki_test_patterns: ["tests/harnesses/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Harnesses supplies the System responsibility required by this Story.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Harnesses supplies isolated Check evaluation and active-model authoring required by this Story.
---
# Harnesses

A harness adapts an execution environment to typed Candidate producer, Check evaluator, or worker ports. Every adapter declares candidate production, model evaluation, code runtime, repository read, workbench mutation, structured output, cancellation, usage reporting, and isolation capabilities.

Model Checks are isolated tool-free evaluations over deterministic Runtime-supplied context. Code Checks run only in admitted sandboxes through exact language adapters. Neither evaluator receives implementation-agent history, mutation tools, credentials, network access, or canonical-write authority. Missing isolation, exact model selection, structured output, runtime profile, or sandbox capability becomes unavailable or indeterminate and never weakens policy.

The default model catalog, authentication, and execution adapter uses the Pi SDK with CodeWiki-specific user credential and model paths. A Claude Code adapter may expose harness-native Anthropic routes and opaque harness-managed authentication only when it can provide exact model choice, isolated context, bounded output, and provenance. The same nominal model through Pi and Claude Code is a different route because adapter, authentication source, envelope, and behavior differ.

The active Harness model may author Check Packs or repair Candidates under ordinary user-visible work authority. It is distinct from the configured Check evaluator route. Assisted authoring uses host-native guidance plus deterministic CodeWiki schemas and validators; it cannot silently assign the Harness model as evaluator, promote enforcement, or create Results.

Harnesses cannot own Loop semantics, Runtime scheduling, canonical writes, guarded effects, project credentials, or final routing. Runtime depends only on neutral harness ports, concrete Harnesses do not import interaction Clients, and Pi remains the first adapter rather than a privileged core dependency.
