---
version: alpha
name: CodeWiki Quiet Systems Atlas
description: A warm, precise project interface for portfolio Work, Product knowledge, System topology, and Design guidance, grounded in canonical sources and calibrated evidence.
colors:
  canvas: "#F5F1E8"
  surface: "#FFFDF8"
  surface-muted: "#EEE8DB"
  surface-raised: "#FFFFFF"
  ink: "#252622"
  ink-secondary: "#62635E"
  ink-tertiary: "#666761"
  line: "#D8D2C4"
  line-strong: "#AAA597"
  primary: "#315F62"
  primary-hover: "#264D50"
  primary-soft: "#D7E6E2"
  on-primary: "#FFFFFF"
  product: "#F3C7A9"
  product-strong: "#783F24"
  system: "#BFD8E8"
  system-strong: "#28536A"
  changes: "#E9A294"
  changes-strong: "#663028"
  sage: "#C9D8B6"
  butter: "#ECDD9C"
  lilac: "#D7C7DD"
  success: "#D7E5CD"
  success-strong: "#315B32"
  warning: "#F4E6B5"
  warning-strong: "#6A4D08"
  error: "#F2C7C1"
  error-strong: "#7A2D28"
typography:
  page-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.025em
  title-lg:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.018em
  title-md:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.012em
  body-lg:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: -0.01em
  body-md:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.006em
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.004em
  metadata:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0em
rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 18px
  xl: 24px
  full: 9999px
spacing:
  hairline: 1px
  micro: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 40px
  section: 32px
  page-gutter: 24px
  content-max: 1600px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
  navigation-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 8px
  content-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 24px
  inspector:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  destination-product:
    backgroundColor: "{colors.product}"
    textColor: "{colors.product-strong}"
    rounded: "{rounded.full}"
  destination-system:
    backgroundColor: "{colors.system}"
    textColor: "{colors.system-strong}"
    rounded: "{rounded.full}"
  destination-design:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
  destination-work:
    backgroundColor: "{colors.changes}"
    textColor: "{colors.changes-strong}"
    rounded: "{rounded.full}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.success-strong}"
    rounded: "{rounded.full}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-strong}"
    rounded: "{rounded.full}"
  status-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.error-strong}"
    rounded: "{rounded.full}"
  popover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  secondary-text:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-md}"
  tertiary-text:
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.metadata}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.line-strong}"
    height: 1px
  selected-surface:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  diagram-sage:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  diagram-butter:
    backgroundColor: "{colors.butter}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  diagram-lilac:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
type: Concept
title: CodeWiki Design System
tags:
  - codewiki
  - product
  - design-system
  - visual-identity
  - dashboard
timestamp: 2026-07-20T00:00:00Z
---
# Design System: CodeWiki

## Overview

CodeWiki should feel like a quiet systems atlas from 1968 rebuilt as a precise contemporary instrument. Warm paper, graphite typography, hairline structure, and restrained pastel coding make a complex project understandable without making it childish or ornamental. The interface is calm, optimistic, and visibly crafted.

CodeWiki is a project-management application, not a marketing site, terminal transcript, or collection of Change cards. Runtime owns the portfolio work pipeline. The dashboard exposes that runtime through purpose-built Work surfaces and exposes canonical project knowledge through Product, System, and Design surfaces.

The four primary destinations are:

- **Work**, containing Backlog, Planning, and Implementation;
- **Product**, containing Users, Stories, and Dictionary;
- **System**, containing canonical diagram views;
- **Design**, containing Guidelines and UIs.

Work opens by default at Backlog. Change remains a canonical accountable entity and opens as a cross-cutting dossier from any destination. Product, System, Design, Change, Sprint, Work Item, and Assignment vocabulary remains literal; navigation labels never rename repository truth.

The dashboard exists for the person managing software development. It renders canonical Knowledge, Change Traces, WorkState, source/tests, Git, and bounded runtime observations into concise explanations that help that person understand the project, direct work, and intervene only when exact human judgment or reserved authority is required.

