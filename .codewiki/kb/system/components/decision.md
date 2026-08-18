---
type: System Component
title: Decision
description: Owns accepted-intent Candidate semantics, active-Change compatibility, knowledge-impact assessment, and Decision attempt interpretation.
status: stable
tags: [system, component]
codewiki_component: decision
codewiki_source_patterns: ["src/loops/decision/**", "src/loops/candidate-admission.ts"]
codewiki_test_patterns: ["tests/loops/decision/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/maintain-intent.md
    rationale: Decision supplies the System responsibility required by this Story.
---
# Decision

Decision evaluates one authenticated exact Change revision. Its Candidate states desired meaning, alternatives, constraints, risks, explicit relationships to accepted active Changes, and either an exact Knowledge transition or explicit unchanged-Knowledge references. Its typed `approve | reject | defer | withdraw` disposition remains part of Decision meaning rather than Check or Project Server policy.

Decision requires no unresolved semantic contradiction with the accepted active-Change portfolio. Duplicate, superseding, dependent, coordinated, and contradictory relationships are distinct: technical overlap and resource contention are not automatically semantic failure. The editable default Decision Check Pack includes an `active_change_compatibility` Model Check over the exact Candidate, every relevant accepted nonterminal Change revision, explicit relationships, accepted Work Graph projection, complete comparison coverage, and active-portfolio digest. Existing deterministic overlap checks require explicit accounting. Incomplete coverage stops the Gate rather than silently passing. Planning still owns technical dependencies and ordering; Project Server owns live resources; Integration and Review own actual byte and aggregate conflicts.

Decision owns Candidate and attempt semantics under `src/loops/decision/**`. A Change-scoped producer DSH Agent Session may span several bounded Runs. Project Server supplies refreshable immutable Project Material Generations to the producer and freezes a separate immutable Gate Evaluation Package only at Candidate checkpoint. Optional Decision Pack Skills may guide evaluation but cannot select disposition or affect Gate authority. Decision Checks independently run through the shared Checks Gate; every Model Check uses its own fresh, tool-free session. A failed Gate returns each atomic failure and its feedback contract to durable WorkState. A stopped Gate preserves current state and reports operational recovery.

A passed Gate certifies only the exact Decision Candidate against its frozen inputs. An authorized actor must separately confirm that unchanged Candidate and Gate digest against the current active-portfolio and WorkState heads. Project Server uses expected-head compare-and-swap so concurrently passed but mutually conflicting Changes cannot both inherit a stale compatibility result. Confirmed `approve` ratifies the Change and advances it to Change-scoped Planning; confirmed `reject`, `defer`, or `withdraw` follows its typed meaning. Any Candidate edit or relevant portfolio change requires fresh affected Results. Discoveries that alter accepted meaning return here rather than being silently absorbed by Planning, Implementation, or Review.
