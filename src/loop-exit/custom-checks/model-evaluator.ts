import type { EvidenceId } from "../../evidence/contracts.ts";
import type { CheckResult } from "../contracts.ts";
import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const CUSTOM_CHECK_EVALUATOR_PROTOCOL = Object.freeze({
	id: "codewiki.custom-check-evaluator",
	version: "1.0.0",
	maxEvidenceGaps: 16,
	maxCounterevidence: 16,
	maxRepairTargets: 16,
	maxRepairSummaryCodePoints: 1_000,
	maxTextCodePoints: 500,
});

export interface CustomCheckEvaluatorStandardBinding {
	readonly userStandardId: string;
	readonly standardDigest: Sha256Digest;
	readonly name: string;
	readonly source: {
		readonly kind: "inline" | "url";
		readonly mediaType: "text/plain" | "text/markdown";
		readonly contentDigest: Sha256Digest;
		readonly observedAt: string;
		readonly uri?: string;
	};
	readonly passages: readonly {
		readonly passageId: string;
		readonly text: string;
	}[];
}

export interface CustomCheckEvaluatorBinding {
	readonly protocolId: typeof CUSTOM_CHECK_EVALUATOR_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_EVALUATOR_PROTOCOL.version;
	readonly sessionIsolation: "fresh_no_shared_state";
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly checkTypeId: string;
	readonly checkTypeVersion: string;
	readonly evaluatorId: string;
	readonly candidateDigest: Sha256Digest;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly checkDigest: Sha256Digest;
	readonly protectedSourceHead: string;
	readonly protectedConfigDigest: Sha256Digest;
	readonly customCheckConfigDigest: Sha256Digest;
	readonly protectedConfigSnapshotDigest: Sha256Digest;
	readonly standardBindings: readonly CustomCheckEvaluatorStandardBinding[];
	readonly knowledgeRefs: readonly string[];
	readonly repairGuidance?: string;
	readonly consideredEvidenceIds: readonly EvidenceId[];
	readonly prerequisiteResults: readonly {
		readonly checkId: string;
		readonly checkVersion: string;
		readonly resultDigest: Sha256Digest;
		readonly status: CheckResult["status"];
		readonly evidenceInputDigest: Sha256Digest;
	}[];
	readonly route: {
		readonly id: string;
		readonly provider: string;
		readonly model: string;
	};
	readonly configurationDigest: Sha256Digest;
	readonly evaluatorBindingDigest: Sha256Digest;
}

export interface CustomCheckEvaluatorAssessmentExtension {
	readonly protocolId: typeof CUSTOM_CHECK_EVALUATOR_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_EVALUATOR_PROTOCOL.version;
	readonly evaluatorBindingDigest: Sha256Digest;
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly checkTypeId: string;
	readonly checkTypeVersion: string;
	readonly evaluatorId: string;
	readonly prerequisiteResultDigests: readonly Sha256Digest[];
	readonly evidenceGaps: readonly string[];
	readonly counterevidence: readonly string[];
	readonly coverage: "complete" | "partial";
	readonly truncated: boolean;
	readonly repair: {
		readonly summary: string;
		readonly targetRefs: readonly string[];
	} | null;
}

export function normalizeCustomCheckEvaluatorStandardBindings(
	value: unknown,
): CustomCheckEvaluatorStandardBinding[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
		throw new Error("Custom Check Evaluator Standard bindings are invalid.");
	}
	const bindings = value.map(normalizeStandardBinding);
	if (new Set(bindings.map((binding) => binding.userStandardId)).size !== bindings.length) {
		throw new Error("Custom Check Evaluator Standard bindings must be unique.");
	}
	return bindings;
}

export function createCustomCheckEvaluatorBinding(
	input: Omit<CustomCheckEvaluatorBinding, "protocolId" | "protocolVersion" | "sessionIsolation" | "evaluatorBindingDigest">,
): CustomCheckEvaluatorBinding {
	const body = {
		protocolId: CUSTOM_CHECK_EVALUATOR_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_EVALUATOR_PROTOCOL.version,
		sessionIsolation: "fresh_no_shared_state" as const,
		...input,
	};
	return Object.freeze({
		...body,
		evaluatorBindingDigest: canonicalJsonDigest(body),
	});
}

