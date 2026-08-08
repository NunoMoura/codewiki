---
type: User Story
title: Automate Safe Work
description: A maintainer wants compatible work to advance automatically while authority, policy, Evidence, and effect boundaries remain explicit and fail closed.
status: stable
codewiki_user: /product/users/maintainer.md
tags: [product, story, automation]
---
# Automate Safe Work

As a maintainer, I want CodeWiki to advance compatible work automatically so routine progress does not require manual orchestration while unsafe progression remains blocked.

## Acceptance signals

- Runtime selects, starts, retries, waits, blocks, and routes eligible work from current state.
- Missing capability, stale state, incomplete Evidence, or absent authority yields waiting or blocking, never silent relaxation.
- Every advance names exact inputs, policy, Evidence, and route.
