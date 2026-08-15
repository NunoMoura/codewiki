---
type: User
title: Agent
description: Tool-using participant that acts through a bounded Client or Worker Assignment without owning acceptance, lifecycle, or effects.
status: stable
tags: [product, user, agent]
---
# Agent

Agents consume bounded snapshot-bound context and produce exactly scoped proposals, Candidates, Check Outputs, research, or Worker reports. A managed Pi Agent executes as a Worker under complete Runtime-controlled session and Workbench custody. Claude Code or Codex acts as a Client while inspecting or requesting work and as a Worker only while executing an accepted Assignment through stateless MCP and exact admitted Workbench operations. Its Model Provider remains a separate inference supplier.

CodeWiki-managed Agents never autonomously create, edit, install, update, or restore Check Packs. A User may direct an external coding Agent to follow public Check schemas and edit `.codewiki/check-packs/**` as ordinary project files; that Agent is the User's chosen editor, not a CodeWiki policy authority.

Agents cannot select Changes, alter canonical history, grant authority, schedule canonical descendants, choose Gate transitions, or perform guarded effects. When an Agent acts for a User through CodeWiki, exact delegation is required; otherwise it acts only as its own limited service actor. Success means useful work resumes from project and operation identity rather than hidden conversation memory while provenance and semantic decisions remain independently inspectable.
