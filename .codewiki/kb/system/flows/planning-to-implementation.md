---
type: System Flow
title: Planning to Implementation
description: Claims eligible Work Items and integrates exact realization Candidates against current accepted Planning.
status: stable
tags: [system, flow]
codewiki_relationships:
  - type: realizes
    target: /product/stories/maintainer/automate-safe-work.md
    rationale: Planning to Implementation provides the stable cross-component behavior required by this Story.
---
# Planning to Implementation

Runtime projects eligible Work Items from accepted Planning and current WorkState, acquires bounded claims, and dispatches each assignment to a Runtime-owned isolated workbench through Managed Execution or an admitted MCP Agent Client. Implementation Candidates bind exact obligations, source, tests, Knowledge, configuration, Git base, workbench custody, and provenance.

Runtime integrates only fresh compatible Candidates. Claim loss, base drift, conflicting work, incomplete Evidence, or unsupported capability leaves canonical state unchanged and routes to retry, replanning, or Decision as semantics require.
