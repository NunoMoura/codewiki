import {Type} from "typebox";
import type { EvidenceId } from "../evidence/contracts.ts";
import type { EvidenceObligationResolution } from "../evidence/obligation-resolution.ts";
import type { EvidenceObligation } from "../evidence/obligations.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import {assertExactKeys, assertTypeboxSchema} from "../utils/json.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import { canonicalJsonDigest as resolvedExitPolicyDigest } from "./identity.ts";

export { resolvedExitPolicyDigest };

export const LOOP_EXIT_SCHEMA_VERSION = 1;

export interface LoopExitDeclaration<
	Loop extends SemanticLoop = SemanticLoop,
> {
	readonly loop: Loop;
}

export interface LoopExitSuite {
	readonly decision: LoopExitDeclaration<"decision">;
	readonly planning: LoopExitDeclaration<"planning">;
	readonly implementation: LoopExitDeclaration<"implementation">;
}

export function createLoopExitSuite(input: LoopExitSuite): LoopExitSuite {
	assertLoopDeclaration(input.decision, "decision");
	assertLoopDeclaration(input.planning, "planning");
	assertLoopDeclaration(input.implementation, "implementation");
	return Object.freeze({
		decision: Object.freeze({loop: "decision"}),
		planning: Object.freeze({loop: "planning"}),
		implementation: Object.freeze({loop: "implementation"}),
	});
}

function assertLoopDeclaration(
	declaration: LoopExitDeclaration | undefined,
	expected: SemanticLoop,
): void {
	if (declaration?.loop !== expected) {
		throw new Error(
			`Loop exit declaration ${expected} must declare loop ${expected}.`,
		);
	}
}

export type CheckExecutionKind = "code" | "model";
export type CheckMeasurementKind = "qualitative" | "quantitative";
export type CheckMeasurementShape =
	| "boolean"
	| "score"
	| "count"
	| "set"
	| "structured";
export type CheckEnforcement = "observe" | "warn" | "require";
export type CheckResultStatus = "pass" | "fail" | "indeterminate";
export type ExitReportStatus = "pass" | "fail" | "indeterminate";
export type CheckExclusionReason =
	| "not_applicable"
	| "covered_by_invariant"
	| "escalated_elsewhere";

export type CheckJsonValue =
	| null
	| boolean
	| number
	| string
	| CheckJsonValue[]
	| { [key: string]: CheckJsonValue };

export interface CheckExecutionSpec {
	id: string;
	version: string;
	kind: CheckExecutionKind;
}

export interface CheckMeasurementSpec {
	kind: CheckMeasurementKind;
	shape: CheckMeasurementShape;
	minimum?: number;
	maximum?: number;
	schemaRef?: string;
}

export interface CheckDefinition {
	id: string;
	version: string;
	description: string;
	requirement: string;
	requirementDigest: string;
	execution: CheckExecutionSpec;
	measurement: CheckMeasurementSpec;
	evidenceObligations: EvidenceObligation[];
	repairTarget: string;
	cost: number;
	timeoutMs: number;
	protected: boolean;
}

export interface CheckBinding {
	checkId: string;
	checkVersion: string;
	requirementDigest: string;
	checkDigest: string;
	enforcement: CheckEnforcement;
	required: boolean;
	parameters: Record<string, CheckJsonValue>;
	dependsOn: string[];
	activatedBy: string[];
	ruleRefs: string[];
}

export type CheckMeasurement =
	| { shape: "boolean"; value: boolean }
	| { shape: "score"; value: number }
	| { shape: "count"; value: number }
	| { shape: "set"; values: string[] }
	| {
			shape: "structured";
			schemaRef: string;
			value: Record<string, CheckJsonValue>;
	  };

export interface CheckExecutionIdentity {
	id: string;
	version: string;
	kind: CheckExecutionKind;
	adapterVersion?: string;
	modelRef?: string;
	configurationDigest?: string;
	trialPolicy?: string;
	aggregationPolicy?: string;
}

export const CHECK_INVOCATION_PROTOCOL_ID = "codewiki.check-invocation";
export const CHECK_INVOCATION_PROTOCOL_VERSION = "1.0.0";
export const CHECK_OBSERVATION_PROTOCOL_ID = "codewiki.check-observation";
export const CHECK_OBSERVATION_PROTOCOL_VERSION = "1.0.0";

