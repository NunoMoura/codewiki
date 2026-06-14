import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runImplementationIteration } from "../../src/implementation/iteration.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import {
	buildBlockersView,
	buildConflictsView,
	buildResumeView,
	buildStatusView,
	buildWorkPlanView,
	buildWorkQueueView,
	formatViewJson,
	viewFilePath,
	writeNamedView,
} from "../../src/api/views.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

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
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	return runDecisionIteration({
		traceId,
		table,
		createdAt: "2026-06-11T00:00:01.000Z",
	}).traceEvents;
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

function planningWorkEvent(events, workUnitId) {
	const iteration = events.find(
		(event) => event.event === "planning.iteration",
	);
	const item = workUnitId
		? iteration?.data?.output?.workItems?.find(
				(candidate) => candidate.id === workUnitId,
			)
		: iteration?.data?.output?.workItems?.[0];
	if (!iteration || !item) return undefined;
	return {
		...iteration,
		id: `trace:${iteration.id}#work:${item.id}`,
		event: "planning.iteration",
		refs: [...(item.decisionRefs || []), ...(item.pathScopes || [])],
		data: { ...item, workUnitId: item.id },
	};
}

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function queueTrace(traceId, options = {}) {
	const head = createTraceHead({
		traceId,
		title: options.title || traceId,
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const decisions = decisionEvents(traceId);
	const decisionRef = approvedDecisionRef(decisions);
	const configuredWorkItemInputs =
		typeof options.workItemInputs === "function"
			? options.workItemInputs(decisionRef)
			: options.workItemInputs;
	const workItemInputs = configuredWorkItemInputs || [
		{
			id: options.workUnitId || "WU-queue",
			title: options.workUnitTitle || "Queued work",
			decisionRefs: [decisionRef],
			outcome: "Queued work is executable.",
			...planningQualityFields(),
			acceptance: ["Queued work has evidence."],
			componentRefs: ["component.views"],
			pathScopes: [options.pathScope || "src/views"],
			verification: ["tests/views/views-projections.test.mjs"],
			dependsOn: options.dependsOn || [],
		},
	];
	const plan = options.unplanned
		? undefined
		: runPlanningIteration({
				traceId,
				decisionEvents: decisions,
				startSequence: nextSequence(decisions),
				createdAt: "2026-06-11T00:00:02.000Z",
				workItemInputs,
			});
	const planningEvent = plan
		? planningWorkEvent(plan.traceEvents, options.workUnitId)
		: undefined;
	const nextAfterPlan = nextSequence(plan?.traceEvents || decisions);
	const implementation = options.implemented
		? runImplementationIteration({
				traceId,
				planningEvents: plan?.traceEvents || [],
				startSequence: nextAfterPlan,
				createdAt: "2026-06-11T00:00:03.000Z",
				changeInputs: [
					{
						id: "IC-queue",
						planningRefs: [planningEvent.id],
						codePaths: ["src/views/work-queue.ts"],
						testPaths: ["tests/views/views-projections.test.mjs"],
						checkResults: [{ command: "npm test", status: "pass" }],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Queue projection test passed.",
								evidenceRefs: ["tests/views/views-projections.test.mjs"],
							},
						],
						contentProof: { workingTreeDigest: "sha256:456def" },
						...implementationQualityFields(),
					},
				],
			})
		: undefined;
	const claim = options.claimed
		? [
				{
					type: "trace_event",
					id: `${traceId}:runtime:claim:1`,
					parentId: planningEvent.id,
					traceId,
					sequence: nextAfterPlan,
					loop: "implementation",
					event: "runtime.work.claimed",
					refs: [planningEvent.id],
					createdAt: "2026-06-11T00:00:03.000Z",
					data: {
						workerId: options.workerId || "worker-1",
						...(options.claimExpiresAt
							? { expiresAt: options.claimExpiresAt }
							: {}),
					},
				},
			]
		: [];
	const release = options.released
		? [
				{
					type: "trace_event",
					id: `${traceId}:runtime:release:1`,
					parentId: planningEvent.id,
					traceId,
					sequence: nextAfterPlan + claim.length,
					loop: "implementation",
					event: "runtime.claim.released",
					refs: [planningEvent.id],
					createdAt: "2026-06-11T00:00:04.000Z",
					data: { workerId: options.workerId || "worker-1" },
				},
			]
		: [];
	return {
		head,
		decisions,
		plan,
		implementation,
		records: [
			head,
			...decisions,
			...(plan?.traceEvents || []),
			...claim,
			...release,
			...(implementation?.traceEvents || []),
		],
	};
}

