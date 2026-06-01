---
id: spec.system.audits
title: Linter Engine Migration
state: active
summary: Migration contract from legacy audit wording to gateway-required deterministic linters for alignment, security, package, generated-state, and file-structure evidence.
owners:
  - architecture
  - security
updated: "2026-06-01"
---

# Linter Engine Migration

## Responsibility

CodeWiki quality vocabulary is centered on the validation gateway. The gateway owns named gates; gates run required linters and executable code tests when code behavior changes; the gateway produces a validation verdict.

This document records the migration of the existing source-owned audit engine toward gateway-required linters. The file path and some source/API field names still use legacy audit wording for compatibility. User docs and agent guidance should prefer gateway, gate, linter, test, and validation.

Linters produce deterministic evidence for CodeWiki alignment. They do not decide product intent and do not replace validation gates. A gate may require linter evidence and then decide `pass`, `fail`, or `block` according to policy.

## Legacy surfaces

Current implementation still exposes legacy surfaces that should become compatibility shims or internal primitives during the production-surface migration:

- source-root engine currently implemented under `src/audit/**`,
- internal `wiki_audit` tool,
- standalone `/audit [flags]` command,
- fields such as `audit_refs` and `audit_reports` in build/report schemas.

The target surface is `wiki_gate` plus gateway-required linters. `/audit` remains a compatibility alias until command migration removes or hides it.

## Linter profiles

| Linter profile | Purpose | Typical gate use |
| --- | --- | --- |
| `alignment` | Check decision, knowledge, roadmap, tests, code, builds, validation, and content-evidence traceability. | Decision, planning, implementation, task-close. |
| `horizontal-alignment` | Check same-layer and neighboring-layer consistency: KB claim conflicts/duplicates, KB-code explicit refs, and relative source import contracts. | Architecture/system changes, semantic implementation, task-close when drift risk is high. |
| `source-contract` | Snapshot and compare source/API contract surfaces: registered tool names, command names, API facade exports, package entry roots, and documented expected surfaces. | API/tool/adapter changes, namespace migrations, package-facing source changes. |
| `file-structure` | Check path taxonomy, layer ownership, forbidden folders, generated/canonical boundaries, system diagram refs, stale architecture references, and that optional scripts do not own authoritative semantics. | Architecture/system changes, task-close, publication. |
| `stale-reference` | Check active docs/source for deleted paths, legacy command names, stale architecture paths, and obsolete CodeWiki surfaces. | Documentation, implementation, release. |
| `package` | Check package reachability, tarball contents, missing lockfile, source files included/excluded, and publication metadata. | Publication, release. |
| `security` | Check dependencies, secret-risk paths, unsafe command paths, network/package manager behavior, and publication safety. | Security changes, publication, release. |
| `generated-parity` | Check generated graph/views/task shards against canonical sources and detect stale generated output. | Graph rebuild, task-close, publication. |
| `changed` | Restrict linter execution to changed files and their owning layers while preserving required upstream/downstream checks. | Fast implementation iteration. |
| `task` | Evaluate one task, its accepted builds, evidence, files, and closure readiness. | Task-close. |

Profiles should return machine-readable findings, warnings, evidence refs, checked inputs, and content digests where applicable.

## Gateway use

Gateways call deterministic linter engines directly. Gateway policy selects required profiles by build kind, change type, and publication risk.

Examples:

- Documentation validation requires `alignment` and `stale-reference` for changed knowledge paths.
- Horizontal consistency validation can require `horizontal-alignment` when KB claims, explicit KB-code refs, API/import contracts, or same-layer source/docs coherence are the risk surface.
- API, adapter, tool namespace, or package-facing source changes can require `source-contract` so documented tool/command/API surfaces and package roots do not drift from source.
- Architecture or file-ownership changes require `file-structure`, `generated-parity`, and `alignment`.
- Implementation task-close requires `changed`, `task`, and any profile implied by changed files.
- Publication requires `package`, `security`, `alignment`, and immutable content evidence.

A missing required linter result blocks the gate. A failed linter finding fails or blocks according to severity and policy.

## Evidence model

Linter evidence should include:

- profile name and version,
- checked files and scopes,
- ignored/generated path classes,
- command output summaries,
- findings with severity, kind, path, and rationale,
- source fingerprints or working-tree digest,
- related build, task, validation, commit, or package refs.

Hot linter reports should persist only when they block, fail, are policy-required, or are needed for current publication. Passing linter evidence can live in the accepted build or validation report unless policy asks for a separate artifact.

## Rules

- Linters produce evidence; gates decide.
- Linter profiles should be deterministic wherever possible.
- Linter rules must understand canonical, generated, transient, runtime, dogfood, source, test, optional-helper-script, package, and system-diagram path classes.
- System diagram linters parse `.codewiki/kb/system/diagrams/**/*.yaml`, verify declared `diagram_refs`, and report `requires_doc` gaps through migration mode warnings or hard errors according to `codewiki.system_diagrams.diagram_refs.mode`.
- Gateway-required linters should be scoped by policy to avoid unnecessary cost.
- If a non-deterministic validator finds drift not covered by a linter profile, a follow-up task should add or extend a deterministic linter rule.

## Related docs

- [Alignment Model](alignment-model.md)
- [Validation Gateway](validation-gateway.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
- [Builds](builds.md)
