import { Type, type TSchema } from "typebox";
import type { Sha256Digest } from "../utils/canonical-json.ts";

export const EVIDENCE_SCHEMA_VERSION = "1.3.0" as const;

export const EVIDENCE_KINDS = [
	"research_citation",
	"source_observation",
	"command_execution",
	"resource_usage",
	"ui_capture",
	"model_assessment",
	"worker_report",
	"integration_proof",
	"approval_receipt",
	"delivery_attestation",
	"outcome_observation",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceId<TKind extends EvidenceKind = EvidenceKind> =
	`evidence:${TKind}:${string}`;
export type EvidenceProducerKind =
	| "runtime"
	| "worker"
	| "model"
	| "user"
	| "external_service";
export type EvidenceAuthority =
	| "asserted"
	| "observed"
	| "verified"
	| "approved";
export type EvidenceCoverage = "complete" | "partial" | "unknown";
export type EvidenceSensitivity = "public" | "project" | "private";

export interface EvidenceSubject {
	readonly changeRefs: readonly string[];
	readonly changeRevisionDigests: readonly Sha256Digest[];
	readonly candidateDigest?: Sha256Digest;
	readonly planningRevisionDigest?: Sha256Digest;
	readonly acceptanceRequirementIds: readonly string[];
	readonly sourceTreeDigest?: Sha256Digest;
}

export interface EvidenceProducer {
	readonly kind: EvidenceProducerKind;
	readonly id: string;
	readonly version: string;
}

export interface EvidenceArtifact {
	readonly digest: Sha256Digest;
	readonly mediaType: string;
	readonly ref: string;
	readonly sizeBytes?: number;
}

export interface ResearchCitationPayload {
	readonly claim: string;
	readonly classification: "primary" | "secondary";
	readonly publisher: string;
	readonly uri: string;
	readonly title?: string;
	readonly publicationDate?: string;
	readonly passageDigest: Sha256Digest;
	readonly passageLocator?: string;
	readonly stance: "supports" | "contradicts" | "mixed" | "context_only";
	readonly limitations: readonly string[];
}

export interface SourceObservationPayload {
	readonly sourceType: "source" | "test" | "knowledge" | "git";
	readonly snapshotDigest: Sha256Digest;
	readonly paths: readonly string[];
	readonly symbols: readonly string[];
	readonly ownershipRefs: readonly string[];
	readonly observations: readonly string[];
}

export interface CommandExecutionPayload {
	readonly adapterId: string;
	readonly adapterVersion: string;
	readonly invocationDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly termination: "exited" | "timed_out" | "cancelled" | "unavailable";
	readonly exitCode?: number;
	readonly durationMs: number;
	readonly stdoutDigest?: Sha256Digest;
	readonly stderrDigest?: Sha256Digest;
	readonly diagnosticRefs: readonly string[];
}

export interface ResourceUsagePayload {
	readonly metric:
		| "model_tokens"
		| "cost_usd"
		| "latency_ms"
		| "changed_files"
		| "trace_bytes";
	readonly unit: "tokens" | "usd" | "milliseconds" | "files" | "bytes";
	readonly scope:
		| "decision_attempt"
		| "planning_attempt"
		| "implementation_assignment"
		| "implementation_attempt";
	readonly accountingWindow: string;
	readonly value: number;
	readonly aggregation: "complete_window";
	readonly meterId: string;
	readonly meterVersion: string;
	readonly meterConfigurationDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly capabilitySnapshotDigest: Sha256Digest;
	readonly templateBindingDigest: Sha256Digest;
	readonly customCheckDefinitionDigest: Sha256Digest;
	readonly protectedCustomCheckConfigSnapshotDigest: Sha256Digest;
}

export interface UiCaptureArtifact extends EvidenceArtifact {
	readonly role: "screenshot" | "video";
	readonly durationMs?: number;
}

export interface UiCapturePayload {
	readonly previewTargetId: string;
	readonly previewProfileId: string;
	readonly captureManifestDigest: Sha256Digest;
	readonly route: string;
	readonly scenario: string;
	readonly state: string;
	readonly viewport: {
		readonly width: number;
		readonly height: number;
		readonly deviceScaleFactor?: number;
	};
	readonly captures: readonly UiCaptureArtifact[];
	readonly livePreviewRef?: string;
	readonly console: {
		readonly errors: number;
		readonly warnings: number;
		readonly summaryDigest?: Sha256Digest;
	};
	readonly network: {
		readonly failedRequests: number;
		readonly summaryDigest?: Sha256Digest;
	};
	readonly observations: readonly string[];
}

export type EvidenceMeasurement =
	| { readonly kind: "boolean"; readonly value: boolean }
	| {
			readonly kind: "score";
			readonly value: number;
			readonly minimum: number;
			readonly maximum: number;
	  }
	| { readonly kind: "count"; readonly value: number }
	| {
			readonly kind: "label";
			readonly value: string;
			readonly vocabularyDigest: Sha256Digest;
	  };

export interface ModelSecurityChallengeFinding {
	readonly threatGoal: string;
	readonly preconditions: readonly string[];
	readonly attackPath: string;
	readonly violatedInvariants: readonly string[];
	readonly candidateRefs: readonly string[];
	readonly evidenceIds: readonly EvidenceId[];
	readonly claimedSeverity: "unknown" | "low" | "medium" | "high" | "critical";
	readonly confidence: "low" | "medium" | "high";
	readonly mitigations: readonly string[];
	readonly limitations: readonly string[];
}

export interface ModelAssessmentPayload {
	readonly checkId: string;
	readonly checkVersion: string;
	readonly protocolId: string;
	readonly protocolVersion: string;
	readonly routeId: string;
	readonly configurationDigest: Sha256Digest;
	readonly measurement: EvidenceMeasurement;
	readonly consideredEvidenceIds: readonly EvidenceId[];
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
	readonly securityFindings?: readonly ModelSecurityChallengeFinding[];
}

export interface WorkerReportPayload {
	readonly assignmentId: string;
	readonly claimId: string;
	readonly workbenchId: string;
	readonly baseTreeDigest: Sha256Digest;
	readonly reportDigest: Sha256Digest;
	readonly completion: "completed" | "blocked" | "failed" | "cancelled";
	readonly changedPaths: readonly string[];
	readonly proofRefs: readonly string[];
	readonly summary: string;
}

export interface IntegrationProofPayload {
	readonly operation: "apply" | "merge" | "cherry_pick" | "rebase";
	readonly targetRef: string;
	readonly baseCommit: string;
	readonly sourceCommit?: string;
	readonly resultCommit?: string;
	readonly resultTreeDigest: Sha256Digest;
	readonly patchDigest: Sha256Digest;
	readonly changedPaths: readonly string[];
	readonly verificationEvidenceIds: readonly EvidenceId[];
}

export interface ApprovalReceiptProvider {
	readonly id: string;
	readonly repository: string;
	readonly pullRequestNumber: number;
	readonly eventId: string;
	readonly headSha: string;
}

export interface ApprovalReceiptPayload {
	readonly checkId: string;
	readonly checkVersion: string;
	readonly approvalScope:
		| "candidate_exit"
		| "security_residual_risk"
		| "release_intent"
		| "release_safety";
	readonly actorId: string;
	readonly authenticatedIdentityRef: string;
	readonly role: string;
	readonly decision: "approved" | "changes_requested" | "rejected" | "revoked";
	readonly channel: "codewiki" | "git_provider";
	readonly decidedAt: string;
	readonly evidenceBundleDigest: Sha256Digest;
	readonly captureDigests: readonly Sha256Digest[];
	readonly securityResidualRisk?: {
		readonly risk: "high" | "critical";
		readonly priorApprovalEvidenceId: EvidenceId;
		readonly assessmentEvidenceIds: readonly EvidenceId[];
		readonly rationaleDigest: Sha256Digest;
		readonly findingDigests: readonly Sha256Digest[];
	};
	readonly provider?: ApprovalReceiptProvider;
}

export interface DeliveryAttestationPayload {
	readonly effect: "push" | "product_publication" | "release" | "deployment";
	readonly targetRef: string;
	readonly operationId: string;
	readonly outcome: "completed" | "failed" | "unavailable";
	readonly remoteStateDigest: Sha256Digest;
	readonly commitSha?: string;
	readonly artifactDigest?: Sha256Digest;
	readonly channel?: string;
	readonly providerEventId?: string;
}

export interface OutcomeObservationPayload {
	readonly outcomeId: string;
	readonly observationType: "metric" | "experience" | "user_feedback";
	readonly measurement?: EvidenceMeasurement;
	readonly summary: string;
	readonly window: {
		readonly startedAt: string;
		readonly endedAt: string;
	};
	readonly sourceRef: string;
	readonly limitations: readonly string[];
}

export interface EvidencePayloadByKind {
	readonly research_citation: ResearchCitationPayload;
	readonly source_observation: SourceObservationPayload;
	readonly command_execution: CommandExecutionPayload;
	readonly resource_usage: ResourceUsagePayload;
	readonly ui_capture: UiCapturePayload;
	readonly model_assessment: ModelAssessmentPayload;
	readonly worker_report: WorkerReportPayload;
	readonly integration_proof: IntegrationProofPayload;
	readonly approval_receipt: ApprovalReceiptPayload;
	readonly delivery_attestation: DeliveryAttestationPayload;
	readonly outcome_observation: OutcomeObservationPayload;
}

type EvidenceMaterialFor<TKind extends EvidenceKind> = {
	readonly schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
	readonly kind: TKind;
	readonly artifact?: EvidenceArtifact;
	readonly provenanceRefs: readonly string[];
	readonly payload: EvidencePayloadByKind[TKind];
};

export type EvidenceMaterial<TKind extends EvidenceKind = EvidenceKind> =
	TKind extends EvidenceKind ? EvidenceMaterialFor<TKind> : never;

export type EvidenceRecord<TKind extends EvidenceKind = EvidenceKind> =
	TKind extends EvidenceKind
		? EvidenceMaterialFor<TKind> & {
				readonly evidenceId: EvidenceId<TKind>;
				readonly subject: EvidenceSubject;
				readonly observedAt: string;
				readonly producer: EvidenceProducer;
				readonly authority: EvidenceAuthority;
				readonly coverage: EvidenceCoverage;
				readonly freshnessBoundary?: string;
				readonly sensitivity: EvidenceSensitivity;
		  }
		: never;

export interface EvidenceRuntimeContext {
	readonly subject: EvidenceSubject;
	readonly observedAt: string;
	readonly producer: EvidenceProducer;
	readonly authority: EvidenceAuthority;
	readonly coverage: EvidenceCoverage;
	readonly freshnessBoundary?: string;
	readonly sensitivity: EvidenceSensitivity;
}

const requiredTextSchema = Type.String({
	minLength: 1,
	maxLength: 8_192,
	pattern: "\\S",
});
const refSchema = Type.String({ minLength: 1, maxLength: 2_048, pattern: "\\S" });
const idSchema = Type.String({
	minLength: 1,
	maxLength: 256,
	pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
});
const digestSchema = Type.String({ pattern: "^sha256:[0-9a-f]{64}$" });
const timestampSchema = Type.String({
	pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
});
const dateSchema = Type.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" });
const gitObjectIdSchema = Type.String({ pattern: "^[0-9a-f]{40}([0-9a-f]{24})?$" });
const refListSchema = Type.Array(refSchema, { maxItems: 256 });
const digestListSchema = Type.Array(digestSchema, { maxItems: 256 });
const idListSchema = Type.Array(idSchema, { maxItems: 256 });
const findingListSchema = Type.Array(requiredTextSchema, { maxItems: 256 });

const evidenceArtifactSchema = Type.Object(
	{
		digest: digestSchema,
		mediaType: Type.String({
			minLength: 3,
			maxLength: 256,
			pattern: "^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$",
		}),
		ref: refSchema,
		sizeBytes: Type.Optional(Type.Integer({ minimum: 0 })),
	},
	{ additionalProperties: false },
);

export const evidenceSubjectSchema = Type.Object(
	{
		changeRefs: Type.Array(refSchema, { minItems: 1, maxItems: 256 }),
		changeRevisionDigests: Type.Array(digestSchema, {
			minItems: 1,
			maxItems: 256,
		}),
		candidateDigest: Type.Optional(digestSchema),
		planningRevisionDigest: Type.Optional(digestSchema),
		acceptanceRequirementIds: idListSchema,
		sourceTreeDigest: Type.Optional(digestSchema),
	},
	{ additionalProperties: false },
);

const evidenceProducerSchema = Type.Object(
	{
		kind: Type.Union([
			Type.Literal("runtime"),
			Type.Literal("worker"),
			Type.Literal("model"),
			Type.Literal("user"),
			Type.Literal("external_service"),
		]),
		id: idSchema,
		version: Type.String({ minLength: 1, maxLength: 256, pattern: "\\S" }),
	},
	{ additionalProperties: false },
);

const measurementSchema = Type.Union([
	Type.Object(
		{ kind: Type.Literal("boolean"), value: Type.Boolean() },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			kind: Type.Literal("score"),
			value: Type.Number(),
			minimum: Type.Number(),
			maximum: Type.Number(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("count"), value: Type.Integer({ minimum: 0 }) },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			kind: Type.Literal("label"),
			value: requiredTextSchema,
			vocabularyDigest: digestSchema,
		},
		{ additionalProperties: false },
	),
]);

