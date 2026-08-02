import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	isUserStandardId,
	isUserStandardPassageId,
	normalizeUserStandardDefinitions,
	type UserStandardDefinition,
} from "../../loop-exit/custom-checks/user-standards.ts";

export const BACKLOG_TRIAGE_POLICY_PROTOCOL = Object.freeze({
	id: "codewiki.backlog-triage-policy",
	version: "1.0.0",
	maxBindings: 64,
	maxDimensionsPerBinding: 8,
} as const);

export const TRIAGE_PREFERENCE_DIMENSIONS = Object.freeze([
	"severity",
	"exposure",
	"regression",
	"urgency",
	"risk_of_inaction",
	"impact",
	"strategic_value",
	"effort",
	"confidence",
	"freshness",
	"age_fairness",
] as const);

export type TriagePreferenceDimension =
	(typeof TRIAGE_PREFERENCE_DIMENSIONS)[number];
export type TriagePreferenceDirection = "ascending" | "descending";

export interface TriagePreferenceBinding {
	readonly bindingId: string;
	readonly bindingDigest: Sha256Digest;
	readonly distillationReceiptId: string;
	readonly clauseId: string;
	readonly userStandardId: string;
	readonly standardDigest: Sha256Digest;
	readonly sourceContentDigest: Sha256Digest;
	readonly passageId: string;
	readonly dimensions: readonly TriagePreferenceDimension[];
}

export interface BacklogTriagePolicyCriterion {
	readonly precedence: number;
	readonly dimension: TriagePreferenceDimension;
	readonly direction: TriagePreferenceDirection;
	readonly bindingIds: readonly string[];
}

export interface BacklogTriagePolicy {
	readonly protocol: typeof BACKLOG_TRIAGE_POLICY_PROTOCOL;
	readonly projectConfigDigest: Sha256Digest;
	readonly bindings: readonly TriagePreferenceBinding[];
	readonly criteria: readonly BacklogTriagePolicyCriterion[];
	readonly policyDigest: Sha256Digest;
}

const DIRECTION_BY_DIMENSION: Readonly<
	Record<TriagePreferenceDimension, TriagePreferenceDirection>
> = Object.freeze({
	severity: "descending",
	exposure: "descending",
	regression: "descending",
	urgency: "descending",
	risk_of_inaction: "descending",
	impact: "descending",
	strategic_value: "descending",
	effort: "ascending",
	confidence: "descending",
	freshness: "descending",
	age_fairness: "descending",
});

const DIMENSION_PRECEDENCE = new Map<TriagePreferenceDimension, number>(
	TRIAGE_PREFERENCE_DIMENSIONS.map((dimension, index) => [dimension, index]),
);
const DISTILLATION_RECEIPT_ID = /^user-standard-distillation-receipt:[0-9a-f]{64}$/u;
const DISTILLATION_CLAUSE_ID = /^user-standard-clause:[0-9a-f]{64}$/u;
const BINDING_ID = /^triage-preference:[0-9a-f]{64}$/u;

export function createTriagePreferenceBinding(input: {
	readonly distillationReceiptId: string;
	readonly clauseId: string;
	readonly userStandard: UserStandardDefinition;
	readonly passageId: string;
	readonly dimensions: readonly TriagePreferenceDimension[];
}): TriagePreferenceBinding {
	const [userStandard] = normalizeUserStandardDefinitions([input.userStandard]);
	if (!userStandard) throw new Error("Triage preference requires one User Standard.");
	if (!DISTILLATION_RECEIPT_ID.test(input.distillationReceiptId)) {
		throw new Error("Triage preference distillationReceiptId is invalid.");
	}
	if (!DISTILLATION_CLAUSE_ID.test(input.clauseId)) {
		throw new Error("Triage preference clauseId is invalid.");
	}
	if (!userStandard.passages.some((passage) => passage.passageId === input.passageId)) {
		throw new Error("Triage preference passageId is not present in its User Standard.");
	}
	const dimensions = normalizeDimensions(input.dimensions);
	const body = {
		distillationReceiptId: input.distillationReceiptId,
		clauseId: input.clauseId,
		userStandardId: userStandard.userStandardId,
		standardDigest: userStandard.standardDigest,
		sourceContentDigest: userStandard.source.contentDigest,
		passageId: input.passageId,
		dimensions,
	};
	const bindingDigest = canonicalJsonDigest(body);
	return Object.freeze({
		bindingId: `triage-preference:${bindingDigest.slice("sha256:".length)}`,
		bindingDigest,
		...body,
	});
}

