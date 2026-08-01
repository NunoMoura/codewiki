import type {EvidenceRecord} from "../../evidence/contracts.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../loop-exit/cache.ts";
import {createCheckCatalog} from "../../loop-exit/catalog.ts";
import type {ExitReport, ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../../loop-exit/custom-checks/index.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import type {
	DecisionResearchClaimsModelObservation,
	DecisionResearchClaimsRequest,
} from "../../runtime/decision-research-claims.ts";
import {createNativeDecisionResearchExecutors} from "../../runtime/native-decision-research.ts";
import {resolveExitPolicy} from "../../loop-exit/resolve-policy.ts";
import {
	classifySecuritySurfaces,
	type SecuritySurfaceClassification,
	type SecuritySurfaceSignal,
} from "../../loop-exit/security-surfaces.ts";
import {
	createLoopExitRunner,
	type LoopCheckExecutor,
	type LoopExitRunnerLimits,
} from "../../loop-exit/runner.ts";
import type {DecisionCandidate} from "./candidate.ts";
import {createDecisionCodeExecutors} from "./code-executors.ts";
import {
	decisionEvidenceSubject,
	resolveDecisionEvidenceObligations,
} from "./evidence.ts";
import {
	createDecisionModelCheckExecutors,
	type DecisionModelCheckTransport,
} from "./model-checks.ts";

interface CreateDecisionExitRuntimeInput {
	readonly additionalExecutors?: readonly LoopCheckExecutor[];
	readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
	readonly cache?: LoopExitResultCache;
	readonly limits?: LoopExitRunnerLimits;
	readonly modelChecks?: {
		readonly route: WikiModelRouteConfig;
		readonly transport: DecisionModelCheckTransport;
	};
	readonly researchChecks?: {
		readonly route: WikiModelRouteConfig;
		readonly sensitivity: "public" | "project" | "private";
		readonly transport: {
			readonly execute: (
				request: DecisionResearchClaimsRequest,
				options: {readonly signal: AbortSignal},
			) => Promise<DecisionResearchClaimsModelObservation>;
		};
	};
}

interface RunDecisionExitInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly researchFreshnessBoundary?: string;
	readonly signal?: AbortSignal;
}

export interface DecisionRuntimeRoute {
	readonly schemaVersion: "1.0.0";
	readonly candidateDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly requestedDisposition: DecisionCandidate["content"]["disposition"];
	readonly route: "planning" | "repair" | "waiting" | "complete" | "withdrawn";
	readonly reasonCode: string;
	readonly routeDigest: Sha256Digest;
}

interface DecisionExitRun {
	readonly policy: ResolvedExitPolicy;
	readonly result: Awaited<
		ReturnType<ReturnType<typeof createLoopExitRunner>["run"]>
	>;
	readonly route: DecisionRuntimeRoute;
}

export function createDecisionExitRuntime(
	input: CreateDecisionExitRuntimeInput = {},
): {
	readonly run: (runInput: RunDecisionExitInput) => Promise<DecisionExitRun>;
	readonly cache: LoopExitResultCache;
} {
	if ("customChecks" in input) {
		throw new Error(
			"Decision Exit Runtime received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
		);
	}
	const catalog = createCheckCatalog(
		input.protectedBaseCustomCheckConfig?.customChecks,
	);
	const cache = input.cache ?? createLoopExitResultCache();
	return Object.freeze({
		cache,
		async run(runInput: RunDecisionExitInput): Promise<DecisionExitRun> {
			assertRunInput(runInput);
			const policy = decisionExitPolicy(
				runInput.candidate,
				runInput.changeRef,
				input.protectedBaseCustomCheckConfig,
			);
			const subject = decisionEvidenceSubject(
				runInput.candidate,
				runInput.changeRef,
			);
			const runner = createLoopExitRunner({
				catalog,
				cache,
				limits: input.limits,
				executors: [
					...createDecisionCodeExecutors(catalog),
					...(input.modelChecks
						? createDecisionModelCheckExecutors({
								catalog,
								route: input.modelChecks.route,
								subject,
								transport: input.modelChecks.transport,
							})
						: []),
					...(input.researchChecks && runInput.researchFreshnessBoundary
						? createNativeDecisionResearchExecutors({
								catalog,
								route: input.researchChecks.route,
								candidateSubject: subject,
								expectedFreshnessBoundary:
									runInput.researchFreshnessBoundary,
								sensitivity: input.researchChecks.sensitivity,
								transport: input.researchChecks.transport,
							})
						: []),
					...(input.additionalExecutors ?? []),
				],
			});
			const evidenceRecords = runInput.evidenceRecords ?? [];
			const evidenceResolutionsByCheck = resolveDecisionEvidenceObligations({
				catalog,
				policy,
				subject,
				evidenceRecords,
				...(runInput.researchFreshnessBoundary
					? {
							researchFreshnessBoundary:
								runInput.researchFreshnessBoundary,
						}
					: {}),
			});
			const result = await runner.run({
				candidate: runInput.candidate,
				policy,
				evidenceResolutionsByCheck,
				evidenceRecords,
				...(runInput.signal ? {signal: runInput.signal} : {}),
			});
			return Object.freeze({
				policy,
				result,
				route: deriveDecisionRuntimeRoute(
					runInput.candidate,
					result.report,
				),
			});
		},
	});
}

