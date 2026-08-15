import type {ChangeIntakeMaterial} from "../../changes/intake/contracts.ts";
import type {DecisionCandidate} from "../../loops/decision/candidate.ts";
import {
	createDecisionSecurityScannerExecutor,
	type DecisionSecurityScanContext,
} from "../../loops/decision/security-scanners.ts";
import type {EvidenceSubject} from "../../evidence/contracts.ts";
import type {CheckCatalog} from "../../checks/catalog.ts";
import type {ResolvedExitPolicy} from "../../checks/contracts.ts";
import type {
	ProjectCheckPackSnapshot,
	ProtectedCustomCheckConfigSnapshot,
} from "../../checks/packs/index.ts";
import {resolveExitPolicy} from "../../checks/resolve-policy.ts";
import type {LoopCheckExecutor} from "../../checks/runner.ts";
import {createAtomicSecurityScannerCheckExecutors} from "../../checks/security-scanner-checks.ts";
import {toCanonicalJsonValue} from "../../utils/canonical-json.ts";
import {
	classifySecuritySurfaces,
	type SecuritySurfaceClassification,
	type SecuritySurfaceSignal,
} from "../../checks/security-surfaces.ts";
export type DecisionProtectedCustomCheckConfig = ProtectedCustomCheckConfigSnapshot;
export type DecisionSecurityFindingIntakeMaterial = ChangeIntakeMaterial;
export type {DecisionSecurityScanContext};

type DecisionSecurityScannerAdapter = Parameters<
	typeof createDecisionSecurityScannerExecutor
>[0]["adapters"][number];

export interface DecisionGateSecurityConfig {
	readonly adapters: readonly DecisionSecurityScannerAdapter[];
	readonly sensitivity: "public" | "project" | "private";
}

interface PrepareDecisionGateSecurityInput {
	readonly catalog: CheckCatalog;
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly subject: EvidenceSubject;
	readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
	readonly projectCheckPackSnapshot?: ProjectCheckPackSnapshot;
	readonly configuration?: DecisionGateSecurityConfig;
	readonly scanContext?: DecisionSecurityScanContext;
}

interface PreparedDecisionGateSecurity {
	readonly policy: ResolvedExitPolicy;
	readonly executors: readonly LoopCheckExecutor[];
	readonly findingIntakeMaterials: readonly ChangeIntakeMaterial[];
}

export function prepareDecisionGateSecurity(
	input: PrepareDecisionGateSecurityInput,
): PreparedDecisionGateSecurity {
	const changeId = input.changeRef.slice("change:".length);
	const classification = securitySurfaceClassificationForCandidate(
		input.candidate,
		changeId,
	);
	const findingIntakeMaterials: ChangeIntakeMaterial[] = [];
	const scannerSubject = input.scanContext
		? (toCanonicalJsonValue({
				...input.subject,
				sourceTreeDigest: input.scanContext.sourceTreeDigest,
			}) as unknown as EvidenceSubject)
		: input.subject;
	return {
		policy: decisionGatePolicy(
			input.candidate,
			changeId,
			classification,
			input.protectedBaseCustomCheckConfig,
			input.projectCheckPackSnapshot,
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
					...createAtomicSecurityScannerCheckExecutors({
						catalog: input.catalog,
						loop: "decision",
						subject: scannerSubject,
					}),
				]
			: [],
		findingIntakeMaterials,
	};
}

function decisionGatePolicy(
	candidate: DecisionCandidate,
	changeId: string,
	securitySurfaceClassification: SecuritySurfaceClassification,
	protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot,
	projectCheckPackSnapshot?: ProjectCheckPackSnapshot,
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
		...(candidate.content.revision.safety.risk === "high" ||
		candidate.content.revision.safety.risk === "critical"
			? {securityResidualRisk: candidate.content.revision.safety.risk}
			: {}),
		projectTraits: [],
		technologies: [],
		paths: [...candidate.content.revision.classification.targetRefs],
		pathFactsComplete: true,
		...(protectedBaseCustomCheckConfig
			? {protectedBaseCustomCheckConfig}
			: {}),
		...(projectCheckPackSnapshot ? {projectCheckPackSnapshot} : {}),
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
