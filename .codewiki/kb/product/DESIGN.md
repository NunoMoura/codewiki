---
version: alpha
name: CodeWiki
colors:
  canvas: "#F6F3ED"
  surface: "#FFFCF7"
  ink: "#1D2521"
  muted: "#66706A"
  line: "#D7D2C7"
  forest: "#1F5A46"
  forest-hover: "#174534"
  amber: "#A55A13"
  red: "#A83A32"
  blue: "#245E99"
typography:
  display:
    fontFamily: "Iowan Old Style, Georgia, serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 22px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  page: 56px
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
components:
  primary-action:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  evidence-status:
    typography: "{typography.label}"
    rounded: "{rounded.full}"
type: Design System
title: CodeWiki Design System
description: Visual and interaction rules for truthful, calm, inspectable project coordination surfaces.
status: stable
tags: [product, design]
---
# CodeWiki Design System

## Overview

CodeWiki should feel calm, exact, and inspectable. It is the standalone software-evolution Backend behind a project, not a skin around one Agent product. It helps people understand project state and authority without disguising uncertainty as confidence. Warm paper surfaces, deep ink, restrained forest actions, and compact technical metadata make durable work feel deliberate rather than theatrical.

Git artifact history, CodeWiki semantic state, and Agent execution evidence remain visibly distinct. Visual design presents bounded project facts. It never invents lifecycle state, confidence, completion, activity, approval, custody, or causality. System components own those facts; this document owns how visible facts are arranged and distinguished.

## Colors

Canvas is warm and quiet. Surface separates active material without heavy cards. Ink carries durable reading. Forest marks permitted forward action, amber marks attention, red marks failure or danger, and blue marks reference or neutral inspection. Color never carries status alone; text, iconography, and accessible labels accompany it.

Use one primary action per visible task area. Do not use decorative gradients, glass effects, or severity colors as generic ornament.

## Typography

Display type introduces destinations and major dossier titles. Sans-serif body text supports dense operational reading. Monospace labels identify IDs, timestamps, digests, source paths, exact revisions, and Check names.

Keep reading measures broad enough for prose and narrow enough for comparison. Do not render technical identifiers as body prose or use tiny text to hide required context.

## Layout

Desktop uses a stable destination header, context rail, and single primary reading/work surface. Small screens replace persistent rails with labeled controls while retaining current destination, selected Change, and return path.

Use spacing scale consistently. Group facts by semantic owner: intent, current state, Candidate, Evidence, Checks, Gate, Stage Loop, and effect. A page may disclose details progressively, but failures, stopped execution, empty-stage warnings, and required Evidence must remain visible before expansion.

## Elevation & Depth

Depth comes from surface tone, border, and spacing, not heavy shadows. Modal layers are reserved for focused confirmation, source inspection, and authority actions. A floating control must not obscure current state, status, or required Evidence.

## Shapes

Use modest rounded corners for controls and bounded panels. Status chips use full rounding. Keep borders thin and quiet. Avoid mixing strongly rounded playful controls with sharp dense data surfaces.

## Iconography

Use a small, consistent outline icon set for navigation, status support, disclosure, and source actions. Every icon has a visible label or accessible name. Icons reinforce text; they never carry authority, severity, or lifecycle state alone.

## Components

**Destination navigation** identifies current Work, Product, System, or Design context and preserves keyboard focus on navigation.

**Change selector** shows exact Change identity, proposed accepted-to-intended transition, revision, current Stage Loop, Gate state, and unresolved attention. It never suggests a Change is selected for Decision unless authenticated selection completed.

**Stage workspace** organizes Decision, Planning, Implementation, and Review as fixed derived views. Each view shows exact subject, current WorkState, producer route and custody, context snapshot, Pack Skills, Checks, attempts, Gate feedback, pending authority, and permitted fixed transition. It never exposes a configurable workflow graph or second activation manifest.

**Backend status** distinguishes CodeWiki Server, Project Runtime, Agent Run Supervisor, Agent Runner, Check Runner, and Workbench health. It shows exact DSH and first-party Backend Plugin closure, upgrade qualification, active Run identities, cancellation, and recovery without presenting Runner availability as project acceptance.

**State and Evidence rows** show status, authority basis, timestamp, exact identity, and missing or stale conditions. They link to inspectable detail rather than flattening complex Results into one score.

**Execution custody** distinguishes Backend Agent Runs, Delegated Agent Runs, and External Agent Client activity. Backend-owned views may show complete DSH version, prompt, Skill, tool, model-route, context, query, budget, compaction, raw-session, usage, output, and isolation receipts. Delegated views show exact task, adapter, configuration policy, process lifecycle, Workbench base and result, final output, and declared unknown child internals. External-client views show only authenticated CodeWiki calls and admitted artifacts. No partial receipt appears as complete custody.