const researchCitationPayloadSchema = Type.Object(
	{
		claim: requiredTextSchema,
		classification: Type.Union([Type.Literal("primary"), Type.Literal("secondary")]),
		publisher: requiredTextSchema,
		uri: Type.String({
			minLength: 3,
			maxLength: 2_048,
			pattern: "^[A-Za-z][A-Za-z0-9+.-]*:",
		}),
		title: Type.Optional(requiredTextSchema),
		publicationDate: Type.Optional(dateSchema),
		passageDigest: digestSchema,
		passageLocator: Type.Optional(refSchema),
		stance: Type.Union([
			Type.Literal("supports"),
			Type.Literal("contradicts"),
			Type.Literal("mixed"),
			Type.Literal("context_only"),
		]),
		limitations: findingListSchema,
	},
	{ additionalProperties: false },
);

const sourceObservationPayloadSchema = Type.Object(
	{
		sourceType: Type.Union([
			Type.Literal("source"),
			Type.Literal("test"),
			Type.Literal("knowledge"),
			Type.Literal("git"),
		]),
		snapshotDigest: digestSchema,
		paths: refListSchema,
		symbols: refListSchema,
		ownershipRefs: refListSchema,
		observations: Type.Array(requiredTextSchema, { minItems: 1, maxItems: 256 }),
	},
	{ additionalProperties: false },
);

