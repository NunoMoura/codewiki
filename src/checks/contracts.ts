import {Type} from "typebox";
import {assertTypeboxSchema} from "../utils/json.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export const CHECK_DEFINITION_SCHEMA_VERSION = "1.0.0" as const;
export const CHECK_INVOCATION_PROTOCOL_ID = "codewiki.check-invocation" as const;
export const CHECK_INVOCATION_PROTOCOL_VERSION = "2.0.0" as const;
export const CHECK_OUTPUT_PROTOCOL_ID = "codewiki.check-output" as const;
export const CHECK_OUTPUT_PROTOCOL_VERSION = "1.0.0" as const;
export const CHECK_RESULT_SCHEMA_VERSION = "1.0.0" as const;
export const GATE_REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const GATE_REPORT_REDUCTION_VERSION = "1.0.0" as const;

export const CHECK_STAGES = [
	"decision",
	"planning",
	"implementation",
	"review",
] as const;

export type CheckStage = (typeof CHECK_STAGES)[number];
export type SemanticLoop = Exclude<CheckStage, "review">;
export type CheckImplementationKind = "code" | "model";
export type CheckInputSource =
	| "subject"
	| "repository"
	| "knowledge"
	| "evidence"
	| "provider_receipts";
export type CheckResultStatus = "passed" | "failed";
export type GateReportStatus = "passed" | "failed" | "stopped";

export interface CheckInputSelector {
	readonly source: CheckInputSource;
	readonly refs: readonly string[];
	readonly required: boolean;
	readonly maximumBytes: number;
}

export interface CodeCheckImplementation {
	readonly kind: "code";
	readonly profile: string;
}

export interface ModelCheckImplementation {
	readonly kind: "model";
	readonly route: string;
	readonly profile: string;
	readonly maximumTokens: number;
}

export type CheckImplementation =
	| CodeCheckImplementation
	| ModelCheckImplementation;

export type CheckMeasurementSpec =
	| Readonly<{kind: "binary"}>
	| Readonly<{
			kind: "quantitative";
			minimum?: number;
			maximum?: number;
	  }>;

export interface CheckFailureContract {
	readonly code: string;
	readonly message: string;
	readonly remediation: readonly string[];
}

export interface CheckExecutionLimits {
	readonly timeoutMs: number;
	readonly maximumAttempts: number;
	readonly maximumInputBytes: number;
	readonly maximumOutputBytes: number;
}

export interface CheckDefinition {
	readonly schemaVersion: typeof CHECK_DEFINITION_SCHEMA_VERSION;
	readonly id: string;
	readonly version: string;
	readonly description: string;
	readonly requirement: string;
	readonly implementation: CheckImplementation;
	readonly inputs: readonly CheckInputSelector[];
	readonly measurement: CheckMeasurementSpec;
	readonly failure: CheckFailureContract;
	readonly limits: CheckExecutionLimits;
}

export interface CheckSubject {
	readonly stage: CheckStage;
	readonly id: string;
	readonly schemaVersion: string;
	readonly digest: Sha256Digest;
	readonly content: CanonicalJsonValue;
}

export interface CheckInputItem {
	readonly source: CheckInputSource;
	readonly ref: string;
	readonly digest: Sha256Digest;
	readonly content: CanonicalJsonValue;
}

export interface CheckInputSelection {
	readonly selector: CheckInputSelector;
	readonly status: "ready" | "unavailable";
	readonly items: readonly CheckInputItem[];
	readonly truncated: boolean;
	readonly stale: boolean;
	readonly selectionDigest: Sha256Digest;
}

export interface CheckInvocationBinding {
	readonly packId: string;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly checkDigest: Sha256Digest;
	readonly implementationKind: CheckImplementationKind;
}

export interface CheckInvocation {
	readonly protocolId: typeof CHECK_INVOCATION_PROTOCOL_ID;
	readonly protocolVersion: typeof CHECK_INVOCATION_PROTOCOL_VERSION;
	readonly subject: CheckSubject;
	readonly packSnapshotDigest: Sha256Digest;
	readonly check: CheckInvocationBinding;
	readonly inputs: readonly CheckInputSelection[];
	readonly inputDigest: Sha256Digest;
	readonly invocationDigest: Sha256Digest;
}