export function normalizeCustomCheckEvaluatorAssessment(input: {
	readonly value: unknown;
	readonly binding: CustomCheckEvaluatorBinding;
}): CustomCheckEvaluatorAssessmentExtension {
	assertExactKeys({
		value: input.value,
		allowed: [
			"protocolId",
			"protocolVersion",
			"evaluatorBindingDigest",
			"customCheckId",
			"definitionDigest",
			"checkTypeId",
			"checkTypeVersion",
			"evaluatorId",
			"prerequisiteResultDigests",
			"evidenceGaps",
			"counterevidence",
			"coverage",
			"truncated",
			"repair",
		],
		label: "Custom Check Evaluator assessment",
	});
	const value = input.value as Record<string, unknown>;
	if (
		value.protocolId !== CUSTOM_CHECK_EVALUATOR_PROTOCOL.id ||
		value.protocolVersion !== CUSTOM_CHECK_EVALUATOR_PROTOCOL.version ||
		value.evaluatorBindingDigest !== input.binding.evaluatorBindingDigest ||
		value.customCheckId !== input.binding.customCheckId ||
		value.definitionDigest !== input.binding.definitionDigest ||
		value.checkTypeId !== input.binding.checkTypeId ||
		value.checkTypeVersion !== input.binding.checkTypeVersion ||
		value.evaluatorId !== input.binding.evaluatorId
	) {
		throw new Error("Custom Check Evaluator assessment identity does not match request.");
	}
	const prerequisiteResultDigests = normalizedDigests({
		value: value.prerequisiteResultDigests,
		label: "prerequisite Result digests",
	});
	const expectedPrerequisites = input.binding.prerequisiteResults.map(
		(result) => result.resultDigest,
	);
	if (!sameTextList({left: prerequisiteResultDigests, right: expectedPrerequisites})) {
		throw new Error("Custom Check Evaluator prerequisite Results do not match request.");
	}
	if (value.coverage !== "complete" && value.coverage !== "partial") {
		throw new Error("Custom Check Evaluator assessment coverage is invalid.");
	}
	if (typeof value.truncated !== "boolean") {
		throw new Error("Custom Check Evaluator assessment truncation is invalid.");
	}
	return {
		protocolId: CUSTOM_CHECK_EVALUATOR_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_EVALUATOR_PROTOCOL.version,
		evaluatorBindingDigest: input.binding.evaluatorBindingDigest,
		customCheckId: input.binding.customCheckId,
		definitionDigest: input.binding.definitionDigest,
		checkTypeId: input.binding.checkTypeId,
		checkTypeVersion: input.binding.checkTypeVersion,
		evaluatorId: input.binding.evaluatorId,
		prerequisiteResultDigests,
		evidenceGaps: normalizedTextList({
			value: value.evidenceGaps,
			maximumItems: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxEvidenceGaps,
			maximumCodePoints: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxTextCodePoints,
			label: "Evidence gaps",
		}),
		counterevidence: normalizedTextList({
			value: value.counterevidence,
			maximumItems: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxCounterevidence,
			maximumCodePoints: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxTextCodePoints,
			label: "counterevidence",
		}),
		coverage: value.coverage,
		truncated: value.truncated,
		repair: normalizedRepair(value.repair),
	};
}

function normalizeStandardBinding(
	value: unknown,
): CustomCheckEvaluatorStandardBinding {
	assertExactKeys({
		value,
		allowed: ["userStandardId", "standardDigest", "name", "source", "passages"],
		label: "Custom Check Evaluator Standard binding",
	});
	const binding = value as Record<string, unknown>;
	const source = normalizeStandardSource(binding.source);
	const userStandardId = requiredBoundedText({
		value: binding.userStandardId,
		maximumCodePoints: 80,
		label: "Custom Check Evaluator User Standard id",
	});
	const standardDigest = requiredDigest({
		value: binding.standardDigest,
		label: "Standard digest",
	});
	const passages = normalizeStandardPassages(binding.passages);
	return {
		userStandardId,
		standardDigest,
		name: requiredBoundedText({
			value: binding.name,
			maximumCodePoints: 80,
			label: "Custom Check Evaluator Standard name",
		}),
		source,
		passages,
	};
}

function normalizeStandardSource(
	value: unknown,
): CustomCheckEvaluatorStandardBinding["source"] {
	const hasUri =
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		"uri" in value;
	assertExactKeys({
		value,
		allowed:
			!hasUri
				? ["kind", "mediaType", "contentDigest", "observedAt"]
				: ["kind", "mediaType", "contentDigest", "observedAt", "uri"],
		label: "Custom Check Evaluator Standard source",
	});
	const source = value as Record<string, unknown>;
	if (!isSupportedStandardSource(source)) {
		throw new Error("Custom Check Evaluator Standard source is invalid.");
	}
	return {
		kind: source.kind,
		mediaType: source.mediaType,
		contentDigest: requiredDigest({
			value: source.contentDigest,
			label: "Standard content digest",
		}),
		observedAt: source.observedAt,
		...(source.uri ? {uri: source.uri as string} : {}),
	};
}

function isSupportedStandardSource(
	source: Readonly<Record<string, unknown>>,
): source is Readonly<{
	kind: "inline" | "url";
	mediaType: "text/plain" | "text/markdown";
	contentDigest: unknown;
	observedAt: string;
	uri?: string;
}> {
	return (
		(source.kind === "inline" || source.kind === "url") &&
		(source.mediaType === "text/plain" || source.mediaType === "text/markdown") &&
		typeof source.observedAt === "string" &&
		Number.isFinite(Date.parse(source.observedAt)) &&
		(source.uri === undefined ||
			(source.kind === "url" && typeof source.uri === "string"))
	);
}

