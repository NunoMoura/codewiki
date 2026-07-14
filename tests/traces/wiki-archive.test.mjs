import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiArchive } from "../../src/api/wiki-archive.ts";
import { runWikiImplement } from "../../src/api/wiki-implement.ts";
import { runDecisionIterationWithRunner } from "../../src/decision/iteration.ts";
import { runWikiPlan } from "../../src/api/wiki-plan.ts";
import { appendTraceRecords } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

async function runDecisionFixture(input) {
	return {
		loopResult: await runDecisionIterationWithRunner({
			traceId: input.traceId,
			proposalInput: input.proposalInput,
			createdAt: input.createdAt,
			startSequence: input.nextSequence,
		}),
	};
}

async function archiveRecords(traceId = "TRACE-wiki-archive") {
	const head = createTraceHead({
		traceId,
		title: "Archive trace",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const decision = await runDecisionFixture({
		traceId,
		createdAt: "2026-06-11T00:00:01.000Z",
		proposalInput: {
			id: "DT-archive",
			createdAt: "2026-06-11T00:00:01.000Z",
			updatedAt: "2026-06-11T00:00:01.000Z",
			changes: [
				{
					id: "CHG-archive",
					currentState: "Retention stub built manually.",
					desiredState: "wiki_archive previews retention refs.",
					rationale: "Archive must preserve restore refs.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/components/traces.md"],
				},
			],
		},
	});
	const decisionEvent = decision.loopResult.traceEvents[0];
	const decisionRow = decisionEvent.data.output.approvedChanges[0];
	const decisionRef = `trace:${decisionEvent.id}#change:${decisionRow.id}`;
	const planning = await runWikiPlan({
		traceId,
		decisionEvents: decision.loopResult.traceEvents,
		nextSequence: 2,
		createdAt: "2026-06-11T00:00:02.000Z",
		workItemInputs: [
			{
				id: "WU-archive",
				title: "Preview archive retention refs",
				decisionRefs: [decisionRef],
				outcome: "wiki_archive previews retention refs.",
				...planningQualityFields(),
				acceptance: ["Retention refs are previewed and close is guarded."],
				componentRefs: ["traces"],
				pathScopes: ["src/traces"],
				verification: ["tests/traces/wiki-archive.test.mjs"],
			},
		],
	});
	const planningEvent = planning.loopResult.traceEvents[0];
	const workItem = planningEvent.data.output.workItems[0];
	const planningRef = `trace:${planningEvent.id}#work:${workItem.id}`;
	const implementation = await runWikiImplement({
		repoRoot: ".",
		traceId,
		planningEvents: planning.loopResult.traceEvents,
		nextSequence: 3,
		createdAt: "2026-06-11T00:00:03.000Z",
		changeInputs: [
			{
				id: "CHG-archive",
				planningRefs: [planningRef],
				codePaths: ["src/traces/retention.ts"],
				testPaths: ["tests/traces/wiki-archive.test.mjs"],
				checks: [
					"node --experimental-strip-types --test tests/traces/wiki-archive.test.mjs",
				],
				checkResults: [
					{
						command:
							"node --experimental-strip-types --test tests/traces/wiki-archive.test.mjs",
						status: "pass",
						outputRef: "tests/traces/wiki-archive.test.mjs",
					},
				],
				acceptanceEvidence: ["Archive retention refs are covered."],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Archive retention refs are covered.",
						evidenceRefs: ["tests/traces/wiki-archive.test.mjs"],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abcdef" },
				...implementationQualityFields(),
			},
		],
	});
	return [
		head,
		...decision.loopResult.traceRecords,
		...planning.loopResult.traceRecords,
		...implementation.loopResult.traceRecords,
	];
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

	it("blocks trace close until the trace goal is complete or deferred", async () => {
		const head = createTraceHead({
			traceId: "TRACE-wiki-archive-incomplete",
			title: "Incomplete archive trace",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decision = await runDecisionFixture({
			traceId: head.traceId,
			createdAt: "2026-06-11T00:00:01.000Z",
			proposalInput: {
				id: "DT-archive-incomplete",
				createdAt: "2026-06-11T00:00:01.000Z",
				updatedAt: "2026-06-11T00:00:01.000Z",
				changes: [
					{
						id: "CHG-archive-incomplete",
						currentState: "Trace close can happen too early.",
						desiredState: "Trace close waits for goal coverage.",
						rationale: "Closed incomplete traces hide unfinished goals.",
						...decisionQualityFields(),
						approval: "approved",
						sourceRefs: ["kb:system/components/traces.md"],
					},
				],
			},
		});
		await assert.rejects(
			() =>
				runWikiArchive({
					action: "close",
					records: [head, ...decision.loopResult.traceRecords],
					gitRestoreRef: "refs/codewiki/archive/TRACE-wiki-archive-incomplete",
				}),
			/incomplete trace goal|needs planning coverage/,
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
		const hydrateFromOpenArchive = await runWikiArchive({
			action: "hydrate",
			stub: close.stub,
			archivedRecords: records,
		});
		assert.equal(
			hydrateFromOpenArchive.hydration?.records.length,
			records.length + 1,
		);
		assert.equal(
			hydrateFromOpenArchive.hydration?.records.at(-1)?.type,
			"trace_close",
		);
	});

	it("compacts completed traces into replayable hot stubs", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-archive-compact-"));
		try {
			const records = await archiveRecords("TRACE-wiki-archive-compact");
			const first = await appendTraceRecords(root, records, 0);
			const result = await runWikiArchive({
				action: "compact",
				mode: "append",
				repoRoot: root,
				expectedBytes: first.nextBytes,
				records,
				gitRestoreRef: "979df48",
				headRef: "trace:TRACE-wiki-archive-compact",
				reason: "Trace finished and retained in Git.",
				createdAt: "2026-06-11T00:00:04.000Z",
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-wiki-archive-compact")),
			);
			const state = replayTrace(readBack.records);

			assert.equal(result.action, "compact");
			assert.equal(result.append?.previousBytes, first.nextBytes);
			assert.ok((result.append?.nextBytes || 0) < first.nextBytes);
			assert.equal(readBack.records.length, 3);
			assert.equal(readBack.records[0].type, "trace_head");
			assert.equal(readBack.records[1].type, "tail_checkpoint");
			assert.equal(readBack.records[2].type, "trace_close");
			assert.equal(state.closed, true);
			assert.equal(result.stub?.closedAt, "2026-06-11T00:00:04.000Z");

			const hydrate = await runWikiArchive({
				action: "hydrate",
				stub: result.stub,
				archivedRecords: records,
			});
			assert.equal(hydrate.hydration?.records.length, records.length + 1);
			assert.equal(hydrate.hydration?.records.at(-1)?.type, "trace_close");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("compacts already closed traces with a fresh Git restore ref", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-archive-closed-compact-"));
		try {
			const records = await archiveRecords("TRACE-wiki-archive-closed-compact");
			const close = await runWikiArchive({
				action: "close",
				records,
				gitRestoreRef: "refs/codewiki/archive/legacy-closed-compact",
				headRef: "trace:TRACE-wiki-archive-closed-compact",
				reason: "Trace was closed before commit-backed compaction existed.",
				createdAt: "2026-06-11T00:00:04.000Z",
			});
			const closedRecords = [...records, close.closeRecord];
			const first = await appendTraceRecords(root, closedRecords, 0);
			const result = await runWikiArchive({
				action: "compact",
				mode: "append",
				repoRoot: root,
				expectedBytes: first.nextBytes,
				records: closedRecords,
				gitRestoreRef: "d62561c",
				headRef: "d62561c:TRACE-wiki-archive-closed-compact.jsonl",
				summary: "Closed legacy trace archived to current Git commit.",
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-wiki-archive-closed-compact")),
			);

			assert.equal(readBack.records.length, 3);
			assert.equal(result.stub?.gitRestoreRef, "d62561c");
			assert.equal(result.stub?.firstKeptRecordId, close.closeRecord.id);
			assert.equal(readBack.records[1].data.gitRestoreRef, "d62561c");
			assert.equal(readBack.records[2].gitRestoreRef, "d62561c");
			assert.equal(
				readBack.records[2].data.originalCloseGitRestoreRef,
				"refs/codewiki/archive/legacy-closed-compact",
			);

			const hydrate = await runWikiArchive({
				action: "hydrate",
				stub: result.stub,
				archivedRecords: closedRecords,
			});
			assert.equal(hydrate.hydration?.records.length, closedRecords.length);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("blocks compacting incomplete traces", async () => {
		const head = createTraceHead({
			traceId: "TRACE-wiki-archive-compact-incomplete",
			title: "Incomplete compact archive trace",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decision = await runDecisionFixture({
			traceId: head.traceId,
			createdAt: "2026-06-11T00:00:01.000Z",
			proposalInput: {
				id: "DT-archive-compact-incomplete",
				createdAt: "2026-06-11T00:00:01.000Z",
				updatedAt: "2026-06-11T00:00:01.000Z",
				changes: [
					{
						id: "CHG-archive-compact-incomplete",
						currentState: "Trace compact can happen too early.",
						desiredState: "Trace compact waits for implementation exit.",
						rationale: "Compacting incomplete traces hides unfinished work.",
						...decisionQualityFields(),
						approval: "approved",
						sourceRefs: ["kb:system/components/traces.md"],
					},
				],
			},
		});
		await assert.rejects(
			() =>
				runWikiArchive({
					action: "compact",
					records: [head, ...decision.loopResult.traceRecords],
					gitRestoreRef:
						"refs/codewiki/archive/TRACE-wiki-archive-compact-incomplete",
				}),
			/incomplete trace goal|needs planning coverage/,
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
				traceId: "TRACE-wiki-archive-append",
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
