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
    rationale: Clients provide deterministic Check configuration, review, and explicit assisted authoring.
---
# Clients

A Client is a software endpoint that speaks the CodeWiki Client-Server Protocol. A User Interface is the human-facing surface implemented by a Client. The browser App, deterministic CLI, and optional Pi TUI are first-party Clients with User Interfaces. Headless automation is a Client without a User Interface. Claude Code and Codex connect as Clients through MCP and become Workers only while executing an accepted Assignment. Slack, GitHub, WhatsApp, and optional OpenClaw connectors enter through Server channel adapters.

Each adapter declares the commands, queries, events, attachments, confirmations, and redaction classes it can represent. Client kind and Client instance describe only software and paired installation or process; they are never the accountable actor. The same actor may use App, CLI, Pi, MCP, or channel Clients without changing identity. An Agent or service Client requires explicit delegation when acting for a user and otherwise acts only as its own limited service actor. Effective capability is the intersection of adapter declaration, actor Authority Grant, explicit delegation where applicable, project policy, and current Runtime guards.

Clients render persisted Runtime truth and never infer readiness, provenance, activity, causality, completion, impact, next action, or authority. Browser and channel Clients call neither models nor Git directly. High-authority scope, enforcement, Integration, publication, and deployment actions require a User Interface capable of exact digest-bound confirmation, normally the App or CLI. Submitting Change Intake Material never accepts a Change or grants protected authority.

Optional Pi integration exposes bounded reads and explicit user commands. It does not register Decision, Planning, or Implementation Candidate tools, dynamically activate Loop tools, or schedule semantic work or Workers from ambient chat, tool-result, startup, or resume events. Exact `/wiki-select` admission may start one authenticated Decision attempt through Runtime; managed model execution remains separately isolated behind Execution Ports.

Check forms and developer mode edit the same tracked Pack files. Assisted authoring is an explicit Client request that Runtime routes to Managed Execution; the returned proposal receives deterministic validation and exact diff review before acceptance. Authoring and evaluator model routes remain separately visible.
