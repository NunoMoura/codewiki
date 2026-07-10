import type {
	DecisionKind,
	DecisionPlanningDepth,
	DecisionRouteTarget,
	DecisionRisk,
	DecisionWorkScale,
} from "./types.ts";

export const DECISION_TYPE_IDS = [
	"debug",
	"fix",
	"harden",
	"improve",
	"migrate",
	"docs",
	"release",
	"direct_implementation",
] as const;

export type DecisionTypeId = (typeof DECISION_TYPE_IDS)[number] | string;
export type EvidencePolicyClass =
	| "acceptance_links"
	| "content_proof"
	| "regression"
	| "negative_tests"
	| "migration_equivalence"
	| "release_approval"
	| "review_evidence";
export type QualityProfileNodeState =
	| "active"
	| "required"
	| "optional"
	| "not_applicable"
	| "escalated";
export type QualityProfileInactiveReason =
	| "not_applicable"
	| "covered_by_invariant"
	| "escalated_elsewhere";
export type DecisionEscalationTarget =
	| "planning"
	| "decision"
	| "user_approval"
	| "stronger_evidence";
export type ForbiddenSkip =
	| "traceability"
	| "user_approval"
	| "acceptance_evidence"
	| "content_proof"
	| "required_review_evidence"
	| "protected_hard_gates";

export interface DecisionPipelineProfile {
	id: string;
	defaultRouteTarget: DecisionRouteTarget;
	allowedRouteTargets: DecisionRouteTarget[];
	defaultPlanningDepth: DecisionPlanningDepth;
	allowedPlanningDepth: DecisionPlanningDepth[];
	directImplementationAllowed: boolean;
	allowedDirectImplementationScales: DecisionWorkScale[];
	maxDirectImplementationRisk: "low" | "medium" | "high";
}

export interface DecisionLoopQualityProfile {
	id: string;
	description: string;
	activationMask: Record<
		string,
		{
			state: QualityProfileNodeState;
			reason?: QualityProfileInactiveReason;
		}
	>;
}

export interface DecisionEvidencePolicy {
	id: string;
	requiredClasses: EvidencePolicyClass[];
	requiredReviewPacks: string[];
	acceptanceLinksRequired: boolean;
	allowFastCacheForAcceptance: boolean;
}

export interface DecisionEscalationRule {
	id: string;
	when: string;
	target: DecisionEscalationTarget;
	rationale: string;
}

export interface DecisionTypeDefinition {
	id: DecisionTypeId;
	description: string;
	decisionKind: DecisionKind | "direct_implementation";
	routing: DecisionPipelineProfile;
	pipelineProfile: DecisionPipelineProfile;
	loopQualityProfile: DecisionLoopQualityProfile;
	evidencePolicy: DecisionEvidencePolicy;
	escalationRules: DecisionEscalationRule[];
	forbiddenSkips: ForbiddenSkip[];
}

export interface DecisionTypeRegistryValidationIssue {
	code: "duplicate_decision_type" | "missing_profile";
	id: string;
	message: string;
}

const protectedSkips: ForbiddenSkip[] = [
	"traceability",
	"user_approval",
	"acceptance_evidence",
	"content_proof",
	"required_review_evidence",
	"protected_hard_gates",
];

const normalQualityProfile: DecisionLoopQualityProfile = {
	id: "quality.normal",
	description:
		"Use the full production quality network unless a later profile explicitly marks a node inactive with a reason.",
	activationMask: {},
};

function pipelineProfile(input: {
	id: string;
	defaultRouteTarget?: DecisionRouteTarget;
	allowedRouteTargets?: DecisionRouteTarget[];
	defaultPlanningDepth?: DecisionPlanningDepth;
	allowedPlanningDepth?: DecisionPlanningDepth[];
	directImplementationAllowed?: boolean;
	allowedDirectImplementationScales?: DecisionWorkScale[];
	maxDirectImplementationRisk?: "low" | "medium" | "high";
}): DecisionPipelineProfile {
	return {
		id: input.id,
		defaultRouteTarget: input.defaultRouteTarget || "planning",
		allowedRouteTargets: input.allowedRouteTargets || ["planning"],
		defaultPlanningDepth: input.defaultPlanningDepth || "standard",
		allowedPlanningDepth: input.allowedPlanningDepth || ["standard", "micro"],
		directImplementationAllowed: input.directImplementationAllowed || false,
		allowedDirectImplementationScales:
			input.allowedDirectImplementationScales || ["tiny", "small"],
		maxDirectImplementationRisk: input.maxDirectImplementationRisk || "low",
	};
}

