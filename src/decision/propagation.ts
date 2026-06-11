import type { DecisionRecord } from "./types.ts";

export function decisionPropagationRefs(record: DecisionRecord): string[] {
	return [...record.sourceRefs];
}
