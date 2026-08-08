import type {WikiModelThinking} from "../../project/model-routing.ts";
import type {SemanticLoop} from "../../semantic-loop.ts";
import {
	TRIAGE_PREFERENCE_DIMENSIONS,
	type TriagePreferenceDimension,
} from "../../changes/triage/policy.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	normalizeCustomCheckProposal,
	type CustomCheckApplicability,
	type CustomCheckProposal,
} from "./contracts.ts";
import type {CustomCodeTemplateSelection} from "./code-templates.ts";
import {
	listCustomCheckTypes,
	type CustomCheckTypeDefinition,
	type CustomCheckTypeId,
} from "./check-types.ts";
import {
	assertUserStandardSourceReceipt,
	type UserStandardSourceReceipt,
} from "./source-retrieval.ts";
import {
	createUserStandardDefinition,
	type UserStandardDefinition,
} from "./user-standards.ts";
import {
	canonicalIsoTimestamp,
	compareCanonicalText as compareText,
	deepFreezeValue as deepFreeze,
} from "./validation.ts";

export const USER_STANDARD_DISTILLATION_PROTOCOL = Object.freeze({
	id: "codewiki.user-standard-distillation",
	version: "2.0.0",
	maxRequestBytes: 262_144,
	maxResponseBytes: 131_072,
	maxClauses: 32,
	maxDefaultChecks: 128,
	maxTextCodePoints: 2_000,
	maxExplanationCodePoints: 1_000,
	maxCapabilities: 8,
});

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RECEIPT_ID = /^user-standard-distillation-receipt:[0-9a-f]{64}$/u;
const CLAUSE_ID = /^user-standard-clause:[0-9a-f]{64}$/u;
const PROPOSAL_ID = /^custom-check-proposal:[0-9a-f]{64}$/u;
const CODE_PROPOSAL_ID = /^custom-code-check-proposal:[0-9a-f]{64}$/u;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{2,127}$/u;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const CHECK_ID = /^[a-z][a-z0-9_]{2,127}$/u;
const LOOP_VALUES: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];
const DISPOSITIONS = [
	"default_covered",
	"custom_model",
	"custom_code",
	"triage_preference",
	"runtime_guard",
	"unresolved",
] as const;
const UNRESOLVED_REASONS = [
	"unsupported",
	"ambiguous",
	"contradictory",
	"stale",
	"partial",
	"excluded",
	"unavailable",
	"negative",
	"retracted",
	"superseded",
] as const;
export const USER_STANDARD_TRIAGE_DIMENSIONS = TRIAGE_PREFERENCE_DIMENSIONS;
const THRESHOLD_OPERATORS = ["lt", "lte", "gt", "gte", "eq"] as const;
const THINKING_VALUES: readonly WikiModelThinking[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];
const OPERATIONAL_REASONS = [
	"timeout",
	"provider_failure",
	"unavailable",
	"cancelled",
	"malformed_output",
] as const;

export type UserStandardClauseDisposition = (typeof DISPOSITIONS)[number];
export type UserStandardUnresolvedReason = (typeof UNRESOLVED_REASONS)[number];
export type UserStandardTriageDimension = TriagePreferenceDimension;
export type UserStandardDistillationOperationalReason =
	(typeof OPERATIONAL_REASONS)[number];

export interface UserStandardDefaultCheckDescriptor {
	readonly id: string;
	readonly version: string;
	readonly digest: Sha256Digest;
	readonly description: string;
	readonly requirement: string;
	readonly loops: readonly SemanticLoop[];
}

export interface UserStandardDistillationRoute {
	readonly id: string;
	readonly provider: string;
	readonly model: string;
	readonly thinking: WikiModelThinking;
	readonly timeoutMs: number;
	readonly configurationDigest: Sha256Digest;
}

export interface UserStandardDistillationRequest {
	readonly protocolId: typeof USER_STANDARD_DISTILLATION_PROTOCOL.id;
	readonly protocolVersion: typeof USER_STANDARD_DISTILLATION_PROTOCOL.version;
	readonly name: string;
	readonly sourceReceipt: Extract<
		UserStandardSourceReceipt,
		{readonly status: "retrieved"}
	>;
	readonly defaultChecks: readonly UserStandardDefaultCheckDescriptor[];
	readonly checkTypes: readonly CustomCheckTypeDefinition[];
	readonly triageDimensions: readonly UserStandardTriageDimension[];
	readonly route: UserStandardDistillationRoute;
	readonly limits: {
		readonly maxClauses: number;
		readonly maxResponseBytes: number;
		readonly maxTextCodePoints: number;
		readonly maxExplanationCodePoints: number;
		readonly maxCapabilities: number;
	};
	readonly requestDigest: Sha256Digest;
}

export interface UserStandardCustomCheckDraft {
	readonly checkTypeId: CustomCheckTypeId;
	readonly name: string;
	readonly requirement: string;
	readonly repairGuidance?: string;
	readonly appliesWhen: CustomCheckApplicability;
	readonly knowledgeRefs?: readonly string[];
}

