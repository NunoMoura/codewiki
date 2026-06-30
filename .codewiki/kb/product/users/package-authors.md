---
type: Concept
title: Extension and Workflow Authors
description: Extension and workflow authors use CodeWiki's structure and capability contracts without adopting CodeWiki as a sandbox, telemetry runtime, or general execution framework.
tags:
  - codewiki
  - product
  - users
  - package
  - authors
timestamp: 2026-06-30T00:00:00Z
---
# Extension and Workflow Authors

Extension and workflow authors use CodeWiki's structure and capability contracts without adopting CodeWiki as a sandbox, telemetry runtime, or general execution framework.

They need stable semantics for:

- compact state reads;
- semantic loop iterations;
- runtime claims and worker coordination;
- exit-condition results;
- generated view rebuilds;
- loop-governed automation controls;
- publication support;
- packaged workflow skills;
- future visual or non-visual access surfaces.

## Success signals

- Authors can extend workflows without bypassing `.codewiki/` semantics.
- Skill packages compose with CodeWiki rather than replacing traces, loop outputs, generated views, source/tests, or Git proof.
- Technical access surfaces use typed capabilities for semantic writes.
- Visual surfaces read canonical and generated state rather than creating hidden UI-only truth.

## Related docs

- [CodeWiki API](../../system/api.md)
- [API Tool Surface](../../system/api-tools.md)
- [Loop Model](../../system/loop-model.md)
- [Extension](../../system/extension.md)
