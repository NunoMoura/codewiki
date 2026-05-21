export const CHANGE_TYPE_VALUES = ["product", "system", "task", "code"] as const;
export const TRACEABILITY_EXEMPTION_VALUES = ["generated", "runtime", "mechanical"] as const;
/** @deprecated Use CHANGE_TYPE_VALUES. */
export const CHANGE_CLASS_VALUES = CHANGE_TYPE_VALUES;

export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];
export type TraceabilityExemption = (typeof TRACEABILITY_EXEMPTION_VALUES)[number];
export type LegacyChangeClass = ChangeType | TraceabilityExemption | "code-bugfix" | "maintenance" | "audit" | "security" | "publication";
/** @deprecated Use ChangeType. */
export type ChangeClass = LegacyChangeClass;
