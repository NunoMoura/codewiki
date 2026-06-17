import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiImplement } from "../../src/api/wiki-implement.ts";
import { collectPiWorkerResults } from "../../src/pi/worker-results.ts";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { createRuntimeClaimEvent } from "../../src/runtime/claims.ts";
import { createRuntimeWorkerCompletionReleaseEvents } from "../../src/runtime/dispatcher.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

function approvedDecisionRef(events) {
	const iteration = events.find(
		(event) => event.event === "decision.iteration",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function planningWorkRef(events, workUnitId = "WU-implement") {
	const iteration = events.find(
		(event) => event.event === "planning.iteration",
	);
	const item = iteration?.data?.output?.workItems?.find(
		(candidate) => candidate.id === workUnitId,
	);
	assert.ok(iteration);
	assert.ok(item);
	return `trace:${iteration.id}#work:${item.id}`;
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-implement-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(
		join(root, "src", "feature.ts"),
		"export const feature = true;\n",
	);
	await writeFile(
		join(root, "tests", "feature.test.mjs"),
		"assert.ok(true);\n",
	);
	await writeFile(join(root, "package.json"), '{"name":"fixture"}\n');
	return root;
}

function planningEvents(traceId) {
	const table = createDecisionTable({
		id: `${traceId}-DT`,
		createdAt: "2026-06-11T00:00:01.000Z",
		updatedAt: "2026-06-11T00:00:01.000Z",
		rows: [
			{
				id: "DTR-implement",
				currentState: "Implementation callers wire proof manually.",
				desiredState: "wiki_implement prepares proof and appends safely.",
				rationale: "Avoid partial or weak implementation trace writes.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/implementation-loop.md"],
			},
		],
	});
	const decision = runDecisionIteration({
		traceId,
		table,
		createdAt: "2026-06-11T00:00:01.000Z",
	});
	const decisionRef = approvedDecisionRef(decision.traceEvents);
	return runPlanningIteration({
		traceId,
		decisionEvents: decision.traceEvents,
		startSequence: 5,
		createdAt: "2026-06-11T00:00:02.000Z",
		workItemInputs: [
			{
				id: "WU-implement",
				title: "Run wiki_implement",
				decisionRefs: [decisionRef],
				outcome: "Implementation facade runs and appends safely.",
				...planningQualityFields(),
				acceptance: ["wiki_implement appends implementation iteration."],
				componentRefs: ["api"],
				pathScopes: ["src/feature.ts"],
				verification: ["tests/feature.test.mjs"],
			},
		],
	}).traceEvents;
}

function changeInput(planningRef) {
	return {
		id: "CH-implement",
		planningRefs: [planningRef],
		codePaths: ["src/feature.ts"],
		testPaths: ["tests/feature.test.mjs"],
		checks: ["node --test tests/feature.test.mjs"],
		checkResults: [
			{
				command: "node --test tests/feature.test.mjs",
				status: "pass",
				phase: "green",
				criterionId: "AC-001",
				outputRef: "tests/feature.test.mjs",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Feature test passes.",
				evidenceRefs: ["tests/feature.test.mjs"],
			},
		],
		...implementationQualityFields(),
	};
}

describe("wiki_implement core facade", () => {
	it("previews implementation with snapshot and automatic content proof", async () => {
		const root = await fixture();
		try {
			const traceId = "TRACE-wiki-implement-preview";
			const events = planningEvents(traceId);
			const planningRef = planningWorkRef(events);
			const result = await runWikiImplement({
				repoRoot: root,
				mode: "preview",
				traceId,
				planningEvents: events,
				nextSequence: 9,
				createdAt: "2026-06-11T00:00:03.000Z",
				changeInputs: [changeInput(planningRef)],
			});

			assert.equal(result.mode, "preview");
			assert.equal(result.iterationEvent.event, "implementation.iteration");
			assert.equal(result.loopResult.readyForClosure, true);
			assert.equal(result.append, undefined);
			assert.deepEqual(result.proofPaths, [
				"src/feature.ts",
				"tests/feature.test.mjs",
			]);
			assert.match(
				result.aggregateContentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.match(
				result.loopResult.changes[0].contentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.equal(result.snapshot.files.includes("src/feature.ts"), true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("previews implementation from normalized Pi worker completion", async () => {
		const root = await fixture();
		try {
			const traceId = "TRACE-wiki-implement-worker";
			const events = planningEvents(traceId);
			const planningRef = planningWorkRef(events);
			const claim = createRuntimeClaimEvent({
				traceId,
				id: `${traceId}:runtime:claim:WU-implement:8`,
				parentId: planningRef,
				sequence: 8,
				createdAt: "2026-06-11T00:00:02.500Z",
				claimId: "claim-WU-implement-001",
				workerId: "pi-worker-001",
				workUnitId: "WU-implement",
				planningRefs: [planningRef],
				pathScopes: ["src/feature.ts"],
			});
			const workerResults = collectPiWorkerResults([
				{
					dispatch: {
						workerId: "pi-worker-001",
						workUnitId: "WU-implement",
						traceId,
						planningRefs: [planningRef],
						claimId: "claim-WU-implement-001",
						sessionId: "session-pi-worker-001",
						sessionFile: "/tmp/pi-worker-001.jsonl",
						status: "started",
					},
					output: {
						status: "completed",
						message: "Worker finished implementation.",
						changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
						checks_run: ["node --test tests/feature.test.mjs"],
						working_tree_digest: "sha256:abc123",
						changes: [changeInput(planningRef)],
					},
				},
			]);
			const result = await runWikiImplement({
				repoRoot: root,
				mode: "preview",
				traceId,
				planningEvents: events,
				claimEvents: [claim],
				workerResults,
				nextSequence: 9,
				createdAt: "2026-06-11T00:00:03.000Z",
			});

			assert.equal(result.loopResult.readyForClosure, true);
			assert.equal(result.loopResult.changes[0].workerId, "pi-worker-001");
			assert.equal(
				result.loopResult.changes[0].claimId,
				"claim-WU-implement-001",
			);
			assert.equal(
				result.loopResult.workerAggregation.workerResults[0].sessionId,
				"session-pi-worker-001",
			);
			assert.match(
				result.aggregateContentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			const release = createRuntimeWorkerCompletionReleaseEvents(
				workerResults,
				[claim],
				{
					createdAt: "2026-06-11T00:00:04.000Z",
					nextSequenceByTrace: { [traceId]: 10 },
				},
			).events[0];
			const queue = buildWorkQueueView({
				records: [...events, claim, result.iterationEvent, release],
			});
			assert.equal(
				queue.items.find((item) => item.id === "WU-implement")?.status,
				"done",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends implementation iteration atomically in append mode", async () => {
		const root = await fixture();
		try {
			const traceId = "TRACE-wiki-implement-append";
			const head = createTraceHead({
				traceId,
				title: "Append wiki_implement result",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const events = planningEvents(traceId);
			const planningRef = planningWorkRef(events);
			const result = await runWikiImplement({
				repoRoot: root,
				mode: "append",
				expectedBytes: first.nextBytes,
				traceId,
				planningEvents: events,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:03.000Z",
				changeInputs: [changeInput(planningRef)],
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 2);
			assert.equal(state.events.at(-1)?.event, "implementation.iteration");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			await assert.rejects(
				() =>
					runWikiImplement({
						repoRoot: root,
						mode: "append",
						traceId,
						planningEvents: events,
						changeInputs: [changeInput(planningRef)],
					}),
				/expectedBytes/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
