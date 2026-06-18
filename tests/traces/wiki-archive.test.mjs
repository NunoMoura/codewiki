import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiArchive } from "../../src/api/wiki-archive.ts";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { appendTraceRecords } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

async function archiveRecords(traceId = "TRACE-wiki-archive") {
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
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/traces.md"],
				},
			],
		},
	});
	return [head, ...decision.loopResult.traceRecords];
}

describe("wiki_archive core facade", () => {
	it("previews retention stubs from trace records", async () => {
		const records = await archiveRecords();
		const result = await runWikiArchive({
			records,
			gitRestoreRef: "refs/codewiki/archive/TRACE-wiki-archive",
			headRef: "trace:TRACE-wiki-archive",
		});

		assert.equal(result.action, "retention_stub");
		assert.equal(result.mode, "preview");
		assert.equal(result.stub?.traceId, "TRACE-wiki-archive");
		assert.equal(result.stub?.title, "Archive trace");
		assert.equal(
			result.stub?.gitRestoreRef,
			"refs/codewiki/archive/TRACE-wiki-archive",
		);
		assert.equal(result.refs.includes("trace:TRACE-wiki-archive"), true);
		assert.equal(
			result.refs.includes("refs/codewiki/archive/TRACE-wiki-archive"),
			true,
		);
	});

	it("previews trace close records and hydration plans", async () => {
		const records = await archiveRecords("TRACE-wiki-archive-close");
		const close = await runWikiArchive({
			action: "close",
			records,
			gitRestoreRef: "refs/codewiki/archive/TRACE-wiki-archive-close",
			headRef: "trace:TRACE-wiki-archive-close",
			reason: "Trace finished and retained.",
			createdAt: "2026-06-11T00:00:03.000Z",
		});

		assert.equal(close.action, "close");
		assert.equal(close.closeRecord?.type, "trace_close");
		assert.equal(close.closeRecord?.reason, "Trace finished and retained.");
		assert.equal(close.stub?.closedAt, "2026-06-11T00:00:03.000Z");
		assert.equal(close.releaseNotes?.closed, true);
		assert.equal(
			close.releaseNotes?.closeReason,
			"Trace finished and retained.",
		);

		const hydrate = await runWikiArchive({
			action: "hydrate",
			stub: close.stub,
			archivedRecords: [...records, close.closeRecord],
		});

		assert.equal(hydrate.action, "hydrate");
		assert.equal(hydrate.hydration?.traceId, "TRACE-wiki-archive-close");
		assert.equal(hydrate.hydration?.records.length, records.length + 1);

		await assert.rejects(
			() =>
				runWikiArchive({
					action: "hydrate",
					stub: {
						...close.stub,
						gitRestoreRef: "refs/codewiki/archive/wrong-trace",
					},
					archivedRecords: [...records, close.closeRecord],
				}),
			/Hydration restore ref mismatch/,
		);
		await assert.rejects(
			() =>
				runWikiArchive({
					action: "hydrate",
					stub: close.stub,
					archivedRecords: records,
				}),
			/Hydration close mismatch/,
		);
	});

	it("appends trace close records with byte preflight", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-archive-"));
		try {
			const records = await archiveRecords("TRACE-wiki-archive-append");
			const first = await appendTraceRecords(root, records, 0);
			const result = await runWikiArchive({
				action: "close",
				mode: "append",
				repoRoot: root,
				expectedBytes: first.nextBytes,
				records,
				gitRestoreRef: "refs/codewiki/archive/TRACE-wiki-archive-append",
				createdAt: "2026-06-11T00:00:03.000Z",
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-wiki-archive-append")),
			);
			const state = replayTrace(readBack.records);

			assert.equal(result.append?.previousBytes, first.nextBytes);
			assert.equal(state.closed, true);
			assert.equal(state.close?.id, result.closeRecord?.id);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