**Context and history inspection** starts from compact stage context, then exposes bounded source-linked queries, coverage, unknowns, truncation, staleness, and retained exact model-visible ledger ranges. Compaction summaries remain visibly non-authoritative projections. Optional programmatic query runs show exact snapshot, code digest, limits, canonical JSON output, and receipt without presenting an opaque persistent heap.

**Action controls** separate safe reads from protected actions. Disabled actions explain the unmet guard. Decision Gate pass and semantic confirmation are separate visible states. Confirmation names exact Candidate and Gate digests, current WorkState, accountable actor, and consequence; any edit invalidates confirmation eligibility until a fresh Gate passes.

**Source and diagram inspectors** show canonical path or diagram reference, provenance, coverage, truncation, and staleness. They open the owning concept or exact file rather than a copied summary.

**Check Pack navigation** groups project files by Decision, Planning, Implementation, and Review, then by `default` or named Pack. Users can inspect, create, rename, edit, and delete any Pack or Check. Each Pack separately presents its optional standard Agent Skill and its Gate Checks so guidance never appears to be an acceptance decision. Empty stages and Packs remain valid but display persistent Check-based warnings.

**Model Check editing** uses one deterministic form for requirement, pass, fail, feedback, bounded inputs, binary or quantitative measurement, threshold, model profile, and budget. Saving writes the documented `check.json` and `CHECK.md` files. CodeWiki never invokes a model to author or alter them.

**Pack Skill editing** presents standard Skill name, description, `SKILL.md`, scripts, references, assets, other bounded resources, and declared tool guidance. It shows effective stage composition in stable Pack order, exact content digest, Backend Agent and delegate-route compatibility, and capabilities unavailable under current producer or Implementation Worker policy. Saving changes project files only after an explicit authenticated action; Skill scripts never run in the browser or during package installation.

**Code Check editing** uses the same common fields and accepts one self-contained `CHECK.mjs` upload. Syntax, schema, bounds, and sandbox preview errors remain visible before save; browser code never runs directly.

**Model route selection** distinguishes stage-producer, Implementation Worker, and configured Check model routes, names provider and credential source without exposing secrets, and explains unavailable capability, independence, budget, or billing boundaries before execution.

**Developer Check mode** exposes the same tracked `check.json`, `CHECK.md`, and `CHECK.mjs` files used by regular forms, plus schemas, exact input coverage, horizontal and vertical OKF/repository/Alignment query facts, bundle provenance, sandbox diagnostics, content digests, cache identity, preview runs, fixture results, and historical replay. It distinguishes reusable Probes and composed Checks from the single registered top-level Result boundary and grants visibility rather than additional authority.

**Check Pack marketplace** follows npm package-gallery ergonomics while also accepting exact Git and local package sources. Search and inspection identify source, publisher where applicable, resolved version or revision, stages, optional Pack Skills, Code and Model Checks, requested inputs, integrity, separate Skill and Check digests, and local modifications. Backend Plugins, DSH or Cordis plugins, product prompts, themes, settings, and lifecycle hooks are not Pack resources. Installation, update, and removal are explicit User actions; update never hides a local diff.

**Responsive behavior** preserves hierarchy and available actions across pointer, keyboard, touch, and assistive technology. Reduced-motion preference removes nonessential transition and animation.

## Do's and Don'ts

- Do show what CodeWiki knows, which Checks passed or failed, why a Gate stopped, and when no Checks are configured.
- Do bind approvals and effects to exact visible subjects.
- Do preserve readable contrast and keyboard focus.
- Do use screenshots and previews as Candidate-bound Evidence, not semantic approval.
- Do identify stage-producer, Implementation Worker, and Check model routes separately.
- Do render one stable failure code and one feedback contract per failed Check while retaining its bounded factual details and locations.
- Don't display a generic trust score, hidden reasoning, or fabricated certainty.
- Don't invoke a model, widen Check input, or substitute a producer or Implementation Worker route for a Check route without an explicit visible choice.
- Don't present a compaction summary, delegated receipt, External Agent Client receipt, or Agent-generated proposal as canonical truth or complete custody.
- Don't make background work appear active without an observed state transition.
- Don't duplicate System topology or runtime policy in design guidance.
- Don't let visual polish hide missing Evidence, stale state, or unavailable capability.

## Visual References

Visual references are illustrative inputs, not canonical state. Keep accepted references project-local, identify their source and intended UI concern, and validate resulting surfaces against these tokens, accessibility requirements, and exact runtime facts.
