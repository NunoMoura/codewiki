import { Type, type Static } from "typebox";
import {
	assertCandidateContentKeys,
	assertCandidateNestedKeys,
	assertCandidateSchema,
	candidateContentRecord,
	candidateNestedRecord,
} from "../verification/admission.ts";

const requiredTextSchema = Type.String({ minLength: 1, pattern: "\\S" });
const stringArraySchema = Type.Array(Type.String());
const checkPhaseSchema = Type.Union([
	Type.Literal("red"),
	Type.Literal("green"),
	Type.Literal("refactor"),
	Type.Literal("verify"),
]);

export const implementationCommandResultCandidateSchema = Type.Object(
	{
		command: Type.Optional(Type.String()),
		status: Type.Optional(
			Type.Union([
				Type.Literal("pass"),
				Type.Literal("fail"),
				Type.Literal("blocked"),
				Type.Literal("not-run"),
			]),
		),
		phase: Type.Optional(checkPhaseSchema),
		tddPhase: Type.Optional(checkPhaseSchema),
		acceptanceRequirementId: Type.Optional(Type.String()),
		exitCode: Type.Optional(Type.Integer()),
		outputRef: Type.Optional(Type.String()),
		summary: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const implementationAcceptanceEvidenceCandidateSchema = Type.Object(
	{
		acceptanceRequirementId: Type.Optional(Type.String()),
		summary: Type.Optional(Type.String()),
		evidenceRefs: Type.Optional(stringArraySchema),
	},
	{ additionalProperties: false },
);

export const implementationAssessmentCandidateSchema = Type.Object(
	{
		stance: Type.Optional(
			Type.Union([
				Type.Literal("production_ready"),
				Type.Literal("concerns"),
				Type.Literal("blocked"),
			]),
		),
		maintainability: Type.Optional(Type.String()),
		simplicity: Type.Optional(Type.String()),
		projectStyle: Type.Optional(Type.String()),
		errorHandling: Type.Optional(Type.String()),
		uncertainties: Type.Optional(stringArraySchema),
		uncertaintyOwner: Type.Optional(
			Type.Union([
				Type.Literal("none"),
				Type.Literal("implementation"),
				Type.Literal("planning"),
				Type.Literal("decision"),
				Type.Literal("user"),
			]),
		),
		uncertaintyResolution: Type.Optional(Type.String()),
		rationale: Type.Optional(Type.String()),
		concerns: Type.Optional(stringArraySchema),
	},
	{ additionalProperties: false },
);

export const implementationSensitiveSurfaceCandidateSchema = Type.Object(
	{
		security: Type.Optional(Type.String()),
		privacy: Type.Optional(Type.String()),
		accessibility: Type.Optional(Type.String()),
		dependencyRisk: Type.Optional(Type.String()),
		rationale: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const implementationEvidenceCandidateSchema = Type.Object(
	{
		workItemId: requiredTextSchema,
		assignmentId: Type.Optional(Type.String()),
		codePaths: Type.Optional(stringArraySchema),
		docPaths: Type.Optional(stringArraySchema),
		testPaths: Type.Optional(stringArraySchema),
		commands: Type.Optional(stringArraySchema),
		commandResults: Type.Optional(
			Type.Array(implementationCommandResultCandidateSchema),
		),
		acceptanceEvidence: Type.Optional(stringArraySchema),
		acceptanceEvidenceItems: Type.Optional(
			Type.Array(implementationAcceptanceEvidenceCandidateSchema),
		),
		implementationAssessment: Type.Optional(
			implementationAssessmentCandidateSchema,
		),
		sensitiveSurfaceAssessment: Type.Optional(
			implementationSensitiveSurfaceCandidateSchema,
		),
		publicationRefs: Type.Optional(stringArraySchema),
	},
	{ additionalProperties: false },
);

export const implementationArchiveDispositionCandidateSchema = Type.Object(
	{
		action: Type.Union([
			Type.Literal("post_commit_compact"),
			Type.Literal("retain_hot"),
		]),
		traceId: requiredTextSchema,
		reason: requiredTextSchema,
		afterCommit: Type.Boolean(),
		gitRestoreRef: Type.Optional(Type.String()),
		refs: stringArraySchema,
	},
	{ additionalProperties: false },
);

export const implementationCandidateContentSchema = Type.Object(
	{
		evidence: Type.Optional(Type.Array(implementationEvidenceCandidateSchema)),
		archiveDisposition: Type.Optional(
			implementationArchiveDispositionCandidateSchema,
		),
	},
	{ additionalProperties: false },
);

export type ImplementationCommandResultCandidate = Static<
	typeof implementationCommandResultCandidateSchema
>;
export type ImplementationAcceptanceEvidenceCandidate = Static<
	typeof implementationAcceptanceEvidenceCandidateSchema
>;
export type ImplementationAssessmentCandidate = Static<
	typeof implementationAssessmentCandidateSchema
>;
export type ImplementationSensitiveSurfaceCandidate = Static<
	typeof implementationSensitiveSurfaceCandidateSchema
>;
export type ImplementationEvidenceCandidate = Static<
	typeof implementationEvidenceCandidateSchema
>;
export type ImplementationArchiveDispositionCandidate = Static<
	typeof implementationArchiveDispositionCandidateSchema
>;
export type ImplementationCandidateContent = Static<
	typeof implementationCandidateContentSchema
>;

const CANDIDATE_FIELDS = ["evidence", "archiveDisposition"] as const;
const RUNTIME_FIELDS = [
	"reviewEvidenceReports",
	"requireArchiveDisposition",
	"evidencePolicy",
	"includeCachedReviewEvidence",
	"autoReviewEvidence",
	"reviewTimeoutMs",
	"requireTddEvidence",
	"createdAt",
	"snapshotRoots",
	"snapshotExclude",
	"proofPaths",
	"changedPaths",
	"evidencePaths",
	"aggregateContentProof",
	"repoRoot",
	"expectedWorkStateDigest",
	"workerReports",
	"runtimeJobId",
	"traceId",
	"planningEvents",
	"changes",
	"changeInputs",
	"workerClaims",
	"claimEvents",
	"componentMap",
	"parentId",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
	"mode",
] as const;
const EVIDENCE_FIELDS = Object.keys(
	implementationEvidenceCandidateSchema.properties,
);

export function parseImplementationCandidateContent(
	value: unknown,
): ImplementationCandidateContent {
	const candidate = candidateContentRecord(value, "implementation");
	assertCandidateContentKeys(
		"implementation",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (candidate.evidence !== undefined) {
		if (!Array.isArray(candidate.evidence)) {
			throw new Error("Runtime implementation candidate evidence must be an array.");
		}
		for (const value of candidate.evidence) {
			const evidence = candidateNestedRecord(value, "Implementation evidence");
			assertCandidateNestedKeys(evidence, EVIDENCE_FIELDS, "Implementation evidence");
		}
	}
	assertCandidateSchema(
		implementationCandidateContentSchema,
		candidate,
		"Runtime implementation candidate",
	);
	return candidate as ImplementationCandidateContent;
}
