import { CHANGE_SCOPE_VALUES, type ChangeScope } from "../changes/types.ts";
import {
	DECISION_APPROVAL_STATUS_VALUES,
	TRACEABILITY_EXEMPTION_VALUES,
	type DecisionApprovalStatus,
	type TraceabilityExemption,
} from "./types.ts";

const approvalValues = new Set<string>(DECISION_APPROVAL_STATUS_VALUES);
const scopeValues = new Set<string>(CHANGE_SCOPE_VALUES);
const traceabilityExemptionValues = new Set<string>(
	TRACEABILITY_EXEMPTION_VALUES,
);

export function normalizeDecisionApprovalStatus(
	value: unknown,
	fallback: DecisionApprovalStatus = "pending",
): DecisionApprovalStatus {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (!normalized) return fallback;
	if (["approve", "approved", "accept", "accepted"].includes(normalized))
		return "approved";
	if (["reject", "rejected"].includes(normalized)) return "rejected";
	if (["defer", "deferred"].includes(normalized)) return "deferred";
	if (["edit", "edited", "alternative"].includes(normalized)) return "edited";
	return approvalValues.has(normalized)
		? (normalized as DecisionApprovalStatus)
		: fallback;
}

export function normalizeDecisionScope(
	value: unknown,
	fallback: ChangeScope = "source",
): ChangeScope {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (scopeValues.has(normalized)) return normalized as ChangeScope;
	return fallback;
}

export function normalizeTraceabilityExemption(
	value: unknown,
): TraceabilityExemption | undefined {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return traceabilityExemptionValues.has(normalized)
		? (normalized as TraceabilityExemption)
		: undefined;
}

export function isSemanticTraceability(
	semantic: unknown,
	exemption: TraceabilityExemption | string | undefined,
): boolean {
	return typeof semantic === "boolean" ? semantic : !exemption;
}
