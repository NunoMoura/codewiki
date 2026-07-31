import {
	createInitialProjectWorkState,
	createManifestForRecords,
	createNextChangeOperation,
	createChangeRevision,
	createPlanningEpochRecord,
	reduceAcceptedStateBatch,
	reduceChangeOperation,
} from "../../src/change-trace/index.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";
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

export function inlineSemanticArtifact(id, artifact) {
	return {
		id,
		digest: canonicalJsonDigest(artifact),
		schemaVersion: String(artifact.schemaVersion),
		artifact,
	};
}

export function runtimeRouteArtifact(loop, route, reasonCode) {
	const body = {schemaVersion: "1.0.0", loop, route, reasonCode};
	const routeDigest = canonicalJsonDigest(body);
	return inlineSemanticArtifact(
		`runtime-route:${loop}:${routeDigest.slice("sha256:".length)}`,
		{...body, routeDigest},
	);
}

export function planningArtifacts(suffix = "reducer") {
	const candidateBody = {
		loop: "planning",
		schemaVersion: "1.0.0",
		content: {fixture: suffix},
		observedBase: {
			workStateDigest: digest("1"),
			knowledgeSnapshotDigest: digest("2"),
			canonicalRefs: [`fixture:${suffix}`],
		},
	};
	const candidateDigest = canonicalJsonDigest(candidateBody);
	const candidateId = `candidate:planning:${candidateDigest.slice("sha256:".length)}`;
	const candidateArtifact = {
		...candidateBody,
		id: candidateId,
		digest: candidateDigest,
	};
	const policyBody = {
		schemaVersion: 1,
		loop: "planning",
		candidateDigest,
		fixture: suffix,
	};
	const policyDigest = canonicalJsonDigest(policyBody);
	const policyId = `exit-policy:planning:${policyDigest.slice("sha256:".length)}`;
	const policyArtifact = {...policyBody, policyDigest};
	const resultBody = {
		schemaVersion: 1,
		checkId: "planning-coherence",
		status: "pass",
		fixture: suffix,
	};
	const resultDigest = canonicalJsonDigest(resultBody);
	const resultId = `check-result:planning:${resultDigest.slice("sha256:".length)}`;
	const resultArtifact = {...resultBody, resultDigest};
	const reportBody = {
		schemaVersion: 1,
		loop: "planning",
		candidateDigest,
		policyDigest,
		checkResults: [resultArtifact],
		fixture: suffix,
	};
	const reportDigest = canonicalJsonDigest(reportBody);
	const reportId = `exit-report:planning:${reportDigest.slice("sha256:".length)}`;
	return {
		candidate: inlineSemanticArtifact(candidateId, candidateArtifact),
		policy: inlineSemanticArtifact(policyId, policyArtifact),
		result: inlineSemanticArtifact(resultId, resultArtifact),
		report: inlineSemanticArtifact(reportId, {...reportBody, reportDigest}),
	};
}

