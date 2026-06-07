---
id: research.context-bloat-refresh-thresholds-2026-06-07
title: Context bloat refresh thresholds for automatic CodeWiki agency
state: active
created: "2026-06-07"
source: web_search
---

# Context bloat refresh thresholds for automatic CodeWiki agency

## Question

When CodeWiki agency is allowed to execute at sprint or roadmap scope, what context window threshold should trigger a source-backed context refresh so the agent does not continue with degraded reasoning or unsafe memory loss?

## Evidence summary

- Production context managers commonly check estimated prompt/context size before each model invocation and trigger compression/eviction before the next call approaches capacity. One agent paper describes a pre-flight context checker that estimates message and auxiliary context token cost before every LLM invocation.
- General context-window guides commonly use summarization or compaction when the active window approaches capacity; one implementation example calls `needs_compaction(0.8)`.
- Coding-agent discussions warn that 95% auto-compaction is too late because reasoning quality can degrade before hard capacity. Other guides describe 80% default compaction as sometimes too late or poorly timed when it fires during critical implementation work.
- Long-context research shows that models do not robustly use all long context. “Lost in the Middle” reports degradation based on relevant information position, and later work reports context length itself can hurt performance even when retrieval is perfect.
- Coding-agent context guides recommend compaction around the 50–70% zone when quality matters, with a preference for compaction at logical boundaries rather than during a critical edit or validation sequence.

## Sources

- Context Window Management · AI & Agentic, https://ikshitij.com/learn/ai-agentic/context-window-management/
- Adaptive Context Management for Long-Running LLM Agent Sessions, https://kaman.ai/papers/adaptive-context-management.pdf
- docs/context-window.md · nazq-org/llm-stack, https://github.com/nazq-org/llm-stack/blob/main/docs/context-window.md
- Manual Compaction Strategy for Dumb Zone Mitigation, https://agentpatterns.ai/context-engineering/manual-compaction-dumb-zone-mitigation/
- Context Compaction: Delete Noise, Keep Signal, https://www.morphllm.com/claude-code-auto-compact
- Lost in the Middle: How Language Models Use Long Contexts, https://aclanthology.org/2024.tacl-1.9.pdf
- Context Length Alone Hurts LLM Performance Despite Perfect Retrieval, https://aclanthology.org/2025.findings-emnlp.1264.pdf

## Recommended CodeWiki policy

Use quality thresholds, not only hard context capacity thresholds. Defaults should be configurable per model/provider/project, but the generic default policy should be:

- `warn_ratio`: 0.50. Start tracking context-bloat risk and prefer shorter tool outputs.
- `handoff_ratio`: 0.60. Prepare or refresh a source-backed handoff packet while continuing only if the current loop is safe.
- `soft_refresh_ratio`: 0.70. At the next safe idle boundary, perform a CodeWiki source-backed soft refresh or start a fresh worker/session with the handoff packet.
- `hard_refresh_ratio`: 0.80. Stop before starting a new task, worker, gate, or broad edit unless a fresh source-backed context has been created.
- `emergency_ratio`: 0.90. Do not perform new semantic decisions, source edits, or publication work; write a minimal handoff from source refs and continue in a fresh context.

Refresh boundaries must respect atomic work. If the agent is in the middle of a write, test, validation, or publication step, it should finish the smallest safe sub-step, record source-backed state, release or heartbeat leases, and refresh before the next task/gate/worker.

For sprint/roadmap agency, context should be checked before every loop iteration, before each worker spawn, before each gate, and before starting each new task. Refresh packets must be sourced from CodeWiki artifacts, roadmap state, validation reports, Git/content proof, and active artifact leases rather than chat summaries alone.
