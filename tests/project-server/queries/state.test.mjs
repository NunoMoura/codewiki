import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { buildWikiState } from "../../../src/project-server/queries/state.ts";
import {
	acceptChangeRecord,
	createChangeRecord,
} from "../../../src/changes/records.ts";
import { ChangeTraceStore } from "../../../src/changes/trace/store.ts";
import { InMemoryReviewEvidenceCache } from "../../../src/runtime/review/index.ts";
import { buildCodewikiAppState } from "../../../src/project-server/queries/app-state.ts";
import { loadProjectServerChangesState } from "../../../src/project-server/queries/changes.ts";
import { readProjectTraceRecords } from "../../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../../helpers/accepted-change.mjs";
import { createTraceCloseRecord } from "../../../src/changes/trace/retention.ts";
import { runDecisionIteration } from "../../helpers/canonical-loop-events.mjs";
import { canonicalChangeInput } from "../../helpers/canonical-loop-events.mjs";
import { runPlanningIteration } from "../../helpers/canonical-loop-events.mjs";
import { createTraceHead } from "../../../src/changes/trace/writer.ts";
import { decisionQualityFields } from "../../helpers/proposed-change.mjs";
import { planningQualityFields } from "../../helpers/planning-work.mjs";

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function approvedDecisionRef(events) {
	const iteration = events.find((event) => event.loop === "decision");
	const change = iteration?.data?.output?.changeRecord?.change;
	assert.ok(iteration);
	assert.ok(change);
	return `change:${change.id}`;
}

