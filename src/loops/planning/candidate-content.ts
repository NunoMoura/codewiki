import { Type, type Static } from "typebox";
import {
	assertCandidateContentKeys,
	assertCandidateSchema,
	candidateContentRecord,
	requiredCandidateText,
} from "../candidate-admission.ts";

const requiredTextSchema = Type.String({ minLength: 1, pattern: "\\S" });
const stringArraySchema = Type.Array(Type.String());

export const planningUiPreviewTargetCandidateSchema = Type.Object(
	{
		targetId: requiredTextSchema,
		targetDigest: requiredTextSchema,
		profileId: requiredTextSchema,
		profileDigest: requiredTextSchema,
		workUnitIds: stringArraySchema,
		contributingChangeIds: stringArraySchema,
		required: Type.Boolean(),
		activation: Type.Literal("implementation"),
		autoOpen: Type.Union([
			Type.Literal("once_per_target"),
			Type.Literal("manual"),
		]),
	},
	{ additionalProperties: false },
);

export const planningSprintCandidateSchema = Type.Object(
	{
		id: requiredTextSchema,
		goal: requiredTextSchema,
		participatingChangeIds: stringArraySchema,
		workUnitIds: stringArraySchema,
		rollbackBoundary: requiredTextSchema,
		dependsOn: stringArraySchema,
		integrationRefs: stringArraySchema,
		uiPreviewTargets: Type.Optional(
			Type.Array(planningUiPreviewTargetCandidateSchema),
		),
	},
	{ additionalProperties: false },
);

export const planningWorkUnitCandidateSchema = Type.Object(
	{
		id: requiredTextSchema,
		sprintId: requiredTextSchema,
		owningChangeId: requiredTextSchema,
		contributingChangeIds: stringArraySchema,
		title: requiredTextSchema,
		outcome: requiredTextSchema,
		technicalRequirements: stringArraySchema,
		acceptanceRequirements: stringArraySchema,
		componentRefs: stringArraySchema,
		pathScopes: stringArraySchema,
		verification: stringArraySchema,
		workerProfile: requiredTextSchema,
		dependsOn: stringArraySchema,
	},
	{ additionalProperties: false },
);

export const planningCandidateContentSchema = Type.Object(
	{
		sprints: Type.Array(planningSprintCandidateSchema),
		workUnits: Type.Array(planningWorkUnitCandidateSchema),
		rationale: requiredTextSchema,
	},
	{ additionalProperties: false },
);

export type PlanningSprintCandidate = Static<
	typeof planningSprintCandidateSchema
>;
export type PlanningWorkUnitCandidate = Static<
	typeof planningWorkUnitCandidateSchema
>;
export type PlanningCandidateContent = Static<
	typeof planningCandidateContentSchema
>;

const CANDIDATE_FIELDS = ["sprints", "workUnits", "rationale"] as const;
const RUNTIME_FIELDS = [
	"actor",
	"createdAt",
	"repoRoot",
	"expectedWorkStateDigest",
	"expectedChangeIds",
	"expectedBytesByChangeId",
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
	if (!Array.isArray(candidate.sprints)) {
		throw new Error("Project Server planning candidate sprints must be an array.");
	}
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