export type CheckMeasurement =
	| Readonly<{kind: "binary"; value: boolean}>
	| Readonly<{kind: "quantitative"; value: number}>;

export interface CheckOutputDetail {
	readonly message: string;
	readonly ref?: string;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface CheckOutput {
	readonly protocolId: typeof CHECK_OUTPUT_PROTOCOL_ID;
	readonly protocolVersion: typeof CHECK_OUTPUT_PROTOCOL_VERSION;
	readonly invocationDigest: Sha256Digest;
	readonly measurement: CheckMeasurement;
	readonly summary: string;
	readonly details: readonly CheckOutputDetail[];
}

export interface CheckExecutionIdentity {
	readonly kind: CheckImplementationKind;
	readonly executorId: string;
	readonly executorVersion: string;
	readonly profile: string;
	readonly route?: string;
	readonly configurationDigest: Sha256Digest;
}

export interface CheckFailure {
	readonly code: string;
	readonly message: string;
	readonly remediation: readonly string[];
	readonly summary: string;
	readonly details: readonly CheckOutputDetail[];
}

export interface CheckResult {
	readonly schemaVersion: typeof CHECK_RESULT_SCHEMA_VERSION;
	readonly stage: CheckStage;
	readonly subjectDigest: Sha256Digest;
	readonly packSnapshotDigest: Sha256Digest;
	readonly packId: string;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly checkDigest: Sha256Digest;
	readonly invocationDigest: Sha256Digest;
	readonly inputDigest: Sha256Digest;
	readonly evidenceRecordIds: readonly string[];
	readonly status: CheckResultStatus;
	readonly measurement: CheckMeasurement;
	readonly execution: CheckExecutionIdentity;
	readonly failure?: CheckFailure;
	readonly resultDigest: Sha256Digest;
}

export type CheckExecutionStopCode =
	| "missing_inputs"
	| "executor_unavailable"
	| "timeout"
	| "cancelled"
	| "invalid_output"
	| "execution_failed"
	| "budget_exhausted"
	| "stale_subject"
	| "malformed_check";

export interface GateStopReason {
	readonly code: CheckExecutionStopCode;
	readonly message: string;
	readonly packId?: string;
	readonly checkId?: string;
}

export interface CheckExecutionFact {
	readonly packId: string;
	readonly checkId: string;
	readonly source: "cache" | "executed";
	readonly status: "completed" | "stopped" | "cancelled";
	readonly attempts: number;
	readonly execution?: CheckExecutionIdentity;
	readonly resultDigest?: Sha256Digest;
	readonly stopReason?: GateStopReason;
}

export type GateWarningCode = "no_checks_configured" | "empty_pack";

export interface GateWarning {
	readonly code: GateWarningCode;
	readonly message: string;
	readonly packId?: string;
}

export interface GateReport {
	readonly schemaVersion: typeof GATE_REPORT_SCHEMA_VERSION;
	readonly reductionVersion: typeof GATE_REPORT_REDUCTION_VERSION;
	readonly stage: CheckStage;
	readonly subjectDigest: Sha256Digest;
	readonly packSnapshotDigest: Sha256Digest;
	readonly status: GateReportStatus;
	readonly selectedCheckCount: number;
	readonly results: readonly CheckResult[];
	readonly executions: readonly CheckExecutionFact[];
	readonly cacheHitCheckIds: readonly string[];
	readonly warnings: readonly GateWarning[];
	readonly stoppedReason?: GateStopReason;
	readonly reportDigest: Sha256Digest;
}

const IdentifierSchema = Type.String({
	pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
});
const VersionSchema = Type.String({
	pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[A-Za-z0-9.-]+)?$",
});
const BoundedTextSchema = Type.String({minLength: 1, maxLength: 4_096});
const DigestSchema = Type.String({pattern: "^sha256:[a-f0-9]{64}$"});
const InputSourceSchema = Type.Union([
	Type.Literal("subject"),
	Type.Literal("repository"),
	Type.Literal("knowledge"),
	Type.Literal("evidence"),
	Type.Literal("provider_receipts"),
]);
export const CheckInputSelectorSchema = Type.Object(
	{
		source: InputSourceSchema,
		refs: Type.Array(Type.String({minLength: 1, maxLength: 512}), {
			maxItems: 64,
		}),
		required: Type.Boolean(),
		maximumBytes: Type.Integer({minimum: 1, maximum: 1_048_576}),
	},
	{additionalProperties: false},
);
const CodeImplementationSchema = Type.Object(
	{
		kind: Type.Literal("code"),
		profile: IdentifierSchema,
	},
	{additionalProperties: false},
);
const ModelImplementationSchema = Type.Object(
	{
		kind: Type.Literal("model"),
		route: IdentifierSchema,
		profile: IdentifierSchema,
		maximumTokens: Type.Integer({minimum: 1, maximum: 65_536}),
	},
	{additionalProperties: false},
);
const MeasurementSpecSchema = Type.Union([
	Type.Object({kind: Type.Literal("binary")}, {additionalProperties: false}),
	Type.Object(
		{
			kind: Type.Literal("quantitative"),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
		},
		{additionalProperties: false},
	),
]);
const FailureSchema = Type.Object(
	{
		code: IdentifierSchema,
		message: BoundedTextSchema,
		remediation: Type.Array(BoundedTextSchema, {maxItems: 32}),
	},
	{additionalProperties: false},
);
const LimitsSchema = Type.Object(
	{
		timeoutMs: Type.Integer({minimum: 1, maximum: 300_000}),
		maximumAttempts: Type.Integer({minimum: 1, maximum: 3}),
		maximumInputBytes: Type.Integer({minimum: 1, maximum: 4_194_304}),
		maximumOutputBytes: Type.Integer({minimum: 1, maximum: 1_048_576}),
	},
	{additionalProperties: false},
);

