---
type: User Story
title: Enforce Project Standards
description: A maintainer wants open project-owned Checks to gate each development stage with exact outcomes and actionable feedback.
status: stable
codewiki_user: /product/users/maintainer.md
tags: [product, story, checks]
---
# Enforce Project Standards

As a maintainer, I want CodeWiki to apply project expectations as bounded Checks so code, policy, design, review, and delivery requirements remain inspectable and editable rather than hidden in agent prompts or product code.

## Acceptance signals

- Bootstrap materializes deliberately bare-bones Default Packs under Decision, Planning, Implementation, and Review; users may edit or delete every default without breaking CodeWiki.
- Every local or marketplace-installed Pack uses direct `<check-id>/` directories with `check.json` and exactly one `CHECK.md` or `CHECK.mjs`, and may contain one optional standard Agent Skill under `skill/<skill-name>/`.
- Pack Skills guide only work-producing Agents; Code and Model Checks independently judge exact outputs and never inherit producer Skills, resources, memory, or tools.
- CodeWiki never autonomously authors or restores Packs; manual edits, user-controlled Agents, and authenticated App forms operate on the same documented files.
- Every Check defines one pass/fail boundary, one stable failure code, and one feedback contract; binary and thresholded quantitative measurements both reduce to pass or fail.
- Model Checks are isolated and tool-free with routes separate from work-producing models; Code Checks run only in admitted sandboxes.
- Completed Checks produce pass or fail Results. Operational inability stops the Gate attempt with an exact recovery reason, produces no Result, and does not crash the system.
- Checks run with exact caching, bounded parallelism, and code-before-model fail-fast execution.
- A stage with no Checks passes with a visible `no_checks_configured` warning; malformed content stops only the affected Gate.
- Review may use automated Model or Code Checks, provider Evidence, optional human Review Evidence, or any user-chosen combination.
- Npm packages use a simple discoverable Check Pack manifest or conventional `check-packs/` tree, install without lifecycle scripts, and materialize only editable Skill and runtime Check files through the App; `package.json` remains transport metadata and never replaces `check.json`.
