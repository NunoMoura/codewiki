---
type: System Component
title: Clients
description: Owns deterministic first-party interaction surfaces and capability-scoped presentation without Runtime or execution authority.
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
    rationale: Clients provide deterministic Check configuration, review, and explicit assisted authoring.
---
# Clients

Clients are CodeWiki-owned interaction surfaces: the CodeWiki App, deterministic CLI, and optional Pi TUI integration. External Claude Code and Codex applications connect as Agent Clients through Host MCP; Slack, GitHub, WhatsApp, and optional OpenClaw connectors enter through Host channel adapters.

Each adapter declares the commands, queries, events, attachments, confirmations, and redaction classes it can represent. Effective capability is the intersection of adapter declaration, paired actor authority, project policy, and current Runtime guards. A paired WhatsApp participant may submit Change Intake Material and answer bounded questions; transport name alone does not prohibit intake. Submitting material never accepts a Change or grants protected authority.

Clients render persisted Runtime truth and never infer readiness, provenance, activity, causality, completion, or authority. Browser and channel Clients call neither models nor Git directly. High-authority scope, enforcement, Integration, publication, and deployment actions require an interaction surface capable of exact digest-bound confirmation, normally the App or CLI.

Check forms and developer mode edit the same tracked Pack files. Assisted authoring is an explicit Client request that Runtime routes to Managed Execution; the returned proposal receives deterministic validation and exact diff review before acceptance. Authoring and evaluator model routes remain separately visible.
