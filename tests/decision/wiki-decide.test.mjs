import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

function tableInput(id = "DT-wiki-decide") {
	return {
		id,
		createdAt: "2026-06-11T00:00:01.000Z",
		updatedAt: "2026-06-11T00:00:01.000Z",
		rows: [
			{
				id: "DTR-wiki-decide",
				currentState: "Decision callers use iteration runner directly.",
				desiredState: "wiki_decide wraps decision output and append safely.",
				rationale: "Avoid split output/exit public workflow.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/decision-loop.md"],
			},
		],
	};
}

describe("wiki_decide core facade", () => {
	it("previews decision loop iterations", async () => {
		const result = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-preview",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			tableInput: tableInput(),
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.iterationEvent.event, "decision.iteration");
		assert.equal(result.iterationEvent.sequence, 2);
		assert.equal(result.loopResult.readyForPlanning, true);
		assert.equal(result.append, undefined);
	});

	it("appends decision loop iterations atomically", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-decide-"));
		try {
			const traceId = "TRACE-wiki-decide-append";
			const head = createTraceHead({
				traceId,
				title: "Append wiki_decide result",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const result = await runWikiDecide({
				repoRoot: root,
				mode: "append",
				expectedBytes: first.nextBytes,
				traceId,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:01.000Z",
				tableInput: tableInput(),
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 2);
			assert.equal(state.events.at(-1)?.event, "decision.iteration");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						traceId,
						tableInput: tableInput(),
					}),
				/expectedBytes/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