export interface UserStandardCustomCodeDraft {
	readonly checkTypeId: CustomCheckTypeId;
	readonly name: string;
	readonly requirement: string;
	readonly repairGuidance?: string;
	readonly appliesWhen: CustomCheckApplicability;
	readonly knowledgeRefs?: readonly string[];
	readonly templateIntent: string;
	readonly requiredCapabilities: readonly string[];
}

interface UserStandardClauseBase {
	readonly passage: string;
	readonly explanation: string;
}

export type UserStandardDistillationClause =
	| (UserStandardClauseBase & {
			readonly disposition: "default_covered";
			readonly defaultCheckIds: readonly string[];
	  })
	| (UserStandardClauseBase & {
			readonly disposition: "custom_model";
			readonly proposal: UserStandardCustomCheckDraft;
	  })
	| (UserStandardClauseBase & {
			readonly disposition: "custom_code";
			readonly proposal: UserStandardCustomCodeDraft;
	  })
	| (UserStandardClauseBase & {
			readonly disposition: "triage_preference";
			readonly preference: string;
			readonly dimensions: readonly UserStandardTriageDimension[];
	  })
	| (UserStandardClauseBase & {
			readonly disposition: "runtime_guard";
			readonly guard: {
				readonly metric: string;
				readonly unit: string;
				readonly scope: string;
				readonly accountingWindow: string;
				readonly operator: (typeof THRESHOLD_OPERATORS)[number];
				readonly threshold: number;
				readonly enforcement: string;
				readonly measurementSource: string;
				readonly requiredCapability: string;
			};
	  })
	| (UserStandardClauseBase & {
			readonly disposition: "unresolved";
			readonly reason: UserStandardUnresolvedReason;
			readonly details: string;
	  });

export interface UserStandardDistillationOutput {
	readonly protocolId: typeof USER_STANDARD_DISTILLATION_PROTOCOL.id;
	readonly protocolVersion: typeof USER_STANDARD_DISTILLATION_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly clauses: readonly UserStandardDistillationClause[];
}

export interface UserStandardDistillerBinding {
	readonly id: string;
	readonly version: string;
	readonly configurationDigest: Sha256Digest;
}

export type UserStandardDistillationObservation =
	| {readonly status: "completed"; readonly response: unknown}
	| {readonly status: UserStandardDistillationOperationalReason};

export interface UserStandardDistiller {
	readonly binding: UserStandardDistillerBinding;
	readonly execute: (input: {
		readonly request: UserStandardDistillationRequest;
		readonly signal?: AbortSignal;
	}) => Promise<UserStandardDistillationObservation>;
}

interface UserStandardDistillationReceiptBase {
	readonly receiptId: string;
	readonly protocolId: typeof USER_STANDARD_DISTILLATION_PROTOCOL.id;
	readonly protocolVersion: typeof USER_STANDARD_DISTILLATION_PROTOCOL.version;
	readonly request: UserStandardDistillationRequest;
	readonly distiller: UserStandardDistillerBinding;
	readonly recordedAt: string;
}

export type UserStandardDistillationReceipt =
	| (UserStandardDistillationReceiptBase & {
			readonly status: "completed";
			readonly output: UserStandardDistillationOutput;
			readonly responseDigest: Sha256Digest;
			readonly reason: null;
	  })
	| (UserStandardDistillationReceiptBase & {
			readonly status: "indeterminate";
			readonly output: null;
			readonly responseDigest: null;
			readonly reason: UserStandardDistillationOperationalReason;
	  });

export type UserStandardMaterializedClause = UserStandardDistillationClause & {
	readonly clauseId: string;
	readonly passageId: string;
};

export interface UserStandardDistilledCustomCheckProposal {
	readonly proposalId: string;
	readonly clauseId: string;
	readonly proposal: CustomCheckProposal;
}

export interface UserStandardDistilledCustomCodeProposal {
	readonly proposalId: string;
	readonly clauseId: string;
	readonly proposal: UserStandardCustomCodeDraft;
}

export interface UserStandardDistillationBundle {
	readonly distillationReceiptId: string;
	readonly userStandard: UserStandardDefinition;
	readonly clauses: readonly UserStandardMaterializedClause[];
	readonly customCheckProposals: readonly UserStandardDistilledCustomCheckProposal[];
	readonly customCodeCheckProposals: readonly UserStandardDistilledCustomCodeProposal[];
}

export function createUserStandardDistillationRequest(input: {
	readonly name: string;
	readonly sourceReceipt: UserStandardSourceReceipt;
	readonly defaultChecks: readonly UserStandardDefaultCheckDescriptor[];
	readonly route: UserStandardDistillationRoute;
}): UserStandardDistillationRequest {
	assertUserStandardSourceReceipt(input.sourceReceipt);
	if (input.sourceReceipt.status !== "retrieved") {
		throw new Error("User Standard distillation requires a retrieved source snapshot.");
	}
	const body = {
		protocolId: USER_STANDARD_DISTILLATION_PROTOCOL.id,
		protocolVersion: USER_STANDARD_DISTILLATION_PROTOCOL.version,
		name: boundedText(input.name, "User Standard distillation name", 80),
		sourceReceipt: input.sourceReceipt,
		defaultChecks: normalizeDefaultChecks(input.defaultChecks),
		checkTypes: listCustomCheckTypes(),
		triageDimensions: USER_STANDARD_TRIAGE_DIMENSIONS,
		route: normalizeRoute(input.route),
		limits: protocolLimits(),
	};
	const request = deepFreeze({
		...body,
		requestDigest: canonicalJsonDigest(body),
	});
	assertRequestSize(request);
	return request;
}

