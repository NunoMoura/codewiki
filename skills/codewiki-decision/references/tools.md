---
id: skill.codewiki-decision.tools
state: active
title: Decision Compiler Tool Reference
summary: Tool usage reference for decision rows, KB edits, propagation evidence, and decision_build creation.
owners: [maintainers]
updated: "2026-06-02"
---

# Decision compiler tools

## `wiki_state`

Start with graph-backed context:

```text
wiki_state refresh=true include=["summary","roadmap","session"]
```

Read exact KB/build/task refs before semantic edits.

## `wiki_decide`

Use for pending decision rows, approvals, KB mappings, propagation evidence, and accepted `decision_build` creation:

```text
wiki_decide action="propose" table_id="DT-..." rows=[...]
wiki_decide action="rows" table_id="DT-..." row_actions=[{ row_id="ROW-001", action="accept" }]
wiki_decide action="build" decision_build={ decision_mode="accepted", decision_table=[...], approved_decision_rows=[...] }
```

Rows must include current state, desired state, rationale, affected layers, risk, and requested user action.

## KB edits

Edit only approved product/system truth:

- product-first decisions update `.codewiki/kb/product/**` first, then record system impact or no-system-impact evidence;
- system-first decisions update `.codewiki/kb/system/**` and diagram refs first, then record product impact or no-product-impact evidence.

## Decision build payload

Compile after approved rows and KB edits through `wiki_decide action="build"`:

```text
wiki_decide action="build" decision_build={
  decision_mode="accepted",
  decision_table=[...],
  approved_decision_rows=["ROW-001"],
  knowledge_changes=[".codewiki/kb/system/compilers.md"],
  row_to_kb_mappings=[{ row_id, knowledge_refs, diagram_refs, evidence }],
  propagation={ direction, product_impact, system_impact, no_product_impact, no_system_impact },
  downstream_planning_questions=[...]
}
```

Accepted decision builds require:

- at least one approved decision row;
- row-to-KB mapping for every approved row;
- propagation direction;
- product-first: `system_impact` or `no_system_impact`;
- system-first: `product_impact` or `no_product_impact`.

Proposal decision builds may record draft rows, but must not record approved rows or canonical KB changes.

## `wiki_gate`

Use `wiki_gate` for deterministic linter evidence and decision gateway reports when policy/risk requires:

```text
wiki_gate action="preflight" profile="decision" verdict="pass" source=".codewiki/builds/decision/...json" rationale="..."
wiki_gate action="validate" profile="decision" verdict="pass|fail|block" source=".codewiki/builds/decision/...json" checks_run=[...]
```

Validation linters/tests approved-row coverage, KB mappings, product/system propagation, diagram refs, stale references, and risk approval.

## Compatibility aliases

`wiki_decision_table`, `wiki_build`, `wiki_audit`, and `wiki_gateway` remain expert compatibility aliases during migration. Do not use them as the normal decision surface.

## Routing

After accepted decision build:

```text
decision_build -> planning_build -> implementation_build -> validation
```

Do not create roadmap tasks in decision mode. Route executable work to planning.