export type CheckInvocationCoverageStatus =
	| "complete"
	| "partial"
	| "unavailable";
export type CheckObservationOutcome = "pass" | "fail" | "indeterminate";

export interface CheckInvocationContextItem {
	readonly ref: string;
	readonly digest: Sha256Digest;
	readonly mediaType: string;
	readonly content: CanonicalJsonValue;
}

export interface CheckInvocationContextSection {
	readonly status: CheckInvocationCoverageStatus;
	readonly requestedRefs: readonly string[];
	readonly items: readonly CheckInvocationContextItem[];
	readonly omittedCount: number;
	readonly truncated: boolean;
	readonly stale: boolean;
}

export interface CheckInvocationContext {
	readonly repository: CheckInvocationContextSection;
	readonly knowledge: CheckInvocationContextSection;
	readonly evidence: CheckInvocationContextSection;
}

export interface CheckInvocationCandidate {
	readonly id: string;
	readonly digest: Sha256Digest;
	readonly loop: SemanticLoop;
	readonly schemaVersion: string;
	readonly content: CanonicalJsonValue;
	readonly observedBase: {
		readonly workStateDigest: Sha256Digest;
		readonly knowledgeSnapshotDigest: Sha256Digest;
		readonly sourceSnapshotDigest?: Sha256Digest;
		readonly gitTreeDigest?: Sha256Digest;
		readonly canonicalRefs: readonly string[];
	};
}

export interface CheckInvocationPolicyBinding {
	readonly candidateDigest: Sha256Digest;
	readonly catalogDigest: Sha256Digest;
	readonly selectorInputDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
}

export interface CheckInvocationCheckBinding {
	readonly id: string;
	readonly version: string;
	readonly requirement: string;
	readonly requirementDigest: Sha256Digest;
	readonly checkDigest: Sha256Digest;
	readonly enforcement: CheckEnforcement;
	readonly required: boolean;
	readonly parameters: Readonly<Record<string, CheckJsonValue>>;
}

export interface CheckInvocation {
	readonly protocolId: typeof CHECK_INVOCATION_PROTOCOL_ID;
	readonly protocolVersion: typeof CHECK_INVOCATION_PROTOCOL_VERSION;
	readonly candidate: CheckInvocationCandidate;
	readonly policy: CheckInvocationPolicyBinding;
	readonly check: CheckInvocationCheckBinding;
	readonly context: CheckInvocationContext;
	readonly invocationDigest: Sha256Digest;
}

export interface CreateCheckInvocationInput {
	readonly candidate: CheckInvocationCandidate;
	readonly policy: CheckInvocationPolicyBinding;
	readonly check: CheckInvocationCheckBinding;
	readonly context: CheckInvocationContext;
	readonly maximumInputBytes: number;
}

export interface CheckObservationFinding {
	readonly message: string;
	readonly code?: string;
	readonly location?: {
		readonly ref: string;
		readonly startLine?: number;
		readonly endLine?: number;
	};
}

export interface CheckObservation {
	readonly protocolId: typeof CHECK_OBSERVATION_PROTOCOL_ID;
	readonly protocolVersion: typeof CHECK_OBSERVATION_PROTOCOL_VERSION;
	readonly invocationDigest: Sha256Digest;
	readonly outcome: CheckObservationOutcome;
	readonly summary: string;
	readonly findings: readonly CheckObservationFinding[];
	readonly reason?: string;
	readonly grantsResult: false;
}

export interface NormalizeCheckObservationInput {
	readonly value: unknown;
	readonly expectedInvocationDigest: Sha256Digest;
	readonly maximumOutputBytes: number;
}

export interface CheckThreshold {
	minimum?: number;
	maximum?: number;
}

