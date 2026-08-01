import {
	CHANGE_KIND_VALUES,
	type ChangeKind,
} from "../../changes/types.ts";
import type { SemanticLoop } from "../../semantic-loop.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	getCustomCheckType,
	isCustomCheckTypeId,
	type CustomCheckTypeId,
} from "./check-types.ts";

export const CUSTOM_CHECK_SCHEMA_VERSION = "2.0.0" as const;
export const MAX_CUSTOM_CHECKS = 64;
export const MAX_CUSTOM_CHECKS_PER_TYPE = 16;
export const MAX_CUSTOM_CHECK_BYTES = 16_384;

const SEMANTIC_LOOPS: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];
const CUSTOM_CHECK_LIFECYCLES = ["draft", "active", "disabled"] as const;
const CUSTOM_CHECK_ID = /^custom-check:[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PROHIBITED_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f]/u;

export type CustomCheckLifecycle = (typeof CUSTOM_CHECK_LIFECYCLES)[number];

export interface CustomCheckApplicability {
	readonly loops?: readonly SemanticLoop[];
	readonly changeKinds?: readonly ChangeKind[];
	readonly affectedLayers?: readonly string[];
	readonly pathScopes?: readonly string[];
}

export interface CustomCheckProposal {
	readonly checkTypeId: CustomCheckTypeId;
	readonly name: string;
	readonly requirement: string;
	readonly repairGuidance?: string;
	readonly appliesWhen: CustomCheckApplicability;
	readonly knowledgeRefs?: readonly string[];
}

export interface CustomCheckDefinition extends CustomCheckProposal {
	readonly schemaVersion: typeof CUSTOM_CHECK_SCHEMA_VERSION;
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly lifecycle: CustomCheckLifecycle;
}

export function createCustomCheckDefinition(
	proposal: CustomCheckProposal,
): CustomCheckDefinition {
	const normalized = normalizeProposal(proposal);
	const customCheckId = `custom-check:${canonicalJsonDigest(normalized).slice(
		"sha256:".length,
	)}`;
	return materializeDefinition({
		...normalized,
		schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
		customCheckId,
		lifecycle: "draft",
	});
}

export function updateCustomCheckDefinition(
	current: CustomCheckDefinition,
	proposal: CustomCheckProposal,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	const normalized = normalizeProposal(proposal);
	if (normalized.checkTypeId !== current.checkTypeId) {
		throw new Error("Custom Check Type cannot change after creation.");
	}
	return materializeDefinition({
		...normalized,
		schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
		customCheckId: current.customCheckId,
		lifecycle: current.lifecycle,
	});
}

export function activateCustomCheckDefinition(
	current: CustomCheckDefinition,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	if (current.lifecycle !== "draft") {
		throw new Error(
			`Custom Check ${current.customCheckId} must be draft before activation.`,
		);
	}
	return withLifecycle(current, "active");
}

export function disableCustomCheckDefinition(
	current: CustomCheckDefinition,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	if (current.lifecycle === "disabled") {
		throw new Error(`Custom Check ${current.customCheckId} is already disabled.`);
	}
	return withLifecycle(current, "disabled");
}

export function normalizeCustomCheckDefinitions(
	value: readonly CustomCheckDefinition[],
): CustomCheckDefinition[] {
	if (!Array.isArray(value)) {
		throw new Error("Custom Checks must be an array.");
	}
	if (value.length > MAX_CUSTOM_CHECKS) {
		throw new Error(
			`Custom Checks cannot exceed ${MAX_CUSTOM_CHECKS} definitions per project.`,
		);
	}
	const normalized = value.map((definition) => {
		assertCustomCheckDefinition(definition);
		return materializeDefinition(cloneDefinition(definition));
	});
	assertUnique(
		normalized.map((definition) => definition.customCheckId),
		"Custom Check ids",
	);
	for (const checkTypeId of new Set(
		normalized.map((definition) => definition.checkTypeId),
	)) {
		const activeCount = normalized.filter(
			(definition) =>
				definition.checkTypeId === checkTypeId &&
				definition.lifecycle === "active",
		).length;
		if (activeCount > MAX_CUSTOM_CHECKS_PER_TYPE) {
			throw new Error(
				`Active Custom Checks for ${checkTypeId} cannot exceed ${MAX_CUSTOM_CHECKS_PER_TYPE}.`,
			);
		}
	}
	return normalized.sort((left, right) =>
		compareText(left.customCheckId, right.customCheckId),
	);
}

export function customCheckConfigurationDigest(
	definitions: readonly CustomCheckDefinition[],
): Sha256Digest {
	return canonicalJsonDigest({
		schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
		definitions: normalizeCustomCheckDefinitions(definitions),
	});
}

