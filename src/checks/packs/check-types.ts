import type { SemanticLoop } from "../contracts.ts";

export const CUSTOM_CHECK_TYPE_CATALOG_VERSION = "1.0.0" as const;

export const CUSTOM_CHECK_TYPE_IDS = [
	"intent_and_product",
	"research_and_claims",
	"architecture_and_api",
	"security_and_privacy",
	"accessibility",
	"design_system",
	"library_compatibility",
	"implementation_quality",
	"delivery_and_release",
	"organization_policy",
] as const;

export type CustomCheckTypeId = (typeof CUSTOM_CHECK_TYPE_IDS)[number];

export interface CustomCheckTypeDefinition {
	readonly id: CustomCheckTypeId;
	readonly version: "1.0.0";
	readonly label: string;
	readonly loops: readonly SemanticLoop[];
	readonly evaluatorId: string;
	readonly prerequisites: Readonly<Partial<Record<SemanticLoop, readonly string[]>>>;
}

const ALL_LOOPS: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];

const TYPE_DEFINITIONS: readonly CustomCheckTypeDefinition[] = [
	typeDefinition("intent_and_product", "Intent and product", ["decision"]),
	typeDefinition("research_and_claims", "Research and claims", ["decision"]),
	typeDefinition("architecture_and_api", "Architecture and API", ALL_LOOPS),
	typeDefinition("security_and_privacy", "Security and privacy", ALL_LOOPS),
	typeDefinition("accessibility", "Accessibility", [
		"decision",
		"implementation",
	]),
	typeDefinition("design_system", "Design system", [
		"decision",
		"implementation",
	]),
	typeDefinition("library_compatibility", "Library compatibility", [
		"decision",
		"implementation",
	]),
	typeDefinition("implementation_quality", "Implementation quality", [
		"planning",
		"implementation",
	]),
	typeDefinition("delivery_and_release", "Delivery and release", ALL_LOOPS),
	typeDefinition("organization_policy", "Organization policy", ALL_LOOPS),
];

const TYPES_BY_ID = new Map(
	TYPE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function listCustomCheckTypes(): readonly CustomCheckTypeDefinition[] {
	return TYPE_DEFINITIONS.map(cloneTypeDefinition);
}

export function getCustomCheckType(
	id: CustomCheckTypeId,
): CustomCheckTypeDefinition {
	const definition = TYPES_BY_ID.get(id);
	if (!definition) throw new Error(`Unknown Custom Check Type ${id}.`);
	return cloneTypeDefinition(definition);
}

export function isCustomCheckTypeId(value: unknown): value is CustomCheckTypeId {
	return (
		typeof value === "string" &&
		(CUSTOM_CHECK_TYPE_IDS as readonly string[]).includes(value)
	);
}

function typeDefinition(
	id: CustomCheckTypeId,
	label: string,
	loops: readonly SemanticLoop[],
	prerequisites: Partial<Record<SemanticLoop, readonly string[]>> = {},
): CustomCheckTypeDefinition {
	return Object.freeze({
		id,
		version: "1.0.0" as const,
		label,
		loops: Object.freeze([...loops]),
		evaluatorId: `codewiki.check-evaluator.${id}`,
		prerequisites: Object.freeze(
			Object.fromEntries(
				Object.entries(prerequisites).map(([loop, checkIds]) => [
					loop,
					Object.freeze([...(checkIds ?? [])].sort(compareText)),
				]),
			),
		),
	});
}

function cloneTypeDefinition(
	definition: CustomCheckTypeDefinition,
): CustomCheckTypeDefinition {
	return {
		...definition,
		loops: [...definition.loops],
		prerequisites: Object.fromEntries(
			Object.entries(definition.prerequisites).map(([loop, checkIds]) => [
				loop,
				[...(checkIds ?? [])],
			]),
		),
	};
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
