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
	it("rejects natural-language shortcut input instead of silently producing empty output", async () => {
		await assert.rejects(
			() =>
				runWikiDecide({
					intent: "Build a benchmark app",
					decision: "Proceed",
				}),
			/wiki_decide received unsupported input field intent/,
		);
		await assert.rejects(
			() => runWikiDecide({ tableInput: tableInput() }),
			/wiki_decide requires traceId/,
		);
	});

	it("previews decision loop iterations", async () => {
		const result = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-preview",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			tableInput: tableInput(),
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.iterationEvent.event, "rows_approved");
		assert.equal(result.iterationEvent.sequence, 2);
		assert.equal(result.loopResult.readyForPlanning, true);
		assert.equal(result.append, undefined);
		assert.match(result.renderedDecisionTable.markdown, /\| Row ID \| Decision \|/);
		assert.match(result.renderedDecisionTable.markdown, /DTR-wiki-decide/);
		assert.match(result.renderedDecisionTable.digest, /^sha256:/);
	});

	it("routes low-risk scoped decisions directly to implementation", async () => {
		const result = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-direct-implementation",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			tableInput: tableInput("DT-wiki-decide-direct"),
		});
		const row = result.iterationEvent.data.output.approvedRows[0];

		assert.equal(result.loopResult.exit.route, "planning");
		assert.equal(row.routeTarget, "planning");

		const direct = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-direct-implementation",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			tableInput: {
				...tableInput("DT-wiki-decide-direct"),
				rows: [
					{
						...tableInput("DT-wiki-decide-direct").rows[0],
						routeTarget: "implementation",
						routeRationale:
							"The change is low-risk, scoped, and has targeted validation.",
						implementationMode: "targeted_checks",
						directImplementationScope: {
							pathScopes: ["src/pi/tools/index.ts"],
							verification: ["npm run typecheck"],
							acceptanceCriteria: [
								{
									id: "AC-DIRECT",
									text: "The small fix is validated without a planning loop.",
								},
							],
						},
					},
				],
			},
		});

		assert.equal(direct.loopResult.readyForPlanning, false);
		assert.equal(direct.loopResult.exit.route, "implementation");
		assert.equal(
			direct.iterationEvent.data.exit.routePlan.target,
			"implementation",
		);
		assert.equal(
			direct.iterationEvent.data.exit.routePlan.kind,
			"direct_implementation",
		);
		assert.equal(
			direct.iterationEvent.data.output.approvedRows[0].implementationMode,
			"targeted_checks",
		);
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
			const preview = await runWikiDecide({
				mode: "preview",
				traceId,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:01.000Z",
				tableInput: tableInput(),
			});
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						expectedBytes: first.nextBytes,
						traceId,
						nextSequence: 1,
						createdAt: "2026-06-11T00:00:01.000Z",
						tableInput: tableInput(),
					}),
				/rendered decision table/,
			);
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						expectedBytes: first.nextBytes,
						traceId,
						nextSequence: 1,
						createdAt: "2026-06-11T00:00:01.000Z",
						tableInput: {
							...tableInput(),
							rows: [
								{
									...tableInput().rows[0],
									desiredState: "A changed table must need new approval.",
								},
							],
						},
						decisionTableApproval: {
							approved: true,
							renderedTableDigest: preview.renderedDecisionTable.digest,
						},
					}),
				/does not match the current rendered table/,
			);
			const result = await runWikiDecide({
				repoRoot: root,
				mode: "append",
				expectedBytes: first.nextBytes,
				traceId,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:01.000Z",
				tableInput: tableInput(),
				decisionTableApproval: {
					approved: true,
					renderedTableDigest: preview.renderedDecisionTable.digest,
				},
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 2);
			assert.equal(state.events.at(-1)?.event, "rows_approved");
			assertQualityGraphIdentity(state.events.at(-1), "decision.loop");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			assertQualityGraphIdentity(state.latestCheckpoint, "decision.loop");
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						traceId,
						tableInput: tableInput(),
						decisionTableApproval: {
							approved: true,
							renderedTableDigest: preview.renderedDecisionTable.digest,
						},
					}),
				/expectedBytes/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

function assertQualityGraphIdentity(record, graphId) {
	const outputGraph = record?.data?.output?.qualityGraph;
	const exitGraph = record?.data?.exit?.qualityGraph;
	const checkpointGraph = record?.data?.qualityGraph;
	const graph = outputGraph || exitGraph || checkpointGraph;
	assert.equal(graph?.id, graphId);
	assert.equal(graph?.version, "0.3.0.loop.5");
	assert.equal(graph?.schemaVersion, 2);
	assert.match(graph?.hash, /^sha256:/);
	if (outputGraph) assert.deepEqual(outputGraph, exitGraph);
}