const commandExecutionPayloadSchema = Type.Object(
	{
		adapterId: idSchema,
		adapterVersion: idSchema,
		invocationDigest: digestSchema,
		environmentDigest: digestSchema,
		termination: Type.Union([
			Type.Literal("exited"),
			Type.Literal("timed_out"),
			Type.Literal("cancelled"),
			Type.Literal("unavailable"),
		]),
		exitCode: Type.Optional(Type.Integer()),
		durationMs: Type.Integer({ minimum: 0 }),
		stdoutDigest: Type.Optional(digestSchema),
		stderrDigest: Type.Optional(digestSchema),
		diagnosticRefs: refListSchema,
	},
	{ additionalProperties: false },
);

const resourceUsagePayloadSchema = Type.Object(
	{
		metric: Type.Union([
			Type.Literal("model_tokens"),
			Type.Literal("cost_usd"),
			Type.Literal("latency_ms"),
			Type.Literal("changed_files"),
			Type.Literal("trace_bytes"),
		]),
		unit: Type.Union([
			Type.Literal("tokens"),
			Type.Literal("usd"),
			Type.Literal("milliseconds"),
			Type.Literal("files"),
			Type.Literal("bytes"),
		]),
		scope: Type.Union([
			Type.Literal("decision_attempt"),
			Type.Literal("planning_attempt"),
			Type.Literal("implementation_assignment"),
			Type.Literal("implementation_attempt"),
		]),
		accountingWindow: requiredTextSchema,
		value: Type.Number({minimum: 0}),
		aggregation: Type.Literal("complete_window"),
		meterId: idSchema,
		meterVersion: idSchema,
		meterConfigurationDigest: digestSchema,
		environmentDigest: digestSchema,
		capabilitySnapshotDigest: digestSchema,
		templateBindingDigest: digestSchema,
		customCheckDefinitionDigest: digestSchema,
		protectedCustomCheckConfigSnapshotDigest: digestSchema,
	},
	{additionalProperties: false},
);