function plannedTrace() {
	const traceId = "TRACE-views";
	const head = createTraceHead({
		traceId,
		title: "Migrate trace-backed views",
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	const decisions = decisionEvents(traceId);
	const decisionRef = approvedDecisionRef(decisions);
	const plan = runPlanningIteration({
		traceId,
		decisionEvents: decisions,
		startSequence: nextSequence(decisions),
		createdAt: "2026-06-11T00:00:02.000Z",
		workItemInputs: [
			{
				id: "WU-views",
				title: "Generate generated views",
				decisionRefs: [decisionRef],
				outcome:
					"Status, resume, blockers, conflicts, and work-plan views project traces.",
				...planningQualityFields(),
				acceptance: ["Views contain no durable truth."],
				componentRefs: ["component.views"],
				pathScopes: ["src/views"],
				verification: ["tests/views/views-projections.test.mjs"],
			},
		],
	});
	return {
		head,
		decisions,
		plan,
		records: [head, ...decisions, ...plan.traceEvents],
	};
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
		const planningEvent = planningWorkEvent(plan.traceEvents);
		assert.equal(workPlan.cards[0].traceRefs.includes(planningEvent.id), true);
		assert.deepEqual(workPlan.cards[0].componentRefs, ["component.views"]);
		assert.deepEqual(workPlan.cards[0].pathScopes, ["src/views"]);
		assert.equal(status.health, "yellow");
		assert.equal(status.currentLoop, "implementation");
		assert.equal(status.readyForClosure, false);
		assert.equal(resume.nextAction, "Implement planned work unit WU-views.");
	});

	it("marks work done when implementation evidence covers planning refs", () => {
		const { head, decisions, plan } = plannedTrace();
		const planningEvent = planningWorkEvent(plan.traceEvents);
		const implementation = runImplementationIteration({
			traceId: head.traceId,
			planningEvents: plan.traceEvents,
			startSequence: nextSequence(plan.traceEvents),
			createdAt: "2026-06-11T00:00:03.000Z",
			changeInputs: [
				{
					id: "IC-views",
					planningRefs: [planningEvent.id],
					codePaths: ["src/views/work-plan.ts"],
					testPaths: ["tests/views/views-projections.test.mjs"],
					checks: ["npm test"],
					checkResults: [{ command: "npm test", status: "pass" }],
					acceptanceEvidence: ["View projection tests passed."],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "View projection tests passed.",
							evidenceRefs: ["tests/views/views-projections.test.mjs"],
						},
					],
					contentProof: { workingTreeDigest: "sha256:123abc" },
					...implementationQualityFields(),
				},
			],
		});
		const records = [
			head,
			...decisions,
			...plan.traceEvents,
			...implementation.traceEvents,
		];
		const workPlan = buildWorkPlanView({ records });
		const status = buildStatusView({ records });
		const resume = buildResumeView({ records });

		assert.equal(workPlan.cards[0].status, "done");
		assert.equal(
			workPlan.cards[0].implementationRefs.includes("sha256:123abc"),
			true,
		);
		assert.equal(status.health, "green");
		assert.equal(status.readyForClosure, true);
		assert.equal(
			resume.nextAction,
			"Close trace or publish implementation evidence.",
		);
	});

	it("projects planning conflicts and route-back blockers", () => {
		const traceId = "TRACE-views-blocked";
		const head = createTraceHead({
			traceId,
			title: "Blocked view projection",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decisions = decisionEvents(traceId);
		const decisionRef = approvedDecisionRef(decisions);
		const plan = runPlanningIteration({
			traceId,
			decisionEvents: decisions,
			startSequence: nextSequence(decisions),
			workItemInputs: [
				{
					id: "WU-left",
					title: "Left change",
					decisionRefs: [decisionRef],
					outcome: "Left outcome",
					...planningQualityFields(),
					acceptance: ["Left accepted"],
					pathScopes: ["src/views"],
					verification: ["npm test"],
				},
				{
					id: "WU-right",
					title: "Right change",
					decisionRefs: [decisionRef],
					outcome: "Right outcome",
					...planningQualityFields(),
					acceptance: ["Right accepted"],
					pathScopes: ["src/views"],
					verification: ["npm test"],
				},
			],
			resolutionInputs: [
				{
					decisionRef: decisionRef,
					kind: "route-back",
					evidenceRefs: ["kb:system/traces.md"],
					owner: "architecture",
					trigger: "Need user decision.",
					rationale: "Conflicting path ownership needs route-back.",
					...decisionQualityFields(),
				},
			],
		});
		const records = [head, ...decisions, ...plan.traceEvents];
		const conflicts = buildConflictsView({ records }).conflicts;
		const blockers = buildBlockersView({ records }).blockers;
		const status = buildStatusView({ records });

		assert.deepEqual(
			conflicts.map((conflict) => conflict.pathScope),
			["src/views"],
		);
		assert.equal(
			blockers.some((blocker) => blocker.kind === "route-back"),
			true,
		);
		assert.equal(
			blockers.some((blocker) => blocker.kind === "conflict"),
			true,
		);
		assert.equal(status.health, "red");
		assert.equal(status.blockers.length, 3);
	});

	it("projects cross-trace work queue state from trace facts", () => {
		const backlog = queueTrace("TRACE-queue-backlog", { unplanned: true });
		const ready = queueTrace("TRACE-queue-ready", {
			workUnitId: "WU-ready",
		});
		const waiting = queueTrace("TRACE-queue-waiting", {
			workUnitId: "WU-waiting",
			workItemInputs: (decisionRef) => [
				{
					id: "WU-dependency",
					decisionRefs: [decisionRef],
					outcome: "Dependency is available for scheduling.",
					...planningQualityFields(),
					acceptance: ["Dependency can run first."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
				},
				{
					id: "WU-waiting",
					decisionRefs: [decisionRef],
					outcome: "Waiting work depends on another work unit.",
					...planningQualityFields(),
					acceptance: ["Waiting work waits."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					dependsOn: ["WU-dependency"],
				},
			],
		});
		const claimed = queueTrace("TRACE-queue-claimed", {
			workUnitId: "WU-claimed",
			claimed: true,
			workerId: "worker-claimed",
		});
		const done = queueTrace("TRACE-queue-done", {
			workUnitId: "WU-done",
			implemented: true,
		});
		const records = [
			...backlog.records,
			...ready.records,
			...waiting.records,
			...claimed.records,
			...done.records,
		];
		const queue = buildWorkQueueView({ records });
		const byId = Object.fromEntries(queue.items.map((item) => [item.id, item]));

		assert.equal(queue.traceIds.length, 5);
		assert.equal(queue.summary.backlog, 1);
		assert.equal(queue.summary.ready, 2);
		assert.equal(queue.summary.waiting, 1);
		assert.equal(queue.summary.claimed, 1);
		assert.equal(queue.summary.done, 1);
		assert.equal(byId["DTR-views"].status, "backlog");
		assert.equal(byId["WU-ready"].status, "ready");
		assert.equal(byId["WU-waiting"].status, "waiting");
		assert.equal(byId["WU-claimed"].status, "claimed");
		assert.equal(byId["WU-claimed"].claimedBy, "worker-claimed");
		assert.equal(byId["WU-done"].status, "done");
	});

	it("ignores expired or released runtime claims in the work queue", () => {
		const expired = queueTrace("TRACE-queue-expired", {
			workUnitId: "WU-expired",
			claimed: true,
			claimExpiresAt: "2026-06-11T00:00:04.000Z",
		});
		const released = queueTrace("TRACE-queue-released", {
			workUnitId: "WU-released",
			claimed: true,
			released: true,
		});
		const active = queueTrace("TRACE-queue-active-claim", {
			workUnitId: "WU-active-claim",
			claimed: true,
			workerId: "worker-active",
			claimExpiresAt: "2026-06-11T00:00:08.000Z",
		});
		const queue = buildWorkQueueView({
			records: [...expired.records, ...released.records, ...active.records],
			generatedAt: "2026-06-11T00:00:05.000Z",
		});
		const byId = Object.fromEntries(queue.items.map((item) => [item.id, item]));

		assert.equal(byId["WU-expired"].status, "ready");
		assert.equal(byId["WU-released"].status, "ready");
		assert.equal(byId["WU-active-claim"].status, "claimed");
		assert.equal(byId["WU-active-claim"].claimedBy, "worker-active");
		assert.equal(
			byId["WU-active-claim"].claimExpiresAt,
			"2026-06-11T00:00:08.000Z",
		);
	});

	it("formats and writes named disposable view files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-views-"));
		try {
			const view = { health: "green", blockers: [] };
			assert.equal(viewFilePath("status"), ".codewiki/views/status.json");
			assert.equal(
				viewFilePath("work-queue"),
				".codewiki/views/work-queue.json",
			);
			assert.equal(
				formatViewJson(view),
				'{\n  "health": "green",\n  "blockers": []\n}\n',
			);
			const path = await writeNamedView(root, "status", view);
			assert.equal(await readFile(path, "utf8"), formatViewJson(view));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