export function assertUserStandardDistillationRequest(
	value: UserStandardDistillationRequest,
): void {
	assertExactKeys(
		value,
		[
			"protocolId",
			"protocolVersion",
			"name",
			"sourceReceipt",
			"defaultChecks",
			"checkTypes",
			"triageDimensions",
			"route",
			"limits",
			"requestDigest",
		],
		"User Standard distillation request",
	);
	const expected = createUserStandardDistillationRequest({
		name: value.name,
		sourceReceipt: value.sourceReceipt,
		defaultChecks: value.defaultChecks,
		route: value.route,
	});
	if (canonicalJson(expected.checkTypes) !== canonicalJson(value.checkTypes)) {
		throw new Error("User Standard distillation Check Types are invalid.");
	}
	if (
		canonicalJson(expected.triageDimensions) !==
		canonicalJson(value.triageDimensions)
	) {
		throw new Error("User Standard distillation triage dimensions are invalid.");
	}
	if (canonicalJson(expected.limits) !== canonicalJson(value.limits)) {
		throw new Error("User Standard distillation limits are invalid.");
	}
	if (
		value.protocolId !== expected.protocolId ||
		value.protocolVersion !== expected.protocolVersion ||
		value.requestDigest !== expected.requestDigest
	) {
		throw new Error("User Standard distillation request identity is invalid.");
	}
	assertRequestSize(value);
}

export async function runUserStandardDistillation(input: {
	readonly request: UserStandardDistillationRequest;
	readonly distiller: UserStandardDistiller;
	readonly now?: () => Date;
	readonly signal?: AbortSignal;
}): Promise<UserStandardDistillationReceipt> {
	assertUserStandardDistillationRequest(input.request);
	const distiller = normalizeDistillerBinding(input.distiller.binding);
	const recordedAt = canonicalIsoTimestamp(
		(input.now ?? (() => new Date()))().toISOString(),
		"User Standard distillation receipt recordedAt",
	);
	if (input.signal?.aborted) {
		return indeterminateReceipt({
			request: input.request,
			distiller,
			recordedAt,
			reason: "cancelled",
		});
	}
	let observation: UserStandardDistillationObservation;
	try {
		observation = await input.distiller.execute({
			request: input.request,
			...(input.signal ? {signal: input.signal} : {}),
		});
	} catch {
		return indeterminateReceipt({
			request: input.request,
			distiller,
			recordedAt,
			reason: input.signal?.aborted ? "cancelled" : "provider_failure",
		});
	}
	if (!isRecord(observation) || observation.status !== "completed") {
		const reason = operationalReason(
			isRecord(observation) ? observation.status : "malformed_output",
		);
		return indeterminateReceipt({
			request: input.request,
			distiller,
			recordedAt,
			reason,
		});
	}
	try {
		const output = normalizeOutput(observation.response, input.request);
		const responseDigest = canonicalJsonDigest(output);
		return receiptWithIdentity({
			request: input.request,
			distiller,
			recordedAt,
			status: "completed",
			output,
			responseDigest,
			reason: null,
		});
	} catch {
		return indeterminateReceipt({
			request: input.request,
			distiller,
			recordedAt,
			reason: "malformed_output",
		});
	}
}

export function assertUserStandardDistillationReceipt(
	value: UserStandardDistillationReceipt,
): void {
	assertExactKeys(
		value,
		[
			"receiptId",
			"protocolId",
			"protocolVersion",
			"request",
			"distiller",
			"recordedAt",
			"status",
			"output",
			"responseDigest",
			"reason",
		],
		"User Standard distillation receipt",
	);
	if (
		value.protocolId !== USER_STANDARD_DISTILLATION_PROTOCOL.id ||
		value.protocolVersion !== USER_STANDARD_DISTILLATION_PROTOCOL.version ||
		!RECEIPT_ID.test(value.receiptId)
	) {
		throw new Error("User Standard distillation receipt identity is invalid.");
	}
	assertUserStandardDistillationRequest(value.request);
	const distiller = normalizeDistillerBinding(value.distiller);
	const recordedAt = canonicalIsoTimestamp(
		value.recordedAt,
		"User Standard distillation receipt recordedAt",
	);
	if (value.status === "completed") {
		if (value.output === null || value.reason !== null || value.responseDigest === null) {
			throw new Error("Completed User Standard distillation receipt is incomplete.");
		}
		const output = normalizeOutput(value.output, value.request);
		if (canonicalJsonDigest(output) !== value.responseDigest) {
			throw new Error("User Standard distillation response digest is invalid.");
		}
		assertReceiptIdentity({...value, distiller, recordedAt, output});
		return;
	}
	if (
		value.status !== "indeterminate" ||
		value.output !== null ||
		value.responseDigest !== null
	) {
		throw new Error("User Standard distillation receipt status is invalid.");
	}
	const reason = operationalReason(value.reason);
	assertReceiptIdentity({...value, distiller, recordedAt, reason});
}