export function assertCustomCheckDefinition(
	value: CustomCheckDefinition,
): void {
	assertRecord(value, "Custom Check definition");
	assertKnownKeys(value, "Custom Check definition", [
		"schemaVersion",
		"customCheckId",
		"definitionDigest",
		"lifecycle",
		"checkTypeId",
		"name",
		"requirement",
		"repairGuidance",
		"appliesWhen",
		"knowledgeRefs",
	]);
	if (value.schemaVersion !== CUSTOM_CHECK_SCHEMA_VERSION) {
		throw new Error(
			`Custom Check schemaVersion must be ${CUSTOM_CHECK_SCHEMA_VERSION}.`,
		);
	}
	if (!CUSTOM_CHECK_ID.test(value.customCheckId)) {
		throw new Error("Custom Check customCheckId is invalid.");
	}
	if (!DIGEST.test(value.definitionDigest)) {
		throw new Error("Custom Check definitionDigest is invalid.");
	}
	if (!CUSTOM_CHECK_LIFECYCLES.includes(value.lifecycle)) {
		throw new Error(
			`Custom Check lifecycle ${String(value.lifecycle)} is invalid.`,
		);
	}
	const normalizedProposal = normalizeProposal(value, true);
	const expectedDigest = definitionDigest({
		...normalizedProposal,
		schemaVersion: value.schemaVersion,
		customCheckId: value.customCheckId,
	});
	if (value.definitionDigest !== expectedDigest) {
		throw new Error(
			`Custom Check ${value.customCheckId} definitionDigest does not match definition.`,
		);
	}
	const bytes = Buffer.byteLength(canonicalJson(value), "utf8");
	if (bytes > MAX_CUSTOM_CHECK_BYTES) {
		throw new Error(
			`Custom Check ${value.customCheckId} exceeds ${MAX_CUSTOM_CHECK_BYTES} UTF-8 bytes.`,
		);
	}
}

export function customCheckDefinitionCheckId(
	definition: Pick<CustomCheckDefinition, "customCheckId">,
): string {
	if (!CUSTOM_CHECK_ID.test(definition.customCheckId)) {
		throw new Error("Custom Check customCheckId is invalid.");
	}
	return `custom.${definition.customCheckId.slice("custom-check:".length)}`;
}

function withLifecycle(
	current: CustomCheckDefinition,
	lifecycle: CustomCheckLifecycle,
): CustomCheckDefinition {
	return materializeDefinition({
		...cloneDefinition(current),
		lifecycle,
	});
}

function materializeDefinition(
	input: Omit<CustomCheckDefinition, "definitionDigest">,
): CustomCheckDefinition {
	const normalizedProposal = normalizeProposal(input, true);
	const semanticDefinition = {
		...normalizedProposal,
		schemaVersion: input.schemaVersion,
		customCheckId: input.customCheckId,
	};
	const definition = {
		...semanticDefinition,
		definitionDigest: definitionDigest(semanticDefinition),
		lifecycle: input.lifecycle,
	} as CustomCheckDefinition;
	assertCustomCheckDefinition(definition);
	return Object.freeze(cloneDefinition(definition));
}

function normalizeProposal(
	value: CustomCheckProposal,
	allowRuntimeFields = false,
): CustomCheckProposal {
	assertRecord(value, "Custom Check proposal");
	assertKnownKeys(value, "Custom Check proposal", [
		"checkTypeId",
		"name",
		"requirement",
		"repairGuidance",
		"appliesWhen",
		"knowledgeRefs",
		...(allowRuntimeFields
			? ["schemaVersion", "customCheckId", "definitionDigest", "lifecycle"]
			: []),
	]);
	if (!isCustomCheckTypeId(value.checkTypeId)) {
		throw new Error(`Unknown Custom Check Type ${String(value.checkTypeId)}.`);
	}
	const checkType = getCustomCheckType(value.checkTypeId);
	const name = boundedText(value.name, "Custom Check name", 80);
	const requirement = boundedText(
		value.requirement,
		"Custom Check requirement",
		2_000,
	);
	const repairGuidance = optionalBoundedText(
		value.repairGuidance,
		"Custom Check repairGuidance",
		1_000,
	);
	const appliesWhen = normalizeApplicability(value.appliesWhen, checkType.loops);
	const knowledgeRefs = normalizeStringList(
		value.knowledgeRefs ?? [],
		"Custom Check knowledgeRefs",
		8,
		512,
	);
	return {
		checkTypeId: value.checkTypeId,
		name,
		requirement,
		...(repairGuidance ? { repairGuidance } : {}),
		appliesWhen,
		...(knowledgeRefs.length > 0 ? { knowledgeRefs } : {}),
	};
}

