---
type: User Story
title: Recover History
description: A maintainer wants hot coordination state to remain compact while immutable accountable history stays recoverable and auditable.
status: stable
codewiki_user: /product/users/maintainer.md
tags: [product, story, recovery]
---
# Recover History

As a maintainer, I want CodeWiki to archive completed operation history without losing replay and audit capability so active coordination remains compact.

## Acceptance signals

- Archive acceptance verifies exact immutable segment identity before hot removal.
- Hydration is read-only and digest-bound.
- Reopening creates a new accountable hot segment rather than altering archived history.
