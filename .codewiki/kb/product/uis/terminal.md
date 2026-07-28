---
type: Concept
title: Project Dashboard and Optional Pi Client
description: Standalone CLI and dashboard are primary Project Runtime clients; optional thin Pi client supports conversational intent, authority, explanation, and supervision.
tags:
  - codewiki
  - product
  - ui
  - dashboard
  - pi
  - observability
  - accessibility
timestamp: 2026-06-30T00:00:00Z
codewiki_component: dashboard
codewiki_components:
  - dashboard
codewiki_source_patterns:
  - src/dashboard/**
codewiki_test_patterns:
  - tests/dashboard/**
  - tests/runtime/pi-extension.test.mjs
  - tests/runtime/pi-rpc-smoke.mjs
codewiki_role: project_management_ui
codewiki_source_map:
  - id: dashboard
    source_patterns:
      - src/dashboard/**
    test_patterns:
      - tests/dashboard/**
      - tests/runtime/pi-extension.test.mjs
      - tests/runtime/pi-rpc-smoke.mjs
    role: project_management_ui
---
# Project Dashboard and Optional Pi Client

Standalone CLI and dashboard are primary Project Runtime clients. Dashboard is primary visual project-management workspace. Optional Pi client remains natural place to discuss intent, submit Changes, answer exact authority questions, and inspect or steer work. No client owns canonical truth or Runtime lifetime.

Project Runtime owns intake, WorkState, scheduling, semantic-session creation, worker lifecycle, Integration, guarded writes/effects, and live projections. CLI, several Pi sessions, dashboard, and future bounded clients may connect concurrently.

## Primary navigation

The dashboard has four primary destinations:

- **Work**
  - Backlog
  - Planning
  - Implementation
- **Product**
  - Users
  - Stories
  - Dictionary
- **System**
  - canonical diagram selector
- **Design**
  - Guidelines
  - UIs

Work opens by default at Backlog. Every route is deep-linkable. Search, filters, creation, and editing follow the active destination rather than behaving as one global generic control set.

## Work / Backlog

Backlog accepts proposals from authenticated users, agents, and future bounded integrations while other work continues. New proposals become persisted pending Changes with source attribution and idempotency protection. Submission never grants approval or execution authority.

The Backlog workspace emphasizes:

- proposal title, outcome, origin, and current revision;
- related Product, System, and Design concepts;
- possible duplicate, overlap, or conflict;
- missing clarification and exact Decision question;
- active Decision work and freshness;
- approval, defer, rejection, withdrawal, or supersession receipt;
- human attention only when meaning, risk, or reserved authority is genuinely underdetermined.

The primary composition is an intake/triage list with one focused detail region, not a grid of lifecycle cards. Approval assurance remains attached to the exact Change revision and evidence that support it.

## Work / Planning

Planning shows one bounded project execution graph over approved Changes. It does not show one private plan per Change.

The default graph includes:

- approved Change outcome nodes;
- Sprint clusters;
- owned and contributing Work Items;
- dependency, conflict, contribution, rollback, and integration edges;
- current ready parallel frontier;
- claimed or frozen Work Items;
- held Work Items with exact reason;
- uncovered, deferred, or route-back Changes;
- current Planning epoch and superseded history.

Selection opens an inspector with authoritative inputs, active Checks and `activatedBy` reasons, failed/indeterminate Results, coverage, evidence, recovery, and exact source/OKF impact. The full repository knowledge graph is not drawn by default. Only the current planning horizon and selected context neighborhood appear.

## Work / Implementation

Implementation is an execution cockpit organized around Sprints, Work Items, Assignments, workers, and integration targets.

It shows:

- queued, ready, claimed, running, waiting, blocked, integrating, accepted, and terminal work;
- concurrent worker lanes and current bounded activity;
- worker session, model, worktree/container, source base, claim, and freshness;
- path or integration conflicts that hold work;
- isolated candidate output versus integrated product state;
- exact Checks, Results, preview evidence, content proof, and unmet acceptance criteria;
- Implementation acceptance, remediation, or route-back;
- commit and restore proof after integration;
- Integration, merge, push, publication, release, and outcome as distinct guarded/observed boundaries.

Live state is a disposable runtime projection. The UI never invents motion from a next-action hint or writes heartbeat records merely to appear active.

## Change dossier

A Change is accessible from every relevant Product, System, Design, Planning, and Implementation surface. Its detail is an accountable dossier, not a pipeline.

It presents:

1. current intent and immutable approved revision;
2. origin, authority, and Decision receipt;
3. Product, System, and Design impact;
4. Sprint and Work Item coverage;
5. Assignment and integrated realization evidence;
6. Git proof, restore, outcome disposition, and publication state;
7. factual route-back and supersession history.

The dossier may summarize current runtime activity, but it does not own Loop controls, four progress bars, or a duplicated Runtime scheduler.

## Product, System, and Design

Product renders Users, Stories, and Dictionary from canonical Markdown. User selection shows explicit Stories, UIs, System realization, and active Changes. Missing audience or coverage remains visibly unknown rather than inferred.

Dictionary renders `.codewiki/kb/lexicon.md` directly with exact-term search, alphabetical navigation, stable anchors, aliases, deprecated-term replacement guidance, and related terms. Contextual explanations in Work inspectors and Change dossiers link to exact Dictionary entries. Short excerpts may aid orientation, but dashboard state never becomes a second vocabulary authority.

System renders each canonical YAML diagram using a topology-specific composition. Diagram node detail loads linked System Markdown, Product responsibility, source ownership, tests, and active work.

Design renders `.codewiki/kb/product/DESIGN.md` and canonical UI concepts. Guidelines expose tokens and rules. UIs expose responsibility, stories, users, system realization, preview targets, evidence, and active Changes.

## Source-backed editing

Product, System, and Design editing modifies canonical Markdown/YAML through guarded typed operations:

```text
edit intent
-> deterministic patch against expected digest
-> rendered diff
-> OKF or diagram-schema validation
-> Change proposal and Decision
-> guarded application
-> Git and trace evidence
```

The editor preserves unknown OKF frontmatter and unsupported Markdown. Raw-source mode may be offered to advanced users, but it uses the same digest, validation, diff, and Change workflow. No browser-only metadata or hidden content database is created.

## Header and global controls

Global chrome contains repository identity, current destination and subpage, contextual search/filters, project-wide notifications, runtime state, and Settings. Contextual creation lives inside the active workspace.

Notifications contain only genuine project-wide intervention questions. Routine test failure, retry, accessibility checking, preview review, and Planning-owned repair remain autonomous.

Settings exposes bounded capacity, model routing, isolation, automation, budgets, preview profiles, and effective supervision. It cannot raise authority beyond active policy or accept raw arbitrary execution configuration.

## Pi client

Optional Pi extension connects active conversation to existing Project Runtime. It may:

- submit or revise Change intent;
- provide explicit authority bound to exact revisions;
- display compact state and notifications;
- request dashboard open/reopen;
- register supervision presence;
- explain project context through guarded core APIs.

The extension does not own the dashboard server, scheduler, Planning session, or worker pool. Dashboard actions do not inject arbitrary prompts into whichever Pi conversation happens to be active.

Runtime creates bounded read-only Decision, Planning, Implementation candidate, and Model Check sessions through embedded published Pi SDK adapter. Implementation workers run through isolated process or container adapters. Main user conversations remain independent.

## Local-private host

The project service binds to loopback or an equivalent private local socket. Endpoint metadata and capabilities remain user-only. Browser mutations require same-origin authority, exact freshness guards, bounded schemas, idempotency, audit receipts, and secret redaction.

Closing one browser tab or Pi session does not mutate workflow truth. Under supervised policy, losing all approved supervisors prevents new execution starts while preserving intake, dashboard state, and deterministic recovery. Unattended continuation requires separate explicit policy.

## Live preview

Planning binds UI-affecting work to canonical UI targets and approved project-native preview profiles. Runtime owns one loopback development server per profile/integration root and isolated browser sessions per requested target.

Dashboard shows target identity, exact integration state, contributing Changes and Work Items, readiness, browser capability, failures, bounded logs, and target-specific Open/Capture controls. Capture proves experience realization for the exact revision and viewport; it does not approve semantics or business outcomes.

## Accessibility and trust

All custom navigation, listboxes, graph nodes, tabs, inspectors, and dialogs support keyboard, touch, focus return, zoom, screen readers, and reduced motion. Graph information has a nonvisual structured equivalent.

Trust remains calibrated. UI exposes authoritative basis, exact candidate, active Checks and activation reasons, failed/indeterminate/passing Results, Report status, separate Runtime route, missing/stale evidence, exclusions, authority, recovery, and exact proof. It never presents a generic trust score, private reasoning, unexplained confidence percentage, or process theater.

## Success signals

- Backlog accepts new proposals while Planning and workers continue.
- Planning reveals one coherent cross-Change graph and ready parallel frontier.
- Implementation clearly separates queued, isolated, integrated, accepted, and published state.
- Several Pi clients and dashboard views share one project runtime without competing owners.
- Canonical Product/System/Design files are rendered and edited without duplicate state.
- Change dossiers preserve accountability without recreating the runtime pipeline.
- Desktop and mobile remain calm, legible, and complete under real evidence density.
- No renderer, preview, browser observation, generated graph, or session becomes source of truth.
