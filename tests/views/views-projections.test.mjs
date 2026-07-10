import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createSprintProposal } from "../../src/decision/proposal.ts";
import { runImplementationIteration } from "../../src/implementation/iteration.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { createTraceCloseRecord } from "../../src/traces/retention.ts";
import {
	createTriggerRunTraceHead,
	createTraceHead,
} from "../../src/traces/writer.ts";
import {
	buildTriggersView,
	buildBlockersView,
	buildConflictsView,
	buildQualityView,
	buildResumeView,
	buildStatusView,
	buildTraceBoardView,
	buildTraceQueueView,
	buildWorkPlanView,
	buildWorkQueueView,
	formatViewJson,
	viewFilePath,
	writeNamedView,
} from "../../src/api/views.ts";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

function decisionEvents(traceId = "TRACE-views") {
	const proposal = createSprintProposal({
		id: "SP-views",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		changes: [
			{
				id: "CHG-views",
				question: "How should views represent trace state?",
				currentState: "Old graph/roadmap state owns generated status.",
				desiredState: "Generated views project trace records.",
				rationale: "Views are disposable caches.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/components/traces.md"],
			},
		],
	});
	return runDecisionIteration({
		traceId,
		proposal,
		createdAt: "2026-06-11T00:00:01.000Z",
	}).traceEvents;
}

function approvedDecisionRef(events) {
	const iteration = events.find((event) => event.loop === "decision");
	const change = iteration?.data?.output?.approvedChanges?.[0];
	assert.ok(iteration);
	assert.ok(change);
	return `trace:${iteration.id}#change:${change.id}`;
}

function directDecisionEvents(traceId = "TRACE-direct-route") {
	const proposal = createSprintProposal({
		id: "SP-direct-route",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		changes: [
			{
				id: "CHG-direct-route",
				currentState: "Small fixes require planning ceremony.",
				desiredState:
					"Small scoped fixes can route directly to implementation.",
				rationale: "The route is explicit and still trace-backed.",
				...decisionQualityFields(),
				approval: "approved",
				routeTarget: "implementation",
				routeRationale: "Low-risk, scoped, and directly verifiable.",
				implementationMode: "targeted_checks",
				directImplementationScope: {
					pathScopes: ["src/views/work-queue.ts"],
					verification: ["tests/views/views-projections.test.mjs"],
					acceptanceCriteria: [
						{
							id: "AC-DIRECT",
							text: "Direct routed work appears as implementation work.",
						},
					],
				},
				sourceRefs: ["kb:system/components/loop-contracts.md"],
			},
		],
	});
	return runDecisionIteration({
		traceId,
		proposal,
		createdAt: "2026-06-11T00:00:01.000Z",
	}).traceEvents;
}