function normalizeStandardPassages(
	value: unknown,
): CustomCheckEvaluatorStandardBinding["passages"] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
		throw new Error("Custom Check Evaluator Standard passages are invalid.");
	}
	const passages = value.map((passage) => {
		assertExactKeys({
			value: passage,
			allowed: ["passageId", "text"],
			label: "Custom Check Evaluator Standard passage",
		});
		const record = passage as Record<string, unknown>;
		return {
			passageId: requiredBoundedText({
				value: record.passageId,
				maximumCodePoints: 96,
				label: "Custom Check Evaluator Standard passage id",
			}),
			text: requiredBoundedText({
				value: record.text,
				maximumCodePoints: 2_000,
				label: "Custom Check Evaluator Standard passage text",
			}),
		};
	});
	if (new Set(passages.map((passage) => passage.passageId)).size !== passages.length) {
		throw new Error("Custom Check Evaluator Standard passages must be unique.");
	}
	return passages;
}

function requiredDigest(input: {
	readonly value: unknown;
	readonly label: string;
}): Sha256Digest {
	if (
		typeof input.value !== "string" ||
		!/^sha256:[0-9a-f]{64}$/u.test(input.value)
	) {
		throw new Error(`Custom Check Evaluator ${input.label} is invalid.`);
	}
	return input.value as Sha256Digest;
}

function normalizedRepair(
	value: unknown,
): CustomCheckEvaluatorAssessmentExtension["repair"] {
	if (value === null) return null;
	assertExactKeys({
		value,
		allowed: ["summary", "targetRefs"],
		label: "Custom Check Evaluator repair",
	});
	const repair = value as Record<string, unknown>;
	return {
		summary: requiredBoundedText({
			value: repair.summary,
			maximumCodePoints: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxRepairSummaryCodePoints,
			label: "Custom Check Evaluator repair summary",
		}),
		targetRefs: normalizedTextList({
			value: repair.targetRefs,
			maximumItems: CUSTOM_CHECK_EVALUATOR_PROTOCOL.maxRepairTargets,
			maximumCodePoints: 256,
			label: "repair target refs",
		}),
	};
}

function normalizedDigests(input: {
	readonly value: unknown;
	readonly label: string;
}): Sha256Digest[] {
	const values = normalizedTextList({
		value: input.value,
		maximumItems: 64,
		maximumCodePoints: 71,
		label: input.label,
	});
	if (values.some((entry) => !/^sha256:[0-9a-f]{64}$/u.test(entry))) {
		throw new Error(`Custom Check Evaluator ${input.label} are invalid.`);
	}
	return values as Sha256Digest[];
}

function normalizedTextList(input: {
	readonly value: unknown;
	readonly maximumItems: number;
	readonly maximumCodePoints: number;
	readonly label: string;
}): string[] {
	if (!Array.isArray(input.value) || input.value.length > input.maximumItems) {
		throw new Error(`Custom Check Evaluator ${input.label} are invalid.`);
	}
	const normalized = input.value.map((entry) =>
		requiredBoundedText({
			value: entry,
			maximumCodePoints: input.maximumCodePoints,
			label: `Custom Check Evaluator ${input.label}`,
		}),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`Custom Check Evaluator ${input.label} must be unique.`);
	}
	return normalized;
}

function requiredBoundedText(input: {
	readonly value: unknown;
	readonly maximumCodePoints: number;
	readonly label: string;
}): string {
	if (typeof input.value !== "string") {
		throw new Error(`${input.label} is invalid.`);
	}
	const normalized = input.value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
	if (
		normalized.length === 0 ||
		Array.from(normalized).length > input.maximumCodePoints ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
	) {
		throw new Error(`${input.label} is invalid.`);
	}
	return normalized;
}

function sameTextList(input: {
	readonly left: readonly string[];
	readonly right: readonly string[];
}): boolean {
	if (input.left.length !== input.right.length) return false;
	for (let index = 0; index < input.left.length; index += 1) {
		if (input.left[index] !== input.right[index]) return false;
	}
	return true;
}

function assertExactKeys(input: {
	readonly value: unknown;
	readonly allowed: readonly string[];
	readonly label: string;
}): void {
	if (
		input.value === null ||
		typeof input.value !== "object" ||
		Array.isArray(input.value)
	) {
		throw new Error(`${input.label} must be an object.`);
	}
	const actual = Object.keys(input.value).sort(compareText);
	const expected = [...input.allowed].sort(compareText);
	if (!sameTextList({left: actual, right: expected})) {
		throw new Error(`${input.label} received unsupported or missing fields.`);
	}
}

function compareText(...values: [string, string]): number {
	return values[0].localeCompare(values[1]);
}
