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

CodeWiki should feel calm, exact, and inspectable. It helps people understand project state and authority without disguising uncertainty as confidence. Warm paper surfaces, deep ink, restrained forest actions, and compact technical metadata make durable work feel deliberate rather than theatrical.

Visual design presents bounded project facts. It never invents lifecycle state, confidence, completion, activity, approval, or causality. System components own those facts; this document owns how visible facts are arranged and distinguished.

## Colors

Canvas is warm and quiet. Surface separates active material without heavy cards. Ink carries durable reading. Forest marks permitted forward action, amber marks attention, red marks failure or danger, and blue marks reference or neutral inspection. Color never carries status alone; text, iconography, and accessible labels accompany it.

Use one primary action per visible task area. Do not use decorative gradients, glass effects, or severity colors as generic ornament.

## Typography

Display type introduces destinations and major dossier titles. Sans-serif body text supports dense operational reading. Monospace labels identify IDs, timestamps, digests, source paths, exact revisions, and Check names.

Keep reading measures broad enough for prose and narrow enough for comparison. Do not render technical identifiers as body prose or use tiny text to hide required context.

## Layout

Desktop uses a stable destination header, context rail, and single primary reading/work surface. Small screens replace persistent rails with labeled controls while retaining current destination, selected Change, and return path.

Use spacing scale consistently. Group facts by semantic owner: intent, current state, candidate, Evidence, Checks, route, and effect. A page may disclose details progressively, but required uncertainty and blocking conditions must remain visible before expansion.

## Elevation & Depth

Depth comes from surface tone, border, and spacing, not heavy shadows. Modal layers are reserved for focused confirmation, source inspection, and authority actions. A floating control must not obscure current state, status, or required Evidence.

## Shapes

Use modest rounded corners for controls and bounded panels. Status chips use full rounding. Keep borders thin and quiet. Avoid mixing strongly rounded playful controls with sharp dense data surfaces.

## Iconography

Use a small, consistent outline icon set for navigation, status support, disclosure, and source actions. Every icon has a visible label or accessible name. Icons reinforce text; they never carry authority, severity, or lifecycle state alone.

## Components

**Destination navigation** identifies current Work, Product, System, or Design context and preserves keyboard focus on navigation.

**Change selector** shows exact Change identity, revision, current route, and unresolved attention. It never suggests a Change is selected for Decision unless authenticated selection completed.

**State and Evidence rows** show status, authority basis, timestamp, exact identity, and missing or stale conditions. They link to inspectable detail rather than flattening complex Results into one score.

**Action controls** separate safe reads from protected actions. Disabled actions explain the unmet guard. Confirmation states name exact subject and consequence.

**Source and diagram inspectors** show canonical path or diagram reference, provenance, coverage, truncation, and staleness. They open the owning concept or exact file rather than a copied summary.

**Check authoring** uses deterministic fields for requirement, pass, fail, indeterminate, feedback, Development stage, scope, inputs, model route, and enforcement. An explicit assisted action invokes the active Harness model through the Check Creator skill; it never hides a model call or silently promotes enforcement.

**Model route selection** distinguishes the active authoring or repair model from the configured Check evaluator, names adapter and credential source without exposing secrets, and explains unavailable capabilities or billing boundaries before confirmation.

**Developer Check mode** exposes the same tracked `CHECK.*` and optional sparse configuration used by regular forms, plus schemas, resolved configuration, Candidate input coverage, sandbox diagnostics, digests, shadow runs, and historical replay. It grants visibility rather than additional authority.

**Responsive behavior** preserves hierarchy and available actions across pointer, keyboard, touch, and assistive technology. Reduced-motion preference removes nonessential transition and animation.

## Do's and Don'ts

- Do show what CodeWiki knows, what it does not know, and why a route is blocked.
- Do bind approvals and effects to exact visible subjects.
- Do preserve readable contrast and keyboard focus.
- Do use screenshots and previews as candidate-bound Evidence, not semantic approval.
- Do identify every assisted-authoring model separately from the Check model that evaluates Candidates.
- Don't display a generic trust score, hidden reasoning, or fabricated certainty.
- Don't invoke a model, widen Check input, or substitute the active Harness model without an explicit visible choice.
- Don't make background work appear active without an observed state transition.
- Don't duplicate System topology or runtime policy in design guidance.
- Don't let visual polish hide missing Evidence, stale state, or unavailable capability.

## Visual References

Visual references are illustrative inputs, not canonical state. Keep accepted references project-local, identify their source and intended UI concern, and validate resulting surfaces against these tokens, accessibility requirements, and exact runtime facts.
