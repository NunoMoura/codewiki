import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { compileDecision } from "../../src/decision/compiler.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { compileImplementation } from "../../src/implementation/compiler.ts";
import { compilePlan } from "../../src/planning/compiler.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import {
	buildBlockersView,
	buildConflictsView,
	buildResumeView,
	buildStatusView,
	buildWorkPlanView,
	formatViewJson,
	viewFilePath,
	writeNamedView,
} from "../../src/api/views.ts";

function decisionEvents(traceId = "TRACE-views") {
	const table = createDecisionTable({
		id: "DT-views",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		rows: [
			{
				id: "DTR-views",
				question: "How should views represent trace state?",
				currentState: "Old graph/roadmap state owns generated status.",
				desiredState: "Generated views project trace records.",
				rationale: "Views are disposable caches.",
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	return compileDecision({
		traceId,
		table,
		createdAt: "2026-06-11T00:00:01.000Z",
	}).traceEvents;
}

function plannedTrace() {
	const traceId = "TRACE-views";
	const head = createTraceHead({
		traceId,
		title: "Migrate trace-backed views",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const decisions = decisionEvents(traceId);
	const plan = compilePlan({
		traceId,
		decisionEvents: decisions,
		startSequence: 2,
		createdAt: "2026-06-11T00:00:02.000Z",
		workItemInputs: [
			{
				id: "WU-views",
				title: "Build generated views",
				decisionRefs: [decisions[0].id],
				outcome: "Status, resume, blockers, conflicts, and work-plan views project traces.",
				acceptance: ["Views contain no durable truth."],
				pathScopes: ["src/views"],
				verification: ["tests/views/views-projections.test.mjs"],
			},
		],
	});
	return { head, decisions, plan, records: [head, ...decisions, ...plan.traceEvents] };
}

describe("trace-backed views", () => {
	it("projects planned trace work into work-plan, status, and resume views", () => {
		const { records, plan } = plannedTrace();
		const input = { records, generatedAt: "2026-06-11T00:00:03.000Z" };
		const workPlan = buildWorkPlanView(input);
		const status = buildStatusView(input);
		const resume = buildResumeView(input);

		assert.equal(workPlan.traceId, "TRACE-views");
		assert.equal(workPlan.cards[0].id, "WU-views");
		assert.equal(workPlan.cards[0].status, "todo");
		assert.equal(workPlan.cards[0].traceRefs.includes(plan.traceEvents[0].id), true);
		assert.deepEqual(workPlan.cards[0].pathScopes, ["src/views"]);
		assert.equal(status.health, "yellow");
		assert.equal(status.currentLoop, "implementation");
		assert.equal(status.readyForClosure, false);
		assert.equal(resume.nextAction, "Implement planned work unit WU-views.");
	});

	it("marks work done when implementation evidence covers planning refs", () => {
		const { head, decisions, plan } = plannedTrace();
		const implementation = compileImplementation({
			traceId: head.traceId,
			planningEvents: plan.traceEvents,
			startSequence: 3,
			createdAt: "2026-06-11T00:00:03.000Z",
			changeInputs: [
				{
					id: "IC-views",
					planningRefs: [plan.traceEvents[0].id],
					codePaths: ["src/views/work-plan.ts"],
					testPaths: ["tests/views/views-projections.test.mjs"],
					checks: ["npm test"],
					acceptanceEvidence: ["View projection tests passed."],
					contentProof: { workingTreeDigest: "sha256:views" },
				},
			],
		});
		const records = [head, ...decisions, ...plan.traceEvents, ...implementation.traceEvents];
		const workPlan = buildWorkPlanView({ records });
		const status = buildStatusView({ records });
		const resume = buildResumeView({ records });

		assert.equal(workPlan.cards[0].status, "done");
		assert.equal(workPlan.cards[0].implementationRefs.includes("sha256:views"), true);
		assert.equal(status.health, "green");
		assert.equal(status.readyForClosure, true);
		assert.equal(resume.nextAction, "Close trace or publish implementation evidence.");
	});

	it("projects planning conflicts and route-back blockers", () => {
		const traceId = "TRACE-views-blocked";
		const head = createTraceHead({
			traceId,
			title: "Blocked view projection",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decisions = decisionEvents(traceId);
		const plan = compilePlan({
			traceId,
			decisionEvents: decisions,
			startSequence: 2,
			workItemInputs: [
				{
					id: "WU-left",
					title: "Left change",
					decisionRefs: [decisions[0].id],
					outcome: "Left outcome",
					acceptance: ["Left accepted"],
					pathScopes: ["src/views"],
					verification: ["npm test"],
				},
				{
					id: "WU-right",
					title: "Right change",
					decisionRefs: [decisions[0].id],
					outcome: "Right outcome",
					acceptance: ["Right accepted"],
					pathScopes: ["src/views"],
					verification: ["npm test"],
				},
			],
			resolutionInputs: [
				{
					decisionRef: decisions[0].id,
					kind: "route-back",
					evidenceRefs: ["kb:system/traces.md"],
					owner: "architecture",
					trigger: "Need user decision.",
					rationale: "Conflicting path ownership needs route-back.",
				},
			],
		});
		const records = [head, ...decisions, ...plan.traceEvents];
		const conflicts = buildConflictsView({ records }).conflicts;
		const blockers = buildBlockersView({ records }).blockers;
		const status = buildStatusView({ records });

		assert.deepEqual(conflicts.map((conflict) => conflict.pathScope), ["src/views"]);
		assert.equal(blockers.some((blocker) => blocker.kind === "route-back"), true);
		assert.equal(blockers.some((blocker) => blocker.kind === "conflict"), true);
		assert.equal(status.health, "red");
		assert.equal(status.blockers.length, 2);
	});

	it("formats and writes named disposable view files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-views-"));
		try {
			const view = { health: "green", blockers: [] };
			assert.equal(viewFilePath("status"), ".codewiki/views/status.json");
			assert.equal(formatViewJson(view), '{\n  "health": "green",\n  "blockers": []\n}\n');
			const path = await writeNamedView(root, "status", view);
			assert.equal(await readFile(path, "utf8"), formatViewJson(view));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