export interface CheckResult {
	schemaVersion: typeof LOOP_EXIT_SCHEMA_VERSION;
	checkId: string;
	checkVersion: string;
	requirementDigest: string;
	checkDigest: string;
	candidateDigest: string;
	policyDigest: string;
	invocationDigest?: Sha256Digest;
	status: CheckResultStatus;
	measurement?: CheckMeasurement;
	threshold?: CheckThreshold;
	evidenceResolutions: EvidenceObligationResolution[];
	evidenceRecordIds: EvidenceId[];
	evidenceInputDigest: string;
	findings: string[];
	issueClass?: string;
	repairTarget: string;
	feedback?: string;
	execution: CheckExecutionIdentity;
	resultDigest: string;
}

export interface ExitReport {
	schemaVersion: typeof LOOP_EXIT_SCHEMA_VERSION;
	reductionVersion: string;
	loop: SemanticLoop;
	candidateDigest: string;
	catalogDigest: string;
	policyDigest: string;
	status: ExitReportStatus;
	checkResults: CheckResult[];
	reportDigest: string;
}

export interface CheckExclusion {
	checkId: string;
	checkVersion: string;
	requirementDigest: string;
	checkDigest: string;
	reason: CheckExclusionReason;
	refs: string[];
}

export interface ResolvedExitPolicy {
	schemaVersion: typeof LOOP_EXIT_SCHEMA_VERSION;
	loop: SemanticLoop;
	candidateDigest: string;
	catalogDigest: string;
	selectorInputDigest: string;
	bindings: CheckBinding[];
	exclusions: CheckExclusion[];
	protectedCheckIds: string[];
	policyDigest: string;
}

interface CreateResolvedExitPolicyInput {
	loop: SemanticLoop;
	candidateDigest: string;
	catalogDigest: string;
	selectorInputDigest: string;
	bindings: CheckBinding[];
	exclusions?: CheckExclusion[];
	protectedCheckIds?: string[];
}

export function createResolvedExitPolicy(
	input: CreateResolvedExitPolicyInput,
): ResolvedExitPolicy {
	const policyWithoutDigest = normalizePolicyInput(input);
	assertValidPolicyShape(policyWithoutDigest);
	return {
		...policyWithoutDigest,
		policyDigest: resolvedExitPolicyDigest(policyWithoutDigest),
	};
}

export function assertValidResolvedExitPolicy(
	policy: ResolvedExitPolicy,
): void {
	if (policy.schemaVersion !== LOOP_EXIT_SCHEMA_VERSION) {
		throw new Error(
			`Resolved Exit Policy uses unsupported schema version ${policy.schemaVersion}.`,
		);
	}
	const { policyDigest, ...policyWithoutDigest } = policy;
	assertDigest(policyDigest, "policyDigest");
	assertValidPolicyShape(policyWithoutDigest);
	const expectedDigest = resolvedExitPolicyDigest(policyWithoutDigest);
	if (policyDigest !== expectedDigest) {
		throw new Error(
			`Resolved Exit Policy digest mismatch: expected ${expectedDigest}.`,
		);
	}
}

function normalizePolicyInput(
	input: CreateResolvedExitPolicyInput,
): Omit<ResolvedExitPolicy, "policyDigest"> {
	return {
		schemaVersion: LOOP_EXIT_SCHEMA_VERSION,
		loop: input.loop,
		candidateDigest: input.candidateDigest,
		catalogDigest: input.catalogDigest,
		selectorInputDigest: input.selectorInputDigest,
		bindings: [...input.bindings]
			.map((binding) => ({
				...binding,
				parameters: sortedCheckJsonObject(binding.parameters),
				dependsOn: sortedUnique(binding.dependsOn),
				activatedBy: sortedUnique(binding.activatedBy),
				ruleRefs: sortedUnique(binding.ruleRefs),
			}))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
		exclusions: [...(input.exclusions ?? [])]
			.map((exclusion) => ({
				...exclusion,
				refs: sortedUnique(exclusion.refs),
			}))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
		protectedCheckIds: sortedUnique(input.protectedCheckIds ?? []),
	};
}

