---
id: spec.system.audits
title: Audits
state: active
summary: Audit engine and user command model for deterministic alignment, security, package, and file-structure evidence.
owners:
  - architecture
  - security
updated: "2026-05-25"
code_paths:
  - src/audit
  - src/adapters/pi/commands/audit.ts
  - src/adapters/pi/tools/audit.ts
  - src/adapters/pi/schemas.ts
  - scripts/check-architecture.mjs
---

# Audits

## Responsibility

Audits produce evidence for CodeWiki alignment. They do not decide product intent and do not replace validation gateways. A gateway may require audit evidence and then decide `pass`, `fail`, or `block` according to policy.

CodeWiki should expose one audit surface implemented in source, with adapter-facing entrypoints:

- source-root audit tool `src/audit/tool.ts` for gateways, agency, and agent workflows,
- user command `/audit [flags]` as a human wrapper around the same source-owned engine.

`/audit` without flags runs the full audit profile. Flags select narrower profiles so users and gateways do not need to audit the entire system every time.

## Profiles

| Profile | Purpose | Typical gate use |
| --- | --- | --- |
| `alignment` | Check decision, knowledge, roadmap, tests, code, builds, validation, and publication traceability. | Decision, planning, implementation, task-close. |
| `file-structure` | Check path taxonomy, layer ownership, forbidden folders, generated/canonical boundaries, system diagram refs, stale architecture references, and that optional scripts do not own authoritative semantics. | Architecture/system changes, task-close, publication. |
| `stale-reference` | Check active docs/source for deleted paths, legacy command names, stale architecture paths, and obsolete CodeWiki surfaces. | Documentation, implementation, release. |
| `package` | Check package reachability, tarball contents, missing lockfile, source files included/excluded, and publication metadata. | Publication, release. |
| `security` | Check dependencies, secret-risk paths, unsafe command paths, network/package manager behavior, and publication safety. | Security changes, publication, release. |
| `generated-parity` | Check generated graph/views/task shards against canonical sources and detect stale generated output. | Graph rebuild, task-close, publication. |
| `changed` | Restrict audit to changed files and their owning layers while preserving required upstream/downstream checks. | Fast implementation iteration. |
| `task` | Audit a single task, its accepted builds, evidence, checks, files, and closure readiness. | Task-close. |

Profiles should return machine-readable issues, warnings, evidence refs, checked inputs, and content digests where applicable.

## User command

The user-facing command should be a single command:

```text
/audit
/audit --file-structure
/audit --security
/audit --alignment
/audit --package
/audit --changed
/audit --task TASK-###
/audit --layer product,system,roadmap
```

The command prints a concise human report and stores or links machine-readable evidence when policy requires persistence.

## Gateway use

Gateways call the source-root audit engine directly. Gateway policy selects required profiles by build kind, change type, and publication risk.

Examples:

- Documentation validation requires `alignment` and `stale-reference` for changed knowledge paths.
- Architecture or file-ownership changes require `file-structure`, `generated-parity`, and `alignment`.
- Implementation task-close requires `changed`, `task`, and any profile implied by changed files.
- Publication requires `package`, `security`, `alignment`, and immutable content proof.

A missing required audit result blocks the gateway. A failed audit issue fails or blocks according to profile severity and policy.

## Evidence model

Audit evidence should include:

- profile name and version,
- checked files and scopes,
- ignored/generated path classes,
- command/check output summaries,
- issues with severity, kind, path, and rationale,
- source fingerprints or working-tree digest,
- related build, task, validation, commit, or package refs.

Hot audit reports should persist only when they block, fail, are policy-required, or are needed for current publication. Passing audit evidence can live in the accepted build or validation report unless policy asks for a separate artifact.

## Rules

- Audits produce evidence; gateways decide.
- Audit profiles should be deterministic wherever possible.
- Audit checks must understand canonical, generated, transient, runtime, dogfood, source, test, optional-helper-script, package, and system-diagram path classes. Scripts may be checked for package hygiene, but authoritative audit policy must live in source-owned engines, not in scripts.
- System diagram audits parse `.codewiki/kb/system/diagrams/**/*.yaml`, verify declared `diagram_refs`, and report `requires_doc` gaps through migration mode warnings or hard errors according to `codewiki.system_diagrams.diagram_refs.mode`.
- Full audit is the default user command behavior; gateway audits should be scoped by policy to avoid unnecessary cost.
- If a non-deterministic validator finds drift not covered by an audit profile, a follow-up task should add or extend a deterministic audit rule.

## Related docs

- [Alignment Model](alignment-model.md)
- [Validation Gateway](validation-gateway.md)
- [Graph](graph.md)
- [File Structure](file-structure.md)
- [Builds](builds.md)
