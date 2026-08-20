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

- A Decision Candidate binds an exact proposed transition from accepted state to intended Knowledge, or explicitly records no Knowledge delta, and accounts for relationships to accepted active Changes.
- The default Decision policy checks for unresolved semantic contradiction against an exact complete accepted active Changes snapshot; overlap, dependency, supersession, duplication, and conflict remain distinct.
- Gate pass certifies only that exact Candidate against present Checks and accepted active Changes inputs.
- An authenticated authorized maintainer separately confirms the unchanged passed Candidate and Gate digest before Project Server accepts the semantic transition through accepted active Changes expected-head compare-and-swap.
- Any Candidate edit requires a fresh Gate, and Implementation discoveries that change meaning route back to Decision.
- Git commits preserve artifact states but never substitute for accepted intent, Decision confirmation, or a Project Server lifecycle transition.