export function materializeUserStandardDistillationBundle(
	receipt: UserStandardDistillationReceipt,
): UserStandardDistillationBundle {
	assertUserStandardDistillationReceipt(receipt);
	if (receipt.status !== "completed") {
		throw new Error("Indeterminate User Standard distillation has no review bundle.");
	}
	const userStandard = standardFromOutput(receipt.request, receipt.output);
	const passageByText = new Map(
		userStandard.passages.map((passage) => [passage.text, passage.passageId]),
	);
	const clauses = receipt.output.clauses
		.map((clause) => {
			const passageId = passageByText.get(clause.passage);
			if (!passageId) throw new Error("Distilled clause passage binding is missing.");
			const clauseId = `user-standard-clause:${canonicalJsonDigest({
				requestDigest: receipt.request.requestDigest,
				clause,
			}).slice("sha256:".length)}`;
			return Object.freeze({...clause, clauseId, passageId});
		})
		.sort((...values) => compareText(values[0].clauseId, values[1].clauseId));
	const customCheckProposals: UserStandardDistilledCustomCheckProposal[] = [];
	for (const clause of clauses) {
		if (clause.disposition !== "custom_model") continue;
		const proposal = normalizeCustomCheckProposal({
			...clause.proposal,
			evaluator: "model",
			standardRefs: [
				{
					userStandardId: userStandard.userStandardId,
					standardDigest: userStandard.standardDigest,
					passageIds: [clause.passageId],
				},
			],
		});
		customCheckProposals.push(
			Object.freeze({
				proposalId: `custom-check-proposal:${canonicalJsonDigest(proposal).slice("sha256:".length)}`,
				clauseId: clause.clauseId,
				proposal,
			}),
		);
	}
	customCheckProposals.sort((...values) =>
		compareText(values[0].proposalId, values[1].proposalId),
	);
	assertUnique(
		clauses.map((clause) => clause.clauseId),
		"User Standard distillation clause ids",
	);
	const customCodeCheckProposals: UserStandardDistilledCustomCodeProposal[] = [];
	for (const clause of clauses) {
		if (clause.disposition !== "custom_code") continue;
		customCodeCheckProposals.push(
			Object.freeze({
				proposalId: `custom-code-check-proposal:${canonicalJsonDigest({
					clauseId: clause.clauseId,
					proposal: clause.proposal,
				}).slice("sha256:".length)}`,
				clauseId: clause.clauseId,
				proposal: clause.proposal,
			}),
		);
	}
	customCodeCheckProposals.sort((...values) =>
		compareText(values[0].proposalId, values[1].proposalId),
	);
	assertUnique(
		customCheckProposals.map((proposal) => proposal.proposalId),
		"User Standard distillation proposal ids",
	);
	assertUnique(
		customCodeCheckProposals.map((proposal) => proposal.proposalId),
		"User Standard distillation Custom Code proposal ids",
	);
	return deepFreeze({
		distillationReceiptId: receipt.receiptId,
		userStandard,
		clauses,
		customCheckProposals,
		customCodeCheckProposals,
	});
}

function normalizeOutput(
	...values: [unknown, UserStandardDistillationRequest]
): UserStandardDistillationOutput {
	const [value, request] = values;
	if (!isRecord(value)) {
		throw new Error("User Standard distillation output must be an object.");
	}
	assertExactKeys(
		value,
		["protocolId", "protocolVersion", "requestDigest", "clauses"],
		"User Standard distillation output",
	);
	if (
		value.protocolId !== USER_STANDARD_DISTILLATION_PROTOCOL.id ||
		value.protocolVersion !== USER_STANDARD_DISTILLATION_PROTOCOL.version ||
		value.requestDigest !== request.requestDigest
	) {
		throw new Error("User Standard distillation output identity is invalid.");
	}
	if (
		!Array.isArray(value.clauses) ||
		value.clauses.length === 0 ||
		value.clauses.length > USER_STANDARD_DISTILLATION_PROTOCOL.maxClauses
	) {
		throw new Error("User Standard distillation clauses are invalid.");
	}
	const provisional = value.clauses.map((clause) =>
		normalizeClauseShape(clause, request),
	);
	const standard = standardFromClauses(request, provisional);
	const clauses = provisional.map((clause) =>
		normalizeClauseSemantics(clause, request, standard),
	);
	assertUnique(
		clauses.map((clause) => canonicalJsonDigest(clause)),
		"User Standard distillation clauses",
	);
	const output = deepFreeze({
		protocolId: USER_STANDARD_DISTILLATION_PROTOCOL.id,
		protocolVersion: USER_STANDARD_DISTILLATION_PROTOCOL.version,
		requestDigest: request.requestDigest,
		clauses,
	});
	if (
		Buffer.byteLength(canonicalJson(output), "utf8") >
		USER_STANDARD_DISTILLATION_PROTOCOL.maxResponseBytes
	) {
		throw new Error("User Standard distillation output exceeds protocol limit.");
	}
	return output;
}

