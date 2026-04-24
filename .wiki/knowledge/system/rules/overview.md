---
id: spec.system.rules
title: System Rules
state: active
summary: System-level documentation contract for maintaining codewiki itself with hidden knowledge, machine evidence, roadmap state, and status read models.
owners:
- docs
updated: '2026-04-21'
---

# System Rules

## Canonical artifacts

- `.wiki/evidence/*.jsonl`: compact evidence capture
- `.wiki/knowledge/**.md`: intended system truth
- `.wiki/roadmap.json`: canonical mutable roadmap state
- `wiki/index.md`: generated navigation surface
- `wiki/roadmap.md`: generated roadmap view
- `.wiki/roadmap-state.json`: derived roadmap and task UI read model
- `.wiki/status-state.json`: derived status panel and footer UI read model
- `.wiki/`: generated metadata and event log

## Responsibility split

### Evidence

Evidence records short synthesized findings plus source links. It should stay compact, appendable, and directly reusable by roadmap or authored docs.

### Authored docs

Docs under `.wiki/knowledge/` describe desired state. They should mirror meaningful ownership boundaries and stay readable enough for humans while being concrete enough for agents to compare against code.

### Roadmap

Roadmap is machine-managed canonical state for numbered tasks that close the gap between authored docs and implementation reality. Tasks are the atomic work units and canonically use `TASK-###` ids. Plans and drift should default to roadmap tasks instead of separate top-level doc classes. Audit workflows should be able to append new roadmap tasks without manual prose translation, while users primarily interact through Pi surfaces instead of raw JSON edits.

Roadmap should contain accepted tracked delta, not every raw detector output. High-frequency heartbeat analysis may produce evidence and draft proposals, but roadmap entries should stay deduplicated, causal, and user-comprehensible.

### Sessions

Pi sessions record execution history. codewiki should not replace Pi's session JSONL model. Instead it should append custom task-link entries and read current task context from Pi at runtime.

Resume-oriented session state should preserve enough context to restart work with low friction: focused task, last meaningful action, touched files or code areas when known, latest deterministic verification summary, and current loop phase.

### Status read model

`.wiki/status-state.json` should denormalize repo truth into a small number of stable UI sections:

- header
- `wiki`
- `roadmap`
- `agents`
- `channels`
- optional footer summary

The panel-facing contract should treat those sections like this:

- header = repo plus one health circle
- `wiki` = Product, System, and Clients talkable groups, with knowledge grouped directly under Product, System, and Clients
- `roadmap` = kanban columns by phase gate rather than prose summaries
- `agents` = stable named execution rows, not raw session ids as the primary label
- `channels` = add-channel affordance plus existing channels list

Repo-owned truth may feed those sections, but some runtime state remains user-owned rather than repo-owned:

- repo pinning and repo-switch preferences
- footer visibility preferences
- personal delivery targets
- external channel secrets and credentials

The read model should expose delivery health and routing state without persisting private secrets in repo-owned files.

## Goal quality rule

Well-defined goals are required for strong validation and verification loops.

Authored docs and roadmap tasks should therefore be concrete enough to answer:

- what outcome is intended?
- what evidence would demonstrate alignment?
- what would count as drift or failure?
- what is explicitly out of scope?

## Verification loop rule

Task execution should not jump directly from coding to closure. The default progression is:

1. todo
2. research
3. implement
4. verify
5. done

`Blocked` is a task signal and evidence outcome, not a competing main board column. Parent-owned roadmap truth still decides when work is done. Sessions or future workers may contribute evidence, but they do not directly close tasks.

## Local decisions

- - keep `/wiki-bootstrap` explicit, even though `/wiki-status` may offer bootstrap guidance when no wiki exists yet
- keep `/wiki-config` as the separate runtime-configuration command rather than folding configuration into the status panel
- keep the always-on summary optional and constrained to the Pi footer rather than a larger persistent status surface

## Archive stance

Public duplicate wiki docs are deprecated by default. Archive is deprecated by default. Prefer git history for full diffs, `.wiki/events.jsonl` for compact lifecycle events, `.wiki/roadmap-events.jsonl` for roadmap mutation history, and compact roadmap or evidence updates over large historical doc buckets.

By default the package should not generate a separate compact-history artifact. If a repo later needs richer historical analytics, that should be introduced as explicit follow-up scope rather than quietly reviving archive docs.

## Related docs

- [Product](../../product/overview.md)
- [System Overview](../overview.md)
- [Package Surface](../package/overview.md)
- [Extension Runtime](../extension/overview.md)
- [Templates and Rebuild](../templates/overview.md)
- [Roadmap](../../../../wiki/roadmap.md)
