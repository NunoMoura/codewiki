import {
	createInitialProjectWorkState,
	createManifestForRecords,
	createNextChangeOperation,
	createChangeRevision,
	createPlanningEpochRecord,
	reduceAcceptedStateBatch,
	reduceChangeOperation,
} from "../../src/change-trace/index.ts";
import {authorityBinding, digest, gitObject} from "./change-trace-v1.mjs";

export const allowAllReplayPolicy = Object.freeze({
	authorize: () => true,
	acceptSnapshot: () => true,
});

export function baseSnapshotFor(state) {
	return {
		remoteStateHead: state.stateHead,
		sourceHead: gitObject("2"),
		knowledgeDigest: digest("3"),
		configDigest: digest("4"),
		policyDigest: digest("5"),
	};
}

export function revisionFor(changeId) {
	return createChangeRevision({
		title: `Execute ${changeId}`,
		summary: `Apply accepted intent for ${changeId}.`,
		desiredOutcome: `Produce deterministic accepted state for ${changeId}.`,
		acceptanceRequirements: [
			{id: "accepted", statement: "Required evidence and checks are exact."},
		],
		constraints: ["No compatibility path."],
		nonGoals: ["No mutable status setter."],
		knowledgeRefs: ["kb:system/traces"],
		sourceRefs: ["src/change-trace"],
		risk: "moderate",
	});
}

export function buildOperationSequence({
	change = null,
	changeId,
	baseSnapshot,
	authority = authorityBinding(),
	specifications,
	planningEpochs = [],
}) {
	let projected = change;
	const operations = [];
	for (const specification of specifications) {
		const payload =
			typeof specification.payload === "function"
				? specification.payload({change: projected, operations})
				: specification.payload;
		const operation = createNextChangeOperation(projected, {
			changeId,
			kind: specification.kind,
			baseSnapshot,
			authorityBinding: specification.authorityBinding ?? authority,
			recordedAt: specification.recordedAt,
			payload,
			...(specification.additionalParents
				? {additionalParents: specification.additionalParents}
				: {}),
		});
		projected = reduceChangeOperation(projected, operation, {planningEpochs});
		operations.push(operation);
	}
	return {change: projected, operations};
}

export function acceptedBatch(state, records, stateHead) {
	return {
		stateHead,
		manifest: createManifestForRecords(state, records),
		records,
	};
}

export function reduceBatch(
	state,
	records,
	stateHead,
	policy = allowAllReplayPolicy,
) {
	return reduceAcceptedStateBatch(
		state,
		acceptedBatch(state, records, stateHead),
		policy,
	);
}

export function openProposedChange(state, changeId, stateHead = gitObject("a")) {
	const revision = revisionFor(changeId);
	const built = buildOperationSequence({
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		specifications: [
			{
				kind: "trace.opened",
				recordedAt: "2026-07-30T13:00:00.000Z",
				payload: {origin: "user", provenanceRefs: [`request:${changeId}`]},
			},
			{
				kind: "change.proposed",
				recordedAt: "2026-07-30T13:00:01.000Z",
				payload: {
					revision,
					provenance: {kind: "user", refs: [`request:${changeId}`]},
				},
			},
		],
	});
	return {
		revision,
		operations: built.operations,
		change: built.change,
		state: reduceBatch(state, built.operations, stateHead),
	};
}

export function objectBinding(id, character) {
	return {
		id,
		digest: digest(character),
		schemaVersion: "1.0.0",
		ref: `state:objects/${id}`,
	};
}