const uiCaptureArtifactSchema = Type.Object(
	{
		role: Type.Union([Type.Literal("screenshot"), Type.Literal("video")]),
		digest: digestSchema,
		mediaType: Type.String({ minLength: 3, maxLength: 256, pattern: "^[^/\\s]+/[^/\\s]+$" }),
		ref: refSchema,
		sizeBytes: Type.Optional(Type.Integer({ minimum: 0 })),
		durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
	},
	{ additionalProperties: false },
);

const uiCapturePayloadSchema = Type.Object(
	{
		previewTargetId: idSchema,
		previewProfileId: idSchema,
		captureManifestDigest: digestSchema,
		route: refSchema,
		scenario: idSchema,
		state: idSchema,
		viewport: Type.Object(
			{
				width: Type.Integer({ minimum: 1, maximum: 16_384 }),
				height: Type.Integer({ minimum: 1, maximum: 16_384 }),
				deviceScaleFactor: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 8 })),
			},
			{ additionalProperties: false },
		),
		captures: Type.Array(uiCaptureArtifactSchema, { minItems: 1, maxItems: 32 }),
		livePreviewRef: Type.Optional(refSchema),
		console: Type.Object(
			{
				errors: Type.Integer({ minimum: 0 }),
				warnings: Type.Integer({ minimum: 0 }),
				summaryDigest: Type.Optional(digestSchema),
			},
			{ additionalProperties: false },
		),
		network: Type.Object(
			{
				failedRequests: Type.Integer({ minimum: 0 }),
				summaryDigest: Type.Optional(digestSchema),
			},
			{ additionalProperties: false },
		),
		observations: findingListSchema,
	},
	{ additionalProperties: false },
);

