import type { DecisionRecord } from "./types.ts";

export interface DecisionCompileResult {
	records: DecisionRecord[];
	readyForPlanning: boolean;
}

export function compileDecision(records: DecisionRecord[]): DecisionCompileResult {
	return {
		records: records.map((record) => ({ ...record, risks: [...record.risks], sourceRefs: [...record.sourceRefs] })),
		readyForPlanning: records.length > 0,
	};
}
