import type {ChangeIntakeMaterial} from "../../changes/intake/contracts.ts";
import type {EvidenceSubject} from "../../evidence/contracts.ts";
import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../../loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../loop-exit/resolve-policy.ts";
import type {LoopCheckExecutor} from "../../loop-exit/runner.ts";
import type {SecurityScannerAdapter} from "../../loop-exit/security-scanners.ts";
import {
	classifySecuritySurfaces,
	type SecuritySurfaceClassification,
	type SecuritySurfaceSignal,
} from "../../loop-exit/security-surfaces.ts";
import type {DecisionCandidate} from "./candidate.ts";
import {
	createDecisionSecurityScannerExecutor,
	type DecisionSecurityScanContext,
} from "./security-scanners.ts";

export type DecisionProtectedCustomCheckConfig = ProtectedCustomCheckConfigSnapshot;
export type DecisionSecurityFindingIntakeMaterial = ChangeIntakeMaterial;
export type {DecisionSecurityScanContext};

export interface DecisionSecurityRuntimeConfig {
	readonly adapters: readonly SecurityScannerAdapter[];
	readonly sensitivity: "public" | "project" | "private";
}

interface PrepareDecisionSecurityRuntimeInput {
	readonly catalog: CheckCatalog;
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly subject: EvidenceSubject;
	readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
	readonly configuration?: DecisionSecurityRuntimeConfig;
	readonly scanContext?: DecisionSecurityScanContext;
}

interface PreparedDecisionSecurityRuntime {
	readonly policy: ResolvedExitPolicy;
	readonly executors: readonly LoopCheckExecutor[];
	readonly findingIntakeMaterials: readonly ChangeIntakeMaterial[];
}

export function prepareDecisionSecurityRuntime(
	input: PrepareDecisionSecurityRuntimeInput,
): PreparedDecisionSecurityRuntime {
	const changeId = input.changeRef.slice("change:".length);
	const classification = securitySurfaceClassificationForCandidate(
		input.candidate,
		changeId,
	);
	const findingIntakeMaterials: ChangeIntakeMaterial[] = [];
	return {
		policy: decisionExitPolicy(
			input.candidate,
			changeId,
			classification,
			input.protectedBaseCustomCheckConfig,
		),
		executors: input.configuration
			? [
					createDecisionSecurityScannerExecutor({
						catalog: input.catalog,
						subject: input.subject,
						classification,
						adapters: input.configuration.adapters,
						sensitivity: input.configuration.sensitivity,
						scanContext: input.scanContext,
						recordIntakeMaterials(materials) {
							findingIntakeMaterials.push(...materials);
						},
					}),
				]
			: [],
		findingIntakeMaterials,
	};
}

function decisionExitPolicy(
	candidate: DecisionCandidate,
	changeId: string,
	securitySurfaceClassification: SecuritySurfaceClassification,
	protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot,
): ResolvedExitPolicy {
	return resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId,
				revision: candidate.content.revision.ordinal,
				digest: candidate.content.revision.revisionId,
				kind: selectorKind(candidate.content.revision.classification.kind),
				type: selectorType(candidate.content.revision.classification.type),
				risk: selectorRisk(candidate.content.revision.safety.risk),
				affectedLayers: [
					...candidate.content.revision.classification.affectedLayers,
				],
			},
		],
		securitySurfaceClassification,
		projectTraits: [],
		technologies: [],
		paths: [...candidate.content.revision.classification.targetRefs],
		...(protectedBaseCustomCheckConfig
			? {protectedBaseCustomCheckConfig}
			: {}),
	});
}

function securitySurfaceClassificationForCandidate(
	candidate: DecisionCandidate,
	changeId: string,
): SecuritySurfaceClassification {
	const revision = candidate.content.revision;
	return classifySecuritySurfaces({
		changeId,
		revision: revision.ordinal,
		revisionDigest: revision.revisionId,
		kind: selectorKind(revision.classification.kind),
		type: selectorType(revision.classification.type),
		scope: selectorScope(revision.classification.scope),
		risk: selectorRisk(revision.safety.risk),
		affectedLayers: revision.classification.affectedLayers,
		targetRefs: revision.classification.targetRefs,
		knowledgeRefs: [
			...revision.knowledge.topicRefs,
			...revision.knowledge.propagationRefs,
		],
		sourceRefs: [
			...revision.evidence.sourceRefs,
			...revision.evidence.proofRefs,
		],
		signals: decisionSecuritySignals(candidate),
	});
}

function decisionSecuritySignals(
	candidate: DecisionCandidate,
): SecuritySurfaceSignal[] {
	const revision = candidate.content.revision;
	return [
		...securityFields("intent", [
			revision.title,
			revision.intent.currentState,
			revision.intent.desiredState,
			revision.intent.rationale,
			...revision.intent.nonGoals,
			...revision.intent.alternatives,
		]),
		...securityFields("impact", [
			revision.impact.user,
			revision.impact.maintainer,
			revision.impact.compatibility,
		]),
		...securityFields("outcome", [
			...revision.outcome.successSignals,
			...revision.outcome.evidenceExpectations,
		]),
		...securityFields("delivery", [
			...revision.delivery.constraints,
			...revision.delivery.planningQuestions,
		]),
		...securityFields("evidence", [
			revision.evidence.reproduction,
			revision.evidence.expectedBehavior,
			revision.evidence.sourceBehavior,
			revision.evidence.targetBehavior,
		]),
		...securityFields("safety", [
			...revision.safety.invariants,
			revision.safety.safetyBoundary,
			...revision.safety.failureModes,
			revision.safety.rollbackPlan,
			revision.safety.negativeTestPlan,
			revision.safety.regressionPlan,
		]),
	];
}

function selectorKind(
	kind: DecisionCandidate["content"]["revision"]["classification"]["kind"],
): "fix" | "improve" | "harden" | "migrate" | "introduce" | "remove" {
	return kind === "unknown" ? "harden" : kind;
}

function selectorType(
	type: DecisionCandidate["content"]["revision"]["classification"]["type"],
):
	| "behavior_change"
	| "architecture_change"
	| "workflow_change"
	| "incident_resolution"
	| "security_change"
	| "documentation_change"
	| "dependency_change"
	| "release_change" {
	return type === "unknown" ? "security_change" : type;
}

function selectorScope(
	scope: DecisionCandidate["content"]["revision"]["classification"]["scope"],
): "product" | "system" | "source" | "documentation" | "configuration" | "runtime" {
	return scope === "unknown" ? "system" : scope;
}

function selectorRisk(
	risk: DecisionCandidate["content"]["revision"]["safety"]["risk"],
): "low" | "medium" | "high" {
	if (risk === "low") return "low";
	if (risk === "moderate") return "medium";
	return "high";
}

function securityFields(
	prefix: string,
	values: readonly (string | undefined)[],
): SecuritySurfaceSignal[] {
	return values.flatMap((value, index) =>
		value?.trim()
			? [{ref: `revision.${prefix}.${index}`, value: value.trim()}]
			: [],
	);
}
