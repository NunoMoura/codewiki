import {
	createArchiveManifest,
	createCanonicalChangeOperation,
	createChangeRevision,
	createPlanningEpochRecord,
	createStateCommitManifest,
	serializeCanonicalChangeOperation,
} from "../../src/change-trace/index.ts";
import { sha256Digest } from "../../src/utils/canonical-json.ts";

export const digest = (character) => `sha256:${character.repeat(64)}`;
export const gitObject = (character) => character.repeat(40);

export function baseSnapshot() {
	return {
		remoteStateHead: gitObject("1"),
		sourceHead: gitObject("2"),
		knowledgeDigest: digest("3"),
		configDigest: digest("4"),
		policyDigest: digest("5"),
	};
}

export function authorityBinding(overrides = {}) {
	return {
		actorId: "runtime-main",
		principalRef: "principal:maintainer",
		role: "maintainer",
		actorPolicyDigest: digest("6"),
		runtimeProtocolDigest: digest("7"),
		...overrides,
	};
}

export function changeRevision() {
	return createChangeRevision({
		title: "Execute Change Trace Protocol v1",
		summary: "Replace mutable Trace assumptions with exact accepted operations.",
		desiredOutcome: "Canonical replay converges across independent clones.",
		acceptanceRequirements: [
			{id: "replay", statement: "Full and incremental replay are equivalent."},
			{id: "identity", statement: "Every authority-bearing record is content addressed."},
		],
		constraints: ["No mutable status operation.", "No compatibility parser."],
		nonGoals: ["No hosted relay."],
		knowledgeRefs: ["kb:system/traces", "kb:system/alignment-model"],
		sourceRefs: ["src/change-trace"],
		risk: "high",
	});
}

export function proposedOperation(overrides = {}) {
	const revision = changeRevision();
	return createCanonicalChangeOperation({
		changeId: "CHG-protocol-fixture",
		kind: "change.proposed",
		parents: [digest("8")],
		baseSnapshot: baseSnapshot(),
		authorityBinding: authorityBinding(),
		recordedAt: "2026-07-30T12:00:00.000Z",
		preStateDigest: digest("9"),
		postStateDigest: digest("a"),
		payload: {
			revision,
			provenance: {kind: "user", refs: ["request:ratified-refactor"]},
		},
		...overrides,
	});
}

export function planningEpoch(operation = proposedOperation()) {
	const revision = operation.body.payload.revision;
	const participant = {
		changeId: operation.body.changeId,
		revisionId: revision.revisionId,
		tailOperationId: operation.operationId,
	};
	return createPlanningEpochRecord({
		recordedAt: "2026-07-30T12:05:00.000Z",
		baseSnapshot: {...baseSnapshot(), workStateDigest: digest("b")},
		authorityBinding: authorityBinding({role: "planner"}),
		planningCandidateId: "candidate:planning:fixture",
		exitReportId: "exit-report:planning:fixture",
		participants: [participant],
		sprints: [
			{
				id: "sprint-protocol",
				goal: "Land deterministic protocol foundation.",
				participantChangeIds: [operation.body.changeId],
				workItemIds: ["work-protocol"],
				dependsOnSprintIds: [],
				integrationBoundary: "One reviewed protocol commit.",
			},
		],
		workItems: [
			{
				id: "work-protocol",
				sprintId: "sprint-protocol",
				title: "Implement protocol identity",
				outcome: "Exact schemas and identities are executable.",
				owningChange: participant,
				contributingChanges: [],
				dependsOnWorkItemIds: [],
				acceptanceRequirements: [
					{
						id: "protocol-tests",
						statement: "Canonical fixture tests pass.",
						evidenceObligationIds: ["command-proof"],
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
					toolIds: ["pi-lens", "node-test"],
					skillIds: [],
					contextRefs: ["plan:phase-1"],
					budgetDigest: digest("c"),
				},
				integration: {
					targetRef: "refs/heads/main",
					requiredCheckIds: ["tests-pass", "types-pass"],
					rollbackStrategy: "Revert exact accepted commit.",
					reviewRequired: true,
				},
			},
		],
		activeWorkDispositions: [],
		safeExecutionFrontier: ["work-protocol"],
	});
}

export function stateManifest(
	operation = proposedOperation(),
	epoch = planningEpoch(operation),
) {
	return createStateCommitManifest({
		previousStateHead: operation.body.baseSnapshot.remoteStateHead,
		operationIds: [operation.operationId, epoch.operationId],
		changedTraceTails: [
			{
				changeId: operation.body.changeId,
				previousTail: operation.body.parents[0],
				nextTail: operation.operationId,
			},
		],
	});
}

export function archiveManifest(operation = proposedOperation()) {
	const bytes = serializeCanonicalChangeOperation(operation);
	return createArchiveManifest({
		changeId: operation.body.changeId,
		sourceStateHead: gitObject("d"),
		previousArchiveHead: gitObject("e"),
		segments: [
			{
				index: 0,
				digest: sha256Digest(bytes),
				byteLength: Buffer.byteLength(bytes),
				operationCount: 1,
				rootOperationId: operation.operationId,
				tailOperationId: operation.operationId,
			},
		],
		rootOperationId: operation.operationId,
		tailOperationId: operation.operationId,
		closureOperationId: operation.operationId,
		closureReason: "completed",
		integrationOperationIds: [],
		deliveryOperationIds: [],
		outcomeOperationIds: [],
		acceptedStateCommits: [gitObject("d")],
	});
}