const modelSecurityChallengeFindingSchema = Type.Object(
	{
		threatGoal: requiredTextSchema,
		preconditions: findingListSchema,
		attackPath: requiredTextSchema,
		violatedInvariants: findingListSchema,
		candidateRefs: refListSchema,
		evidenceIds: Type.Array(
			Type.String({pattern: "^evidence:[a-z_]+:[0-9a-f]{64}$"}),
			{maxItems: 256, uniqueItems: true},
		),
		claimedSeverity: Type.Union(
			["unknown", "low", "medium", "high", "critical"].map((value) =>
				Type.Literal(value),
			),
		),
		confidence: Type.Union(
			["low", "medium", "high"].map((value) => Type.Literal(value)),
		),
		mitigations: findingListSchema,
		limitations: findingListSchema,
	},
	{additionalProperties: false},
);

const modelAssessmentPayloadSchema = Type.Object(
	{
		checkId: idSchema,
		checkVersion: idSchema,
		protocolId: idSchema,
		protocolVersion: idSchema,
		routeId: idSchema,
		configurationDigest: digestSchema,
		measurement: measurementSchema,
		consideredEvidenceIds: Type.Array(
			Type.String({pattern: "^evidence:[a-z_]+:[0-9a-f]{64}$"}),
			{maxItems: 256, uniqueItems: true},
		),
		findings: findingListSchema,
		limitations: findingListSchema,
		securityFindings: Type.Optional(
			Type.Array(modelSecurityChallengeFindingSchema, {maxItems: 32}),
		),
	},
	{ additionalProperties: false },
);

