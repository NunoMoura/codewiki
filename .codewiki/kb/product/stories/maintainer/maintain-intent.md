---
type: User Story
title: Maintain Intent
description: A maintainer wants accepted desired state captured and challenged before source changes commit the project to an implementation.
status: stable
codewiki_user: /product/users/maintainer.md
tags: [product, story, decision]
---
# Maintain Intent

As a maintainer, I want CodeWiki to preserve current accepted intent as desired Knowledge so source changes realize an understood target rather than transient conversation or raw diffs.

## Acceptance signals

- A Decision Candidate binds an exact desired-Knowledge revision or explicitly records no Knowledge delta.
- An authenticated maintainer approves the exact semantic transition.
- Implementation discoveries that change meaning route back to Decision.
