import { Type, type Static } from "typebox";
import {
	assertCandidateContentKeys,
	assertCandidateSchema,
	candidateContentRecord,
	requiredCandidateText,
} from "../candidate-admission.ts";

const requiredTextSchema = Type.String({ minLength: 1, pattern: "\\S" });
const digestSchema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const stringArraySchema = Type.Array(requiredTextSchema, { uniqueItems: true });

export const planningResourceRequirementsSchema = Type.Object(
	{
		capabilityIds: stringArraySchema,
		toolIds: stringArraySchema,
		skillIds: stringArraySchema,
		custodyRequirements: stringArraySchema,
		budgetClass: requiredTextSchema,
	},
	{ additionalProperties: false },
);

export const planningWorkUnitCandidateSchema = Type.Object(
	{
		id: requiredTextSchema,
		owningChangeId: requiredTextSchema,
		title: requiredTextSchema,
		outcome: requiredTextSchema,
		technicalRequirements: stringArraySchema,
		acceptanceRequirements: stringArraySchema,
		componentRefs: stringArraySchema,
		pathScopes: stringArraySchema,
		verification: stringArraySchema,
		resourceRequirements: planningResourceRequirementsSchema,
	},
	{ additionalProperties: false },
);

export const planningDependencyEdgeSchema = Type.Object(
	{
		fromWorkUnitId: requiredTextSchema,
		toWorkUnitId: requiredTextSchema,
		kind: Type.Union([Type.Literal("requires"), Type.Literal("blocks")]),
	},
	{ additionalProperties: false },
);

export const planningAcceptanceCoverageSchema = Type.Object(
	{
		acceptanceRequirement: requiredTextSchema,
		workUnitIds: Type.Array(requiredTextSchema, { minItems: 1, uniqueItems: true }),
	},
	{ additionalProperties: false },
);

export const planningUiPreviewTargetSchema = Type.Object(
	{
		targetId: requiredTextSchema,
		targetDigest: digestSchema,
		profileId: requiredTextSchema,
		profileDigest: digestSchema,
		workUnitIds: Type.Array(requiredTextSchema, { minItems: 1, uniqueItems: true }),
		changeIds: Type.Array(requiredTextSchema, { minItems: 1, uniqueItems: true }),
		required: Type.Boolean(),
		activation: Type.Literal("implementation"),
		autoOpen: Type.Union([
			Type.Literal("once_per_target"),
			Type.Literal("manual"),
		]),
	},
	{ additionalProperties: false },
);

export const planningCandidateContentSchema = Type.Object(
	{
		changeId: requiredTextSchema,
		changeRevisionId: digestSchema,
		observedWorkGraphDigest: digestSchema,
		workUnits: Type.Array(planningWorkUnitCandidateSchema, { minItems: 1 }),
		dependencyEdges: Type.Array(planningDependencyEdgeSchema),
		acceptanceCoverage: Type.Array(planningAcceptanceCoverageSchema, { minItems: 1 }),
		uiPreviewTargets: Type.Array(planningUiPreviewTargetSchema),
		integrationRequirements: Type.Array(requiredTextSchema, {
			minItems: 1,
			uniqueItems: true,
		}),
		rationale: requiredTextSchema,
	},
	{ additionalProperties: false },
);

export type PlanningResourceRequirements = Static<
	typeof planningResourceRequirementsSchema
>;
export type PlanningWorkUnitCandidate = Static<
	typeof planningWorkUnitCandidateSchema
>;
export type PlanningDependencyEdge = Static<typeof planningDependencyEdgeSchema>;
export type PlanningAcceptanceCoverage = Static<
	typeof planningAcceptanceCoverageSchema
>;
export type PlanningUiPreviewTarget = Static<typeof planningUiPreviewTargetSchema>;
export type PlanningCandidateContent = Static<typeof planningCandidateContentSchema>;

const CANDIDATE_FIELDS = [
	"changeId",
	"changeRevisionId",
	"observedWorkGraphDigest",
	"workUnits",
	"dependencyEdges",
	"acceptanceCoverage",
	"uiPreviewTargets",
	"integrationRequirements",
	"rationale",
] as const;

const RUNTIME_FIELDS = [
	"actor",
	"createdAt",
	"repoRoot",
	"expectedWorkStateDigest",
	"expectedChangeId",
	"expectedBytes",
	"runtimeJobId",
	"mode",
] as const;

export function parsePlanningCandidateContent(
	value: unknown,
): PlanningCandidateContent {
	const candidate = candidateContentRecord(value, "planning");
	assertCandidateContentKeys(
		"planning",
		candidate,
		CANDIDATE_FIELDS,
		RUNTIME_FIELDS,
	);
	if (!Array.isArray(candidate.workUnits)) {
		throw new Error("Project Server planning candidate workUnits must be an array.");
	}
	requiredCandidateText(candidate.rationale, "planning", "rationale");
	assertCandidateSchema(
		planningCandidateContentSchema,
		candidate,
		"Project Server planning candidate",
	);
	return candidate as PlanningCandidateContent;
}