function evidencePolicy(input: {
	id: string;
	requiredClasses?: EvidencePolicyClass[];
	requiredReviewPacks?: string[];
	acceptanceLinksRequired?: boolean;
	allowFastCacheForAcceptance?: boolean;
}): DecisionEvidencePolicy {
	return {
		id: input.id,
		requiredClasses: input.requiredClasses || [
			"acceptance_links",
			"content_proof",
		],
		requiredReviewPacks: input.requiredReviewPacks || [],
		acceptanceLinksRequired: input.acceptanceLinksRequired ?? true,
		allowFastCacheForAcceptance: input.allowFastCacheForAcceptance ?? false,
	};
}

function definition(input: {
	id: DecisionTypeId;
	description: string;
	decisionKind: DecisionTypeDefinition["decisionKind"];
	routing: DecisionPipelineProfile;
	evidencePolicy: DecisionEvidencePolicy;
	escalationRules?: DecisionEscalationRule[];
	forbiddenSkips?: ForbiddenSkip[];
	loopQualityProfile?: DecisionLoopQualityProfile;
}): DecisionTypeDefinition {
	return {
		id: input.id,
		description: input.description,
		decisionKind: input.decisionKind,
		routing: input.routing,
		pipelineProfile: input.routing,
		loopQualityProfile: input.loopQualityProfile || normalQualityProfile,
		evidencePolicy: input.evidencePolicy,
		escalationRules: input.escalationRules || [],
		forbiddenSkips: input.forbiddenSkips || protectedSkips,
	};
}

export const BUILT_IN_DECISION_TYPE_DEFINITIONS: DecisionTypeDefinition[] = [
	definition({
		id: "debug",
		description:
			"Investigate a scoped failure or uncertainty with probes and a stop condition.",
		decisionKind: "debug",
		routing: pipelineProfile({
			id: "pipeline.debug",
			allowedRouteTargets: ["planning", "implementation"],
			directImplementationAllowed: true,
		}),
		evidencePolicy: evidencePolicy({
			id: "evidence.debug",
			requiredClasses: ["acceptance_links", "content_proof", "review_evidence"],
		}),
	}),
	definition({
		id: "fix",
		description: "Repair a reproducible defect with regression coverage.",
		decisionKind: "fix",
		routing: pipelineProfile({
			id: "pipeline.fix",
			allowedRouteTargets: ["planning", "implementation"],
			directImplementationAllowed: true,
		}),
		evidencePolicy: evidencePolicy({
			id: "evidence.fix",
			requiredClasses: [
				"acceptance_links",
				"content_proof",
				"regression",
				"review_evidence",
			],
		}),
	}),
	definition({
		id: "harden",
		description:
			"Strengthen safety boundaries, failure modes, and negative coverage.",
		decisionKind: "harden",
		routing: pipelineProfile({ id: "pipeline.harden" }),
		evidencePolicy: evidencePolicy({
			id: "evidence.harden",
			requiredClasses: [
				"acceptance_links",
				"content_proof",
				"negative_tests",
				"review_evidence",
			],
		}),
		escalationRules: [
			{
				id: "harden-risk-escalates",
				when: "security, privacy, compatibility, or destructive behavior is affected",
				target: "stronger_evidence",
				rationale:
					"Hardening must prove the boundary and negative cases, not merely change code.",
			},
		],
	}),
	definition({
		id: "improve",
		description:
			"Improve product or system behavior with clear user value and non-goals.",
		decisionKind: "improve",
		routing: pipelineProfile({
			id: "pipeline.improve",
			allowedRouteTargets: ["planning", "implementation"],
			directImplementationAllowed: true,
		}),
		evidencePolicy: evidencePolicy({ id: "evidence.improve" }),
	}),
	definition({
		id: "migrate",
		description:
			"Move behavior or data while preserving invariants and rollback safety.",
		decisionKind: "migrate",
		routing: pipelineProfile({ id: "pipeline.migrate" }),
		evidencePolicy: evidencePolicy({
			id: "evidence.migrate",
			requiredClasses: [
				"acceptance_links",
				"content_proof",
				"migration_equivalence",
				"review_evidence",
			],
		}),
	}),
	definition({
		id: "docs",
		description:
			"Change documentation or knowledge without broad behavior changes.",
		decisionKind: "docs",
		routing: pipelineProfile({
			id: "pipeline.docs",
			allowedRouteTargets: ["planning", "implementation"],
			directImplementationAllowed: true,
		}),
		evidencePolicy: evidencePolicy({
			id: "evidence.docs",
			requiredClasses: ["acceptance_links", "content_proof"],
		}),
	}),
	definition({
		id: "release",
		description:
			"Publish or externally expose a package, artifact, or irreversible change.",
		decisionKind: "release",
		routing: pipelineProfile({
			id: "pipeline.release",
			maxDirectImplementationRisk: "high",
		}),
		evidencePolicy: evidencePolicy({
			id: "evidence.release",
			requiredClasses: [
				"acceptance_links",
				"content_proof",
				"release_approval",
				"review_evidence",
			],
		}),
		escalationRules: [
			{
				id: "release-user-approval",
				when: "publication, destructive, or externally visible action is requested",
				target: "user_approval",
				rationale: "Release safety cannot be delegated to automation.",
			},
		],
	}),
	definition({
		id: "direct_implementation",
		description:
			"A low-risk scoped change that may skip Planning only when explicit validation and path scope are present.",
		decisionKind: "direct_implementation",
		routing: pipelineProfile({
			id: "pipeline.direct_implementation",
			defaultRouteTarget: "implementation",
			allowedRouteTargets: ["implementation"],
			defaultPlanningDepth: "micro",
			allowedPlanningDepth: ["micro"],
			directImplementationAllowed: true,
			allowedDirectImplementationScales: ["tiny", "small"],
			maxDirectImplementationRisk: "low",
		}),
		evidencePolicy: evidencePolicy({
			id: "evidence.direct_implementation",
			requiredClasses: ["acceptance_links", "content_proof", "review_evidence"],
		}),
	}),
];

