---
type: User Story
title: Author Composable Checks
description: A Check Author wants reusable read-only project intelligence and composition primitives that build into one deterministic Gate boundary.
status: stable
codewiki_user: /product/users/check-author.md
tags: [product, story, checks, sdk]
---
# Author Composable Checks

As a Check Author, I want to compose repository-aware Checks from reusable Probes and Checks so I can validate both individual project layers and vertical alignment among Knowledge, code, tests, revisions, commits, and accepted work.

## Acceptance signals

- Author source, tests, fixtures, and dependencies remain in the author's package or repository; an installed project Check contains only `check.json` and one self-contained `CHECK.mjs`.
- The Check SDK supplies a Probe primitive for bounded snapshot-bound facts and a Check primitive for binary or quantitative judgment; no separate Verification abstraction is required.
- Checks may import pure libraries, Probes, and Checks through ordinary source dependencies, and the build bundles that closure into one readable deterministic artifact.
- A top-level Check registered by `check.json` is the only Result, cache, retry, failure-code, feedback, and Gate boundary; composed Checks inherit its context, limits, and cancellation and create no independent platform Results.
- Read-only SDK queries cover OKF Knowledge, repository content, code, tests, local revisions, commits, exact pull-request Evidence, Change state, and Alignment Graph facts.
- Horizontal and vertical queries report exact snapshot identity, provenance, coverage, truncation, and staleness.
- SDK diagnostics retain bounded references from Knowledge through source, tests, commits, and accepted work.
- Check Authors can validate, bundle, test with fixtures, preview in an admitted sandbox, and replay historical Invocations without mutating active Packs or canonical project state.
- Missing input or execution capability stops the affected Gate without fabricating a failed semantic Result.
