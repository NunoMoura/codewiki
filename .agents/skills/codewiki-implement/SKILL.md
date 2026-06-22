---
name: codewiki-implement
description: Run the CodeWiki implementation loop. Use when exited planning work must become source/docs/tests changes with checks, acceptance evidence, content proof, and a durable implementation iteration.
---

# CodeWiki Implement

Use this skill when executing a planning work unit in source, tests, or KB docs.

## Ground rules

- Start from `wiki_state` for current trace-backed context.
- Implementation consumes `planning.work_units_created` output.
- Implementation owns source/docs/tests changes, checks, acceptance evidence, and content proof.
- Edit only files required by the selected work unit and acceptance criteria.
- Changes are referenced as `trace:<iteration-id>#change:<change-id>`.
- Append only with expected trace bytes and next sequence.

## Workflow

1. Read planning work refs, acceptance criteria, source-map ownership, and candidate files.
2. Make surgical edits only.
3. Run targeted checks, then broader required checks.
4. Prepare implementation evidence with planning refs, changed paths, check results, acceptance mapping, and content proof.
5. Preview with `wiki_implement`.
6. If blocked, fix missing coverage, invalid refs, failed checks, drift outside ownership, weak acceptance evidence, or missing proof.
7. Append only after trace append handles are known.

## Stop conditions

Stop and route back to planning when work is not self-contained or acceptance cannot be verified. Route back to decision when product/system meaning changed beyond planning scope.
