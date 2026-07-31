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
import type { CheckEnforcement } from "../contracts.ts";
import {
	getCustomCheckType,
	isCustomCheckTypeId,
	type CustomCheckTypeId,
} from "./check-types.ts";

export const CUSTOM_CHECK_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_CUSTOM_CHECKS = 64;
export const MAX_CUSTOM_CHECKS_PER_TYPE = 16;
export const MAX_CUSTOM_CHECK_BYTES = 16_384;

const SEMANTIC_LOOPS: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];
const CUSTOM_CHECK_LIFECYCLES = ["draft", "active", "disabled"] as const;
const CHECK_ENFORCEMENTS: readonly CheckEnforcement[] = [
	"observe",
	"warn",
	"require",
];
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

export interface CustomCheckApproval {
	readonly status: "approved";
	readonly refs: readonly string[];
}

export interface CustomCheckDefinition extends CustomCheckProposal {
	readonly schemaVersion: typeof CUSTOM_CHECK_SCHEMA_VERSION;
	readonly customCheckId: string;
	readonly revision: number;
	readonly contentDigest: Sha256Digest;
	readonly lifecycle: CustomCheckLifecycle;
	readonly rollout: CheckEnforcement;
	readonly rolloutHistory: readonly CheckEnforcement[];
	readonly approval?: CustomCheckApproval;
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
		revision: 1,
		lifecycle: "draft",
		rollout: "observe",
		rolloutHistory: [],
	});
}

