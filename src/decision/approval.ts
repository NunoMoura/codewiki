import {
	CHANGE_TYPE_VALUES,
	DECISION_APPROVAL_STATUS_VALUES,
	TRACEABILITY_EXEMPTION_VALUES,
	type ChangeType,
	type DecisionApprovalStatus,
	type TraceabilityExemption,
} from "./types.ts";

const approvalValues = new Set<string>(DECISION_APPROVAL_STATUS_VALUES);
const changeTypeValues = new Set<string>(CHANGE_TYPE_VALUES);
const traceabilityExemptionValues = new Set<string>(TRACEABILITY_EXEMPTION_VALUES);

const changeTypeAliases = new Map<string, ChangeType>([
	["code-bugfix", "code"],
	["maintenance", "code"],
	["audit", "system"],
	["security", "product"],
	["publication", "system"],
]);

export function normalizeDecisionApprovalStatus(
	value: unknown,
	fallback: DecisionApprovalStatus = "pending",
): DecisionApprovalStatus {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (!normalized) return fallback;
	if (["approve", "approved", "accept", "accepted"].includes(normalized)) return "approved";
	if (["reject", "rejected"].includes(normalized)) return "rejected";
	if (["defer", "deferred"].includes(normalized)) return "deferred";
	if (["edit", "edited", "alternative"].includes(normalized)) return "edited";
	return approvalValues.has(normalized) ? (normalized as DecisionApprovalStatus) : fallback;
}

export function normalizeChangeType(value: unknown, fallback: ChangeType = "task"): ChangeType | string {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (changeTypeValues.has(normalized)) return normalized as ChangeType;
	return changeTypeAliases.get(normalized) ?? fallback;
}

export function normalizeTraceabilityExemption(value: unknown): TraceabilityExemption | undefined {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return traceabilityExemptionValues.has(normalized) ? (normalized as TraceabilityExemption) : undefined;
}

export function isSemanticTraceability(
	semantic: unknown,
	exemption: TraceabilityExemption | string | undefined,
): boolean {
	return typeof semantic === "boolean" ? semantic : !exemption;
}