function normalizeClauseShape(
	...values: [unknown, UserStandardDistillationRequest]
): UserStandardDistillationClause {
	const [value, request] = values;
	if (!isRecord(value)) {
		throw new Error("User Standard distillation clause must be an object.");
	}
	const passage = boundedText(
		value.passage,
		"User Standard distillation passage",
		USER_STANDARD_DISTILLATION_PROTOCOL.maxTextCodePoints,
	);
	if (!request.sourceReceipt.source.content.includes(passage)) {
		throw new Error("User Standard distillation passage is not exact source text.");
	}
	const explanation = boundedText(
		value.explanation,
		"User Standard distillation explanation",
		USER_STANDARD_DISTILLATION_PROTOCOL.maxExplanationCodePoints,
	);
	const disposition = clauseDisposition(value.disposition);
	const base = {passage, explanation, disposition};
	if (disposition === "default_covered") {
		assertExactKeys(
			value,
			["passage", "explanation", "disposition", "defaultCheckIds"],
			"Default-covered Standard clause",
		);
		return {
			...base,
			disposition,
			defaultCheckIds: textArray(value.defaultCheckIds, "defaultCheckIds", 16),
		};
	}
	if (disposition === "custom_model") {
		assertExactKeys(
			value,
			["passage", "explanation", "disposition", "proposal"],
			"Custom Model Standard clause",
		);
		return {...base, disposition, proposal: normalizeCustomDraft(value.proposal)};
	}
	if (disposition === "custom_code") {
		assertExactKeys(
			value,
			["passage", "explanation", "disposition", "proposal"],
			"Custom Code Standard clause",
		);
		return {
			...base,
			disposition,
			proposal: normalizeCustomCodeDraft(value.proposal),
		};
	}
	if (disposition === "triage_preference") {
		assertExactKeys(
			value,
			["passage", "explanation", "disposition", "preference", "dimensions"],
			"Triage-preference Standard clause",
		);
		return {
			...base,
			disposition,
			preference: boundedText(value.preference, "Standard triage preference", 1_000),
			dimensions: triageDimensions(value.dimensions),
		};
	}
	if (disposition === "runtime_guard") {
		assertExactKeys(
			value,
			["passage", "explanation", "disposition", "guard"],
			"Runtime-guard Standard clause",
		);
		return {...base, disposition, guard: normalizeGuard(value.guard)};
	}
	assertExactKeys(
		value,
		["passage", "explanation", "disposition", "reason", "details"],
		"Unresolved Standard clause",
	);
	return {
		...base,
		disposition,
		reason: unresolvedReason(value.reason),
		details: boundedText(value.details, "Unresolved Standard clause details", 1_000),
	};
}

function normalizeClauseSemantics(
	...values: [
		UserStandardDistillationClause,
		UserStandardDistillationRequest,
		UserStandardDefinition,
	]
): UserStandardDistillationClause {
	const [clause, request, standard] = values;
	if (clause.disposition === "default_covered") {
		const available = new Set(request.defaultChecks.map((check) => check.id));
		for (const checkId of clause.defaultCheckIds) {
			if (!available.has(checkId)) {
				throw new Error(`Unknown Default Check coverage ${checkId}.`);
			}
		}
		return {...clause, defaultCheckIds: [...clause.defaultCheckIds].sort(compareText)};
	}
	if (
		clause.disposition !== "custom_model" &&
		clause.disposition !== "custom_code"
	) {
		return clause;
	}
	const passage = standard.passages.find((entry) => entry.text === clause.passage);
	if (!passage) throw new Error("Distilled Standard passage binding is missing.");
	const standardRefs = [
		{
			userStandardId: standard.userStandardId,
			standardDigest: standard.standardDigest,
			passageIds: [passage.passageId],
		},
	];
	if (clause.disposition === "custom_model") {
		const normalized = normalizeCustomCheckProposal({
			...clause.proposal,
			evaluator: "model",
			standardRefs,
		});
		const {
			standardRefs: _standardRefs,
			evaluator: _evaluator,
			codeTemplate: _codeTemplate,
			...proposal
		} = normalized;
		return {...clause, proposal};
	}
	const normalized = normalizeCustomCheckProposal({
		checkTypeId: clause.proposal.checkTypeId,
		evaluator: "model",
		name: clause.proposal.name,
		requirement: clause.proposal.requirement,
		...(clause.proposal.repairGuidance
			? {repairGuidance: clause.proposal.repairGuidance}
			: {}),
		appliesWhen: clause.proposal.appliesWhen,
		standardRefs,
		...(clause.proposal.knowledgeRefs
			? {knowledgeRefs: clause.proposal.knowledgeRefs}
			: {}),
	});
	return {
		...clause,
		proposal: {
			...clause.proposal,
			checkTypeId: normalized.checkTypeId,
			name: normalized.name,
			requirement: normalized.requirement,
			...(normalized.repairGuidance
				? {repairGuidance: normalized.repairGuidance}
				: {}),
			appliesWhen: normalized.appliesWhen,
			...(normalized.knowledgeRefs
				? {knowledgeRefs: normalized.knowledgeRefs}
				: {}),
		},
	};
}