## Truth and projection

Product and System Markdown, System diagram YAML, source, tests, Git, Change Traces, configuration, and runtime observations retain separate authority. Dashboard layouts, search indexes, graph positions, session registries, and live activity are disposable projections.

OKF is connective tissue, not a navigation destination. Standard Markdown links establish portable relationships. CodeWiki relationship metadata, diagram edges, source ownership, Planning refs, and evidence refs provide typed semantics where an untyped link is insufficient.

The dashboard may edit canonical Markdown and YAML only through deterministic source patches, exact source digests, rendered diffs, validation, and guarded Change workflows. It never creates a hidden content database or dashboard-only taxonomy.

This document follows Google's open DESIGN.md alpha format. Prose carries design intent; tokens keep repeated decisions coherent. When token and rationale conflict, stop and resolve this document rather than silently choosing one.

## Design principles

CodeWiki borrows durable platform principles rather than imitating platform decoration:

- Purpose before ornament.
- Exact evidence before confidence language.
- Stable spatial context during live updates.
- One obvious primary action per local composition.
- Progressive disclosure for technical proof, never concealment of hard conditions.
- Familiar keyboard, touch, focus, and recovery behavior.
- Motion only when it explains a real state transition.
- Honest unknown, stale, excluded, isolated, and unverified states.
- Maximum safe useful parallelism, not visual celebration of agent count.

Simplicity means focused usefulness, not emptiness. Delight comes from accumulated care in alignment, wording, transitions, and state.

## Colors

The canonical appearance is warm and light. It recalls uncoated paper and faded technical printing while retaining contemporary screen contrast.

- **Canvas (`#F5F1E8`)** is warm paper, never sterile white.
- **Surface (`#FFFDF8`)** and **raised surface (`#FFFFFF`)** establish hierarchy through small tonal steps, not shadows.
- **Ink (`#252622`)** is graphite. Secondary ink remains readable at normal text sizes.
- **Primary (`#315F62`)** is the sole ordinary interaction color for links, selected controls, primary actions, and focus.
- **Work coral (`#E9A294`)** identifies portfolio work and accountable Change impact.
- **Product apricot (`#F3C7A9`)** identifies users, stories, and product responsibility.
- **System powder blue (`#BFD8E8`)** identifies components, flows, data, and technical relationships.
- **Design lilac (`#D7C7DD`)** identifies guidelines and interface specifications.
- **Sage and butter** support diagram grouping and secondary structure; they are not action colors.
- **Success, warning, and error** remain separate semantic pairs and never replace destination identity.

Use approximately 85 percent neutral surfaces and 15 percent chromatic emphasis. Pastels work as fields, bands, node fills, and selected context—not lightweight text. Never rely on color alone; pair it with wording, form, position, or iconography.

Destination color communicates place, not lifecycle. Status, activity, attention, progress, and relationship remain independent signals.

A future dark appearance requires a separately designed and tested palette. Do not mechanically invert these tokens.

## Typography

Use the local system interface stack. No font download or license dependency is introduced.

- **Page title:** 30px/600 for the selected destination, workspace, or entity.
- **Large title:** 24px/600 for selected concepts and major groups.
- **Medium title:** 18px/600 for collections, diagram names, and inspectors.
- **Body:** 15–17px regular with generous leading.
- **Labels:** 13px/600 in sentence case.
- **Metadata:** 12px local monospace only for IDs, digests, commits, paths, timestamps, models, sessions, and code-shaped proof.

Hierarchy comes from size, weight, placement, and space—not extra typefaces. Keep meaningful prose near 60–75 characters per line. Never truncate essential intent, blockers, recovery, or authority merely to preserve compact geometry.

## Global layout

The sticky header has three spatially independent anchors:

1. repository identity at the left;
2. current destination, subpage, search, and contextual filters in the center;
3. project notifications, runtime state, and Settings at the right.

