---
type: System Component
title: Clients
description: Owns software endpoints and deterministic User Interfaces without Project Server or CodeWiki execution authority.
status: stable
tags: [system, component]
codewiki_component: clients
codewiki_source_patterns: ["src/clients/**"]
codewiki_test_patterns: ["tests/clients/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Clients present bounded project truth and exact Project Server operations.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Clients provide direct user-controlled Check Pack editing, npm, Git, and local installation, preview, and inspection.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Clients expose Skill, Check SDK, bundle, snapshot, preview, and replay diagnostics without granting execution authority.
---
# Clients

A Client is a software endpoint that speaks the CodeWiki Client-Project Server Protocol. A User Interface is the human-facing surface implemented by a Client. The standalone browser App and deterministic CLI are the primary first-party Clients. Optional Pi, Claude Code, Codex, DSH, and future Agent-product integrations connect as External Agent Clients through MCP. Headless automation is a Client without a User Interface. Slack, GitHub, WhatsApp, and optional OpenClaw connectors enter through Project Server channel adapters.

A CodeWiki-launched Claude Code, Codex, or ACP process is a Delegated Run, not a Client. The same product may also run independently as an MCP Client, but the two operations retain different initiators, custody, receipts, and authority. Clients never gain process-lifecycle access merely because a matching delegate adapter exists.

Each Client Integration declares the commands, queries, events, attachments, confirmations, and redaction classes it can represent. Client kind and Client instance describe only software and paired installation or process; they are never the accountable Actor. The same Actor may use App, CLI, Pi, MCP, or channel Clients without changing identity. An Agent or service Client requires explicit delegation when acting for a User and otherwise acts only as its own limited service Actor. Effective capability is the intersection of Client declaration, Actor Authority Grant, explicit delegation where applicable, project policy, and current Project Server guards.

Clients render persisted Project Server truth and never infer readiness, provenance, activity, causality, completion, impact, next action, or authority. Browser and channel Clients call neither models nor Git directly. High-authority Candidate confirmation, Integration, publication, and deployment actions require a User Interface capable of exact digest-bound confirmation, normally the App or CLI. Submitting Change Intake Material never accepts a Change or grants protected authority.

The App organizes work by Decision, Planning, Implementation, and Review. Each stage workspace derives from one WorkState snapshot and presents subject, proposed transition, producer route, execution custody, exact context and Skills, Checks, attempt history, Gate feedback, pending authority, and permitted fixed transition. It distinguishes Runs, Delegated Runs, and External Agent Client activity without converting partial custody into complete provenance. This organization is a projection, not a configurable workflow graph or activation manifest.

External Agent Clients receive typed Stage Context, batch queries, submission, status, and confirmation operations through the reserved CodeWiki MCP namespace. They may also use an optional fresh bounded programmatic context query when supported. CodeWiki receipts cover only authenticated CodeWiki calls and admitted Candidates or Workbench operations; Clients must not display them as proof of complete external prompts, tools, Skills, local reads, subagents, models, code runtime, or memory.

Optional Pi integration exposes bounded reads and explicit User operations through the same Project Server and Runtime contracts. It does not own, import, or launch CodeWiki, Project Server, Runtime, Run Process, or Check Run Process lifecycle implementations, dynamically activate Stage Loop tools, or schedule semantic work from ambient chat, tool-result, startup, or resume events. Pi is one Client Integration rather than the product host or DSH-backed Run engine.

Check Packs have no dedicated lifecycle-management CLI. Users may edit `.codewiki/check-packs/**` directly, including through a user-controlled External Agent Client following public documentation. The App exposes the same source files through stage and Pack navigation. It can inspect and edit one optional `skill/<skill-name>/` Agent Skill, show exact effective stage Skill composition and digests, and distinguish Skill guidance from Gate Checks. A Model Check form captures requirement, pass, fail, feedback, input, measurement, threshold, model profile, and budget and writes `check.json` plus `CHECK.md`. A Code Check form captures common fields, accepts one self-contained `CHECK.mjs` upload, validates it, and may preview it in an admitted sandbox. Developer mode shows Check SDK input coverage, horizontal and vertical query facts, bundle provenance, sandbox diagnostics, and historical replay. Users may create, rename, edit, or delete any Pack, including every default.

Check Author build and fixture commands may exist as SDK development tooling but never install, activate, or mutate active Pack files. The App marketplace follows npm package-gallery ergonomics: search npm packages tagged `codewiki-check-pack`, accept exact npm, Git, or local package sources, inspect optional standard Agent Skills and Code or Model Checks, install selected Pack runtime files into `.codewiki/check-packs/**`, record resolved source integrity and separate Skill and Check base digests, and show exact update diffs. It does not load Runtime Plugins, DSH or Cordis plugins, prompt templates, themes, harness settings, or package hooks. Installation and update are explicit User actions. CodeWiki never invokes a model to author or alter Skill or Check files autonomously.