export const CheckDefinitionSchema = Type.Object(
	{
		schemaVersion: Type.Literal(CHECK_DEFINITION_SCHEMA_VERSION),
		id: IdentifierSchema,
		version: VersionSchema,
		description: BoundedTextSchema,
		requirement: BoundedTextSchema,
		implementation: Type.Union([
			CodeImplementationSchema,
			ModelImplementationSchema,
		]),
		inputs: Type.Array(CheckInputSelectorSchema, {maxItems: 32}),
		measurement: MeasurementSpecSchema,
		failure: FailureSchema,
		limits: LimitsSchema,
	},
	{additionalProperties: false},
);

export const CheckOutputSchema = Type.Object(
	{
		protocolId: Type.Literal(CHECK_OUTPUT_PROTOCOL_ID),
		protocolVersion: Type.Literal(CHECK_OUTPUT_PROTOCOL_VERSION),
		invocationDigest: DigestSchema,
		measurement: Type.Union([
			Type.Object(
				{kind: Type.Literal("binary"), value: Type.Boolean()},
				{additionalProperties: false},
			),
			Type.Object(
				{kind: Type.Literal("quantitative"), value: Type.Number()},
				{additionalProperties: false},
			),
		]),
		summary: BoundedTextSchema,
		details: Type.Array(
			Type.Object(
				{
					message: BoundedTextSchema,
					ref: Type.Optional(Type.String({minLength: 1, maxLength: 512})),
					startLine: Type.Optional(Type.Integer({minimum: 1})),
					endLine: Type.Optional(Type.Integer({minimum: 1})),
				},
				{additionalProperties: false},
			),
			{maxItems: 128},
		),
	},
	{additionalProperties: false},
);

