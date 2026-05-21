import type { ChangeType, TraceabilityExemption } from "./types.ts";
import { CHANGE_TYPE_VALUES, TRACEABILITY_EXEMPTION_VALUES } from "./types.ts";

export const LEGACY_CHANGE_TYPE_ALIASES = new Map<string, ChangeType>([
	["code-bugfix", "code"],
	["maintenance", "code"],
	["audit", "system"],
	["security", "product"],
	["publication", "system"],
]);

const CHANGE_TYPES = new Set<string>(CHANGE_TYPE_VALUES);
const TRACEABILITY_EXEMPTIONS = new Set<string>(TRACEABILITY_EXEMPTION_VALUES);

export function normalizeChangeType(value: unknown, fallback: ChangeType | string = "task"): ChangeType | string {
	const normalized = String(value || "").trim().toLowerCase();
	if (CHANGE_TYPES.has(normalized)) return normalized as ChangeType;
	return LEGACY_CHANGE_TYPE_ALIASES.get(normalized) ?? fallback;
}

export function normalizeTraceabilityExemption(value: unknown): TraceabilityExemption | undefined {
	const normalized = String(value || "").trim().toLowerCase();
	return TRACEABILITY_EXEMPTIONS.has(normalized) ? normalized as TraceabilityExemption : undefined;
}

export function isSemanticTraceability(semantic: unknown, exemption: TraceabilityExemption | string | undefined): boolean {
	return typeof semantic === "boolean" ? semantic : !exemption;
}