const workerReportPayloadSchema = Type.Object(
	{
		assignmentId: idSchema,
		claimId: idSchema,
		workbenchId: idSchema,
		baseTreeDigest: digestSchema,
		reportDigest: digestSchema,
		completion: Type.Union([
			Type.Literal("completed"),
			Type.Literal("blocked"),
			Type.Literal("failed"),
			Type.Literal("cancelled"),
		]),
		changedPaths: refListSchema,
		proofRefs: refListSchema,
		summary: requiredTextSchema,
	},
	{ additionalProperties: false },
);

const integrationProofPayloadSchema = Type.Object(
	{
		operation: Type.Union([
			Type.Literal("apply"),
			Type.Literal("merge"),
			Type.Literal("cherry_pick"),
			Type.Literal("rebase"),
		]),
		targetRef: refSchema,
		baseCommit: gitObjectIdSchema,
		sourceCommit: Type.Optional(gitObjectIdSchema),
		resultCommit: Type.Optional(gitObjectIdSchema),
		resultTreeDigest: digestSchema,
		patchDigest: digestSchema,
		changedPaths: refListSchema,
		verificationEvidenceIds: Type.Array(
			Type.String({ pattern: "^evidence:[a-z_]+:[0-9a-f]{64}$" }),
			{ maxItems: 256 },
		),
	},
	{ additionalProperties: false },
);