const StageSchema = Type.Union(CHECK_STAGES.map((stage) => Type.Literal(stage)));
const MeasurementSchema = Type.Union([
	Type.Object(
		{kind: Type.Literal("binary"), value: Type.Boolean()},
		{additionalProperties: false},
	),
	Type.Object(
		{kind: Type.Literal("quantitative"), value: Type.Number()},
		{additionalProperties: false},
	),
]);
const OutputDetailSchema = Type.Object(
	{
		message: BoundedTextSchema,
		ref: Type.Optional(Type.String({minLength: 1, maxLength: 512})),
		startLine: Type.Optional(Type.Integer({minimum: 1})),
		endLine: Type.Optional(Type.Integer({minimum: 1})),
	},
	{additionalProperties: false},
);
const ExecutionIdentitySchema = Type.Object(
	{
		kind: Type.Union([Type.Literal("code"), Type.Literal("model")]),
		executorId: IdentifierSchema,
		executorVersion: IdentifierSchema,
		profile: IdentifierSchema,
		route: Type.Optional(IdentifierSchema),
		configurationDigest: DigestSchema,
	},
	{additionalProperties: false},
);
const StopCodeSchema = Type.Union([
	Type.Literal("missing_inputs"),
	Type.Literal("executor_unavailable"),
	Type.Literal("timeout"),
	Type.Literal("cancelled"),
	Type.Literal("invalid_output"),
	Type.Literal("execution_failed"),
	Type.Literal("budget_exhausted"),
	Type.Literal("stale_subject"),
	Type.Literal("malformed_check"),
]);

export const GateStopReasonSchema = Type.Object(
	{
		code: StopCodeSchema,
		message: BoundedTextSchema,
		packId: Type.Optional(IdentifierSchema),
		checkId: Type.Optional(IdentifierSchema),
	},
	{additionalProperties: false},
);

export const GateWarningSchema = Type.Object(
	{
		code: Type.Union([
			Type.Literal("no_checks_configured"),
			Type.Literal("empty_pack"),
		]),
		message: BoundedTextSchema,
		packId: Type.Optional(IdentifierSchema),
	},
	{additionalProperties: false},
);

export const CheckInvocationSchema = Type.Object(
	{
		protocolId: Type.Literal(CHECK_INVOCATION_PROTOCOL_ID),
		protocolVersion: Type.Literal(CHECK_INVOCATION_PROTOCOL_VERSION),
		subject: Type.Object(
			{
				stage: StageSchema,
				id: Type.String({minLength: 1, maxLength: 512}),
				schemaVersion: VersionSchema,
				digest: DigestSchema,
				content: Type.Unknown(),
			},
			{additionalProperties: false},
		),
		packSnapshotDigest: DigestSchema,
		check: Type.Object(
			{
				packId: IdentifierSchema,
				checkId: IdentifierSchema,
				checkVersion: VersionSchema,
				checkDigest: DigestSchema,
				implementationKind: Type.Union([
					Type.Literal("code"),
					Type.Literal("model"),
				]),
			},
			{additionalProperties: false},
		),
		inputs: Type.Array(
			Type.Object(
				{
					selector: CheckInputSelectorSchema,
					status: Type.Union([
						Type.Literal("ready"),
						Type.Literal("unavailable"),
					]),
					items: Type.Array(
						Type.Object(
							{
								source: InputSourceSchema,
								ref: Type.String({minLength: 1, maxLength: 512}),
								digest: DigestSchema,
								content: Type.Unknown(),
							},
							{additionalProperties: false},
						),
					),
					truncated: Type.Boolean(),
					stale: Type.Boolean(),
					selectionDigest: DigestSchema,
				},
				{additionalProperties: false},
			),
			{maxItems: 32},
		),
		inputDigest: DigestSchema,
		invocationDigest: DigestSchema,
	},
	{additionalProperties: false},
);

export const CheckResultSchema = Type.Object(
	{
		schemaVersion: Type.Literal(CHECK_RESULT_SCHEMA_VERSION),
		stage: StageSchema,
		subjectDigest: DigestSchema,
		packSnapshotDigest: DigestSchema,
		packId: IdentifierSchema,
		checkId: IdentifierSchema,
		checkVersion: VersionSchema,
		checkDigest: DigestSchema,
		invocationDigest: DigestSchema,
		inputDigest: DigestSchema,
		evidenceRecordIds: Type.Array(Type.String({minLength: 1, maxLength: 512}), {
			maxItems: 256,
		}),
		status: Type.Union([Type.Literal("passed"), Type.Literal("failed")]),
		measurement: MeasurementSchema,
		execution: ExecutionIdentitySchema,
		failure: Type.Optional(
			Type.Object(
				{
					code: IdentifierSchema,
					message: BoundedTextSchema,
					remediation: Type.Array(BoundedTextSchema, {maxItems: 32}),
					summary: BoundedTextSchema,
					details: Type.Array(OutputDetailSchema, {maxItems: 128}),
				},
				{additionalProperties: false},
			),
		),
		resultDigest: DigestSchema,
	},
	{additionalProperties: false},
);