export function reviseCustomCheckDefinition(
	current: CustomCheckDefinition,
	proposal: CustomCheckProposal,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	return materializeDefinition({
		...normalizeProposal(proposal),
		schemaVersion: CUSTOM_CHECK_SCHEMA_VERSION,
		customCheckId: current.customCheckId,
		revision: current.revision + 1,
		lifecycle: "draft",
		rollout: "observe",
		rolloutHistory: [],
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
	return nextDefinition(current, {
		lifecycle: "active",
		rollout: "observe",
		rolloutHistory: [],
		approval: undefined,
	});
}

export function promoteCustomCheckDefinition(
	current: CustomCheckDefinition,
	approval?: CustomCheckApproval,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	if (current.lifecycle !== "active") {
		throw new Error(
			`Custom Check ${current.customCheckId} must be active before promotion.`,
		);
	}
	if (current.rollout === "observe") {
		if (approval !== undefined) {
			throw new Error("Custom Check warn promotion cannot include approval.");
		}
		return nextDefinition(current, {
			rollout: "warn",
			rolloutHistory: ["observe"],
			approval: undefined,
		});
	}
	if (current.rollout === "warn") {
		if (!approval) {
			throw new Error("Custom Check require promotion needs approval.");
		}
		return nextDefinition(current, {
			rollout: "require",
			rolloutHistory: ["observe", "warn"],
			approval: normalizeApproval(approval),
		});
	}
	throw new Error(`Custom Check ${current.customCheckId} is already required.`);
}

export function disableCustomCheckDefinition(
	current: CustomCheckDefinition,
): CustomCheckDefinition {
	assertCustomCheckDefinition(current);
	if (current.lifecycle === "disabled") {
		throw new Error(`Custom Check ${current.customCheckId} is already disabled.`);
	}
	return nextDefinition(current, { lifecycle: "disabled" });
}

export function normalizeCustomCheckDefinitions(
	value: readonly CustomCheckDefinition[],
): CustomCheckDefinition[] {
	if (!Array.isArray(value)) {
		throw new Error("Custom Checks must be an array.");
	}
	if (value.length > MAX_CUSTOM_CHECKS) {
		throw new Error(`Custom Checks cannot exceed ${MAX_CUSTOM_CHECKS}.`);
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
		left.customCheckId.localeCompare(right.customCheckId),
	);
}

export function assertCustomCheckDefinition(
	value: CustomCheckDefinition,
): void {
	assertRecord(value, "Custom Check definition");
	assertKnownKeys(value, "Custom Check definition", [
		"schemaVersion",
		"customCheckId",
		"revision",
		"contentDigest",
		"checkTypeId",
		"name",
		"requirement",
		"repairGuidance",
		"appliesWhen",
		"knowledgeRefs",
		"lifecycle",
		"rollout",
		"rolloutHistory",
		"approval",
	]);
	if (value.schemaVersion !== CUSTOM_CHECK_SCHEMA_VERSION) {
		throw new Error(
			`Custom Check schemaVersion must be ${CUSTOM_CHECK_SCHEMA_VERSION}.`,
		);
	}
	if (!CUSTOM_CHECK_ID.test(value.customCheckId)) {
		throw new Error("Custom Check customCheckId is invalid.");
	}
	if (!Number.isInteger(value.revision) || value.revision < 1) {
		throw new Error("Custom Check revision must be a positive integer.");
	}
	if (!DIGEST.test(value.contentDigest)) {
		throw new Error("Custom Check contentDigest is invalid.");
	}
	const normalized = normalizeProposal(value, true);
	if (!CUSTOM_CHECK_LIFECYCLES.includes(value.lifecycle)) {
		throw new Error(`Custom Check lifecycle ${String(value.lifecycle)} is invalid.`);
	}
	if (!CHECK_ENFORCEMENTS.includes(value.rollout)) {
		throw new Error(`Custom Check rollout ${String(value.rollout)} is invalid.`);
	}
	assertRollout(value);
	const expectedDigest = definitionDigest({
		...normalized,
		schemaVersion: value.schemaVersion,
		customCheckId: value.customCheckId,
		revision: value.revision,
		lifecycle: value.lifecycle,
		rollout: value.rollout,
		rolloutHistory: [...value.rolloutHistory],
		...(value.approval ? { approval: normalizeApproval(value.approval) } : {}),
	});
	if (value.contentDigest !== expectedDigest) {
		throw new Error(
			`Custom Check ${value.customCheckId} contentDigest does not match content.`,
		);
	}
	if (Buffer.byteLength(canonicalJson(value), "utf8") > MAX_CUSTOM_CHECK_BYTES) {
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

function nextDefinition(
	current: CustomCheckDefinition,
	changes: Partial<
		Pick<
			CustomCheckDefinition,
			"lifecycle" | "rollout" | "rolloutHistory" | "approval"
		>
	>,
): CustomCheckDefinition {
	const withoutDigest = {
		...cloneDefinition(current),
		...changes,
		revision: current.revision + 1,
	};
	delete (withoutDigest as { contentDigest?: Sha256Digest }).contentDigest;
	if ("approval" in changes && changes.approval === undefined) {
		delete (withoutDigest as { approval?: CustomCheckApproval }).approval;
	}
	return materializeDefinition(withoutDigest);
}

function materializeDefinition(
	input: Omit<CustomCheckDefinition, "contentDigest">,
): CustomCheckDefinition {
	const normalizedProposal = normalizeProposal(input, true);
	const normalized = {
		...normalizedProposal,
		schemaVersion: input.schemaVersion,
		customCheckId: input.customCheckId,
		revision: input.revision,
		lifecycle: input.lifecycle,
		rollout: input.rollout,
		rolloutHistory: [...input.rolloutHistory],
		...(input.approval ? { approval: normalizeApproval(input.approval) } : {}),
	};
	const definition = {
		...normalized,
		contentDigest: definitionDigest(normalized),
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
			? [
					"schemaVersion",
					"customCheckId",
					"revision",
					"contentDigest",
					"lifecycle",
					"rollout",
					"rolloutHistory",
					"approval",
				]
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
			throw new Error(
				`Custom Check Type is not eligible for ${loop}.`,
			);
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

function assertRollout(definition: CustomCheckDefinition): void {
	if (!Array.isArray(definition.rolloutHistory)) {
		throw new Error("Custom Check rolloutHistory must be an array.");
	}
	const expected =
		definition.rollout === "observe"
			? []
			: definition.rollout === "warn"
				? ["observe"]
				: ["observe", "warn"];
	if (JSON.stringify(definition.rolloutHistory) !== JSON.stringify(expected)) {
		throw new Error(
			`Custom Check ${definition.customCheckId} rolloutHistory must be ${expected.join(" -> ") || "empty"}.`,
		);
	}
	if (definition.rollout === "require") {
		if (!definition.approval) {
			throw new Error(
				`Custom Check ${definition.customCheckId} requires approval.`,
			);
		}
		normalizeApproval(definition.approval);
	} else if (definition.approval !== undefined) {
		throw new Error(
			`Custom Check ${definition.customCheckId} can include approval only when required.`,
		);
	}
}

function normalizeApproval(value: CustomCheckApproval): CustomCheckApproval {
	assertRecord(value, "Custom Check approval");
	assertKnownKeys(value, "Custom Check approval", ["status", "refs"]);
	if (value.status !== "approved") {
		throw new Error("Custom Check approval status must be approved.");
	}
	const refs = normalizeStringList(
		value.refs,
		"Custom Check approval.refs",
		8,
		512,
	);
	if (refs.length === 0) {
		throw new Error("Custom Check approval requires at least one ref.");
	}
	return { status: "approved", refs };
}

function definitionDigest(
	value: Omit<CustomCheckDefinition, "contentDigest">,
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
		rolloutHistory: [...definition.rolloutHistory],
		...(definition.approval
			? { approval: { ...definition.approval, refs: [...definition.approval.refs] } }
			: {}),
	};
}

function normalizePathScope(value: string): string {
	const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
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
	return value === undefined ? undefined : boundedText(value, label, maximum);
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
	const extra = Object.keys(value).filter((key) => !allowed.includes(key));
	if (extra.length > 0) {
		throw new Error(`${label} received unsupported field ${extra.sort()[0]}.`);
	}
}

function assertRecord(value: unknown, label: string): asserts value is object {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} must be unique.`);
	}
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
