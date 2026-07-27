import type { LoopQualityStandardMethod } from "./graph.ts";
import {
	createQualityPolicyResolution,
	type QualityAssessment,
	type QualityPolicyExclusion,
	type QualityPolicyResolution,
	type QualityReport,
	type QualityStandard,
	type QualityStandardBinding,
	type QualityVerifierKind,
} from "./quality-policy.ts";
import type { LoopQualityStandardResult, TraceLoop } from "../traces/types.ts";

export interface LegacyQualityGraphIdentity {
	id: string;
	version: string;
	hash: string;
}

export interface CreateLegacyQualityCompatibilityInput {
	stage: TraceLoop;
	candidateDigest: string;
	selectorInputDigest: string;
	graph: LegacyQualityGraphIdentity;
	standards: LoopQualityStandardResult[];
}

export interface LegacyQualityCompatibility {
	standards: QualityStandard[];
	resolution: QualityPolicyResolution;
	report: QualityReport;
}

export function createLegacyQualityCompatibility(
	input: CreateLegacyQualityCompatibilityInput,
): LegacyQualityCompatibility {
	const activeResults = input.standards.flatMap((result) =>
		result.status === "not_applicable" || result.status === "escalated"
			? []
			: [result],
	);
	const standards = activeResults.map((result) =>
		legacyQualityStandard(input.graph, result),
	);
	const bindings = activeResults.map((result) =>
		legacyQualityBinding(input.graph, result),
	);
	const exclusions = input.standards.flatMap((result) =>
		legacyQualityExclusion(input.graph, result),
	);
	const gate = {
		id: `${input.stage}.legacy_exit`,
		version: input.graph.version,
		kind: "all_required" as const,
		standardIds: bindings.flatMap((binding) =>
			binding.required ? [binding.standardId] : [],
		),
		onFailure: "repair" as const,
	};
	const resolution = createQualityPolicyResolution({
		stage: input.stage,
		candidateDigest: input.candidateDigest,
		selectorInputDigest: input.selectorInputDigest,
		bindings,
		exclusions,
		gates: [gate],
		protectedStandardIds: bindings.flatMap((binding) =>
			binding.required ? [binding.standardId] : [],
		),
	});
	const assessments = activeResults.map((result) =>
		legacyQualityAssessment(input.candidateDigest, input.graph, result),
	);
	const status = qualityReportStatus(assessments);
	return {
		standards,
		resolution,
		report: {
			schemaVersion: resolution.schemaVersion,
			stage: input.stage,
			candidateDigest: input.candidateDigest,
			policyDigest: resolution.policyDigest,
			status,
			assessments,
			gateResults: [
				{
					gateId: gate.id,
					gateVersion: gate.version,
					status,
					assessmentStandardIds: gate.standardIds,
					...(status === "pass" ? {} : { route: "repair" as const }),
				},
			],
		},
	};
}

function legacyQualityStandard(
	graph: LegacyQualityGraphIdentity,
	result: LoopQualityStandardResult,
): QualityStandard {
	const scoreMeasurement = typeof result.score === "number";
	return {
		id: result.id,
		version: graph.version,
		description: result.description,
		assessmentCriteria: [result.description],
		verifier: {
			id: `${graph.id}.${result.id}.${result.method || result.mode}`,
			version: graph.version,
			kind: verifierKind(result.method),
		},
		measurement: scoreMeasurement
			? { shape: "score", minimum: 0, maximum: 100 }
			: { shape: "boolean" },
		evidenceAdapterIds: [],
		repairTarget: result.repairTarget || result.id,
		cost: result.cost ?? 0,
		timeoutMs: result.timeoutMs ?? 0,
		protected: result.gate === "hard",
	};
}

function legacyQualityBinding(
	graph: LegacyQualityGraphIdentity,
	result: LoopQualityStandardResult,
): QualityStandardBinding {
	return {
		standardId: result.id,
		standardVersion: graph.version,
		enforcement: "enforce",
		required: result.gate !== "score_only",
		parameters: {},
		evaluationDependsOn: [],
		activatedBy: ["compatibility:legacy-quality-graph"],
		ruleRefs: [`quality-graph:${graph.id}@${graph.version}`],
	};
}

function legacyQualityExclusion(
	graph: LegacyQualityGraphIdentity,
	result: LoopQualityStandardResult,
): QualityPolicyExclusion[] {
	if (result.status !== "not_applicable" && result.status !== "escalated") {
		return [];
	}
	return [
		{
			standardId: result.id,
			standardVersion: graph.version,
			reason:
				result.status === "escalated"
					? "escalated_elsewhere"
					: "not_applicable",
			refs: result.refs || [],
		},
	];
}

function legacyQualityAssessment(
	candidateDigest: string,
	graph: LegacyQualityGraphIdentity,
	result: LoopQualityStandardResult,
): QualityAssessment {
	return {
		standardId: result.id,
		standardVersion: graph.version,
		candidateDigest,
		status: legacyAssessmentStatus(result),
		...(typeof result.score === "number"
			? { measurement: { shape: "score" as const, value: result.score } }
			: {
					measurement: {
						shape: "boolean" as const,
						value: result.status === "met",
					},
				}),
		evidenceRefs: result.evidenceRefs || result.refs || [],
		findings: result.message ? [result.message] : [],
		verifier: {
			id: `${graph.id}.${result.id}.${result.method || result.mode}`,
			version: graph.version,
		},
	};
}

function legacyAssessmentStatus(
	result: LoopQualityStandardResult,
): QualityAssessment["status"] {
	if (result.status === "met") return "met";
	if (result.status === "unmet" || result.status === "blocked") return "unmet";
	return "indeterminate";
}

function qualityReportStatus(
	assessments: QualityAssessment[],
): QualityReport["status"] {
	if (assessments.some((assessment) => assessment.status === "unmet")) {
		return "fail";
	}
	if (assessments.some((assessment) => assessment.status === "indeterminate")) {
		return "indeterminate";
	}
	return "pass";
}

function verifierKind(
	method: LoopQualityStandardMethod | string | undefined,
): QualityVerifierKind {
	if (method === "model_judge" || method === "agent_self_assessment") {
		return "model";
	}
	if (method === "external_evidence") return "external";
	if (method === "human_authority") return "human";
	return "deterministic";
}