const CheckExecutionFactSchema = Type.Object(
	{
		packId: IdentifierSchema,
		checkId: IdentifierSchema,
		source: Type.Union([Type.Literal("cache"), Type.Literal("executed")]),
		status: Type.Union([
			Type.Literal("completed"),
			Type.Literal("stopped"),
			Type.Literal("cancelled"),
		]),
		attempts: Type.Integer({minimum: 0, maximum: 3}),
		execution: Type.Optional(ExecutionIdentitySchema),
		resultDigest: Type.Optional(DigestSchema),
		stopReason: Type.Optional(GateStopReasonSchema),
	},
	{additionalProperties: false},
);

export const GateReportSchema = Type.Object(
	{
		schemaVersion: Type.Literal(GATE_REPORT_SCHEMA_VERSION),
		reductionVersion: Type.Literal(GATE_REPORT_REDUCTION_VERSION),
		stage: StageSchema,
		subjectDigest: DigestSchema,
		packSnapshotDigest: DigestSchema,
		status: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("stopped"),
		]),
		selectedCheckCount: Type.Integer({minimum: 0, maximum: 256}),
		results: Type.Array(CheckResultSchema, {maxItems: 256}),
		executions: Type.Array(CheckExecutionFactSchema, {maxItems: 256}),
		cacheHitCheckIds: Type.Array(Type.String({minLength: 1, maxLength: 257}), {
			maxItems: 256,
		}),
		warnings: Type.Array(GateWarningSchema, {maxItems: 65}),
		stoppedReason: Type.Optional(GateStopReasonSchema),
		reportDigest: DigestSchema,
	},
	{additionalProperties: false},
);

export function normalizeCheckDefinition(value: unknown): CheckDefinition {
	assertTypeboxSchema(CheckDefinitionSchema, value, "Check Definition");
	const definition = value as CheckDefinition;
	assertThreshold(definition.measurement);
	assertSelectors(definition.inputs);
	return immutable({
		...definition,
		inputs: definition.inputs.map((selector) => ({
			...selector,
			refs: normalizedTextList(selector.refs, "Check input refs"),
		})),
		failure: {
			...definition.failure,
			remediation: normalizedTextList(
				definition.failure.remediation,
				"Check failure remediation",
				false,
			),
		},
	});
}

export function assertValidCheckDefinition(value: unknown): asserts value is CheckDefinition {
	normalizeCheckDefinition(value);
}

export function checkDefinitionDigest(definition: CheckDefinition): Sha256Digest {
	return canonicalJsonDigest(normalizeCheckDefinition(definition));
}

export function normalizeCheckOutput(
	value: unknown,
	expectedInvocationDigest: Sha256Digest,
	maximumOutputBytes: number,
): CheckOutput {
	if (!Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1) {
		throw new Error("Check maximum output bytes must be a positive integer.");
	}
	const normalized = toCanonicalJsonValue(value);
	if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > maximumOutputBytes) {
		throw new Error(`Check Output exceeds ${maximumOutputBytes} bytes.`);
	}
	assertTypeboxSchema(CheckOutputSchema, normalized, "Check Output");
	const output = normalized as unknown as CheckOutput;
	if (output.invocationDigest !== expectedInvocationDigest) {
		throw new Error("Check Output invocation digest does not match its Invocation.");
	}
	assertFiniteMeasurement(output.measurement);
	for (const detail of output.details) {
		if (
			detail.startLine !== undefined &&
			detail.endLine !== undefined &&
			detail.endLine < detail.startLine
		) {
			throw new Error("Check Output detail endLine cannot precede startLine.");
		}
	}
	return immutable(output);
}

