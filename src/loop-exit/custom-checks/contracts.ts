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
import {
	isUserStandardId,
	isUserStandardPassageId,
	normalizeUserStandardDefinitions,
	type UserStandardDefinition,
} from "./user-standards.ts";

export const CUSTOM_CHECK_SCHEMA_VERSION = "3.0.0" as const;
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

export interface CustomCheckStandardRef {
	readonly userStandardId: string;
	readonly standardDigest: Sha256Digest;
	readonly passageIds: readonly string[];
}

export interface CustomCheckProposal {
	readonly checkTypeId: CustomCheckTypeId;
	readonly name: string;
	readonly requirement: string;
	readonly repairGuidance?: string;
	readonly appliesWhen: CustomCheckApplicability;
	readonly standardRefs: readonly CustomCheckStandardRef[];
	readonly knowledgeRefs?: readonly string[];
}

export interface CustomCheckDefinition extends CustomCheckProposal {
	readonly schemaVersion: typeof CUSTOM_CHECK_SCHEMA_VERSION;
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly lifecycle: CustomCheckLifecycle;
}

export function normalizeCustomCheckProposal(
	proposal: CustomCheckProposal,
): CustomCheckProposal {
	return Object.freeze(cloneProposal(normalizeProposal(proposal)));
}

export function createCustomCheckDefinition(
	proposal: CustomCheckProposal,
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	const standards = normalizeUserStandardDefinitions(userStandards);
	const normalized = normalizeProposal(proposal);
	assertAcceptedStandardRefs(normalized.standardRefs, standards);
	const customCheckId = `custom-check:${canonicalJsonDigest(normalized).slice(
		"sha256:".length,
	)}`;
	return materializeDefinition(
		{
			...normalized,
			schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
			customCheckId,
			lifecycle: "draft",
		},
		standards,
	);
}

export function updateCustomCheckDefinition(
	current: CustomCheckDefinition,
	proposal: CustomCheckProposal,
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	const standards = normalizeUserStandardDefinitions(userStandards);
	assertCustomCheckDefinition(current, standards);
	const normalized = normalizeProposal(proposal);
	assertAcceptedStandardRefs(normalized.standardRefs, standards);
	if (normalized.checkTypeId !== current.checkTypeId) {
		throw new Error("Custom Check Type cannot change after creation.");
	}
	return materializeDefinition(
		{
			...normalized,
			schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
			customCheckId: current.customCheckId,
			lifecycle: current.lifecycle,
		},
		standards,
	);
}

export function activateCustomCheckDefinition(
	current: CustomCheckDefinition,
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	const standards = normalizeUserStandardDefinitions(userStandards);
	assertCustomCheckDefinition(current, standards);
	if (current.lifecycle !== "draft") {
		throw new Error(
			`Custom Check ${current.customCheckId} must be draft before activation.`,
		);
	}
	return withLifecycle(current, "active", standards);
}

export function disableCustomCheckDefinition(
	current: CustomCheckDefinition,
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	const standards = normalizeUserStandardDefinitions(userStandards);
	assertCustomCheckDefinition(current, standards);
	if (current.lifecycle === "disabled") {
		throw new Error(`Custom Check ${current.customCheckId} is already disabled.`);
	}
	return withLifecycle(current, "disabled", standards);
}

