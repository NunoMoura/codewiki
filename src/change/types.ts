export const CHANGE_TYPE_VALUES = ["product", "system", "task", "code"] as const;
export const TRACEABILITY_EXEMPTION_VALUES = ["generated", "runtime", "mechanical"] as const;
/** @deprecated Use CHANGE_TYPE_VALUES. */
export const CHANGE_CLASS_VALUES = CHANGE_TYPE_VALUES;

export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];
export type TraceabilityExemption = (typeof TRACEABILITY_EXEMPTION_VALUES)[number];
export type LegacyChangeClass = ChangeType | TraceabilityExemption | "code-bugfix" | "maintenance" | "audit" | "security" | "publication";
/** @deprecated Use ChangeType. */
export type ChangeClass = LegacyChangeClass;

export interface CodewikiDiffTableRowInput {
	id?: string;
	current_state: string;
	/** Optional explicit alias for current_state when callers track row lifecycle. */
	current_project_state?: string;
	desired_state: string;
	/** Optional accepted change summary; defaults to desired_state for legacy rows. */
	agreed_change?: string;
	/** Optional target end state; defaults to desired_state for legacy rows. */
	expected_final_state?: string;
	/** Optional gateway-confirmed end state after validation. */
	validated_final_state?: string;
	/** Optional row lifecycle status independent of user_action. */
	status?: string;
	/** Optional source refs proving row approval, implementation, or validation. */
	proof_refs?: string[];
	rationale: string;
	affected_layers?: string[];
	risk?: "low" | "medium" | "high" | string;
	user_action?: "pending" | "approved" | "rejected" | "deferred" | "edited" | string;
	alternatives?: string[];
}