export function normalizeExecutionIdentity(
	value: CheckExecutionIdentity,
): CheckExecutionIdentity {
	const allowed = new Set([
		"kind",
		"executorId",
		"executorVersion",
		"profile",
		"route",
		"configurationDigest",
	]);
	assertExactObject(value, allowed, "Check execution identity");
	if (value.kind !== "code" && value.kind !== "model") {
		throw new Error("Check execution kind must be code or model.");
	}
	for (const [field, text] of [
		["executorId", value.executorId],
		["executorVersion", value.executorVersion],
		["profile", value.profile],
	] as const) {
		assertIdentifier(text, `Check execution ${field}`);
	}
	if (value.route !== undefined) assertIdentifier(value.route, "Check execution route");
	assertSha256Digest(value.configurationDigest, "Check execution configuration digest");
	if (value.kind === "model" && !value.route) {
		throw new Error("Model Check execution requires an independent route.");
	}
	if (value.kind === "code" && value.route !== undefined) {
		throw new Error("Code Check execution cannot declare a model route.");
	}
	return immutable({...value});
}

export function checkPassed(
	specification: CheckMeasurementSpec,
	measurement: CheckMeasurement,
): boolean {
	assertFiniteMeasurement(measurement);
	if (specification.kind !== measurement.kind) {
		throw new Error(
			`Check measurement kind ${measurement.kind} does not match ${specification.kind}.`,
		);
	}
	if (measurement.kind === "binary") return measurement.value;
	const quantitative = specification as Extract<
		CheckMeasurementSpec,
		{kind: "quantitative"}
	>;
	return (
		(quantitative.minimum === undefined ||
			measurement.value >= quantitative.minimum) &&
		(quantitative.maximum === undefined ||
			measurement.value <= quantitative.maximum)
	);
}

export function qualifiedCheckId(packId: string, checkId: string): string {
	assertIdentifier(packId, "Check Pack id");
	assertIdentifier(checkId, "Check id");
	return `${packId}/${checkId}`;
}

export function isCheckStage(value: unknown): value is CheckStage {
	return CHECK_STAGES.some((stage) => stage === value);
}

function assertThreshold(specification: CheckMeasurementSpec): void {
	if (specification.kind !== "quantitative") return;
	if (specification.minimum !== undefined && !Number.isFinite(specification.minimum)) {
		throw new Error("Check quantitative minimum must be finite.");
	}
	if (specification.maximum !== undefined && !Number.isFinite(specification.maximum)) {
		throw new Error("Check quantitative maximum must be finite.");
	}
	if (
		specification.minimum !== undefined &&
		specification.maximum !== undefined &&
		specification.maximum < specification.minimum
	) {
		throw new Error("Check quantitative maximum cannot be below minimum.");
	}
	if (specification.minimum === undefined && specification.maximum === undefined) {
		throw new Error("Quantitative Check requires a minimum or maximum threshold.");
	}
}

function assertSelectors(selectors: readonly CheckInputSelector[]): void {
	const sources = new Set<CheckInputSource>();
	for (const selector of selectors) {
		if (sources.has(selector.source)) {
			throw new Error(`Check input source ${selector.source} is duplicated.`);
		}
		sources.add(selector.source);
		if (selector.source === "subject" && selector.refs.length > 0) {
			throw new Error("Subject input selector cannot declare refs.");
		}
	}
	if (!sources.has("subject")) {
		throw new Error("Check Definition requires a subject input selector.");
	}
}

function assertFiniteMeasurement(measurement: CheckMeasurement): void {
	if (measurement.kind === "quantitative" && !Number.isFinite(measurement.value)) {
		throw new Error("Check quantitative measurement must be finite.");
	}
}

function normalizedTextList(
	values: readonly string[],
	label: string,
	sort = true,
): string[] {
	if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
	const normalized = values.map((value, index) => {
		if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
			throw new Error(`${label}[${index}] must be trimmed non-empty text.`);
		}
		return value;
	});
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} must be unique.`);
	}
	return sort ? [...normalized].sort(compareText) : normalized;
}

function assertIdentifier(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
		throw new Error(`${label} is invalid.`);
	}
}

function assertExactObject(
	value: object,
	allowed: ReadonlySet<string>,
	label: string,
): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowed.has(key)) {
			throw new Error(`${label} contains unsupported field ${String(key)}.`);
		}
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function immutable<T>(value: T): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
