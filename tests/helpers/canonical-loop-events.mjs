import { createChangeRecord } from "../../src/changes/records.ts";
import { evaluateChangeDecision } from "../../src/decision/change-quality.ts";
import { evaluatePortfolioPlanning } from "../../src/planning/portfolio-quality.ts";
import { acceptedChangeFixture } from "./accepted-change.mjs";

export function canonicalChangeInput(input = {}) {
	return input.change || input.changes?.[0] || input;
}

export function runDecisionIteration(input) {
	return canonicalDecisionIteration(input);
}

export async function runDecisionIterationWithRunner(input) {
	return canonicalDecisionIteration(input);
}

function canonicalDecisionIteration(input) {
	const source = input.changeInput?.changes?.[0] || input.changeInput;
	const change = acceptedChangeFixture({
		id: source?.id || "CHG-canonical-test",
		question: source?.question,
		currentState: source?.currentState,
		desiredState: source?.desiredState,
		rationale: source?.rationale,
		targetRefs: source?.targetRefs,
		sourceRefs: source?.sourceRefs,
		proofRefs: source?.proofRefs,
	});
	const record = createChangeRecord(change);
	const quality = evaluateChangeDecision({
		record,
		workState: { changes: [] },
		disposition: "approve",
		rationale: "Approve exact canonical test Change.",
		authority: {
			kind: "user",
			actor: "user:test",
			ref: "approval:user:test",
		},
	});
	const event = {
		type: "trace_event",
		event: "change_approved",
		id: `${input.traceId}:decision:${input.startSequence || input.baseSequence || 1}`,
		traceId: input.traceId,
		sequence: input.startSequence || input.baseSequence || 1,
		parentId: null,
		loop: "decision",
		kind: "iteration",
		status: "completed",
		createdAt: input.createdAt || "2026-01-01T00:00:00.000Z",
		refs: [`change:${change.id}`],
		data: {
			output: {
				changeRecord: record,
				decision: {
					disposition: "approve",
					rationale: "Approve exact canonical test Change.",
					authority: {
						kind: "user",
						actor: "user:test",
						ref: "approval:user:test",
					},
				},
				qualityStandards: quality.standards,
			},
			exit: { status: "exit", route: "planning", passed: true },
		},
	};
	const checkpoint = tailCheckpoint(
		event,
		"Decision approval fixture complete.",
	);
	return {
		changeInput: source,
		traceEvents: [event],
		traceRecords: [event, checkpoint],
		output: event.data.output,
		exit: event.data.exit,
	};
}

export function runPlanningIteration(input) {
	return canonicalPlanningIteration(input);
}

export async function runPlanningIterationWithRunner(input) {
	return canonicalPlanningIteration(input);
}

function canonicalPlanningIteration(input) {
	const decision = input.decisionEvents?.find(
		(event) => event.loop === "decision",
	);
	const changeId =
		decision?.data?.output?.changeRecord?.change?.id || "CHG-canonical-test";
	const sprintId = "SPR-canonical-test";
	const sourceItems = input.workItemInputs || [];
	const workItems = sourceItems.map((item, index) => ({
		id: item.id || `WI-canonical-${index + 1}`,
		sprintId,
		owningChangeId: changeId,
		contributingChangeIds: [],
		title: item.title || `Canonical work ${index + 1}`,
		outcome: item.outcome || "Implement canonical planned work.",
		technicalRequirements: item.technicalRequirements || [
			"Preserve canonical trace authority.",
		],
		acceptanceCriteria: (
			item.acceptanceCriteria ||
			item.acceptance || ["Canonical work is verified."]
		).map((criterion, criterionIndex) =>
			typeof criterion === "string"
				? {
						id: `AC-${String(criterionIndex + 1).padStart(3, "0")}`,
						text: criterion,
					}
				: criterion,
		),
		componentRefs: item.componentRefs || ["source"],
		pathScopes: item.pathScopes || ["src/**"],
		verification: item.verification || ["npm test"],
		workerProfile: item.workerProfile || "implementation",
		dependsOn: item.dependsOn || [],
		...(item.trigger ? { trigger: item.trigger } : {}),
	}));
	const sprints = [
		{
			id: sprintId,
			goal: "Execute canonical test plan.",
			participatingChangeIds: [changeId],
			workItemIds: workItems.map((item) => item.id),
			rollbackBoundary: "Revert Sprint work as one boundary.",
			dependsOn: [],
			integrationRefs: [],
		},
	];
	const quality = evaluatePortfolioPlanning({
		changeIds: [changeId],
		sprints,
		workItems: workItems.map((item) => ({
			...item,
			acceptanceCriteria: item.acceptanceCriteria.map((entry) => entry.text),
		})),
		workState: { changes: [], workItems: [], assignments: [] },
	});
	const event = {
		type: "trace_event",
		event: "work_units_created",
		id: `${input.traceId}:planning:${input.startSequence || input.baseSequence || 2}`,
		traceId: input.traceId,
		sequence: input.startSequence || input.baseSequence || 2,
		parentId: decision?.id || null,
		loop: "planning",
		kind: "iteration",
		status: "completed",
		createdAt: input.createdAt || "2026-01-01T00:00:01.000Z",
		refs: [`change:${changeId}`],
		data: {
			output: {
				epochId: "PE-canonical-test",
				participantChangeIds: [changeId],
				sprints,
				workItems,
				qualityStandards: quality.standards,
			},
			exit: { status: "exit", route: "implementation", passed: true },
		},
	};
	const checkpoint = tailCheckpoint(event, "Planning fixture complete.");
	return {
		traceEvents: [event],
		traceRecords: [event, checkpoint],
		workItems,
		output: event.data.output,
		exit: event.data.exit,
	};
}

function tailCheckpoint(event, summary) {
	return {
		type: "tail_checkpoint",
		id: `${event.id}:checkpoint`,
		parentId: event.id,
		traceId: event.traceId,
		firstKeptRecordId: event.id,
		summary,
		createdAt: event.createdAt,
		data: { loop: event.loop, exit: event.data.exit },
	};
}

export function planningQualityStandards() {
	const sample = canonicalPlanningIteration({
		traceId: "TRACE-quality-template",
		workItemInputs: [{ id: "WI-quality-template" }],
	});
	return sample.output.qualityStandards;
}