function standardFromOutput(
	...values: [UserStandardDistillationRequest, UserStandardDistillationOutput]
): UserStandardDefinition {
	const [request, output] = values;
	return standardFromClauses(request, output.clauses);
}

function standardFromClauses(
	...values: [UserStandardDistillationRequest, readonly UserStandardDistillationClause[]]
): UserStandardDefinition {
	const [request, clauses] = values;
	const passages = [...new Set(clauses.map((clause) => clause.passage))]
		.sort(compareText)
		.map((text) => ({text}));
	return createUserStandardDefinition({
		name: request.name,
		source: request.sourceReceipt.source,
		passages,
	});
}

function normalizeCustomDraft(value: unknown): UserStandardCustomCheckDraft {
	if (!isRecord(value)) throw new Error("Custom Model Check proposal must be an object.");
	assertExactKeys(
		value,
		["checkTypeId", "name", "requirement", "repairGuidance", "appliesWhen", "knowledgeRefs"],
		"Custom Model Check proposal",
	);
	return {
		checkTypeId: checkTypeId(value.checkTypeId),
		name: boundedText(value.name, "Custom Model Check name", 80),
		requirement: boundedText(value.requirement, "Custom Model Check requirement", 2_000),
		...(value.repairGuidance !== undefined
			? {repairGuidance: boundedText(value.repairGuidance, "Custom Model Check repair guidance", 1_000)}
			: {}),
		appliesWhen: value.appliesWhen as CustomCheckApplicability,
		...(value.knowledgeRefs !== undefined
			? {knowledgeRefs: textArray(value.knowledgeRefs, "Custom Model Check Knowledge refs", 8)}
			: {}),
	};
}

function normalizeCustomCodeDraft(value: unknown): UserStandardCustomCodeDraft {
	if (!isRecord(value)) throw new Error("Custom Code Check proposal must be an object.");
	assertExactKeys(
		value,
		[
			"checkTypeId",
			"name",
			"requirement",
			"repairGuidance",
			"appliesWhen",
			"knowledgeRefs",
			"templateIntent",
			"requiredCapabilities",
		],
		"Custom Code Check proposal",
	);
	return {
		checkTypeId: checkTypeId(value.checkTypeId),
		name: boundedText(value.name, "Custom Code Check name", 80),
		requirement: boundedText(value.requirement, "Custom Code Check requirement", 2_000),
		...(value.repairGuidance !== undefined
			? {
					repairGuidance: boundedText(
						value.repairGuidance,
						"Custom Code Check repair guidance",
						1_000,
					),
				}
			: {}),
		appliesWhen: value.appliesWhen as CustomCheckApplicability,
		...(value.knowledgeRefs !== undefined
			? {
					knowledgeRefs: textArray(
						value.knowledgeRefs,
						"Custom Code Check Knowledge refs",
						8,
					),
				}
			: {}),
		templateIntent: boundedText(value.templateIntent, "Custom Code Check template intent", 1_000),
		requiredCapabilities: textArray(
			value.requiredCapabilities,
			"Custom Code Check required capabilities",
			USER_STANDARD_DISTILLATION_PROTOCOL.maxCapabilities,
		),
	};
}

function normalizeGuard(value: unknown): Extract<
	UserStandardDistillationClause,
	{readonly disposition: "runtime_guard"}
>["guard"] {
	if (!isRecord(value)) throw new Error("Runtime guard proposal must be an object.");
	assertExactKeys(
		value,
		[
			"metric",
			"unit",
			"scope",
			"accountingWindow",
			"operator",
			"threshold",
			"enforcement",
			"measurementSource",
			"requiredCapability",
		],
		"Runtime guard proposal",
	);
	if (
		typeof value.threshold !== "number" ||
		!Number.isFinite(value.threshold) ||
		value.threshold < 0
	) {
		throw new Error("Runtime guard threshold must be a finite non-negative number.");
	}
	if (
		typeof value.operator !== "string" ||
		!(THRESHOLD_OPERATORS as readonly string[]).includes(value.operator)
	) {
		throw new Error("Runtime guard threshold operator is invalid.");
	}
	return {
		metric: boundedText(value.metric, "Runtime guard metric", 128),
		unit: boundedText(value.unit, "Runtime guard unit", 64),
		scope: boundedText(value.scope, "Runtime guard scope", 256),
		accountingWindow: boundedText(value.accountingWindow, "Runtime guard accounting window", 128),
		operator: value.operator as (typeof THRESHOLD_OPERATORS)[number],
		threshold: value.threshold,
		enforcement: boundedText(value.enforcement, "Runtime guard enforcement", 256),
		measurementSource: boundedText(value.measurementSource, "Runtime guard measurement source", 256),
		requiredCapability: boundedText(value.requiredCapability, "Runtime guard required capability", 256),
	};
}

