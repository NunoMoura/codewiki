import type { DecisionRecord } from "./types.ts";

export function decisionHasRequiredEvidence(record: DecisionRecord): boolean {
	return Boolean(record.id && record.question && record.currentState && record.desiredState && record.rationale);
}