export function createThreeBatchJourney(changeId = "CHG-reducer") {
	const initial = createInitialProjectWorkState();
	const opened = openProposedChange(initial, changeId, gitObject("a"));
	const firstBatch = acceptedBatch(initial, opened.operations, gitObject("a"));
	const change = opened.state.changes[0];
	const candidate = objectBinding("candidate:planning:reducer", "b");
	const policy = objectBinding("exit-policy:planning:reducer", "c");
	const result = objectBinding("check-result:planning:reducer", "d");
	const report = objectBinding("exit-report:planning:reducer", "e");
	const planning = buildOperationSequence({
		change,
		changeId: change.changeId,
		baseSnapshot: baseSnapshotFor(opened.state),
		specifications: [
			{
				kind: "loop.attempt_started",
				recordedAt: "2026-07-30T13:10:00.000Z",
				payload: {
					loop: "planning",
					changeRevisionId: change.currentRevision.revisionId,
					loopProtocolDigest: digest("1"),
					routeId: "planning-default",
				},
			},
			{
				kind: "planning.candidate_recorded",
				recordedAt: "2026-07-30T13:10:01.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidate,
					observedBaseDigest: opened.state.workStateDigest,
				}),
			},
			{
				kind: "loop.exit_policy_recorded",
				recordedAt: "2026-07-30T13:10:02.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidateId: candidate.id,
					policy,
				}),
			},
			{
				kind: "check.result_recorded",
				recordedAt: "2026-07-30T13:10:03.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidateId: candidate.id,
					result,
					checkId: "planning-coherence",
					checkVersion: "1.0.0",
					status: "passed",
					evidenceRecordIds: [],
					evidenceInputDigest: digest("2"),
				}),
			},
			{
				kind: "loop.exit_report_recorded",
				recordedAt: "2026-07-30T13:10:04.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidateId: candidate.id,
					report,
					status: "passed",
					resultIds: [result.id],
				}),
			},
			{
				kind: "runtime.route_recorded",
				recordedAt: "2026-07-30T13:10:05.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					exitReportId: report.id,
					route: "implementation",
					reasonCode: "planning-passed",
				}),
			},
			{
				kind: "loop.attempt_ended",
				recordedAt: "2026-07-30T13:10:06.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					status: "passed",
					exitReportId: report.id,
					routeOperationId: operations[5].operationId,
				}),
			},
		],
	});
	const secondBatch = acceptedBatch(
		opened.state,
		planning.operations,
		gitObject("b"),
	);
	const plannedState = reduceAcceptedStateBatch(
		opened.state,
		secondBatch,
		allowAllReplayPolicy,
	);
	const plannedChange = plannedState.changes[0];
	const participant = {
		changeId: plannedChange.changeId,
		revisionId: plannedChange.currentRevision.revisionId,
		tailOperationId: plannedChange.tailOperationId,
	};
	const epoch = createPlanningEpochRecord({
		recordedAt: "2026-07-30T13:20:00.000Z",
		baseSnapshot: {
			...baseSnapshotFor(plannedState),
			workStateDigest: plannedState.workStateDigest,
		},
		authorityBinding: authorityBinding({role: "planner"}),
		planningCandidateId: candidate.id,
		exitReportId: report.id,
		participants: [participant],
		sprints: [
			{
				id: "sprint-reducer",
				goal: "Prove deterministic reduction.",
				participantChangeIds: [plannedChange.changeId],
				workItemIds: ["work-reducer"],
				dependsOnSprintIds: [],
				integrationBoundary: "One exact state batch.",
			},
		],
		workItems: [
			{
				id: "work-reducer",
				sprintId: "sprint-reducer",
				title: "Implement reducer",
				outcome: "Full and incremental replay converge.",
				owningChange: participant,
				contributingChanges: [],
				dependsOnWorkItemIds: [],
				acceptanceRequirements: [
					{
						id: "replay-equivalence",
						statement: "Replay projections are byte-identical.",
						evidenceObligationIds: ["test-proof"],
						checkIds: ["tests-pass"],
					},
				],
				scope: {
					sourcePaths: ["src/change-trace/**"],
					knowledgeRefs: ["kb:system/traces"],
					componentRefs: ["change-traces"],
				},
				workbench: {
					profileId: "typescript",
					toolIds: ["node-test", "pi-lens"],
					skillIds: [],
					contextRefs: ["plan:phase-1"],
					budgetDigest: digest("3"),
				},
				integration: {
					targetRef: "refs/heads/main",
					requiredCheckIds: ["tests-pass", "types-pass"],
					rollbackStrategy: "Reject the state commit.",
					reviewRequired: true,
				},
			},
		],
		activeWorkDispositions: [],
		safeExecutionFrontier: ["work-reducer"],
	});
	const bound = buildOperationSequence({
		change: plannedChange,
		changeId: plannedChange.changeId,
		baseSnapshot: baseSnapshotFor(plannedState),
		planningEpochs: [epoch],
		specifications: [
			{
				kind: "planning.epoch_bound",
				recordedAt: "2026-07-30T13:20:01.000Z",
				payload: {
					planningEpochId: epoch.operationId,
					participantRevisionId: plannedChange.currentRevision.revisionId,
					planningCandidateId: candidate.id,
					exitReportId: report.id,
					workItemIds: ["work-reducer"],
				},
			},
		],
	});
	const thirdBatch = acceptedBatch(
		plannedState,
		[epoch, ...bound.operations],
		gitObject("c"),
	);
	const finalState = reduceAcceptedStateBatch(
		plannedState,
		thirdBatch,
		allowAllReplayPolicy,
	);
	return {
		initial,
		batches: [firstBatch, secondBatch, thirdBatch],
		states: [opened.state, plannedState, finalState],
		epoch,
		candidate,
		report,
	};
}

export function appendContradictoryDecisionResults(
	state,
	stateHead = gitObject("d"),
) {
	const change = state.changes[0];
	const candidate = objectBinding("candidate:decision:contradiction", "8");
	const policy = objectBinding("exit-policy:decision:contradiction", "9");
	const passResult = objectBinding("result:decision:pass", "a");
	const failResult = objectBinding("result:decision:fail", "b");
	const built = buildOperationSequence({
		change,
		changeId: change.changeId,
		baseSnapshot: baseSnapshotFor(state),
		specifications: [
			{
				kind: "loop.attempt_started",
				recordedAt: "2026-07-30T13:40:00.000Z",
				payload: {
					loop: "decision",
					changeRevisionId: change.currentRevision.revisionId,
					loopProtocolDigest: digest("c"),
					routeId: "decision-default",
				},
			},
			{
				kind: "decision.candidate_recorded",
				recordedAt: "2026-07-30T13:40:01.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidate,
					observedBaseDigest: state.workStateDigest,
				}),
			},
			{
				kind: "loop.exit_policy_recorded",
				recordedAt: "2026-07-30T13:40:02.000Z",
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidateId: candidate.id,
					policy,
				}),
			},
			...[
				["passed", passResult, "2026-07-30T13:40:03.000Z"],
				["failed", failResult, "2026-07-30T13:40:04.000Z"],
			].map(([status, result, recordedAt]) => ({
				kind: "check.result_recorded",
				recordedAt,
				payload: ({operations}) => ({
					attemptOperationId: operations[0].operationId,
					candidateId: candidate.id,
					result,
					checkId: "research-supported",
					checkVersion: "1.0.0",
					status,
					evidenceRecordIds: [],
					evidenceInputDigest: digest("d"),
				}),
			})),
		],
	});
	return {
		operations: built.operations,
		state: reduceBatch(state, built.operations, stateHead),
	};
}
