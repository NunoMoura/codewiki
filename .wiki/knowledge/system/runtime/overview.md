---
id: spec.system.runtime
title: Runtime Policy
state: active
summary: Policy boundary for codewiki runtime access in codewiki.
owners:
  - architecture
updated: "2026-04-29"
---

# Runtime Policy

## Responsibility

The runtime policy keeps agent-facing wiki operations small, inspectable, and bound to the repo-local `.wiki/config.json` contract.

## Split of responsibility

- `.wiki/config.json` declares readable paths, direct writable paths, generated read-only paths, byte caps, and runtime adapter metadata.
- `scripts/codewiki-gateway.mjs` is the current adapter for compact reads and validated transaction application.
- A future `think-code` executor may provide generic sandbox isolation while reusing the same policy and transaction schema.
- codewiki owns domain semantics: generated files stay read-only, evidence is append-only, roadmap/task state goes through canonical mutation APIs, and generated state is rebuilt after accepted writes.

## Transaction v1

Transactions are JSON objects with `version: 1`, a short `summary`, and an `ops` array. Supported direct ops are exact-text `patch` and `append_jsonl`.

```json
{
  "version": 1,
  "summary": "Update wiki evidence.",
  "ops": [
    {
      "kind": "patch",
      "path": ".wiki/knowledge/system/overview.md",
      "oldText": "old exact text",
      "newText": "new exact text"
    },
    {
      "kind": "append_jsonl",
      "path": ".wiki/evidence/runtime.jsonl",
      "value": { "summary": "Evidence entry" }
    }
  ]
}
```

## Related docs

- [System Overview](../overview.md)
- [Product](../../product/overview.md)
