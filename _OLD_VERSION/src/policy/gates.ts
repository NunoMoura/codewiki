export const VALIDATION_GATE_VALUES = [
	"decision",
	"planning",
	"implementation",
	"task-close",
	"sprint-close",
	"ship-ready",
] as const;

export type ValidationGate = (typeof VALIDATION_GATE_VALUES)[number];

export const VALIDATION_GATE_ALIAS_VALUES = [
	"publication",
	"publish",
	"release",
] as const;

export function normalizeValidationGate(value: unknown): string {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/^(profile|gate|validation-profile|validation-gate):/, "")
		.replace(/^validation\//, "")
		.replace(/_/g, "-")
		.trim();
	if (["publication", "publish", "release"].includes(normalized)) {
		return "ship-ready";
	}
	return normalized;
}

export function isValidationGate(value: unknown): value is ValidationGate {
	return (VALIDATION_GATE_VALUES as readonly string[]).includes(
		normalizeValidationGate(value),
	);
}

export function isShipReadyGate(value: unknown): boolean {
	return normalizeValidationGate(value) === "ship-ready";
}
