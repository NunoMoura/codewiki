import {
	createChangeRevision,
	createInitialProjectWorkState,
} from "../../src/change-trace/index.ts";
import {parseDecisionCandidateProposal} from "../../src/decision/candidate-proposal.ts";
import {createDecisionCandidate} from "../../src/decision/exit/candidate.ts";
import {
	baseSnapshotFor,
	buildOperationSequence,
	reduceBatch,
} from "./change-trace-replay-v1.mjs";
import {gitObject} from "./change-trace-v1.mjs";

export function nativeDecisionRevision(options = {}) {
	const changeId = options.changeId ?? "CHG-native-decision";
	const desiredState = options.desiredState ?? `Accepted behavior for ${changeId} is explicit.`;
	const targetRefs = options.targetRefs ?? ["src/runtime/native-decision.ts"];
	return createChangeRevision({
		title: options.title ?? `Decide ${changeId}`,
		intent: {
			currentState: options.currentState ?? `Current behavior for ${changeId} is incomplete.`,
			desiredState,
			rationale: options.rationale ?? `Resolve ${changeId} from exact project facts.`,
			nonGoals: options.nonGoals ?? ["Do not grant Planning priority."],
			alternatives: options.alternatives ?? ["Keep current behavior."],
		},
		classification: {
			kind: options.kind ?? "improve",
			type: options.type ?? "workflow_change",
			scope: options.scope ?? "system",
			affectedLayers: options.affectedLayers ?? ["runtime"],
			targetRefs,
		},
		impact: {
			user: options.userImpact ?? desiredState,
			maintainer: options.maintainerImpact ?? "Maintainers receive one exact Decision outcome.",
			compatibility: options.compatibility ?? "No compatibility path is introduced.",
		},
		knowledge: {
			topicRefs: options.topicRefs ?? ["kb:system/decision-loop"],
			propagationRefs: options.propagationRefs ?? ["kb:system/runtime"],
			...(options.noImpactRationale
				? {noImpactRationale: options.noImpactRationale}
				: {}),
		},
		outcome: {
			successSignals: options.successSignals ?? [desiredState],
			evidenceExpectations: options.evidenceExpectations ?? [
				"Exact Decision checks pass.",
			],
		},
		delivery: {
			constraints: options.constraints ?? ["No caller-owned Runtime identity."],
			planningQuestions: options.planningQuestions ?? [],
		},
		evidence: {
			sourceRefs: options.sourceRefs ?? targetRefs,
			proofRefs: options.proofRefs ?? ["tests:native-decision"],
			...(options.reproduction ? {reproduction: options.reproduction} : {}),
			...(options.expectedBehavior
				? {expectedBehavior: options.expectedBehavior}
				: {}),
			...(options.sourceBehavior ? {sourceBehavior: options.sourceBehavior} : {}),
			...(options.targetBehavior ? {targetBehavior: options.targetBehavior} : {}),
		},
		safety: {
			risk: options.risk ?? "moderate",
			invariants: options.invariants ?? ["Accepted intent remains revision-bound."],
			safetyBoundary: options.safetyBoundary ?? "Runtime owns identity and admission.",
			failureModes: options.failureModes ?? ["A stale revision is evaluated."],
			rollbackPlan: options.rollbackPlan ?? "Return the Change to Decision repair.",
			negativeTestPlan: options.negativeTestPlan ?? "Reject stale and malformed inputs.",
			regressionPlan: options.regressionPlan ?? "Replay native Decision tests.",
		},
		acceptanceRequirements: options.acceptanceRequirements ?? [
			{id: "REQ-native-decision", statement: desiredState},
		],
		...(options.defectProfile ? {defectProfile: options.defectProfile} : {}),
	});
}

export function nativeDecisionState(entries) {
	let state = createInitialProjectWorkState();
	for (const [index, entry] of entries.entries()) {
		const built = buildOperationSequence({
			changeId: entry.changeId,
			baseSnapshot: baseSnapshotFor(state),
			specifications: [
				{
					kind: "trace.opened",
					recordedAt: `2026-08-01T10:00:${String(index * 2).padStart(2, "0")}.000Z`,
					payload: {origin: "user", provenanceRefs: [`request:${entry.changeId}`]},
				},
				{
					kind: "change.proposed",
					recordedAt: `2026-08-01T10:00:${String(index * 2 + 1).padStart(2, "0")}.000Z`,
					payload: {
						revision: entry.revision,
						provenance: {kind: "user", refs: [`request:${entry.changeId}`]},
					},
				},
			],
		});
		state = reduceBatch(state, built.operations, gitObject((index + 1).toString(16)));
	}
	return state;
}

export function nativeDecisionCandidate(input) {
	return createDecisionCandidate({
		state: input.state,
		changeId: input.changeId,
		proposal: parseDecisionCandidateProposal({
			disposition: input.disposition ?? "approve",
			rationale:
				input.rationale ?? "Apply exact grounded semantic disposition.",
		}),
	});
}