function assertValidPolicyShape(
	policy: Omit<ResolvedExitPolicy, "policyDigest">,
): void {
	assertDigest(policy.candidateDigest, "candidateDigest");
	assertDigest(policy.catalogDigest, "catalogDigest");
	assertDigest(policy.selectorInputDigest, "selectorInputDigest");
	assertUniqueIds(
		policy.bindings.map((binding) => binding.checkId),
		"binding Check",
	);
	assertUniqueIds(
		policy.exclusions.map((exclusion) => exclusion.checkId),
		"excluded Check",
	);

	const activeIds = new Set(policy.bindings.map((binding) => binding.checkId));
	for (const binding of policy.bindings) {
		assertStableId(binding.checkId, "binding checkId");
		assertVersion(binding.checkVersion, `Check ${binding.checkId}`);
		assertDigest(
			binding.requirementDigest,
			`Check ${binding.checkId} requirementDigest`,
		);
		assertDigest(binding.checkDigest, `Check ${binding.checkId} checkDigest`);
		if (binding.activatedBy.length === 0) {
			throw new Error(`Check binding ${binding.checkId} requires activatedBy.`);
		}
		for (const dependency of binding.dependsOn) {
			if (!activeIds.has(dependency)) {
				throw new Error(
					`Check binding ${binding.checkId} has unknown dependency ${dependency}.`,
				);
			}
		}
	}
	assertAcyclicBindings(policy.bindings);

	for (const exclusion of policy.exclusions) {
		assertStableId(exclusion.checkId, "exclusion checkId");
		assertVersion(exclusion.checkVersion, `Check ${exclusion.checkId}`);
		assertDigest(
			exclusion.requirementDigest,
			`Check ${exclusion.checkId} exclusion requirementDigest`,
		);
		assertDigest(
			exclusion.checkDigest,
			`Check ${exclusion.checkId} exclusion checkDigest`,
		);
		if (activeIds.has(exclusion.checkId)) {
			throw new Error(
				`Check ${exclusion.checkId} cannot be both active and excluded.`,
			);
		}
	}
	for (const protectedId of policy.protectedCheckIds) {
		if (!activeIds.has(protectedId)) {
			throw new Error(`Protected Check ${protectedId} must remain active.`);
		}
	}
}

function assertAcyclicBindings(bindings: CheckBinding[]): void {
	const byId = new Map(bindings.map((binding) => [binding.checkId, binding]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) {
			throw new Error(`Check dependency cycle includes ${id}.`);
		}
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const binding of bindings) visit(binding.checkId);
}

function assertUniqueIds(values: string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) throw new Error(`Duplicate ${label} ${value}.`);
		seen.add(value);
	}
}

function assertStableId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
		throw new Error(`${label} must be a stable id.`);
	}
}

function assertVersion(value: string, label: string): void {
	if (value.trim().length === 0) throw new Error(`${label} requires a version.`);
}