The full sticky block remains opaque so scrolling content disappears cleanly beneath it. No blur-heavy glass.

The visual destination title is a selected-value control listing Work, Product, System, and Design. A destination-specific secondary control selects Backlog/Planning/Implementation, Users/Stories/Dictionary, a System diagram, or Guidelines/UIs. Both controls support pointer, touch, keyboard navigation, typeahead where useful, assistive semantics, and focus return.

Selection replaces the complete workspace context and preserves deep-linkable routes. Search and filters act only on the visible workspace. Each workspace remembers its prior selection and filters without writing canonical truth.

Desktop uses a compact application frame inside a 1600px maximum width. Useful project state begins in the first viewport. Mobile uses the same information architecture in one column, moves secondary filters behind a named Refine control, and preserves at least 44px touch targets.

One icon-only geometric `+` may sit inside the active workspace's top action row when creation exists. Its accessible name and menu are contextual:

- Backlog: New Change;
- Product: New User or New Story;
- System: New Component or New Diagram;
- Design: New Guideline or New UI.

Planning and Implementation do not invent direct creation controls for Planning-owned or runtime-owned entities. Their actions modify intent, priority, constraints, supervision, or runtime lifecycle through guarded capabilities.

## Work

Work is the first destination and uses three purpose-built pages. It is not one grid with filters masquerading as pages.

### Backlog

Backlog answers:

- What was proposed?
- Where did it come from?
- What Product, System, or Design context does it affect?
- Is it duplicate, overlapping, contradictory, or incomplete?
- What exact Decision question remains?
- Which revision and authority support its disposition?

Use an intake/triage composition: a compact proposal list or grouped queue beside one focused detail region on desktop, and a list-to-detail transition on mobile. Rows prioritize title, origin, age/freshness, affected concepts, and current Decision state. They do not show a miniature lifecycle pipeline.

Open hard conditions appear before proven standards. Completed Decision work becomes a receipt attached to the exact Change revision. Rejected, deferred, withdrawn, and superseded proposals remain searchable without competing with active intake.

Human attention appears only for underdetermined meaning, materially different valid outcomes, semantic/risk/authority forks, or reserved destructive/external/publication authority. Routine validation, retry, tests, accessibility, preview, and repair remain autonomous.

### Planning

Planning answers:

- How does the approved portfolio become coherent executable work?
- What can run in parallel now?
- What is blocked by dependency, overlap, capacity, or integration?
- Which Changes lack coverage?
- What changed between Planning epochs?

Default presentation is a bounded planning-horizon graph, not the entire OKF or repository graph. It contains:

- approved Change outcome nodes;
- Sprint clusters;
- Work Item nodes;
- dependency, contribution, conflict, rollback, and integration edges;
- ready, claimed/frozen, held, and completed distinctions.

Selection opens an adjacent or in-place inspector with authoritative inputs, coverage, active quality standards, open hard conditions, exact refs, recovery, and relevant OKF/source neighborhood. Keep graph labels readable at final size. Never solve density by shrinking text below comfortable reading size.

Provide a structured list/table equivalent with identical selection and filtering. Graph position is presentation only. Edge meaning always has text, direction, and non-color encoding.

Current planning epoch may receive one restrained transition when accepted. Quiescent or stale graphs remain static. New approved Changes may appear without replaying the whole canvas.

### Implementation

Implementation answers:

- Which Work Items are ready, running, held, integrating, or accepted?
- How many independent Assignments are executing?
- What is each worker changing and why?
- Which outputs remain isolated?
- What exact verification and evidence exist?
- What recovery or route-back owns failure?

Use execution lanes grouped by Sprint or integration target. Each Work Item owns one row or lane with Assignment attempts nested beneath it. Make queued, ready, claimed, running, waiting, blocked, integrating, accepted, failed, cancelled, and superseded states literal.