function planningWorkEvent(events, workUnitId) {
	const iteration = events.find((event) => event.loop === "planning");
	const item = workUnitId
		? iteration?.data?.output?.workItems?.find(
				(candidate) => candidate.id === workUnitId,
			)
		: iteration?.data?.output?.workItems?.[0];
	if (!iteration || !item) return undefined;
	return {
		...iteration,
		id: `trace:${iteration.id}#work:${item.id}`,
		event: "work_units_created",
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
	const workUnitId = options.workUnitId || workItemInputs[0]?.id || "WU-queue";
	const planningEvent = plan
		? planningWorkEvent(plan.traceEvents, workUnitId)
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
	const claimId = `${traceId}:claim:${workUnitId}`;
	const planningRef =
		planningEvent?.id || `trace:${traceId}:planning#work:${workUnitId}`;
	const claim = options.claimed
		? [
				{
					type: "trace_event",
					id: `${traceId}:runtime:claim:1`,
					parentId: planningEvent.id,
					traceId,
					sequence: nextAfterPlan,
					event: "runtime.work_unit.claimed",
					refs: [planningRef],
					createdAt: "2026-06-11T00:00:03.000Z",
					data: {
						claimId,
						workerId: options.workerId || "worker-1",
						workUnitId,
						planningRefs: [planningRef],
						pathScopes: ["src/queue.ts"],
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
					parentId: claim[0]?.id || planningEvent.id,
					traceId,
					sequence: nextAfterPlan + claim.length,
					event: "runtime.work_unit.claim.released",
					refs: [planningRef],
					createdAt: "2026-06-11T00:00:04.000Z",
					data: {
						claimId,
						workerId: options.workerId || "worker-1",
						workUnitId,
						planningRefs: [planningRef],
					},
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

function runTrace(input) {
	const head = createTriggerRunTraceHead({
		traceId: input.traceId,
		title: input.title || input.traceId,
		triggerTraceId: input.triggerTraceId,
		triggerId: input.triggerId,
		planningRef: input.planningRef,
		runKey: input.runKey,
		createdAt: "2026-06-11T00:00:04.000Z",
	});
	const decisions = decisionEvents(input.traceId);
	const decisionRef = approvedDecisionRef(decisions);
	const plan = runPlanningIteration({
		traceId: input.traceId,
		decisionEvents: decisions,
		startSequence: nextSequence(decisions),
		createdAt: "2026-06-11T00:00:05.000Z",
		workItemInputs: [
			{
				id: "WU-run",
				title: "Run run",
				decisionRefs: [decisionRef],
				outcome: "Run work completes.",
				...planningQualityFields(),
				acceptance: ["Run evidence exists."],
				componentRefs: ["component.views"],
				pathScopes: ["src/views"],
				verification: ["tests/views/views-projections.test.mjs"],
			},
		],
	});
	const planningEvent = planningWorkEvent(plan.traceEvents);
	const implementation = runImplementationIteration({
		traceId: input.traceId,
		planningEvents: plan.traceEvents,
		startSequence: nextSequence(plan.traceEvents),
		createdAt: "2026-06-11T00:00:06.000Z",
		changeInputs: [
			{
				id: "IC-run",
				planningRefs: [planningEvent.id],
				codePaths: ["src/views/triggers.ts"],
				testPaths: ["tests/views/views-projections.test.mjs"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Run evidence passed.",
						evidenceRefs: ["tests/views/views-projections.test.mjs"],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abcdef" },
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
	return {
		records,
		close: createTraceCloseRecord({
			records,
			gitRestoreRef: `refs/codewiki/archive/${input.traceId}`,
			createdAt: "2026-06-11T00:00:07.000Z",
		}),
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
	it("projects run lineage into status and trace-board views", () => {
		const head = createTriggerRunTraceHead({
			traceId: "TRACE-lineage-view",
			title: "Lineage run",
			triggerTraceId: "TRACE-lineage-trigger",
			triggerId: "TRG-lineage",
			planningRef:
				"trace:TRACE-lineage-trigger:planning:iteration:1#work:WU-lineage",
			runKey: "lineage:1",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const input = {
			records: [head],
			generatedAt: "2026-06-11T00:00:01.000Z",
		};
		const status = buildStatusView(input);
		const board = buildTraceBoardView(input);

		assert.equal(status.origin.kind, "trigger_run");
		assert.equal(status.origin.triggerTraceId, "TRACE-lineage-trigger");
		assert.equal(board.traces[0].origin.triggerId, "TRG-lineage");
		assert.equal(board.traces[0].status, "needs_decision");
	});

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

	it("projects direct implementation decisions as implementation work", () => {
		const head = createTraceHead({
			traceId: "TRACE-direct-route",
			title: "Direct route",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const decisions = directDecisionEvents("TRACE-direct-route");
		const input = {
			records: [head, ...decisions],
			generatedAt: "2026-06-11T00:00:03.000Z",
		};
		const workPlan = buildWorkPlanView(input);
		const workQueue = buildWorkQueueView(input);
		const status = buildStatusView(input);

		assert.equal(workPlan.cards[0].id, "CHG-direct-route");
		assert.equal(workPlan.cards[0].status, "todo");
		assert.equal(workQueue.items[0].kind, "work-unit");
		assert.equal(workQueue.items[0].status, "ready");
		assert.equal(status.currentLoop, "implementation");
	});

	it("projects triggers with enabled and run state", () => {
		const plannedTrace = queueTrace("TRACE-trigger-planned", {
			workItemInputs: (decisionRef) => [
				{
					id: "WU-trigger-planned",
					title: "Trigger planned work",
					decisionRefs: [decisionRef],
					outcome: "Trigger is planned.",
					...planningQualityFields(),
					acceptance: ["Trigger is planned."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					trigger: {
						id: "TRG-planned",
						kind: "schedule",
						runMode: "new_trace",
						concurrency: "skip_if_active",
						runKeyTemplate: "planned:${date}",
						owner: "implementation",
						trigger: "cron:0 9 * * 1",
						refs: ["kb:system/components/runtime.md"],
					},
				},
			],
		});
		const enabledTrace = queueTrace("TRACE-trigger-enabled", {
			implemented: true,
			workItemInputs: (decisionRef) => [
				{
					id: "WU-trigger-enabled",
					title: "Trigger enabled work",
					decisionRefs: [decisionRef],
					outcome: "Trigger is enabled.",
					...planningQualityFields(),
					acceptance: ["Trigger is enabled."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					trigger: {
						id: "TRG-enabled",
						kind: "trigger",
						runMode: "new_trace",
						concurrency: "queue",
						runKeyTemplate: "enabled:${event}",
						owner: "implementation",
						trigger: "github:check.failed",
						refs: ["kb:system/components/runtime.md"],
					},
				},
			],
		});
		const enabledOnlyTrace = queueTrace("TRACE-trigger-enabled-only", {
			implemented: true,
			workItemInputs: (decisionRef) => [
				{
					id: "WU-trigger-enabled-only",
					title: "Trigger enabled-only work",
					decisionRefs: [decisionRef],
					outcome: "Trigger is enabled without runs.",
					...planningQualityFields(),
					acceptance: ["Trigger is enabled."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					trigger: {
						id: "TRG-enabled-only",
						kind: "manual",
						runMode: "new_trace",
						concurrency: "replace",
						runKeyTemplate: "enabled-only:${manual}",
						owner: "implementation",
						trigger: "manual:runtime",
						refs: ["kb:system/components/runtime.md"],
					},
				},
			],
		});
		const enabledPlanningRef = planningWorkEvent(
			enabledTrace.plan.traceEvents,
		).id;
		const activeRun = createTriggerRunTraceHead({
			traceId: "TRACE-trigger-active-run",
			title: "Active run",
			triggerTraceId: "TRACE-trigger-enabled",
			triggerId: "TRG-enabled",
			planningRef: enabledPlanningRef,
			runKey: "enabled:event-1",
			createdAt: "2026-06-11T00:00:04.000Z",
		});
		const completedRun = runTrace({
			traceId: "TRACE-trigger-completed-run",
			triggerTraceId: "TRACE-trigger-enabled",
			triggerId: "TRG-enabled",
			planningRef: enabledPlanningRef,
			runKey: "enabled:event-0",
		});
		const view = buildTriggersView({
			records: [
				...plannedTrace.records,
				...enabledTrace.records,
				...enabledOnlyTrace.records,
				activeRun,
				...completedRun.records,
				completedRun.close,
			],
			generatedAt: "2026-06-11T00:00:08.000Z",
		});
		const byId = Object.fromEntries(
			view.triggers.map((trigger) => [trigger.id, trigger]),
		);

		assert.equal(byId["TRG-planned"].status, "planned");
		assert.equal(byId["TRG-enabled-only"].status, "enabled");
		assert.equal(byId["TRG-enabled"].status, "active");
		assert.equal(byId["TRG-enabled"].enabledBy.length > 0, true);
		assert.equal(byId["TRG-enabled"].runs.length, 2);
		assert.equal(
			byId["TRG-enabled"].runs.some((run) => run.status === "closed_complete"),
			true,
		);
		assert.deepEqual(view.summary, {
			planned: 1,
			enabled: 1,
			due: 0,
			active: 1,
			completed: 0,
			blocked: 0,
			disabled: 0,
		});
	});

	it("marks enabled scheduled triggers due when current run is missing", () => {
		const trace = queueTrace("TRACE-trigger-due", {
			implemented: true,
			workItemInputs: (decisionRef) => [
				{
					id: "WU-trigger-due",
					title: "Due trigger work",
					decisionRefs: [decisionRef],
					outcome: "Trigger becomes due on schedule.",
					...planningQualityFields(),
					acceptance: ["Trigger due state is projected."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					trigger: {
						id: "TRG-due",
						kind: "schedule",
						runMode: "new_trace",
						concurrency: "skip_if_active",
						runKeyTemplate: "due:${week}",
						owner: "implementation",
						trigger: "cron:0 9 * * 1",
						refs: ["kb:system/components/runtime.md"],
					},
				},
			],
		});
		const planningRef = planningWorkEvent(trace.plan.traceEvents).id;
		const dueView = buildTriggersView({
			records: trace.records,
			generatedAt: "2026-06-15T10:00:00.000Z",
		});
		const earlyView = buildTriggersView({
			records: trace.records,
			generatedAt: "2026-06-11T04:00:00.000Z",
		});
		const currentRun = runTrace({
			traceId: "TRACE-trigger-due-run",
			triggerTraceId: "TRACE-trigger-due",
			triggerId: "TRG-due",
			planningRef,
			runKey: "due:2026-W25",
		});
		const coveredView = buildTriggersView({
			records: [...trace.records, ...currentRun.records, currentRun.close],
			generatedAt: "2026-06-15T10:00:00.000Z",
		});

		assert.equal(dueView.triggers[0].status, "due");
		assert.equal(dueView.triggers[0].due.status, "due");
		assert.equal(dueView.triggers[0].due.runKey, "due:2026-W25");
		assert.equal(dueView.triggers[0].due.scheduledAt, "2026-06-15T09:00Z");
		assert.equal(earlyView.triggers[0].status, "enabled");
		assert.equal(earlyView.triggers[0].due.reason, "before_enabled");
		assert.equal(coveredView.triggers[0].status, "enabled");
		assert.equal(coveredView.triggers[0].due.reason, "run_exists");
	});

	it("projects planning triggers into work-plan and work-queue views", () => {
		const trace = queueTrace("TRACE-trigger-view", {
			workItemInputs: (decisionRef) => [
				{
					id: "WU-trigger-view",
					title: "Trigger view work",
					decisionRefs: [decisionRef],
					outcome: "Trigger is visible to runtime views.",
					...planningQualityFields(),
					acceptance: ["Trigger is projected."],
					componentRefs: ["component.views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
					trigger: {
						id: "TRG-view",
						kind: "trigger",
						runMode: "new_trace",
						concurrency: "queue",
						runKeyTemplate: "view:${event}",
						owner: "implementation",
						trigger: "github:check.failed",
						refs: ["kb:system/components/runtime.md"],
					},
				},
			],
		});
		const input = {
			records: trace.records,
			generatedAt: "2026-06-11T00:00:03.000Z",
		};
		const workPlan = buildWorkPlanView(input);
		const workQueue = buildWorkQueueView(input);

		assert.equal(workPlan.cards[0].trigger.id, "TRG-view");
		assert.equal(workPlan.cards[0].trigger.kind, "trigger");
		assert.equal(workQueue.items[0].trigger.id, "TRG-view");
		assert.equal(workQueue.items[0].trigger.concurrency, "queue");
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

	it("uses latest planning exit for close readiness when a plan is superseded", () => {
		const { head, decisions, plan } = plannedTrace(
			"TRACE-views-plan-superseded",
		);
		const decisionRef = approvedDecisionRef(decisions);
		const correctedPlan = runPlanningIteration({
			traceId: head.traceId,
			decisionEvents: decisions,
			startSequence: nextSequence([...decisions, ...plan.traceEvents]),
			workItemInputs: [
				{
					id: "WU-corrected",
					title: "Corrected view work",
					decisionRefs: [decisionRef],
					outcome: "Corrected planning work is implemented.",
					...planningQualityFields(),
					acceptance: ["Corrected plan is covered."],
					componentRefs: ["views"],
					pathScopes: ["src/views"],
					verification: ["tests/views/views-projections.test.mjs"],
				},
			],
		});
		const planningEvent = planningWorkEvent(
			correctedPlan.traceEvents,
			"WU-corrected",
		);
		const implementation = runImplementationIteration({
			traceId: head.traceId,
			planningEvents: correctedPlan.traceEvents,
			startSequence: nextSequence([
				...decisions,
				...plan.traceEvents,
				...correctedPlan.traceEvents,
			]),
			changeInputs: [
				{
					id: "IC-corrected",
					planningRefs: [planningEvent.id],
					codePaths: ["src/views/trace-goals.ts"],
					testPaths: ["tests/views/views-projections.test.mjs"],
					checks: ["npm test"],
					checkResults: [{ command: "npm test", status: "pass" }],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Corrected plan is covered.",
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
			...correctedPlan.traceEvents,
			...implementation.traceEvents,
		];
		const status = buildStatusView({ records });
		const workPlan = buildWorkPlanView({ records });

		assert.equal(status.readyForClosure, true);
		assert.equal(status.goalStatus, "finished");
		assert.equal(
			status.blockers.some((blocker) => blocker.includes("WU-views")),
			false,
		);
		assert.deepEqual(
			workPlan.cards.map((card) => card.id),
			["WU-corrected"],
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
					evidenceRefs: ["kb:system/components/traces.md"],
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
		assert.equal(status.blockers.length, 4);
		assert.equal(status.qualityBlockers.length, 1);
	});

	it("treats closed traces as terminal and flags incomplete goals", () => {
		const trace = queueTrace("TRACE-queue-closed", {
			workUnitId: "WU-closed",
		});
		const close = createTraceCloseRecord({
			records: trace.records,
			gitRestoreRef: "refs/codewiki/archive/TRACE-queue-closed",
			reason: "Trace finished and retained.",
			createdAt: "2026-06-11T00:00:05.000Z",
			allowIncomplete: true,
		});
		const records = [...trace.records, close];
		const status = buildStatusView({ records });
		const resume = buildResumeView({ records });
		const queue = buildWorkQueueView({ records });

		assert.equal(status.closed, true);
		assert.equal(status.closedAt, "2026-06-11T00:00:05.000Z");
		assert.equal(status.health, "red");
		assert.equal(status.goalStatus, "closed_incomplete");
		assert.equal(status.currentLoop, null);
		assert.equal(status.readyForClosure, false);
		assert.equal(resume.closed, true);
		assert.equal(resume.nextAction, "Trace is closed.");
		assert.deepEqual(queue.traceIds, []);
		assert.deepEqual(queue.items, []);
		assert.deepEqual(queue.summary, {
			backlog: 0,
			waiting: 0,
			ready: 0,
			claimed: 0,
			blocked: 0,
			done: 0,
		});
	});

	it("projects quality standards for all semantic loops", () => {
		const trace = queueTrace("TRACE-quality-all", {
			workUnitId: "WU-quality-all",
			implemented: true,
		});
		const decision = trace.records.find((record) => record.loop === "decision");
		const implementation = trace.records.find(
			(record) => record.loop === "implementation",
		);
		decision.data.output.qualityStandards =
			decision.data.output.qualityStandards.map((standard) => {
				if (standard.id === "sprint_proposal_ready") {
					const legacy = {
						...standard,
						description:
							"Sprint Proposal has at least one approved change and stable change ids.",
					};
					delete legacy.layer;
					delete legacy.standardType;
					delete legacy.gate;
					return legacy;
				}
				return standard.id === "knowledge_impact_accounted"
					? {
							...standard,
							status: "unmet",
							message: "Decision knowledge impact is incomplete.",
							refs: ["CHG-views"],
						}
					: standard;
			});
		implementation.data.output.qualityStandards =
			implementation.data.output.qualityStandards.map((standard) =>
				standard.id === "release_safety_approved"
					? {
							...standard,
							status: "blocked",
							message: "User approval required before release.",
							refs: ["IC-queue"],
						}
					: standard,
			);
		const input = { records: trace.records };
		const quality = buildQualityView(input);
		const status = buildStatusView(input);
		const resume = buildResumeView(input);

		assert.equal(quality.iterations.length, 3);
		const sprintProposalReady = quality.iterations[0].standards.find(
			(standard) => standard.id === "sprint_proposal_ready",
		);
		assert.equal(sprintProposalReady.layer, "input_contract");
		assert.equal(sprintProposalReady.standardType, "loop_contract");
		assert.equal(sprintProposalReady.gate, "hard");
		assert.doesNotMatch(sprintProposalReady.description, /approved change/i);
		assert.equal(quality.summary.decision.unmet, 1);
		assert.equal(quality.summary.implementation.blocked, 1);
		assert.equal(
			quality.blockers.includes("User approval required before release."),
			true,
		);
		assert.equal(status.health, "red");
		assert.equal(status.readyForClosure, false);
		assert.equal(status.quality?.summary.implementation.blocked, 1);
		assert.equal(resume.quality?.summary.decision.unmet, 1);
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
		assert.equal(byId["CHG-views"].status, "backlog");
		assert.equal(byId["WU-ready"].status, "ready");
		assert.equal(byId["WU-waiting"].status, "waiting");
		assert.equal(byId["WU-claimed"].status, "claimed");
		assert.equal(byId["WU-claimed"].claimedBy, "worker-claimed");
		assert.equal(byId["WU-done"].status, "done");
	});

	it("projects trace queue cards as one card per trace with change subitems", () => {
		const ready = queueTrace("TRACE-card-ready", {
			workUnitId: "WU-card-ready",
		});
		const backlog = queueTrace("TRACE-card-backlog", { unplanned: true });
		const queue = buildTraceQueueView({
			records: [...ready.records, ...backlog.records],
		});
		const byTrace = Object.fromEntries(
			queue.cards.map((card) => [card.traceId, card]),
		);

		assert.equal(queue.cards.length, 2);
		assert.equal(byTrace["TRACE-card-ready"].rowCount, 1);
		assert.equal(byTrace["TRACE-card-ready"].items.length, 1);
		assert.equal(byTrace["TRACE-card-ready"].nextLoop, "implementation");
		assert.equal(byTrace["TRACE-card-backlog"].rowCount, 1);
		assert.equal(byTrace["TRACE-card-backlog"].items.length, 1);
		assert.equal(byTrace["TRACE-card-backlog"].nextLoop, "planning");
	});

	it("exposes planning quality blockers in views", () => {
		const trace = queueTrace("TRACE-queue-quality", {
			workUnitId: "WU-quality",
		});
		const planning = trace.records.find((record) => record.loop === "planning");
		planning.data.output.qualityStandards =
			planning.data.output.qualityStandards.map((standard) =>
				standard.id === "uncertainty_resolved"
					? {
							...standard,
							status: "blocked",
							mode: "user",
							message: "User must resolve planning uncertainty.",
							refs: ["WU-quality"],
						}
					: standard,
			);
		const input = { records: trace.records };
		const queue = buildWorkQueueView(input);
		const workPlan = buildWorkPlanView(input);
		const status = buildStatusView(input);
		const resume = buildResumeView(input);
		const queuedWork = queue.items.find((item) => item.id === "WU-quality");

		assert.equal(queuedWork.status, "blocked");
		assert.equal(queuedWork.qualityBlockers.length, 1);
		assert.equal(workPlan.cards[0].status, "blocked");
		assert.equal(
			workPlan.cards[0].qualityStandards.some(
				(standard) => standard.status === "blocked",
			),
			true,
		);
		assert.equal(status.qualityBlockers.length, 1);
		assert.equal(resume.qualityBlockers.length, 1);
		assert.equal(resume.nextAction.startsWith("Resolve blocker:"), true);
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
				viewFilePath("trace-board"),
				".codewiki/views/trace-board.json",
			);
			assert.equal(viewFilePath("triggers"), ".codewiki/views/triggers.json");
			assert.equal(
				viewFilePath("runtime-board"),
				".codewiki/views/runtime-board.json",
			);
			assert.equal(viewFilePath("quality"), ".codewiki/views/quality.json");
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