function traceRecords(traceId = "TRACE-state") {
	const head = createTraceHead({
		traceId,
		title: "Read wiki state from traces",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const changeInput = canonicalChangeInput({
		id: `${traceId}-DT`,
		createdAt: "2026-06-11T00:00:01.000Z",
		updatedAt: "2026-06-11T00:00:01.000Z",
		changes: [
			{
				id: "CHG-state",
				question: "How should state be read?",
				currentState: "State reads could depend on stored view files.",
				desiredState: "State reads active project traces.",
				rationale: "Views are disposable projections, not truth.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/components/api-tools.md"],
			},
		],
	});
	const decision = runDecisionIteration({
		traceId,
		changeInput,
		createdAt: "2026-06-11T00:00:01.000Z",
	});
	const changeRef = approvedDecisionRef(decision.traceEvents);
	const plan = runPlanningIteration({
		traceId,
		decisionEvents: decision.traceEvents,
		startSequence: nextSequence(decision.traceEvents),
		createdAt: "2026-06-11T00:00:02.000Z",
		workUnitInputs: [
			{
				id: "WU-state",
				title: "Create wiki_state facade",
				changeRefs: [changeRef],
				outcome: "wiki_state returns derived projections.",
				...planningQualityFields(),
				acceptance: ["State derives from trace records."],
				componentRefs: ["runtime"],
				pathScopes: ["src/project-server/queries/state.ts"],
				verification: ["tests/project-server/queries/state.test.mjs"],
			},
		],
	});
	return [head, ...decision.traceEvents, ...plan.traceEvents];
}

describe("wiki_state core facade", () => {
	it("creates view-shaped state from trace records", () => {
		const state = buildWikiState({
			records: traceRecords(),
			generatedAt: "2026-06-11T00:00:03.000Z",
			expectedBytesByTrace: { "TRACE-state": 999 },
		});

		assert.deepEqual(state.traceIds, ["TRACE-state"]);
		assert.equal(state.selectedTraceId, "TRACE-state");
		assert.equal(state.status?.currentLoop, "implementation");
		assert.equal(
			state.resume?.nextAction,
			"Implement planned work unit WU-state.",
		);
		assert.equal(state.workPlan?.cards[0].id, "WU-state");
		assert.equal(state.quality?.summary.planning.met, 7);
		assert.equal(state.workQueue.summary.ready, 1);
		assert.equal(state.traceBoard.summary.needs_implementation, 1);
		assert.equal(state.traceBoard.traces[0].status, "needs_implementation");
		assert.equal(state.traceQueue.cards[0].traceId, "TRACE-state");
		assert.equal(state.traceQueue.cards[0].rowCount, 1);
		assert.equal(state.traceQueue.cards[0].items[0].id, "WU-state");
		assert.equal(state.triggers.triggers.length, 0);
		assert.equal(state.runtimeBoard.summary.readyWorkUnits, 1);
		assert.equal(state.runtimeBoard.summary.selectedClaims, 1);
		assert.equal(
			state.runtimeBoard.nextActions[0].includes("work-unit claim"),
			true,
		);
		assert.deepEqual(state.append?.byTrace["TRACE-state"], {
			expectedBytes: 999,
			nextSequence: 3,
		});
		assert.deepEqual(state.next, {
			action: "implement",
			reason: "Implement planned work unit WU-state.",
			traceId: "TRACE-state",
			workUnitId: "WU-state",
		});
	});

	it("ignores non-exited planning work units in queue projections", () => {
		const records = traceRecords("TRACE-state-planning-repair");
		const planning = records.find(
			(record) => record.type === "trace_event" && record.loop === "planning",
		);
		assert.ok(planning);
		const blockedPlanning = structuredClone(planning);
		blockedPlanning.id = `${planning.id}-blocked`;
		blockedPlanning.sequence = planning.sequence + 1;
		blockedPlanning.event = "planning_blocked";
		blockedPlanning.data.exit.status = "continue";
		blockedPlanning.data.output.workUnits[0].id = "WU-ghost";
		blockedPlanning.data.output.workUnits[0].title = "Ghost blocked plan";
		blockedPlanning.data.output.workUnits[0].pathScopes = ["src/ghost.ts"];

		const state = buildWikiState({
			records: [...records, blockedPlanning],
			generatedAt: "2026-06-11T00:00:03.000Z",
		});

		assert.deepEqual(
			state.workPlan?.cards.map((card) => card.id),
			["WU-state"],
		);
		assert.equal(
			state.workQueue.items.some((item) => item.id === "WU-ghost"),
			false,
		);
		assert.equal(
			state.workQueue.items.some((item) => item.id === "WU-state"),
			true,
		);
	});

	it("clears planning blockers superseded by a later planning exit", () => {
		const records = traceRecords("TRACE-state-planning-superseded");
		const planning = records.find(
			(record) => record.type === "trace_event" && record.loop === "planning",
		);
		assert.ok(planning);
		const nonPlanningRecords = records.filter((record) => record !== planning);
		const blockedPlanning = structuredClone(planning);
		blockedPlanning.id = `${planning.id}-blocked`;
		blockedPlanning.sequence = planning.sequence;
		blockedPlanning.event = "planning_blocked";
		blockedPlanning.data.exit.status = "continue";
		blockedPlanning.data.exit.conditions = [
			{
				id: "dependency_order_clear",
				status: "unmet",
				message: "Old planning blocker should be superseded.",
				refs: ["WU-state"],
			},
		];
		const acceptedPlanning = structuredClone(planning);
		acceptedPlanning.id = `${planning.id}-accepted`;
		acceptedPlanning.sequence = planning.sequence + 1;

		const state = buildWikiState({
			records: [...nonPlanningRecords, blockedPlanning, acceptedPlanning],
			generatedAt: "2026-06-11T00:00:03.000Z",
		});

		assert.equal(
			state.blockers?.blockers.some((blocker) =>
				blocker.message.includes("Old planning blocker"),
			),
			false,
		);
		assert.deepEqual(
			state.workPlan?.cards.map((card) => card.id),
			["WU-state"],
		);
	});

	it("summarizes cached fast review findings", () => {
		const records = traceRecords("TRACE-state-review-cache");
		const cache = new InMemoryReviewEvidenceCache();
		cache.record({
			traceId: "TRACE-state-review-cache",
			createdAt: "2026-06-11T00:00:02.500Z",
			report: {
				phase: "fast",
				changedPaths: ["src/project-server/queries/state.ts"],
				sources: [
					{
						id: "common.fast.blocking-diagnostics",
						kind: "common",
						layer: "common",
						summary: "Fast diagnostics",
					},
				],
				diagnostics: [
					{
						path: "src/project-server/queries/state.ts",
						severity: "error",
						message: "Cached fast blocker.",
						sourceId: "common.fast.blocking-diagnostics",
						range: { startLine: 12 },
					},
				],
			},
		});

		const state = buildWikiState({
			records,
			traceId: "TRACE-state-review-cache",
			generatedAt: "2026-06-11T00:00:03.000Z",
			reviewEvidenceCache: cache,
		});

		assert.equal(state.reviewEvidence?.cachedFast.reportCount, 1);
		assert.equal(state.reviewEvidence?.cachedFast.diagnostics.error, 1);
		assert.equal(
			state.reviewEvidence?.blockers[0],
			"common.fast.blocking-diagnostics: src/project-server/queries/state.ts:12 Cached fast blocker.",
		);
	});

	it("omits append handles for closed traces", () => {
		const records = traceRecords("TRACE-state-closed");
		const close = createTraceCloseRecord({
			records,
			gitRestoreRef: "refs/codewiki/archive/TRACE-state-closed",
			allowIncomplete: true,
		});
		const state = buildWikiState({
			records: [...records, close],
			expectedBytesByTrace: { "TRACE-state-closed": 111 },
		});

		assert.equal(state.traceBoard.traces[0].closed, true);
		assert.deepEqual(state.append?.byTrace, {});
		assert.equal(state.next.action, "wait");
	});

	it("requires trace selection for per-trace state when records span traces", () => {
		const records = [
			...traceRecords("TRACE-state-a"),
			...traceRecords("TRACE-state-b"),
		];
		const projectState = buildWikiState({ records });
		const selectedState = buildWikiState({
			records,
			traceId: "TRACE-state-b",
			expectedBytesByTrace: {
				"TRACE-state-a": 100,
				"TRACE-state-b": 200,
			},
		});

		assert.deepEqual(projectState.traceIds, ["TRACE-state-a", "TRACE-state-b"]);
		assert.equal(projectState.selectedTraceId, undefined);
		assert.equal(projectState.status, undefined);
		assert.equal(projectState.workQueue.summary.ready, 2);
		assert.equal(projectState.traceBoard.summary.needs_implementation, 2);
		assert.equal(projectState.triggers.triggers.length, 0);
		assert.equal(projectState.runtimeBoard.summary.readyWorkUnits, 2);
		assert.equal(projectState.runtimeBoard.summary.traceConflicts, 1);
		assert.equal(projectState.traceBoard.conflicts.length, 1);
		assert.equal(
			projectState.traceBoard.conflicts[0].pathScope,
			"src/project-server/queries/state.ts",
		);
		assert.equal(projectState.next.action, "wait");
		assert.equal(selectedState.selectedTraceId, "TRACE-state-b");
		assert.equal(selectedState.workPlan?.cards[0].id, "WU-state");
		assert.equal(
			selectedState.append?.byTrace["TRACE-state-b"].expectedBytes,
			200,
		);
		assert.equal(selectedState.next.tool, undefined);
		assert.throws(
			() => buildWikiState({ records, traceId: "TRACE-state-missing" }),
			/Unknown trace id/,
		);
	});
});


const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-change-dashboard-"));
	roots.push(root);
	return root;
}