function normalizeApplicability(
	value: CustomCheckApplicability,
	eligibleLoops: readonly SemanticLoop[],
): CustomCheckApplicability {
	assertRecord(value, "Custom Check appliesWhen");
	assertKnownKeys(value, "Custom Check appliesWhen", [
		"loops",
		"changeKinds",
		"affectedLayers",
		"pathScopes",
	]);
	const loops = normalizeEnumList(
		value.loops ?? [],
		SEMANTIC_LOOPS,
		"Custom Check appliesWhen.loops",
	);
	for (const loop of loops) {
		if (!eligibleLoops.includes(loop)) {
			throw new Error(`Custom Check Type is not eligible for ${loop}.`);
		}
	}
	const changeKinds = normalizeEnumList(
		value.changeKinds ?? [],
		CHANGE_KIND_VALUES,
		"Custom Check appliesWhen.changeKinds",
	);
	const affectedLayers = normalizeStringList(
		value.affectedLayers ?? [],
		"Custom Check appliesWhen.affectedLayers",
		16,
		64,
	).map((layer) => layer.toLowerCase());
	const pathScopes = normalizeStringList(
		value.pathScopes ?? [],
		"Custom Check appliesWhen.pathScopes",
		16,
		256,
	).map(normalizePathScope);
	return {
		...(loops.length > 0 ? { loops } : {}),
		...(changeKinds.length > 0 ? { changeKinds } : {}),
		...(affectedLayers.length > 0
			? { affectedLayers: [...new Set(affectedLayers)].sort(compareText) }
			: {}),
		...(pathScopes.length > 0
			? { pathScopes: [...new Set(pathScopes)].sort(compareText) }
			: {}),
	};
}

function definitionDigest(
	value: Omit<CustomCheckDefinition, "definitionDigest" | "lifecycle">,
): Sha256Digest {
	return canonicalJsonDigest(value);
}

function cloneDefinition(
	definition: CustomCheckDefinition,
): CustomCheckDefinition {
	return {
		...definition,
		appliesWhen: {
			...(definition.appliesWhen.loops
				? { loops: [...definition.appliesWhen.loops] }
				: {}),
			...(definition.appliesWhen.changeKinds
				? { changeKinds: [...definition.appliesWhen.changeKinds] }
				: {}),
			...(definition.appliesWhen.affectedLayers
				? { affectedLayers: [...definition.appliesWhen.affectedLayers] }
				: {}),
			...(definition.appliesWhen.pathScopes
				? { pathScopes: [...definition.appliesWhen.pathScopes] }
				: {}),
		},
		...(definition.knowledgeRefs
			? { knowledgeRefs: [...definition.knowledgeRefs] }
			: {}),
	};
}

function normalizePathScope(value: string): string {
	const normalized = value
		.replaceAll("\\", "/")
		.replace(/^\.\//u, "")
		.replace(/\/+$/u, "");
	if (
		!normalized ||
		normalized.startsWith("/") ||
		normalized.split("/").includes("..") ||
		/[\u0000*?[\]{}]/u.test(normalized)
	) {
		throw new Error(`Custom Check path scope ${JSON.stringify(value)} is invalid.`);
	}
	return normalized;
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
	if (!normalized) throw new Error(`${label} cannot be blank.`);
	if (PROHIBITED_TEXT.test(normalized)) {
		throw new Error(`${label} contains prohibited control characters.`);
	}
	if ([...normalized].length > maximum) {
		throw new Error(`${label} cannot exceed ${maximum} Unicode code points.`);
	}
	return normalized;
}

function optionalBoundedText(
	value: unknown,
	label: string,
	maximum: number,
): string | undefined {
	if (value === undefined) return undefined;
	return boundedText(value, label, maximum);
}

function normalizeStringList(
	value: readonly string[],
	label: string,
	maximumItems: number,
	maximumLength: number,
): string[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	if (value.length > maximumItems) {
		throw new Error(`${label} cannot exceed ${maximumItems} entries.`);
	}
	const normalized = value.map((entry) =>
		boundedText(entry, `${label} entry`, maximumLength),
	);
	assertUnique(normalized, label);
	return normalized.sort(compareText);
}

function normalizeEnumList<T extends string>(
	value: readonly T[],
	allowed: readonly T[],
	label: string,
): T[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	for (const entry of value) {
		if (!allowed.includes(entry)) {
			throw new Error(`${label} contains unsupported value ${String(entry)}.`);
		}
	}
	assertUnique([...value], label);
	return [...value].sort(compareText);
}

function assertKnownKeys(
	value: object,
	label: string,
	allowed: readonly string[],
): void {
	const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unsupported.length > 0) {
		throw new Error(
			`${label} received unsupported field${unsupported.length === 1 ? "" : "s"} ${unsupported.join(", ")}.`,
		);
	}
}

function assertRecord(value: unknown, label: string): asserts value is object {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} cannot contain duplicates.`);
	}
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
