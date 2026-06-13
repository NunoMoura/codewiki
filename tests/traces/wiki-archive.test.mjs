import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWikiArchive } from "../../src/api/wiki-archive.ts";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { createTraceHead } from "../../src/traces/writer.ts";

describe("wiki_archive core facade", () => {
	it("previews retention stubs from trace records", async () => {
		const traceId = "TRACE-wiki-archive";
		const head = createTraceHead({
			traceId,
			title: "Archive trace",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decision = await runWikiDecide({
			traceId,
			createdAt: "2026-06-11T00:00:01.000Z",
			tableInput: {
				id: "DT-archive",
				createdAt: "2026-06-11T00:00:01.000Z",
				updatedAt: "2026-06-11T00:00:01.000Z",
				rows: [
					{
						id: "DTR-archive",
						currentState: "Retention stub built manually.",
						desiredState: "wiki_archive previews retention refs.",
						rationale: "Archive must preserve restore refs.",
						approval: "approved",
						sourceRefs: ["kb:system/traces.md"],
					},
				],
			},
		});
		const result = runWikiArchive({
			records: [head, ...decision.loopResult.traceRecords],
			gitRestoreRef: "refs/codewiki/archive/TRACE-wiki-archive",
			headRef: "trace:TRACE-wiki-archive",
		});

		assert.equal(result.action, "retention_stub");
		assert.equal(result.mode, "preview");
		assert.equal(result.stub.traceId, traceId);
		assert.equal(result.stub.title, "Archive trace");
		assert.equal(
			result.stub.gitRestoreRef,
			"refs/codewiki/archive/TRACE-wiki-archive",
		);
		assert.equal(result.refs.includes("trace:TRACE-wiki-archive"), true);
		assert.equal(
			result.refs.includes("refs/codewiki/archive/TRACE-wiki-archive"),
			true,
		);
	});
});