async function appState(root) {
	const records = await readProjectTraceRecords(root);
	return buildCodewikiAppState(
		buildWikiState({ records }),
		root,
		records,
		{
			changes: await loadProjectServerChangesState(root),
		},
	);
}

describe("Change-rooted App state", () => {
	it("projects one Pipeline Card for one Change Trace across approval", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const pending = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-dashboard-journey" }),
		);
		const created = await store.write({
			expectedHead: null,
			records: [pending],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: pending.change.provenance.createdAt,
		});

		const before = await appState(root);
		assert.equal(before.summary.pipeline, 1);
		assert.equal(before.summary.backlog, 1);
		assert.equal(before.pipelineQueue.length, 1);
		assert.deepEqual(before.pipelineQueue[0].changeIds, [pending.change.id]);
		assert.deepEqual(before.pipelineQueue[0].workGraphDeltaIds, []);
		assert.equal(before.pipelineQueue[0].stage, "decision");
		assert.equal(before.pipelineQueue[0].status, "needs_decision");
		assert.equal(before.pipelineQueue[0].blockerCount, 0);
		assert.equal(before.pipelineQueue[0].progress, 30);

		const approved = acceptChangeRecord(pending, {
			changedBy: "maintainer",
			changedAt: "2026-08-01T03:01:00.000Z",
			authority: "user",
			ref: "approval:CHG-dashboard-journey:1",
		});
		await store.write({
			expectedHead: created.head,
			records: [approved],
			message: "Approve exact Change",
			actor: "maintainer",
			createdAt: "2026-08-01T03:01:00.000Z",
		});

		const after = await appState(root);
		assert.equal(after.summary.pipeline, 1);
		assert.equal(after.summary.backlog, 0);
		assert.equal(after.pipelineQueue.length, 1);
		assert.equal(after.pipelineQueue[0].stage, "planning");
		assert.equal(after.pipelineQueue[0].status, "needs_planning");
		assert.equal(after.pipelineQueue[0].progress, 40);
		assert.match(after.pipelineQueue[0].currentAction, /current Work Graph/);
	});
});