export function deriveDecisionRuntimeRoute(
	candidate: DecisionCandidate,
	report: ExitReport,
): DecisionRuntimeRoute {
	if (
		report.loop !== "decision" ||
		report.candidateDigest !== candidate.digest
	) {
		throw new Error("Decision Runtime Route requires the exact Candidate Exit Report.");
	}
	let route: DecisionRuntimeRoute["route"];
	let reasonCode: string;
	if (report.status === "fail") {
		route = "repair";
		reasonCode = "decision-checks-failed";
	} else if (report.status === "indeterminate") {
		route = "waiting";
		reasonCode = "decision-assurance-indeterminate";
	} else {
		({route, reasonCode} = passedDecisionRoute(candidate.content.disposition));
	}
	const body = {
		schemaVersion: "1.0.0" as const,
		candidateDigest: candidate.digest,
		exitReportDigest: report.reportDigest,
		requestedDisposition: candidate.content.disposition,
		route,
		reasonCode,
	};
	return toCanonicalJsonValue({
		...body,
		routeDigest: canonicalJsonDigest(body),
	}) as unknown as DecisionRuntimeRoute;
}

function passedDecisionRoute(
	disposition: DecisionCandidate["content"]["disposition"],
): Pick<DecisionRuntimeRoute, "route" | "reasonCode"> {
	switch (disposition) {
		case "approve":
			return {route: "planning", reasonCode: "decision-approved"};
		case "defer":
			return {route: "waiting", reasonCode: "decision-deferred"};
		case "withdraw":
			return {route: "withdrawn", reasonCode: "decision-withdrawn"};
		case "reject":
			return {route: "complete", reasonCode: "decision-rejected"};
		default:
			throw new Error(`Decision disposition ${String(disposition)} is unsupported.`);
	}
}

function decisionExitPolicy(
	candidate: DecisionCandidate,
	changeRef: string,
	protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot,
): ResolvedExitPolicy {
	const changeId = changeRef.slice("change:".length);
	return resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId,
				revision: candidate.content.revision.revision,
				digest: candidate.content.validation.revisionDigest,
				kind: candidate.content.revision.classification.kind,
				type: candidate.content.revision.classification.type,
				risk: candidate.content.revision.safety.risk,
				affectedLayers: [
					...candidate.content.revision.classification.affectedLayers,
				],
			},
		],
		securitySurfaceClassification: securitySurfaceClassificationForCandidate(
			candidate,
			changeId,
		),
		projectTraits: [],
		technologies: [],
		paths: [...candidate.content.revision.classification.targetRefs],
		...(protectedBaseCustomCheckConfig
			? {protectedBaseCustomCheckConfig}
			: {}),
	});
}

function assertRunInput(input: RunDecisionExitInput): void {
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision exit runtime requires a Decision Candidate.");
	}
	if (!/^change:[A-Za-z0-9._-]+$/.test(input.changeRef)) {
		throw new Error("Decision exit runtime changeRef is invalid.");
	}
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision exit runtime changeRef is not bound by Candidate.");
	}
}

function securitySurfaceClassificationForCandidate(
	candidate: DecisionCandidate,
	changeId: string,
): SecuritySurfaceClassification {
	const revision = candidate.content.revision;
	return classifySecuritySurfaces({
		changeId,
		revision: revision.revision,
		revisionDigest: candidate.content.validation.revisionDigest,
		kind: revision.classification.kind,
		type: revision.classification.type,
		scope: revision.classification.scope,
		risk: revision.safety.risk,
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
			revision.intent.question,
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