export function builtInDecisionTypeDefinitions(): DecisionTypeDefinition[] {
	return BUILT_IN_DECISION_TYPE_DEFINITIONS.map((definition) => ({
		...definition,
		routing: { ...definition.routing },
		pipelineProfile: { ...definition.pipelineProfile },
		loopQualityProfile: {
			...definition.loopQualityProfile,
			activationMask: { ...definition.loopQualityProfile.activationMask },
		},
		evidencePolicy: {
			...definition.evidencePolicy,
			requiredClasses: [...definition.evidencePolicy.requiredClasses],
			requiredReviewPacks: [...definition.evidencePolicy.requiredReviewPacks],
		},
		escalationRules: definition.escalationRules.map((rule) => ({ ...rule })),
		forbiddenSkips: [...definition.forbiddenSkips],
	}));
}

export function decisionTypeDefinitionById(
	id: string,
	definitions: DecisionTypeDefinition[] = BUILT_IN_DECISION_TYPE_DEFINITIONS,
): DecisionTypeDefinition | undefined {
	const normalized = normalizeDecisionTypeId(id);
	return definitions.find((definition) => definition.id === normalized);
}

export function validateDecisionTypeDefinitions(
	definitions: DecisionTypeDefinition[] = BUILT_IN_DECISION_TYPE_DEFINITIONS,
): DecisionTypeRegistryValidationIssue[] {
	const issues: DecisionTypeRegistryValidationIssue[] = [];
	const seen = new Set<string>();
	for (const definition of definitions) {
		const id = normalizeDecisionTypeId(definition.id);
		if (seen.has(id)) {
			issues.push({
				code: "duplicate_decision_type",
				id,
				message: `Decision type ${id} is registered more than once.`,
			});
		}
		seen.add(id);
		if (!definition.pipelineProfile?.id || !definition.evidencePolicy?.id) {
			issues.push({
				code: "missing_profile",
				id,
				message: `Decision type ${id} must define pipeline and evidence profiles.`,
			});
		}
	}
	return issues;
}

export function normalizeDecisionTypeId(value: unknown): string {
	return String(value || "")
		.trim()
		.replace(/-/g, "_");
}

export function riskExceeds(
	risk: DecisionRisk | undefined,
	maxRisk: "low" | "medium" | "high",
): boolean {
	const order = new Map([
		["low", 0],
		["medium", 1],
		["high", 2],
	]);
	const riskValue = order.get(String(risk || "").trim());
	const maxValue = order.get(maxRisk) ?? 0;
	return riskValue === undefined ? true : riskValue > maxValue;
}