export function normalizeCustomCheckDefinitions(
	value: readonly CustomCheckDefinition[],
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition[] {
	if (!Array.isArray(value)) {
		throw new Error("Custom Checks must be an array.");
	}
	if (value.length > MAX_CUSTOM_CHECKS) {
		throw new Error(
			`Custom Checks cannot exceed ${MAX_CUSTOM_CHECKS} definitions per project.`,
		);
	}
	const standards = normalizeUserStandardDefinitions(userStandards);
	const normalized = value.map((definition) => {
		assertCustomCheckDefinition(definition, standards);
		return materializeDefinition(cloneDefinition(definition), standards);
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

export function customCheckConfigurationDigest(input: {
	readonly userStandards: readonly UserStandardDefinition[];
	readonly customChecks: readonly CustomCheckDefinition[];
}): Sha256Digest {
	const userStandards = normalizeUserStandardDefinitions(input.userStandards);
	return canonicalJsonDigest({
		schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
		userStandards,
		definitions: normalizeCustomCheckDefinitions(input.customChecks, userStandards),
	});
}

export function assertCustomCheckDefinition(
	value: CustomCheckDefinition,
	userStandards: readonly UserStandardDefinition[],
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
		"standardRefs",
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
	const standards = normalizeUserStandardDefinitions(userStandards);
	const normalizedProposal = normalizeProposal(value, true);
	assertAcceptedStandardRefs(normalizedProposal.standardRefs, standards);
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
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	return materializeDefinition(
		{
			...cloneDefinition(current),
			lifecycle,
		},
		userStandards,
	);
}

function materializeDefinition(
	input: Omit<CustomCheckDefinition, "definitionDigest">,
	userStandards: readonly UserStandardDefinition[],
): CustomCheckDefinition {
	const normalizedProposal = normalizeProposal(input, true);
	assertAcceptedStandardRefs(normalizedProposal.standardRefs, userStandards);
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
	assertCustomCheckDefinition(definition, userStandards);
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
		"standardRefs",
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
	const standardRefs = normalizeCustomCheckStandardRefs(value.standardRefs);
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
		standardRefs,
		...(knowledgeRefs.length > 0 ? { knowledgeRefs } : {}),
	};
}

export function normalizeCustomCheckStandardRefs(
	value: readonly CustomCheckStandardRef[],
): CustomCheckStandardRef[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(
			"Custom Check standardRefs must contain at least one accepted User Standard binding.",
		);
	}
	if (value.length > 8) {
		throw new Error("Custom Check standardRefs cannot exceed 8 entries.");
	}
	const normalized = value.map((reference) => {
		assertRecord(reference, "Custom Check standardRef");
		const record = reference as unknown as Record<string, unknown>;
		assertKnownKeys(record, "Custom Check standardRef", [
			"userStandardId",
			"standardDigest",
			"passageIds",
		]);
		if (!isUserStandardId(record.userStandardId)) {
			throw new Error("Custom Check standardRef userStandardId is invalid.");
		}
		if (typeof record.standardDigest !== "string" || !DIGEST.test(record.standardDigest)) {
			throw new Error("Custom Check standardRef standardDigest is invalid.");
		}
		if (!Array.isArray(record.passageIds) || record.passageIds.length === 0) {
			throw new Error(
				"Custom Check standardRef passageIds must contain at least one passage.",
			);
		}
		if (record.passageIds.length > 8) {
			throw new Error(
				"Custom Check standardRef passageIds cannot exceed 8 entries.",
			);
		}
		for (const passageId of record.passageIds) {
			if (!isUserStandardPassageId(passageId)) {
				throw new Error("Custom Check standardRef contains an invalid passageId.");
			}
		}
		const passageIds = record.passageIds as string[];
		assertUnique(passageIds, "Custom Check standardRef passageIds");
		return {
			userStandardId: record.userStandardId,
			standardDigest: record.standardDigest as Sha256Digest,
			passageIds: [...passageIds].sort(compareText),
		};
	});
	assertUnique(
		normalized.map((reference) => reference.userStandardId),
		"Custom Check standardRef User Standard ids",
	);
	return normalized.sort((left, right) =>
		compareText(left.userStandardId, right.userStandardId),
	);
}

function assertAcceptedStandardRefs(
	references: readonly CustomCheckStandardRef[],
	userStandards: readonly UserStandardDefinition[],
): void {
	const standardsById = new Map(
		normalizeUserStandardDefinitions(userStandards).map((standard) => [
			standard.userStandardId,
			standard,
		]),
	);
	for (const reference of references) {
		const standard = standardsById.get(reference.userStandardId);
		if (!standard) {
			throw new Error(
				`Custom Check User Standard ${reference.userStandardId} does not exist in accepted User Standards.`,
			);
		}
		if (reference.standardDigest !== standard.standardDigest) {
			throw new Error(
				`Custom Check User Standard ${reference.userStandardId} standardDigest does not match accepted User Standard.`,
			);
		}
		const acceptedPassageIds = new Set(
			standard.passages.map((passage) => passage.passageId),
		);
		for (const passageId of reference.passageIds) {
			if (!acceptedPassageIds.has(passageId)) {
				throw new Error(
					`Custom Check User Standard ${reference.userStandardId} references unknown passage ${passageId}.`,
				);
			}
		}
	}
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
		standardRefs: definition.standardRefs.map((reference) => ({
			...reference,
			passageIds: [...reference.passageIds],
		})),
		...(definition.knowledgeRefs
			? { knowledgeRefs: [...definition.knowledgeRefs] }
			: {}),
	};
}

function cloneProposal(proposal: CustomCheckProposal): CustomCheckProposal {
	return {
		...proposal,
		appliesWhen: {...proposal.appliesWhen},
		standardRefs: proposal.standardRefs.map((reference) => ({
			...reference,
			passageIds: [...reference.passageIds],
		})),
		...(proposal.knowledgeRefs
			? {knowledgeRefs: [...proposal.knowledgeRefs]}
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
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