function normalizeDefaultChecks(
	value: readonly UserStandardDefaultCheckDescriptor[],
): UserStandardDefaultCheckDescriptor[] {
	if (
		!Array.isArray(value) ||
		value.length > USER_STANDARD_DISTILLATION_PROTOCOL.maxDefaultChecks
	) {
		throw new Error("User Standard distillation Default Checks are invalid.");
	}
	const normalized = value.map((check) => {
		if (!isRecord(check)) throw new Error("Default Check descriptor must be an object.");
		assertExactKeys(
			check,
			["id", "version", "digest", "description", "requirement", "loops"],
			"Default Check descriptor",
		);
		if (typeof check.id !== "string" || !CHECK_ID.test(check.id)) {
			throw new Error("Default Check descriptor id is invalid.");
		}
		if (typeof check.version !== "string" || !SEMVER.test(check.version)) {
			throw new Error("Default Check descriptor version is invalid.");
		}
		if (typeof check.digest !== "string" || !DIGEST.test(check.digest)) {
			throw new Error("Default Check descriptor digest is invalid.");
		}
		const loops = textArray(check.loops, "Default Check descriptor loops", 3);
		for (const loop of loops) {
			if (!(LOOP_VALUES as readonly string[]).includes(loop)) {
				throw new Error("Default Check descriptor Loop is invalid.");
			}
		}
		return {
			id: check.id,
			version: check.version,
			digest: check.digest as Sha256Digest,
			description: boundedText(check.description, "Default Check description", 2_000),
			requirement: boundedText(check.requirement, "Default Check requirement", 2_000),
			loops: loops as SemanticLoop[],
		};
	});
	assertUnique(normalized.map((check) => check.id), "Default Check descriptor ids");
	return normalized.sort((...values) => compareText(values[0].id, values[1].id));
}

function normalizeRoute(
	value: UserStandardDistillationRoute,
): UserStandardDistillationRoute {
	if (!isRecord(value)) throw new Error("User Standard distillation route must be an object.");
	assertExactKeys(
		value,
		["id", "provider", "model", "thinking", "timeoutMs", "configurationDigest"],
		"User Standard distillation route",
	);
	for (const field of ["id", "provider", "model"] as const) {
		if (typeof value[field] !== "string" || value[field].trim().length === 0) {
			throw new Error(`User Standard distillation route ${field} is invalid.`);
		}
	}
	if (!(THINKING_VALUES as readonly string[]).includes(value.thinking)) {
		throw new Error("User Standard distillation route thinking is invalid.");
	}
	if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1_000 || value.timeoutMs > 600_000) {
		throw new Error("User Standard distillation route timeoutMs is invalid.");
	}
	if (typeof value.configurationDigest !== "string" || !DIGEST.test(value.configurationDigest)) {
		throw new Error("User Standard distillation route configurationDigest is invalid.");
	}
	return Object.freeze({...value});
}

function normalizeDistillerBinding(
	value: UserStandardDistillerBinding,
): UserStandardDistillerBinding {
	if (!isRecord(value)) throw new Error("User Standard distiller binding must be an object.");
	assertExactKeys(
		value,
		["id", "version", "configurationDigest"],
		"User Standard distiller binding",
	);
	if (typeof value.id !== "string" || !IDENTIFIER.test(value.id)) {
		throw new Error("User Standard distiller id is invalid.");
	}
	if (typeof value.version !== "string" || !SEMVER.test(value.version)) {
		throw new Error("User Standard distiller version is invalid.");
	}
	if (typeof value.configurationDigest !== "string" || !DIGEST.test(value.configurationDigest)) {
		throw new Error("User Standard distiller configurationDigest is invalid.");
	}
	return Object.freeze({...value});
}

function receiptWithIdentity(input: Omit<
	UserStandardDistillationReceipt,
	"receiptId" | "protocolId" | "protocolVersion"
>): UserStandardDistillationReceipt {
	const payload = {
		protocolId: USER_STANDARD_DISTILLATION_PROTOCOL.id,
		protocolVersion: USER_STANDARD_DISTILLATION_PROTOCOL.version,
		...input,
	};
	return deepFreeze({
		receiptId: `user-standard-distillation-receipt:${canonicalJsonDigest(payload).slice("sha256:".length)}`,
		...payload,
	}) as UserStandardDistillationReceipt;
}

function indeterminateReceipt(input: {
	readonly request: UserStandardDistillationRequest;
	readonly distiller: UserStandardDistillerBinding;
	readonly recordedAt: string;
	readonly reason: UserStandardDistillationOperationalReason;
}): UserStandardDistillationReceipt {
	return receiptWithIdentity({
		...input,
		status: "indeterminate",
		output: null,
		responseDigest: null,
	});
}

function assertReceiptIdentity(value: UserStandardDistillationReceipt): void {
	const {receiptId, ...payload} = value;
	const expected = `user-standard-distillation-receipt:${canonicalJsonDigest(payload).slice("sha256:".length)}`;
	if (receiptId !== expected) {
		throw new Error("User Standard distillation receipt identity is invalid.");
	}
}

function protocolLimits(): UserStandardDistillationRequest["limits"] {
	return Object.freeze({
		maxClauses: USER_STANDARD_DISTILLATION_PROTOCOL.maxClauses,
		maxResponseBytes: USER_STANDARD_DISTILLATION_PROTOCOL.maxResponseBytes,
		maxTextCodePoints: USER_STANDARD_DISTILLATION_PROTOCOL.maxTextCodePoints,
		maxExplanationCodePoints:
			USER_STANDARD_DISTILLATION_PROTOCOL.maxExplanationCodePoints,
		maxCapabilities: USER_STANDARD_DISTILLATION_PROTOCOL.maxCapabilities,
	});
}

