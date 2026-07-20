---
version: alpha
name: CodeWiki Work Pipeline
description: Canonical branding, visual identity, and interaction design contract for CodeWiki product interfaces.
colors:
  primary: "#315561"
  on-primary: "#FFFFFF"
  primary-hover: "#397375"
  focus: "#4A9293"
  background: "#050505"
  surface: "#0D0D0D"
  surface-raised: "#171717"
  on-surface: "#F4F1E8"
  on-surface-muted: "#A3A3A3"
  stage-change: "#EF7B36"
  stage-decision: "#F3D55B"
  stage-planning: "#8ECB72"
  stage-implementation: "#4D88B8"
  stage-committed: "#4A9293"
  error: "#D94848"
  warning: "#FFD750"
  success: "#67C66D"
typography:
  headline-lg:
    fontFamily: ui-monospace
    fontSize: 20px
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline-md:
    fontFamily: ui-monospace
    fontSize: 16px
    fontWeight: 800
    lineHeight: 1.3
  body-md:
    fontFamily: ui-monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0.01em
  label-md:
    fontFamily: ui-monospace
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.08em
  label-sm:
    fontFamily: ui-monospace
    fontSize: 11px
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: 0.1em
rounded:
  xs: 5px
  sm: 9px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  micro: 4px
  xs: 8px
  sm: 10px
  md: 16px
  lg: 20px
  xl: 32px
  dashboard-max-width: 1440px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: 38px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  focus-ring:
    backgroundColor: "{colors.focus}"
  pipeline-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
  raised-panel:
    backgroundColor: "{colors.surface-raised}"
  metadata:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-sm}"
  input-field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: 38px
  stage-change:
    backgroundColor: "{colors.stage-change}"
  stage-decision:
    backgroundColor: "{colors.stage-decision}"
  stage-planning:
    backgroundColor: "{colors.stage-planning}"
  stage-implementation:
    backgroundColor: "{colors.stage-implementation}"
  stage-committed:
    backgroundColor: "{colors.stage-committed}"
  status-error:
    backgroundColor: "{colors.error}"
  status-warning:
    backgroundColor: "{colors.warning}"
  status-success:
    backgroundColor: "{colors.success}"
type: Concept
title: CodeWiki Design System
tags:
  - codewiki
  - product
  - design-system
  - visual-identity
  - dashboard
timestamp: 2026-07-18T00:00:00Z
---
# Design System: CodeWiki

## Overview

CodeWiki uses a dark retro control-room language: compact, technical, trustworthy, and visibly alive without becoming theatrical. It should feel like a durable development instrument rather than a generic SaaS dashboard. Dense information remains calm through strict hierarchy, bounded widths, restrained motion, and one clear action at a time.

This document follows Google's open [DESIGN.md alpha specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md). Machine-readable tokens are normative; prose explains why they exist and how agents should apply them.

The multicolor CodeWiki mark provides brand energy. Product surfaces remain mostly neutral so lifecycle colors, blockers, review state, and current action carry meaning. Visual style never outranks trace truth or makes incomplete work look complete.

## Colors

The canvas is near-black, with warm off-white text and layered charcoal surfaces. Teal is the interaction color. Orange, yellow, green, blue, and teal identify lifecycle stages and must not be reassigned to unrelated categories.

