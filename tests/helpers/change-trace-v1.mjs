import {
	createArchiveManifest,
	createCanonicalChangeOperation,
	createChangeRevision,
	createStateCommitManifest,
	serializeCanonicalChangeOperation,
} from "../../src/changes/trace/index.ts";
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
		authenticatedIdentityRef: "identity:maintainer",
		role: "maintainer",
		actorPolicyDigest: digest("6"),
		runtimeProtocolDigest: digest("7"),
		...overrides,
	};
}

export function changeRevision() {
	return createChangeRevision({
		title: "Execute Change Trace Protocol",
		intent: {
			currentState: "Mutable Trace assumptions prevent exact coordination.",
			desiredState: "Canonical replay converges across independent clones.",
			rationale: "Replace mutable Trace assumptions with exact accepted operations.",
			nonGoals: ["No hosted relay."],
			alternatives: ["Keep local mutable Trace state."],
		},
		classification: {
			kind: "migrate",
			type: "architecture_change",
			scope: "system",
			affectedLayers: ["runtime"],
			targetRefs: ["src/change-trace"],
		},
		impact: {
			user: "Accepted intent remains consistent across clones.",
			maintainer: "Canonical operations replace mutable coordination state.",
			compatibility: "No compatibility parser.",
		},
		knowledge: {
			topicRefs: ["kb:system/traces", "kb:system/alignment-model"],
			propagationRefs: ["kb:system/change-trace-v1"],
		},
		outcome: {
			successSignals: ["Canonical replay converges across independent clones."],
			evidenceExpectations: ["Full and incremental replay produce one state digest."],
		},
		delivery: {
			constraints: ["No mutable status operation.", "No compatibility parser."],
			planningQuestions: ["How will stale remote heads fail closed?"],
		},
		evidence: {
			sourceRefs: ["src/change-trace"],
			proofRefs: ["tests:change-trace-protocol", "tests:distributed-mutation"],
			sourceBehavior: "Mutable Trace state coordinates local work.",
			targetBehavior: "Accepted operations replay deterministically.",
		},
		safety: {
			risk: "high",
			invariants: ["Accepted operation identity is immutable."],
			safetyBoundary: "Only expected-head CAS may advance accepted state.",
			failureModes: ["Concurrent writers observe a stale remote head."],
			rollbackPlan: "Restore the previous accepted state ref.",
			negativeTestPlan: "Reject stale, malformed, and unauthorized operations.",
			regressionPlan: "Replay canonical protocol fixtures after every change.",
		},
		acceptanceRequirements: [
			{id: "replay", statement: "Full and incremental replay are equivalent."},
			{id: "identity", statement: "Every authority-bearing record is content addressed."},
		],
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

export function stateManifest(operation = proposedOperation()) {
	return createStateCommitManifest({
		previousStateHead: operation.body.baseSnapshot.remoteStateHead,
		operationIds: [operation.operationId],
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
