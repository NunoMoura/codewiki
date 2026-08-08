---
type: System Flow
title: Decision to Planning
description: Transfers approved desired meaning into ordered realization obligations without allowing Planning to rewrite intent.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision to Planning provides the stable cross-component behavior required by this Story.
---
# Decision to Planning

Runtime reads an approved Decision Candidate and its Exit Report, verifies exact current Change revision and Knowledge binding, then invokes Planning. Planning decomposes accepted meaning into Work Items, dependencies, acceptance criteria, and Knowledge realization obligations.

If Planning discovers ambiguous intent, changed risk, conflicting authority, or a semantic Knowledge change, it recommends return to Decision. It cannot silently reinterpret the approved Candidate.