Worker detail progressively discloses session, model, source base, worktree/container, claim, bounded activity, checks, output refs, and usage. Raw prompts, private reasoning, credentials, unbounded logs, and full source content never appear.

Integrated product state must be visually distinct from isolated worker output. Commit and restore proof appear only after exact integration. Publication remains separate guarded authority and never follows automatically from Commit.

Parallelism is visible through concurrent lanes, not animated agent avatars, vanity counts, or perpetual pulses. Held work states the exact dependency, path conflict, capacity, supervision, policy, or integration reason.

## Product

Product has Users, Stories, and Dictionary workspaces.

Users uses a persistent user rail on desktop and a labeled selector on mobile. Selected User content presents canonical purpose, needs, Stories, UIs, System realization, and active Changes. Use explicit relationships only. Unassociated concepts appear in an honest maintenance state.

Stories uses a browsable story collection organized around user promise, acceptance signals, audience, related UIs, System realization, and active Changes. Story detail expands inside the same workspace and restores prior scroll and focus on Back.

Dictionary renders `.codewiki/kb/lexicon.md` as the canonical vocabulary reference. It provides exact-term search, alphabetical navigation, stable anchors, deprecated-term redirects, technical backing, and related terms without copying definitions into dashboard state. Runtime inspectors and contextual help link unfamiliar qualified terms such as Assignment packet or Worker receipt to their exact entry. Unknown terms remain undefined rather than receiving model-generated authority.

Product Markdown remains source truth. Dashboard editing proposes deterministic canonical patches; it does not duplicate descriptions, infer audience from prose, or create a second glossary.

## System

System is the user-facing label for canonical System Knowledge. A local selector switches among available YAML diagrams such as Architecture, Context, Components, Key Flow, Data Model, and Lifecycle.

Each diagram uses topology-specific composition:

- Architecture uses layers;
- Context uses concentric relationships;
- Components uses clustered dependencies;
- Key Flow uses ordered sequence or swimlanes;
- Data Model uses entities and typed relations;
- Lifecycle uses states and transitions.

Hover or pointer proximity may preview a node, but click, touch, keyboard activation, and structured navigation expose the same information. Node detail loads current canonical explanation, Product responsibilities, connected System elements, source/test ownership, and active Work.

Diagram editing manipulates canonical nodes and edges through a schema-aware patch and diff. Layout coordinates may be presentation metadata; semantic edges and labels remain canonical YAML.

## Design

Design has Guidelines and UIs workspaces.

Guidelines renders this document as an inspectable design system: principles, tokens, typography, components, motion, accessibility, and durable references. Token editing shows affected usages and proposes an exact source patch.

UIs renders canonical UI concepts with responsibility, Users, Stories, System realization, routes, viewports, preview targets, accessibility, evidence, and active Changes. Unknown coverage remains unknown. Captured screenshots prove an exact experience target and revision only; they do not prove semantic approval or user outcomes.

Design is a presentation lens over canonical Product design files. It does not require moving those files into a new folder or inventing another Knowledge root.

## Change dossier

Change detail is available from every relevant surface. It is a cross-cutting accountability view, not a private project pipeline.

Information order:

1. Back to the exact originating workspace, preserving scroll and focus;
2. title and one literal lifecycle/status label;
3. plain-language intended delta and current approved revision;
4. origin, Decision authority, and exact approval or terminal receipt;
5. Product, System, and Design impact;
6. Sprint and Work Item coverage;
7. Assignment, integration, verification, and accepted realization evidence;
8. Git commit/tree/restore proof, outcome disposition, and publication state;
9. factual route-back, invalidation, supersession, and iteration history.

Do not render Approval, Planning, Implementation, and Commit as four progress bars. Selection is not progress. Change status does not summarize project runtime. A Change may participate in several Sprints and shared Work Items, and its dossier must preserve that many-to-many reality.

Use a focused impact bridge when helpful: Product/Design concepts on one side, Change at center, and affected System elements on the other. Lines represent explicit typed relationships. Missing links never prove absence of impact.