export function buildPassingPlanningExit(
	state,
	changeId,
	artifacts = planningArtifacts(),
) {
	const change = state.changes.find((entry) => entry.changeId === changeId);
	if (!change) throw new Error(`Change ${changeId} is absent.`);
	const {candidate, policy, result, report} = artifacts;
	return buildOperationSequence({
		change,
		changeId,
		baseSnapshot: baseSnapshotFor(state),
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
					observedBaseDigest: canonicalJsonDigest(candidate.artifact.observedBase),
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
					runtimeRoute: runtimeRouteArtifact(
						"planning",
						"implementation",
						"planning-passed",
					),
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
}

export function buildPlanningEpochRecords({
	state,
	participantChangeIds,
	artifacts = planningArtifacts(),
	suffix = "reducer",
}) {
	const participants = [...participantChangeIds]
		.sort()
		.map((changeId) => {
			const change = state.changes.find((entry) => entry.changeId === changeId);
			if (!change) throw new Error(`Change ${changeId} is absent.`);
			return {
				changeId,
				revisionId: change.currentRevision.revisionId,
				tailOperationId: change.tailOperationId,
			};
		});
	const workItemId = `work-${suffix}`;
	const sprintId = `sprint-${suffix}`;
	const epoch = createPlanningEpochRecord({
		recordedAt: "2026-07-30T13:20:00.000Z",
		baseSnapshot: {
			...baseSnapshotFor(state),
			workStateDigest: state.workStateDigest,
		},
		authorityBinding: authorityBinding({role: "planner"}),
		planningCandidateId: artifacts.candidate.id,
		exitReportId: artifacts.report.id,
		participants,
		sprints: [
			{
				id: sprintId,
				goal: "Prove deterministic reduction.",
				participantChangeIds: participants.map((entry) => entry.changeId),
				workItemIds: [workItemId],
				dependsOnSprintIds: [],
				integrationBoundary: "One exact state batch.",
			},
		],
		workItems: [
			{
				id: workItemId,
				sprintId,
				title: "Implement reducer",
				outcome: "Full and incremental replay converge.",
				owningChange: participants[0],
				contributingChanges: participants.slice(1),
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
		safeExecutionFrontier: [workItemId],
	});
	const bindings = participants.flatMap((participant) => {
		const change = state.changes.find(
			(entry) => entry.changeId === participant.changeId,
		);
		return buildOperationSequence({
			change,
			changeId: participant.changeId,
			baseSnapshot: baseSnapshotFor(state),
			planningEpochs: [epoch],
			specifications: [
				{
					kind: "planning.epoch_bound",
					recordedAt: "2026-07-30T13:20:01.000Z",
					payload: {
						planningEpochId: epoch.operationId,
						participantRevisionId: participant.revisionId,
						planningCandidateId: artifacts.candidate.id,
						exitReportId: artifacts.report.id,
						workItemIds: [workItemId],
					},
				},
			],
		}).operations;
	});
	return {epoch, workItemId, records: [epoch, ...bindings]};
}

export function createThreeBatchJourney(changeId = "CHG-reducer") {
	const initial = createInitialProjectWorkState();
	const opened = openProposedChange(initial, changeId, gitObject("a"));
	const firstBatch = acceptedBatch(initial, opened.operations, gitObject("a"));
	const artifacts = planningArtifacts();
	const planning = buildPassingPlanningExit(opened.state, changeId, artifacts);
	const secondBatch = acceptedBatch(opened.state, planning.operations, gitObject("b"));
	const plannedState = reduceAcceptedStateBatch(
		opened.state,
		secondBatch,
		allowAllReplayPolicy,
	);
	const epoch = buildPlanningEpochRecords({
		state: plannedState,
		participantChangeIds: [changeId],
		artifacts,
	});
	const thirdBatch = acceptedBatch(plannedState, epoch.records, gitObject("c"));
	const finalState = reduceAcceptedStateBatch(
		plannedState,
		thirdBatch,
		allowAllReplayPolicy,
	);
	return {
		initial,
		batches: [firstBatch, secondBatch, thirdBatch],
		states: [opened.state, plannedState, finalState],
		epoch: epoch.epoch,
		candidate: artifacts.candidate,
		report: artifacts.report,
	};
}

export function appendContradictoryDecisionResults(
	state,
	stateHead = gitObject("d"),
) {
	const change = state.changes[0];
	const candidateBody = {
		loop: "decision",
		schemaVersion: "1.0.0",
		content: {fixture: "contradiction"},
		observedBase: {
			workStateDigest: state.workStateDigest,
			knowledgeSnapshotDigest: state.observedBase.knowledgeDigest,
			canonicalRefs: [change.currentRevision.revisionId],
		},
	};
	const candidateDigest = canonicalJsonDigest(candidateBody);
	const candidateId = `candidate:decision:${candidateDigest.slice("sha256:".length)}`;
	const candidate = inlineSemanticArtifact(candidateId, {
		...candidateBody,
		id: candidateId,
		digest: candidateDigest,
	});
	const policyBody = {
		schemaVersion: 1,
		loop: "decision",
		candidateDigest,
		fixture: "contradiction",
	};
	const policyDigest = canonicalJsonDigest(policyBody);
	const policy = inlineSemanticArtifact(
		`exit-policy:decision:${policyDigest.slice("sha256:".length)}`,
		{...policyBody, policyDigest},
	);
	const result = (status) => {
		const body = {
			schemaVersion: 1,
			checkId: "decision-result",
			status,
			fixture: "contradiction",
		};
		const resultDigest = canonicalJsonDigest(body);
		return inlineSemanticArtifact(
			`check-result:decision:${resultDigest.slice("sha256:".length)}`,
			{...body, resultDigest},
		);
	};
	const passResult = result("pass");
	const failResult = result("fail");
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
					observedBaseDigest: canonicalJsonDigest(candidate.artifact.observedBase),
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