export function normalizeTriagePreferenceBindings(
	input: readonly TriagePreferenceBinding[],
	userStandards: readonly UserStandardDefinition[],
): readonly TriagePreferenceBinding[] {
	if (!Array.isArray(input)) {
		throw new Error("Triage preference bindings must be an array.");
	}
	if (input.length > BACKLOG_TRIAGE_POLICY_PROTOCOL.maxBindings) {
		throw new Error(
			`Triage preference bindings cannot exceed ${BACKLOG_TRIAGE_POLICY_PROTOCOL.maxBindings}.`,
		);
	}
	const standards = normalizeUserStandardDefinitions(userStandards);
	const standardsById = new Map(
		standards.map((standard) => [standard.userStandardId, standard]),
	);
	const normalized = input.map((binding, index) => {
		const value = normalizeBindingShape(binding, `Triage preference binding ${index}`);
		const standard = standardsById.get(value.userStandardId);
		if (!standard) {
			throw new Error(
				`Triage preference binding references unknown User Standard ${value.userStandardId}.`,
			);
		}
		const expected = createTriagePreferenceBinding({
			distillationReceiptId: value.distillationReceiptId,
			clauseId: value.clauseId,
			userStandard: standard,
			passageId: value.passageId,
			dimensions: value.dimensions,
		});
		if (
			value.bindingId !== expected.bindingId ||
			value.bindingDigest !== expected.bindingDigest ||
			value.standardDigest !== expected.standardDigest ||
			value.sourceContentDigest !== expected.sourceContentDigest
		) {
			throw new Error("Triage preference binding identity does not match its content.");
		}
		return expected;
	});
	assertUnique(normalized.map((binding) => binding.bindingId), "binding ids");
	assertUnique(normalized.map((binding) => binding.clauseId), "clause ids");
	return Object.freeze(
		[...normalized].sort((left, right) => compareText(left.bindingId, right.bindingId)),
	);
}

export function createBacklogTriagePolicy(input: {
	readonly projectConfigDigest: Sha256Digest;
	readonly userStandards: readonly UserStandardDefinition[];
	readonly bindings: readonly TriagePreferenceBinding[];
}): BacklogTriagePolicy {
	assertSha256Digest(input.projectConfigDigest, "triagePolicy.projectConfigDigest");
	const bindings = normalizeTriagePreferenceBindings(input.bindings, input.userStandards);
	const criteria = policyCriteria(bindings);
	const body = {
		protocol: BACKLOG_TRIAGE_POLICY_PROTOCOL,
		projectConfigDigest: input.projectConfigDigest,
		bindings,
		criteria,
	};
	return Object.freeze({...body, policyDigest: canonicalJsonDigest(body)});
}

export function assertBacklogTriagePolicy(value: BacklogTriagePolicy): void {
	assertExactKeys(
		value,
		["protocol", "projectConfigDigest", "bindings", "criteria", "policyDigest"],
		"Backlog triage policy",
	);
	assertExactKeys(
		value.protocol,
		["id", "version", "maxBindings", "maxDimensionsPerBinding"],
		"Backlog triage policy protocol",
	);
	if (
		value.protocol.id !== BACKLOG_TRIAGE_POLICY_PROTOCOL.id ||
		value.protocol.version !== BACKLOG_TRIAGE_POLICY_PROTOCOL.version
	) {
		throw new Error("Backlog triage policy protocol identity is invalid.");
	}
	assertSha256Digest(value.projectConfigDigest, "triagePolicy.projectConfigDigest");
	assertSha256Digest(value.policyDigest, "triagePolicy.policyDigest");
	if (!Array.isArray(value.bindings)) {
		throw new Error("Backlog triage policy bindings must be an array.");
	}
	const bindings = value.bindings.map((binding, index) =>
		normalizeBindingShape(binding, `Backlog triage policy binding ${index}`),
	);
	if (bindings.length > BACKLOG_TRIAGE_POLICY_PROTOCOL.maxBindings) {
		throw new Error("Backlog triage policy has too many bindings.");
	}
	assertUnique(bindings.map((binding) => binding.bindingId), "binding ids");
	assertUnique(bindings.map((binding) => binding.clauseId), "clause ids");
	const sortedBindings = [...bindings].sort((left, right) =>
		compareText(left.bindingId, right.bindingId),
	);
	for (let index = 0; index < bindings.length; index += 1) {
		if (bindings[index]?.bindingId !== sortedBindings[index]?.bindingId) {
			throw new Error("Backlog triage policy bindings are not canonical.");
		}
	}
	const criteria = policyCriteria(bindings);
	if (canonicalJsonDigest(value.criteria) !== canonicalJsonDigest(criteria)) {
		throw new Error("Backlog triage policy criteria are invalid.");
	}
	const expectedDigest = canonicalJsonDigest({
		protocol: BACKLOG_TRIAGE_POLICY_PROTOCOL,
		projectConfigDigest: value.projectConfigDigest,
		bindings,
		criteria,
	});
	if (value.policyDigest !== expectedDigest) {
		throw new Error("Backlog triage policy digest does not match its content.");
	}
}

