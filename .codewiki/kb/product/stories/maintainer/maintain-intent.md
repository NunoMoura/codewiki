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

- A Decision Candidate binds an exact proposed transition from accepted state to intended Knowledge, or explicitly records no Knowledge delta.
- Gate pass certifies only that exact Candidate against present Checks.
- An authenticated authorized maintainer separately confirms the unchanged passed Candidate and Gate digest before Runtime accepts the semantic transition.
- Any Candidate edit requires a fresh Gate, and Implementation discoveries that change meaning route back to Decision.
- Git commits preserve artifact states but never substitute for accepted intent, Decision confirmation, or a Runtime lifecycle transition.
