import type {DecisionGateEvidenceCollector} from "../../runtime/lifecycle/gates.ts";
import {decisionEvidenceSubject} from "../../loops/decision/evidence.ts";
import {
	collectDecisionResearchEvidence,
	type DecisionResearchCollector,
} from "../../runtime/effects/research-collection.ts";

export interface PiNativeDecisionResearchOptions {
	readonly sensitivity: "public" | "project" | "private";
	readonly collector: DecisionResearchCollector;
}

export function createPiNativeDecisionResearchCollector(input: {
	readonly research: PiNativeDecisionResearchOptions;
	readonly now?: () => string;
}): DecisionGateEvidenceCollector {
	return Object.freeze({
		async collect(
			request: Parameters<DecisionGateEvidenceCollector["collect"]>[0],
		) {
			const result = await collectDecisionResearchEvidence({
				candidate: request.candidate,
				subject: decisionEvidenceSubject({
					candidate: request.candidate,
					changeRef: request.changeRef,
				}),
				sensitivity: input.research.sensitivity,
				signal: request.signal,
				collector: input.research.collector,
				observedAt: input.now ?? (() => new Date().toISOString()),
			});
			return result.evidenceRecords;
		},
	});
}
