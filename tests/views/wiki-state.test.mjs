import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildWikiState, wikiStateSourceOwner } from "../../src/api/state.ts";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { parseSourceMapYaml } from "../../src/knowledge/source-map.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function approvedDecisionRef(events) {
	const iteration = events.find(
		(event) => event.event === "decision.iteration",
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
				desiredState: "State reads project traces and source-map inputs.",
				rationale: "Views are disposable projections, not truth.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/api-vnext-tools.md"],
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
				acceptance: ["State derives from traces and source-map."],
				componentRefs: ["api"],
				pathScopes: ["src/api/state.ts"],
				verification: ["tests/views/wiki-state.test.mjs"],
			},
		],
	});
	return [head, ...decision.traceEvents, ...plan.traceEvents];
}

describe("wiki_state core facade", () => {
	it("creates view-shaped state from trace records and source-map inputs", () => {
		const sourceMap = parseSourceMapYaml(
			readFileSync(".codewiki/kb/system/source-map.yaml", "utf8"),
		);
		const state = buildWikiState({
			records: traceRecords(),
			generatedAt: "2026-06-11T00:00:03.000Z",
			sourceMap,
			sourcePaths: ["src/views/status.ts", "src/missing.ts"],
		});

		assert.deepEqual(state.traceIds, ["TRACE-state"]);
		assert.equal(state.selectedTraceId, "TRACE-state");
		assert.equal(state.status?.currentLoop, "implementation");
		assert.equal(
			state.resume?.nextAction,
			"Implement planned work unit WU-state.",
		);
		assert.equal(state.workPlan?.cards[0].id, "WU-state");
		assert.equal(state.workQueue.summary.ready, 1);
		assert.equal(state.sourceOwners[0].componentId, "views");
		assert.equal(state.sourceOwners[0].doc, ".codewiki/kb/system/traces.md");
		assert.deepEqual(state.sourceOwners[1].sourcePatterns, []);
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
		});

		assert.deepEqual(projectState.traceIds, ["TRACE-state-a", "TRACE-state-b"]);
		assert.equal(projectState.selectedTraceId, undefined);
		assert.equal(projectState.status, undefined);
		assert.equal(projectState.workQueue.summary.ready, 2);
		assert.equal(selectedState.selectedTraceId, "TRACE-state-b");
		assert.equal(selectedState.workPlan?.cards[0].id, "WU-state");
		assert.throws(
			() => buildWikiState({ records, traceId: "TRACE-state-missing" }),
			/Unknown trace id/,
		);
	});

	it("answers source ownership directly from source-map", () => {
		const sourceMap = parseSourceMapYaml(
			readFileSync(".codewiki/kb/system/source-map.yaml", "utf8"),
		);
		const owner = wikiStateSourceOwner(sourceMap, "src/api/state.ts");

		assert.equal(owner.componentId, "api");
		assert.equal(owner.doc, ".codewiki/kb/system/api.md");
		assert.equal(owner.sourcePatterns.includes("src/api/**"), true);
	});
});
