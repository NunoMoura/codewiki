---
type: System Component
title: Clients
description: Owns software endpoints and deterministic User Interfaces without Runtime or execution authority.
status: stable
tags: [system, component]
codewiki_component: clients
codewiki_source_patterns: ["src/clients/**"]
codewiki_test_patterns: ["tests/clients/**"]
codewiki_relationships:
  - type: realizes
    target: /product/stories/agent/retrieve-bounded-context.md
    rationale: Clients present bounded project truth and exact Runtime operations.
  - type: realizes
    target: /product/stories/maintainer/enforce-project-standards.md
    rationale: Clients provide direct user-controlled Check Pack editing, npm, Git, and local installation, preview, and inspection.
  - type: realizes
    target: /product/stories/check-author/author-composable-checks.md
    rationale: Clients expose Skill, Check SDK, bundle, snapshot, preview, and replay diagnostics without granting execution authority.
---
# Clients

A Client is a software endpoint that speaks the CodeWiki Client-Server Protocol. A User Interface is the human-facing surface implemented by a Client. The browser App, deterministic CLI, and optional Pi TUI are first-party Clients with User Interfaces. Headless automation is a Client without a User Interface. Claude Code and Codex connect as Clients through MCP and become Workers only while executing an accepted Assignment. Slack, GitHub, WhatsApp, and optional OpenClaw connectors enter through Server channel adapters.

Each adapter declares the commands, queries, events, attachments, confirmations, and redaction classes it can represent. Client kind and Client instance describe only software and paired installation or process; they are never the accountable actor. The same actor may use App, CLI, Pi, MCP, or channel Clients without changing identity. An Agent or service Client requires explicit delegation when acting for a user and otherwise acts only as its own limited service actor. Effective capability is the intersection of adapter declaration, actor Authority Grant, explicit delegation where applicable, project policy, and current Runtime guards.

Clients render persisted Runtime truth and never infer readiness, provenance, activity, causality, completion, impact, next action, or authority. Browser and channel Clients call neither models nor Git directly. High-authority Integration, publication, and deployment actions require a User Interface capable of exact digest-bound confirmation, normally the App or CLI. Submitting Change Intake Material never accepts a Change or grants protected authority.

Optional Pi integration exposes bounded reads and explicit user commands. It does not own, import, or launch Server App, Project Runtime, or concrete Execution process lifecycle implementations, register Decision, Planning, Implementation, or Review Candidate tools, dynamically activate Loop tools, or schedule semantic work or Workers from ambient chat, tool-result, startup, or resume events. The neutral Package bootstrap injects narrow dashboard and project-service ports into the Client, then composes those ports with Server App and Preview lifecycle, the Runtime gateway, and the separately owned Execution spawner. Exact `/wiki-select` admission may start one authenticated Decision attempt through Runtime; Pi-specific daemon composition and managed model execution remain separately isolated behind Execution Ports.

Check Packs have no dedicated CLI management surface. Users may edit `.codewiki/check-packs/**` directly, including through a user-controlled external Agent that follows public documentation. The App exposes the same source files through stage and Pack navigation. It can inspect and edit one optional `skill/<skill-name>/` Agent Skill, show exact effective stage Skill composition and digests, and distinguish Skill guidance from Gate Checks. A Model Check form captures requirement, pass, fail, feedback, input, measurement, threshold, model profile, and budget and writes `check.json` plus `CHECK.md`. A Code Check form captures common fields, accepts one self-contained `CHECK.mjs` upload, validates it, and may preview it in an admitted sandbox. Developer mode shows Check SDK input coverage, horizontal and vertical query facts, bundle provenance, sandbox diagnostics, and historical replay. Users may create, rename, edit, or delete any Pack, including every default.

Check Author build and fixture commands may exist as SDK development tooling but never install, activate, or mutate active Pack files. The App marketplace follows npm package-gallery ergonomics: search npm packages tagged `codewiki-check-pack`, accept exact npm, Git, or local package sources, inspect optional standard Agent Skills and Code or Model Checks, install selected Pack runtime files into `.codewiki/check-packs/**`, record resolved source integrity and separate Skill and Check base digests, and show exact update diffs. It does not load Pi extensions, prompt templates, themes, or package settings. Installation and update are explicit User actions. CodeWiki never invokes a model to author or alter Skill or Check files autonomously.