function assertDigest(value: string, label: string): void {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Resolved Exit Policy ${label} must be a sha256 digest.`);
	}
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function sortedCheckJsonObject(
	value: Record<string, CheckJsonValue>,
): Record<string, CheckJsonValue> {
	return Object.fromEntries(
		Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
	);
}

export const MAX_CHECK_INVOCATION_BYTES = 16_777_216;
export const MAX_CHECK_OBSERVATION_BYTES = 1_048_576;
const MAX_CHECK_CONTEXT_ITEMS = 512;
const MAX_CHECK_CONTEXT_REFS = 1_024;
const MAX_CHECK_FINDINGS = 128;

const DigestSchema = Type.String({pattern: "^sha256:[0-9a-f]{64}$"});
const RefSchema = Type.String({minLength: 1, maxLength: 4_096});
const ContextItemSchema = Type.Object(
	{
		ref: RefSchema,
		digest: DigestSchema,
		mediaType: Type.String({minLength: 1, maxLength: 256}),
		content: Type.Any(),
	},
	{additionalProperties: false},
);
const ContextSectionSchema = Type.Object(
	{
		status: Type.Union([
			Type.Literal("complete"),
			Type.Literal("partial"),
			Type.Literal("unavailable"),
		]),
		requestedRefs: Type.Array(RefSchema, {maxItems: MAX_CHECK_CONTEXT_REFS}),
		items: Type.Array(ContextItemSchema, {maxItems: MAX_CHECK_CONTEXT_ITEMS}),
		omittedCount: Type.Integer({minimum: 0, maximum: 1_000_000}),
		truncated: Type.Boolean(),
		stale: Type.Boolean(),
	},
	{additionalProperties: false},
);
const InvocationCandidateSchema = Type.Object(
	{
		id: Type.String({minLength: 1, maxLength: 512}),
		digest: DigestSchema,
		loop: Type.Union([
			Type.Literal("decision"),
			Type.Literal("planning"),
			Type.Literal("implementation"),
		]),
		schemaVersion: Type.String({minLength: 1, maxLength: 64}),
		content: Type.Any(),
		observedBase: Type.Object(
			{
				workStateDigest: DigestSchema,
				knowledgeSnapshotDigest: DigestSchema,
				sourceSnapshotDigest: Type.Optional(DigestSchema),
				gitTreeDigest: Type.Optional(DigestSchema),
				canonicalRefs: Type.Array(RefSchema, {
					maxItems: MAX_CHECK_CONTEXT_REFS,
				}),
			},
			{additionalProperties: false},
		),
	},
	{additionalProperties: false},
);
const InvocationPolicySchema = Type.Object(
	{
		candidateDigest: DigestSchema,
		catalogDigest: DigestSchema,
		selectorInputDigest: DigestSchema,
		policyDigest: DigestSchema,
	},
	{additionalProperties: false},
);
const InvocationCheckSchema = Type.Object(
	{
		id: Type.String({minLength: 1, maxLength: 512}),
		version: Type.String({minLength: 1, maxLength: 64}),
		requirement: Type.String({minLength: 1, maxLength: 262_144}),
		requirementDigest: DigestSchema,
		checkDigest: DigestSchema,
		enforcement: Type.Union([
			Type.Literal("observe"),
			Type.Literal("warn"),
			Type.Literal("require"),
		]),
		required: Type.Boolean(),
		parameters: Type.Record(Type.String(), Type.Any()),
	},
	{additionalProperties: false},
);
const InvocationContextSchema = Type.Object(
	{
		repository: ContextSectionSchema,
		knowledge: ContextSectionSchema,
		evidence: ContextSectionSchema,
	},
	{additionalProperties: false},
);
const InvocationBodySchema = Type.Object(
	{
		protocolId: Type.Literal(CHECK_INVOCATION_PROTOCOL_ID),
		protocolVersion: Type.Literal(CHECK_INVOCATION_PROTOCOL_VERSION),
		candidate: InvocationCandidateSchema,
		policy: InvocationPolicySchema,
		check: InvocationCheckSchema,
		context: InvocationContextSchema,
	},
	{additionalProperties: false},
);
export const CHECK_INVOCATION_SCHEMA = Type.Object(
	{
		...InvocationBodySchema.properties,
		invocationDigest: DigestSchema,
	},
	{
		$id: "urn:codewiki:protocol:check-invocation:1.0.0",
		additionalProperties: false,
	},
);
const ObservationFindingSchema = Type.Object(
	{
		message: Type.String({minLength: 1, maxLength: 4_096}),
		code: Type.Optional(Type.String({minLength: 1, maxLength: 128})),
		location: Type.Optional(
			Type.Object(
				{
					ref: RefSchema,
					startLine: Type.Optional(
						Type.Integer({minimum: 1, maximum: 10_000_000}),
					),
					endLine: Type.Optional(
						Type.Integer({minimum: 1, maximum: 10_000_000}),
					),
				},
				{additionalProperties: false},
			),
		),
	},
	{additionalProperties: false},
);
export const CHECK_OBSERVATION_SCHEMA = Type.Object(
	{
		protocolId: Type.Literal(CHECK_OBSERVATION_PROTOCOL_ID),
		protocolVersion: Type.Literal(CHECK_OBSERVATION_PROTOCOL_VERSION),
		invocationDigest: DigestSchema,
		outcome: Type.Union([
			Type.Literal("pass"),
			Type.Literal("fail"),
			Type.Literal("indeterminate"),
		]),
		summary: Type.String({minLength: 1, maxLength: 2_048}),
		findings: Type.Array(ObservationFindingSchema, {
			maxItems: MAX_CHECK_FINDINGS,
		}),
		reason: Type.Optional(Type.String({minLength: 1, maxLength: 2_048})),
		grantsResult: Type.Literal(false),
	},
	{
		$id: "urn:codewiki:protocol:check-observation:1.0.0",
		additionalProperties: false,
	},
);

export function createCheckInvocation(
	input: CreateCheckInvocationInput,
): CheckInvocation {
	assertExactKeys(
		input,
		["candidate", "policy", "check", "context", "maximumInputBytes"],
		"Check Invocation input",
	);
	const maximumInputBytes = checkProtocolByteLimit(
		input.maximumInputBytes,
		MAX_CHECK_INVOCATION_BYTES,
		"Check Invocation maximumInputBytes",
	);
	const body = normalizeInvocationBody(input);
	const invocation = freezeCheckProtocol({
		...body,
		invocationDigest: canonicalJsonDigest(body),
	});
	assertCheckProtocolBytes(invocation, maximumInputBytes, "Check Invocation");
	return invocation;
}

export function assertValidCheckInvocation(
	value: unknown,
	maximumInputBytes: number,
): asserts value is CheckInvocation {
	const limit = checkProtocolByteLimit(
		maximumInputBytes,
		MAX_CHECK_INVOCATION_BYTES,
		"Check Invocation maximumInputBytes",
	);
	assertTypeboxSchema(CHECK_INVOCATION_SCHEMA, value, "Check Invocation");
	const invocation = value as CheckInvocation;
	const normalized = createCheckInvocation({
		candidate: invocation.candidate,
		policy: invocation.policy,
		check: invocation.check,
		context: invocation.context,
		maximumInputBytes: limit,
	});
	if (canonicalJson(invocation) !== canonicalJson(normalized)) {
		throw new Error("Check Invocation is not in canonical normalized form.");
	}
}

function normalizeInvocationBody(
	input: Omit<CreateCheckInvocationInput, "maximumInputBytes">,
): Omit<CheckInvocation, "invocationDigest"> {
	const raw = {
		protocolId: CHECK_INVOCATION_PROTOCOL_ID,
		protocolVersion: CHECK_INVOCATION_PROTOCOL_VERSION,
		candidate: input.candidate,
		policy: input.policy,
		check: input.check,
		context: input.context,
	};
	assertTypeboxSchema(InvocationBodySchema, raw, "Check Invocation");
	assertProtocolText(input.candidate.id, "Check Invocation candidate id");
	assertProtocolText(
		input.candidate.schemaVersion,
		"Check Invocation candidate schemaVersion",
	);
	assertProtocolText(input.check.id, "Check Invocation Check id");
	assertProtocolText(input.check.version, "Check Invocation Check version");
	assertProtocolText(
		input.check.requirement,
		"Check Invocation Check requirement",
	);
	if (input.policy.candidateDigest !== input.candidate.digest) {
		throw new Error("Check Invocation policy does not bind its Candidate.");
	}
	const body = toCanonicalJsonValue({
		...raw,
		candidate: {
			...input.candidate,
			observedBase: {
				...input.candidate.observedBase,
				canonicalRefs: sortedProtocolValues(
					input.candidate.observedBase.canonicalRefs,
					"Check Invocation candidate canonicalRefs",
				),
			},
		},
		context: {
			repository: normalizeInvocationSection(
				input.context.repository,
				"repository",
			),
			knowledge: normalizeInvocationSection(input.context.knowledge, "knowledge"),
			evidence: normalizeInvocationSection(input.context.evidence, "evidence"),
		},
	}) as unknown as Omit<CheckInvocation, "invocationDigest">;
	return freezeCheckProtocol(body);
}

function normalizeInvocationSection(
	section: CheckInvocationContextSection,
	label: string,
): CheckInvocationContextSection {
	if (section.status === "complete" && (section.truncated || section.omittedCount > 0)) {
		throw new Error(
			`Complete Check Invocation ${label} context cannot be truncated or omit items.`,
		);
	}
	if (section.status === "unavailable" && section.items.length > 0) {
		throw new Error(
			`Unavailable Check Invocation ${label} context cannot include items.`,
		);
	}
	for (const item of section.items) {
		assertProtocolText(item.ref, `Check Invocation ${label} item ref`);
		assertProtocolText(item.mediaType, `Check Invocation ${label} item mediaType`);
	}
	const items = [...section.items].sort((left, right) =>
		left.ref.localeCompare(right.ref),
	);
	sortedProtocolValues(
		items.map((item) => item.ref),
		`Check Invocation ${label} item refs`,
	);
	return {
		...section,
		requestedRefs: sortedProtocolValues(
			section.requestedRefs,
			`Check Invocation ${label} requestedRefs`,
		),
		items,
	};
}

export function normalizeCheckObservation(
	input: NormalizeCheckObservationInput,
): CheckObservation {
	assertExactKeys(
		input,
		["value", "expectedInvocationDigest", "maximumOutputBytes"],
		"Check Observation normalization input",
	);
	const maximumOutputBytes = checkProtocolByteLimit(
		input.maximumOutputBytes,
		MAX_CHECK_OBSERVATION_BYTES,
		"Check Observation maximumOutputBytes",
	);
	assertSha256Digest(
		input.expectedInvocationDigest,
		"Check Observation expectedInvocationDigest",
	);
	if (
		!input.value ||
		typeof input.value !== "object" ||
		Array.isArray(input.value) ||
		(input.value as Record<string, unknown>).grantsResult !== false
	) {
		throw new Error("Check Observation cannot grant a Check Result.");
	}
	assertTypeboxSchema(CHECK_OBSERVATION_SCHEMA, input.value, "Check Observation");
	const observation = input.value as CheckObservation;
	assertProtocolText(observation.summary, "Check Observation summary");
	if (observation.reason) {
		assertProtocolText(observation.reason, "Check Observation reason");
	}
	for (const finding of observation.findings) {
		assertProtocolText(finding.message, "Check Observation finding message");
		if (finding.code) {
			assertProtocolText(finding.code, "Check Observation finding code");
		}
		if (finding.location) {
			assertProtocolText(
				finding.location.ref,
				"Check Observation finding location ref",
			);
		}
	}
	if (observation.invocationDigest !== input.expectedInvocationDigest) {
		throw new Error("Check Observation does not bind its Invocation.");
	}
	if (observation.outcome === "fail" && observation.findings.length === 0) {
		throw new Error("Failed Check Observation requires at least one finding.");
	}
	if (observation.outcome === "indeterminate" && !observation.reason) {
		throw new Error("Indeterminate Check Observation requires a reason.");
	}
	if (observation.outcome !== "indeterminate" && observation.reason) {
		throw new Error("Only an indeterminate Check Observation may supply reason.");
	}
	for (const finding of observation.findings) {
		const location = finding.location;
		if (
			location?.startLine !== undefined &&
			location.endLine !== undefined &&
			location.endLine < location.startLine
		) {
			throw new Error("Check Observation finding endLine cannot precede startLine.");
		}
	}
	const normalized = freezeCheckProtocol(
		toCanonicalJsonValue(observation) as unknown as CheckObservation,
	);
	assertCheckProtocolBytes(normalized, maximumOutputBytes, "Check Observation");
	return normalized;
}

function sortedProtocolValues(
	values: readonly string[],
	label: string,
): string[] {
	for (const value of values) assertProtocolText(value, label);
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return [...values].sort((left, right) => left.localeCompare(right));
}

function assertProtocolText(value: string, label: string): void {
	if (!value.trim() || value !== value.trim()) {
		throw new Error(`${label} must be trimmed non-empty text.`);
	}
}

function checkProtocolByteLimit(
	value: unknown,
	maximum: number,
	label: string,
): number {
	if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
		throw new Error(`${label} must be an integer from 1 through ${maximum}.`);
	}
	return value as number;
}

function assertCheckProtocolBytes(
	value: unknown,
	maximumBytes: number,
	label: string,
): void {
	const size = Buffer.byteLength(canonicalJson(value), "utf8");
	if (size > maximumBytes) {
		throw new Error(`${label} exceeds its ${maximumBytes}-byte limit.`);
	}
}

function freezeCheckProtocol<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value as Record<string, unknown>)) {
			freezeCheckProtocol(child);
		}
		Object.freeze(value);
	}
	return value;
}