function normalizeBindingShape(
	value: TriagePreferenceBinding,
	label: string,
): TriagePreferenceBinding {
	assertExactKeys(
		value,
		[
			"bindingId",
			"bindingDigest",
			"distillationReceiptId",
			"clauseId",
			"userStandardId",
			"standardDigest",
			"sourceContentDigest",
			"passageId",
			"dimensions",
		],
		label,
	);
	if (typeof value.bindingId !== "string" || !BINDING_ID.test(value.bindingId)) {
		throw new Error(`${label} bindingId is invalid.`);
	}
	assertSha256Digest(value.bindingDigest, `${label}.bindingDigest`);
	if (
		typeof value.distillationReceiptId !== "string" ||
		!DISTILLATION_RECEIPT_ID.test(value.distillationReceiptId)
	) {
		throw new Error(`${label} distillationReceiptId is invalid.`);
	}
	if (typeof value.clauseId !== "string" || !DISTILLATION_CLAUSE_ID.test(value.clauseId)) {
		throw new Error(`${label} clauseId is invalid.`);
	}
	if (!isUserStandardId(value.userStandardId)) {
		throw new Error(`${label} userStandardId is invalid.`);
	}
	assertSha256Digest(value.standardDigest, `${label}.standardDigest`);
	assertSha256Digest(value.sourceContentDigest, `${label}.sourceContentDigest`);
	if (!isUserStandardPassageId(value.passageId)) {
		throw new Error(`${label} passageId is invalid.`);
	}
	const dimensions = normalizeDimensions(value.dimensions);
	const body = {
		distillationReceiptId: value.distillationReceiptId,
		clauseId: value.clauseId,
		userStandardId: value.userStandardId,
		standardDigest: value.standardDigest,
		sourceContentDigest: value.sourceContentDigest,
		passageId: value.passageId,
		dimensions,
	};
	const bindingDigest = canonicalJsonDigest(body);
	if (
		value.bindingDigest !== bindingDigest ||
		value.bindingId !== `triage-preference:${bindingDigest.slice("sha256:".length)}`
	) {
		throw new Error(`${label} identity does not match its content.`);
	}
	return Object.freeze({...value, dimensions});
}

function normalizeDimensions(
	input: readonly TriagePreferenceDimension[],
): readonly TriagePreferenceDimension[] {
	if (!Array.isArray(input)) {
		throw new Error("Triage preference dimensions must be an array.");
	}
	if (
		input.length === 0 ||
		input.length > BACKLOG_TRIAGE_POLICY_PROTOCOL.maxDimensionsPerBinding
	) {
		throw new Error(
			`Triage preference requires 1..${BACKLOG_TRIAGE_POLICY_PROTOCOL.maxDimensionsPerBinding} dimensions.`,
		);
	}
	const dimensions = input.map((dimension) => {
		if (
			typeof dimension !== "string" ||
			!TRIAGE_PREFERENCE_DIMENSIONS.includes(
				dimension as TriagePreferenceDimension,
			)
		) {
			throw new Error(`Triage preference dimension ${String(dimension)} is unsupported.`);
		}
		return dimension as TriagePreferenceDimension;
	});
	assertUnique(dimensions, "dimensions");
	return Object.freeze(
		[...dimensions].sort(
			(left, right) =>
				(DIMENSION_PRECEDENCE.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(DIMENSION_PRECEDENCE.get(right) ?? Number.MAX_SAFE_INTEGER),
		),
	);
}

function policyCriteria(
	bindings: readonly TriagePreferenceBinding[],
): readonly BacklogTriagePolicyCriterion[] {
	return Object.freeze(
		TRIAGE_PREFERENCE_DIMENSIONS.flatMap((dimension, index) => {
			const bindingIds = bindings
				.flatMap((binding) =>
					binding.dimensions.includes(dimension) ? [binding.bindingId] : [],
				)
				.sort(compareText);
			return bindingIds.length === 0
				? []
				: [
						Object.freeze({
							precedence: index + 1,
							dimension,
							direction: DIRECTION_BY_DIMENSION[dimension],
							bindingIds: Object.freeze(bindingIds),
						}),
					];
		}),
	);
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`Triage preference ${label} must be unique.`);
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
