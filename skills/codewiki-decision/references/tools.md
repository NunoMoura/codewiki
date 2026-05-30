---
id: skill.codewiki-decision.tools
state: active
title: Decision Compiler Tool Reference
summary: Tool usage reference for decision rows, KB edits, propagation evidence, and decision_build creation.
owners: [maintainers]
updated: "2026-05-19"
---

# Decision compiler tools

## `wiki_state`

Start with graph-backed context:

```text
wiki_state refresh=true include=["summary","roadmap","session"]
```

Read exact KB/build/task refs before semantic edits.

## `wiki_diff_table`

Use before canonical edits when semantic rows need approval:

```text
wiki_diff_table action="propose" rows=[...]
wiki_diff_table action="accept" table_id="..." row_id="ROW-001"
wiki_diff_table action="reject" table_id="..." row_id="ROW-002"
wiki_diff_table action="defer" table_id="..." row_id="ROW-003"
wiki_diff_table action="alternative" table_id="..." row_id="ROW-004" alternative="..."
```

Rows must include current state, desired state, rationale, affected layers, risk, and requested user action.

## KB edits

Edit only approved product/system truth:

- product-first decisions update `.codewiki/kb/product/**` first, then record system impact or no-system-impact evidence;
- system-first decisions update `.codewiki/kb/system/**` and diagram refs first, then record product impact or no-product-impact evidence.

## `wiki_build kind="decision"`

Compile after approved rows and KB edits:

```text
wiki_build kind="decision" \
  decision_mode="accepted" \
  diff_table=[...] \
  approved_diff_rows=["ROW-001"] \
  knowledge_changes=[".codewiki/kb/system/compilers.md"] \
  row_to_kb_mappings=[{ row_id, knowledge_refs, diagram_refs, evidence }] \
  propagation={ direction, product_impact, system_impact, no_product_impact, no_system_impact } \
  downstream_planning_questions=[...]
```

Accepted decision builds require:

- at least one approved diff row;
- row-to-KB mapping for every approved row;
- propagation direction;
- product-first: `system_impact` or `no_system_impact`;
- system-first: `product_impact` or `no_product_impact`.

Proposal decision builds may record draft rows, but must not record approved rows or canonical KB changes.

## `wiki_audit` and `wiki_gateway`

Use audits for deterministic evidence when policy/risk requires. Persist fail/block or policy-required reports:

```text
wiki_gateway profile="decision" verdict="pass|fail|block" source=".codewiki/builds/decision/...json"
```

Validation checks approved-row coverage, KB mappings, product/system propagation, diagram refs, stale references, and risk approval.

## Routing

After accepted decision build:

```text
decision_build -> planning_build -> implementation_build -> validation
```

Do not create roadmap tasks in decision mode. Route executable work to planning.