## Assurance and evidence

Proof-first assurance remains a shared inspector grammar, applied to the claim owner:

- Backlog attaches Decision assurance to the exact Change revision;
- Planning attaches assurance to the Planning epoch, Sprint, Work Item, dependency, or coverage claim;
- Implementation attaches assurance to an Assignment result, integration result, accepted realization, or Git proof.

Every assurance view explains:

- what must be established;
- authoritative input and authority boundary;
- current claimed result;
- open hard conditions before completed proof;
- met, failed, running, masked, and inapplicable standards;
- evidence bound to the exact revision, digest, candidate, tree, or commit;
- exit, recovery, invalidation, and next safe action;
- factual history under progressive disclosure.

No generic trust score, model-confidence percentage, private reasoning, or decorative activity. One unmet hard condition remains prominent even when most standards pass. Missing, stale, unexecuted, excluded, superseded, and invalidated evidence is explicit.

On mobile, show question, result, and open hard conditions first. Collapse detailed standards, evidence, and history by default while preserving exact counts and accessible expansion. Never compress proof into an unexplained badge merely to reduce height.

## Source-backed editing

Editors use one guarded flow:

```text
user edit intent
-> typed Markdown/YAML operation
-> deterministic patch against expected digest
-> rendered diff and affected relationships
-> OKF or diagram-schema validation
-> Change proposal or revision
-> exact Decision authority
-> guarded application
-> Git and trace evidence
```

Preserve unknown OKF frontmatter and unsupported Markdown during round trips. Provide source mode when useful, but never bypass digest, diff, validation, Change, or authority boundaries.

Save language must be literal. `Propose change`, `Approve exact revision`, and `Apply accepted patch` describe different actions. Do not label proposal creation as Save when canonical source has not changed.

## Components and controls

Primary buttons use deep teal with white text. Prefer one primary action per local composition. Secondary controls use neutral surfaces and graphite text. Destructive actions use explicit error treatment and exact verbs.

All custom selected-value controls share geometry, chevron, keyboard, touch, typeahead where applicable, assistive semantics, popup state, and focus return. Native semantic controls remain preferable when they satisfy the contract.

Icon-only controls require familiar symbols, accessible names, and tooltips. Information controls never hide required state, errors, evidence, or safe-choice context. Entire rows or nodes may be detail targets when nested controls preserve exact activation and semantics.

Project-wide notifications sit beside Settings. Badge count reflects unread intervention questions, not routine activity. New eligibility may receive one brief arrival cue; no perpetual pulse.

## Runtime state and activity

Runtime activity uses concise user-facing language such as “Comparing two overlapping proposals,” “Rebuilding the execution graph,” “Running two independent checkout Work Items,” or “Holding integration until the shared schema change is accepted.”

Live activity is a bounded projection over scheduler jobs, semantic-session phase, Assignment, worker phase, integration, progress, and freshness. Meaningful starts, terminal results, blockers, and accepted semantic facts may enter Change Traces. Noisy heartbeats stay outside semantic truth.

Always distinguish:

- durable status;
- current activity;
- human attention;
- objective progress with a real denominator;
- relationships;
- evidence and proof.

If no current observation exists, say so. Never turn `nextAction` into invented live telemetry or animate quiescent/stale work.

## Elevation and shape

Depth comes from tone, overlap, hairlines, and content scale. Main content remains flat. Shadows belong only to temporary menus, popovers, and modal review surfaces.

Use:

- 24px corners for large canvases;
- 18px for inspectors and substantial groups;
- 12px for controls and compact groups;
- 8px for technical evidence and code-shaped fields;
- full pills only for short statuses, destination selection, filters, and compact actions.

Do not place every sentence in a rounded rectangle. Lists, lanes, diagrams, tables, and editorial text often need no container.

## Motion

Motion explains continuity, hierarchy, and real runtime transitions. It never advertises itself.