const approvalReceiptPayloadSchema = Type.Object(
	{
		checkId: idSchema,
		checkVersion: idSchema,
		approvalScope: Type.Union([
			Type.Literal("candidate_exit"),
			Type.Literal("security_residual_risk"),
			Type.Literal("release_intent"),
			Type.Literal("release_safety"),
		]),
		actorId: idSchema,
		authenticatedIdentityRef: refSchema,
		role: idSchema,
		decision: Type.Union([
			Type.Literal("approved"),
			Type.Literal("changes_requested"),
			Type.Literal("rejected"),
			Type.Literal("revoked"),
		]),
		channel: Type.Union([Type.Literal("codewiki"), Type.Literal("git_provider")]),
		decidedAt: timestampSchema,
		evidenceBundleDigest: digestSchema,
		captureDigests: digestListSchema,
		securityResidualRisk: Type.Optional(
			Type.Object(
				{
					risk: Type.Union([Type.Literal("high"), Type.Literal("critical")]),
					priorApprovalEvidenceId: idSchema,
					assessmentEvidenceIds: Type.Array(idSchema, {
						minItems: 2,
						maxItems: 2,
						uniqueItems: true,
					}),
					rationaleDigest: digestSchema,
					findingDigests: Type.Array(digestSchema, {
						maxItems: 128,
						uniqueItems: true,
					}),
				},
				{ additionalProperties: false },
			),
		),
		provider: Type.Optional(
			Type.Object(
				{
					id: idSchema,
					repository: refSchema,
					pullRequestNumber: Type.Integer({ minimum: 1 }),
					eventId: idSchema,
					headSha: gitObjectIdSchema,
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

const deliveryAttestationPayloadSchema = Type.Object(
	{
		effect: Type.Union([
			Type.Literal("push"),
			Type.Literal("product_publication"),
			Type.Literal("release"),
			Type.Literal("deployment"),
		]),
		targetRef: refSchema,
		operationId: idSchema,
		outcome: Type.Union([
			Type.Literal("completed"),
			Type.Literal("failed"),
			Type.Literal("unavailable"),
		]),
		remoteStateDigest: digestSchema,
		commitSha: Type.Optional(gitObjectIdSchema),
		artifactDigest: Type.Optional(digestSchema),
		channel: Type.Optional(idSchema),
		providerEventId: Type.Optional(idSchema),
	},
	{ additionalProperties: false },
);

const outcomeObservationPayloadSchema = Type.Object(
	{
		outcomeId: idSchema,
		observationType: Type.Union([
			Type.Literal("metric"),
			Type.Literal("experience"),
			Type.Literal("user_feedback"),
		]),
		measurement: Type.Optional(measurementSchema),
		summary: requiredTextSchema,
		window: Type.Object(
			{ startedAt: timestampSchema, endedAt: timestampSchema },
			{ additionalProperties: false },
		),
		sourceRef: refSchema,
		limitations: findingListSchema,
	},
	{ additionalProperties: false },
);

export const evidencePayloadSchemas: Readonly<Record<EvidenceKind, TSchema>> =
	Object.freeze({
		research_citation: researchCitationPayloadSchema,
		source_observation: sourceObservationPayloadSchema,
		command_execution: commandExecutionPayloadSchema,
		resource_usage: resourceUsagePayloadSchema,
		ui_capture: uiCapturePayloadSchema,
		model_assessment: modelAssessmentPayloadSchema,
		worker_report: workerReportPayloadSchema,
		integration_proof: integrationProofPayloadSchema,
		approval_receipt: approvalReceiptPayloadSchema,
		delivery_attestation: deliveryAttestationPayloadSchema,
		outcome_observation: outcomeObservationPayloadSchema,
	});

const materialProperties = {
	schemaVersion: Type.Literal(EVIDENCE_SCHEMA_VERSION),
	kind: Type.Union(EVIDENCE_KINDS.map((kind) => Type.Literal(kind))),
	artifact: Type.Optional(evidenceArtifactSchema),
	provenanceRefs: Type.Array(refSchema, { minItems: 1, maxItems: 256 }),
	payload: Type.Unknown(),
};

export const evidenceMaterialEnvelopeSchema = Type.Object(materialProperties, {
	additionalProperties: false,
});

const evidenceAuthoritySchema = Type.Union([
	Type.Literal("asserted"),
	Type.Literal("observed"),
	Type.Literal("verified"),
	Type.Literal("approved"),
]);
const evidenceCoverageSchema = Type.Union([
	Type.Literal("complete"),
	Type.Literal("partial"),
	Type.Literal("unknown"),
]);
const evidenceSensitivitySchema = Type.Union([
	Type.Literal("public"),
	Type.Literal("project"),
	Type.Literal("private"),
]);

export const evidenceRecordEnvelopeSchema = Type.Object(
	{
		...materialProperties,
		evidenceId: Type.String({ pattern: "^evidence:[a-z_]+:[0-9a-f]{64}$" }),
		subject: evidenceSubjectSchema,
		observedAt: timestampSchema,
		producer: evidenceProducerSchema,
		authority: evidenceAuthoritySchema,
		coverage: evidenceCoverageSchema,
		freshnessBoundary: Type.Optional(refSchema),
		sensitivity: evidenceSensitivitySchema,
	},
	{ additionalProperties: false },
);

export const evidenceRuntimeContextSchema = Type.Object(
	{
		subject: evidenceSubjectSchema,
		observedAt: timestampSchema,
		producer: evidenceProducerSchema,
		authority: evidenceAuthoritySchema,
		coverage: evidenceCoverageSchema,
		freshnessBoundary: Type.Optional(refSchema),
		sensitivity: evidenceSensitivitySchema,
	},
	{ additionalProperties: false },
);