- **Primary (#315561):** Primary-action fill with sufficient contrast for white text.
- **Primary hover (#397375):** Hover and active fill for primary actions.
- **Focus (#4A9293):** Focus rings, selected state, links, and normal interactive emphasis.
- **Background (#050505):** Main canvas.
- **Surface (#0D0D0D):** Pipeline cards and primary content regions.
- **Raised surface (#171717):** Inputs, controls, and nested detail surfaces.
- **On surface (#F4F1E8):** Primary warm-white text.
- **Muted text (#A3A3A3):** Secondary explanations and metadata.
- **Change (#EF7B36), Decision (#F3D55B), Planning (#8ECB72), Implementation (#4D88B8), Committed (#4A9293):** Fixed lifecycle identities.
- **Error (#D94848), warning (#FFD750), success (#67C66D):** Operational and review states only.

Never communicate stage or status through color alone. Pair color with labels, symbols, accessible names, or surrounding context. Maintain WCAG AA contrast for normal text and visible keyboard focus.

## Typography

CodeWiki uses a local monospace interface stack:

`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`

No network font request is required. Weight, case, spacing, and color establish hierarchy:

- **Headlines:** 16–20px, weight 800, compact line height.
- **Body:** 14px, regular weight, 1.45 line height.
- **Labels and metadata:** 11–12px, bold, often uppercase with 0.08–0.10em tracking.
- **Long prose:** Keep readable line length and increase leading rather than switching to a second type family.

Do not introduce a display font casually. A font change requires updated tokens, license and loading references, mobile proof, and a deliberate contrast with the technical monospace voice.

## Layout

The dashboard is a responsive, grid-first work surface with a 1440px maximum content width. Outer padding scales from 10px to 20px. Primary regions use a compact 10px rhythm, with 4px micro-spacing and 16–20px separation where hierarchy needs breathing room.

Pipeline cards foreground title, current action, topic alignment, and one five-stage rail. Detail remains attached to its parent card. Dense controls may wrap, but the page must never scroll horizontally. Mobile layouts collapse to one column and preserve readable labels and 44px touch targets even when visible control height is smaller on desktop.

Empty space is allowed when little work exists. Do not inflate cards, add decorative analytics, or center content vertically merely to fill the viewport.

## Elevation & Depth

Depth comes from tonal layers, one-pixel borders, restrained inset shading, and sparse shadows. Cards use clear outlines against the canvas. Hover elevation is limited to primary actions and must not cause layout shift.

Subtle scanline and warm radial treatments may support the retro-console atmosphere. They stay low contrast, ignore pointer input, and never reduce text legibility. Neon glows, glassmorphism, and large blurred color fields are outside the CodeWiki visual language.

## Shapes

Major shells and pipeline cards use 16px corners. Inputs and common controls use 9–10px corners. Small execution controls may use 5px corners when density requires stronger mechanical character.

Do not mix arbitrary radii. Pills are reserved for compact tags, states, and counts whose shape communicates grouping. Circular forms are reserved for status dots or controls with a universally recognizable icon.

## Components

### Pipeline cards

Cards use the primary surface, strong outline, compact padding, and attached detail. Lifecycle bars are equal-width independent segments. Their fill indicates progress while their fixed color indicates stage identity. Grey unfilled space remains visible.

### Buttons

The primary action uses a dark blue-teal fill, white text, strong weight, and a visible teal focus ring. Hover moves no more than one pixel and may add a restrained shadow. Secondary controls use raised charcoal surfaces and border emphasis. Destructive controls use error color and explicit wording.

### Inputs and search

Inputs use the background color inside a raised or outlined control. Labels remain visible; placeholders are hints, never substitutes. Focus changes border and icon color without adding a large glow. Search stays compact and scoped.

### Status and blockers

Blockers use `✕ Blocked — reason`. Review state and lifecycle state remain separate. Success styling appears only after durable completion evidence. Loading, reconnecting, stale, failed, and stopped states always include recovery text.

### Motion

Motion is restrained and functional: 140–180ms color, border, opacity, and one-pixel transform transitions. Respect reduced-motion settings. Do not add perpetual decorative motion, scroll choreography, or animations that obscure state changes.

## Iconography

Prefer simple inline SVG or CSS primitives with consistent 16–20px optical size, approximately 2px stroke weight, square view boxes, and `currentColor`. Utility glyphs must render as monochrome interface symbols rather than colorful emoji. Icons supplement labels; they do not replace unfamiliar actions.

The CodeWiki logo is the only multicolor brand mark in routine dashboard chrome. Preserve its aspect ratio, original palette, and clear space. Do not recolor individual logo bands to represent runtime state.

## Visual References

Canonical repository references:

- `src/dashboard/assets/codewiki-logo.png` — primary CodeWiki brand mark.
- `src/dashboard/assets.ts` — executable dashboard tokens, component styling, responsive rules, and interaction states.
- `.codewiki/kb/product/uis/terminal.md` — dashboard information architecture and product behavior.
- `.codewiki/kb/product/DESIGN.md` — normative design tokens and rationale.

External or generated visual references must use durable HTTPS URLs or repository-relative paths. Temporary `/tmp` screenshots, local workstation paths, and generated mockups are review evidence, not lasting brand truth.

## Do's and Don'ts

- Do preserve the retro technical character, compact hierarchy, and warm text palette.
- Do use lifecycle colors only for their fixed stages.
- Do verify desktop and mobile layouts, keyboard focus, touch targets, contrast, reduced motion, and horizontal overflow.
- Do update this file when approved fonts, icons, colors, references, or component rules change.
- Do keep token values aligned with executable dashboard styles.
- Don't add generic SaaS cards, decorative charts, gradient headline text, glass effects, or neon glows.
- Don't use emoji as product iconography.
- Don't let visual polish imply semantic approval or completion.
- Don't treat temporary screenshots, generated concepts, or framework defaults as canonical design decisions.