function clauseDisposition(value: unknown): UserStandardClauseDisposition {
	if (typeof value !== "string" || !(DISPOSITIONS as readonly string[]).includes(value)) {
		throw new Error("User Standard clause disposition is invalid.");
	}
	return value as UserStandardClauseDisposition;
}

function unresolvedReason(value: unknown): UserStandardUnresolvedReason {
	if (
		typeof value !== "string" ||
		!(UNRESOLVED_REASONS as readonly string[]).includes(value)
	) {
		throw new Error("Unresolved User Standard clause reason is invalid.");
	}
	return value as UserStandardUnresolvedReason;
}

function operationalReason(value: unknown): UserStandardDistillationOperationalReason {
	if (
		typeof value !== "string" ||
		!(OPERATIONAL_REASONS as readonly string[]).includes(value)
	) {
		return "malformed_output";
	}
	return value as UserStandardDistillationOperationalReason;
}

function triageDimensions(value: unknown): UserStandardTriageDimension[] {
	const dimensions = textArray(value, "Standard triage dimensions", 8);
	for (const dimension of dimensions) {
		if (!(USER_STANDARD_TRIAGE_DIMENSIONS as readonly string[]).includes(dimension)) {
			throw new Error("Standard triage dimension is invalid.");
		}
	}
	return dimensions as UserStandardTriageDimension[];
}

function checkTypeId(value: unknown): CustomCheckTypeId {
	if (
		typeof value !== "string" ||
		!listCustomCheckTypes().some((definition) => definition.id === value)
	) {
		throw new Error("Distilled Custom Check Type is invalid.");
	}
	return value as CustomCheckTypeId;
}

function textArray(...values: [unknown, string, number]): string[] {
	const [value, label, maximum] = values;
	if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
		throw new Error(`${label} must contain 1..${maximum} values.`);
	}
	const normalized = value.map((entry) => boundedText(entry, label, 512));
	assertUnique(normalized, label);
	return normalized.sort(compareText);
}

function boundedText(...values: [unknown, string, number]): string {
	const [value, label, maximum] = values;
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
	if (
		normalized.length === 0 ||
		Array.from(normalized).length > maximum ||
		/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(normalized)
	) {
		throw new Error(`${label} is invalid.`);
	}
	return normalized;
}

function assertUnique(...input: [readonly string[], string]): void {
	const [values, label] = input;
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} cannot contain duplicates.`);
	}
}

function assertRequestSize(value: UserStandardDistillationRequest): void {
	if (
		Buffer.byteLength(canonicalJson(value), "utf8") >
		USER_STANDARD_DISTILLATION_PROTOCOL.maxRequestBytes
	) {
		throw new Error("User Standard distillation request exceeds protocol limit.");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUserStandardDistillationReceiptId(value: unknown): value is string {
	return typeof value === "string" && RECEIPT_ID.test(value);
}

export function isUserStandardDistillationClauseId(value: unknown): value is string {
	return typeof value === "string" && CLAUSE_ID.test(value);
}

export function materializeUserStandardDistilledCodeCheck(input: {
	readonly bundle: UserStandardDistillationBundle;
	readonly proposalId: string;
	readonly codeTemplate: CustomCodeTemplateSelection;
}): CustomCheckProposal {
	const distilled = input.bundle.customCodeCheckProposals.find(
		(proposal) => proposal.proposalId === input.proposalId,
	);
	if (!distilled) {
		throw new Error(`Unknown distilled Custom Code Check proposal ${input.proposalId}.`);
	}
	const clause = input.bundle.clauses.find(
		(entry) => entry.clauseId === distilled.clauseId,
	);
	if (!clause || clause.disposition !== "custom_code") {
		throw new Error("Distilled Custom Code Check clause binding is invalid.");
	}
	return normalizeCustomCheckProposal({
		checkTypeId: distilled.proposal.checkTypeId,
		evaluator: "code",
		name: distilled.proposal.name,
		requirement: distilled.proposal.requirement,
		...(distilled.proposal.repairGuidance
			? {repairGuidance: distilled.proposal.repairGuidance}
			: {}),
		appliesWhen: distilled.proposal.appliesWhen,
		standardRefs: [
			{
				userStandardId: input.bundle.userStandard.userStandardId,
				standardDigest: input.bundle.userStandard.standardDigest,
				passageIds: [clause.passageId],
			},
		],
		...(distilled.proposal.knowledgeRefs
			? {knowledgeRefs: distilled.proposal.knowledgeRefs}
			: {}),
		codeTemplate: input.codeTemplate,
	});
}

export function isUserStandardDistilledProposalId(value: unknown): value is string {
	return typeof value === "string" && PROPOSAL_ID.test(value);
}

export function isUserStandardDistilledCodeProposalId(
	value: unknown,
): value is string {
	return typeof value === "string" && CODE_PROPOSAL_ID.test(value);
}
