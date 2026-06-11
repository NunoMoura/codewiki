import type { DecisionRecord } from "./types.ts";

export function createDecisionRecord(input: DecisionRecord): DecisionRecord {
	return {
		...input,
		risks: [...input.risks],
		sourceRefs: [...input.sourceRefs],
	};
}