- Pressed feedback begins immediately and settles around 100–140ms.
- Destination and local content transitions last around 180–240ms.
- Entity expansion may use 280–340ms when it explains spatial origin.
- Back follows the reverse path and restores focus.
- Keep readable text at final size; never scale text snapshots.
- Use scoped View Transitions with complete nonanimated fallback.
- Animate transform and opacity rather than routine layout properties.
- New scheduler jobs, standard completion, route-back, integration, or terminal state may animate once.
- Live refresh never replays page entrance choreography.
- No perpetual decoration, scroll hijacking, parallax, bouncing, or simulated “alive” activity.

Transitions are interruptible. A second action, Back, or destination change settles or replaces active motion rather than queueing it.

`prefers-reduced-motion: reduce` applies to elements and `::before`/`::after` pseudo-elements. It removes spatial transforms and uses immediate updates or restrained dissolves without hiding state changes.

## Accessibility

Accessibility shapes the first design:

- meet WCAG AA contrast for normal text and essential controls;
- preserve visible focus and logical keyboard order;
- support zoom and larger text by reducing columns before truncating meaning;
- pair every color signal with wording or form;
- provide nonvisual structured equivalents for graphs and diagrams;
- keep touch targets at least 44px where practical;
- announce live changes without stealing focus;
- keep recovery beside failure explanations;
- preserve selection, scroll, and focus through refresh and Back;
- test desktop, split-screen, tablet, narrow mobile, keyboard-only use, screen readers, reduced motion, and increased contrast.

## Visual references

Principle references:

- [Apple Human Interface Guidelines: Design Principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)
- [Apple Human Interface Guidelines: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Microsoft Human-AI Interaction Guideline 11](https://www.microsoft.com/en-us/haxtoolkit/guideline/make-clear-why-the-system-did-what-it-did/)
- [Google People + AI Guidebook: Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/)
- [SEI: Assurance Cases Overview](https://www.sei.cmu.edu/library/assurance-cases-overview/)
- [NIST AI RMF: AI Risks and Trustworthiness](https://airc.nist.gov/AI_RMF_Knowledge_Base/AI_RMF/Foundational_Information/3-sec-characteristics)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [MDN: Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Google DESIGN.md specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)

Canonical repository references:

- `src/dashboard/assets/codewiki-logo.png` — existing mark;
- `.codewiki/kb/product/overview.md` — Product direction;
- `.codewiki/kb/product/stories/**`, `uis/**`, and `users/**` — Product concepts;
- `.codewiki/kb/system/diagrams/**` — canonical System diagrams;
- `.codewiki/kb/product/DESIGN.md` — visual and interaction authority.

Temporary screenshots and prototypes are review evidence, not lasting product truth.

## Do's and don'ts

- Do make Work, Product, System, and Design the four primary destinations, in that order.
- Do open Work at Backlog by default.
- Do give Backlog, Planning, and Implementation different information architectures.
- Do make runtime own portfolio scheduling and expose exact held reasons.
- Do use Change detail as a dossier rather than a pipeline.
- Do render and edit canonical Markdown/YAML through guarded source patches.
- Do show integrated state separately from isolated worker output.
- Do keep open hard conditions ahead of completed proof.
- Do let source-backed content, graphs, diagrams, and execution lanes dominate chrome.
- Do preserve exact technical proof behind calm progressive disclosure.
- Do visually approve desktop and mobile before production implementation.
- Don't use a four-stage Change progress rail.
- Don't present every Change, Sprint, Work Item, or concept through one generic card component.
- Don't turn the full OKF corpus into one global graph.
- Don't make session count or animation stand in for progress.
- Don't let the dashboard or a Pi conversation own runtime truth or lifetime.
- Don't expose OKF as a separate destination.
- Don't infer relationships, authority, completion, or trust from prose or polish.
- Don't use marketing heroes, oversized slogans, chapter spacing, stock imagery, glassmorphism, neon glow, or ornamental motion.
