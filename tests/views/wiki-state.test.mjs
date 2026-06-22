import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWikiState } from "../../src/api/state.ts";
import { createTraceCloseRecord } from "../../src/traces/retention.ts";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function approvedDecisionRef(events) {
	const iteration = events.find(
		(event) => event.loop === "decision",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function traceRecords(traceId = "TRACE-state") {
	const head = createTraceHead({
		traceId,
		title: "Read wiki state from traces",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const table = createDecisionTable({
		id: `${traceId}-DT`,
		createdAt: "2026-06-11T00:00:01.000Z",
		updatedAt: "2026-06-11T00:00:01.000Z",
		rows: [
			{
				id: "DTR-state",
				question: "How should state be read?",
				currentState: "State reads could depend on stored view files.",
				desiredState: "State reads active project traces.",
				rationale: "Views are disposable projections, not truth.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/api-tools.md"],
			},
		],
	});
	const decision = runDecisionIteration({
		traceId,
		table,
		createdAt: "2026-06-11T00:00:01.000Z",
	});
	const decisionRef = approvedDecisionRef(decision.traceEvents);
	const plan = runPlanningIteration({
		traceId,
		decisionEvents: decision.traceEvents,
		startSequence: nextSequence(decision.traceEvents),
		createdAt: "2026-06-11T00:00:02.000Z",
		workItemInputs: [
			{
				id: "WU-state",
				title: "Create wiki_state facade",
				decisionRefs: [decisionRef],
				outcome: "wiki_state returns derived projections.",
				...planningQualityFields(),
				acceptance: ["State derives from trace records."],
				componentRefs: ["api"],
				pathScopes: ["src/api/state.ts"],
				verification: ["tests/views/wiki-state.test.mjs"],
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
		assert.equal(state.quality?.summary.planning.met, 13);
		assert.equal(state.workQueue.summary.ready, 1);
		assert.equal(state.traceBoard.summary.needs_implementation, 1);
		assert.equal(state.traceBoard.traces[0].status, "needs_implementation");
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
			tool: "wiki_implement",
			workUnitId: "WU-state",
		});
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
			"src/api/state.ts",
		);
		assert.equal(projectState.next.action, "wait");
		assert.equal(selectedState.selectedTraceId, "TRACE-state-b");
		assert.equal(selectedState.workPlan?.cards[0].id, "WU-state");
		assert.equal(
			selectedState.append?.byTrace["TRACE-state-b"].expectedBytes,
			200,
		);
		assert.equal(selectedState.next.tool, "wiki_implement");
		assert.throws(
			() => buildWikiState({ records, traceId: "TRACE-state-missing" }),
			/Unknown trace id/,
		);
	});
});
