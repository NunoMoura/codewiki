import type {EvidenceRecord} from "../../evidence/contracts.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../loop-exit/cache.ts";
import {createCheckCatalog} from "../../loop-exit/catalog.ts";
import type {ExitReport, ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
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
import {
	prepareDecisionSecurityRuntime,
	type DecisionProtectedCustomCheckConfig,
	type DecisionSecurityFindingIntakeMaterial,
	type DecisionSecurityRuntimeConfig,
	type DecisionSecurityScanContext,
} from "./runtime-security.ts";

interface CreateDecisionExitRuntimeInput {
	readonly additionalExecutors?: readonly LoopCheckExecutor[];
	readonly protectedBaseCustomCheckConfig?: DecisionProtectedCustomCheckConfig;
	readonly cache?: LoopExitResultCache;
	readonly limits?: LoopExitRunnerLimits;
	readonly modelChecks?: {
		readonly route: WikiModelRouteConfig;
		readonly transport: DecisionModelCheckTransport;
	};
	readonly securityScanners?: DecisionSecurityRuntimeConfig;
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
	readonly securityScan?: DecisionSecurityScanContext;
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
	readonly securityFindingIntakeMaterials: readonly DecisionSecurityFindingIntakeMaterial[];
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
			const subject = decisionEvidenceSubject(
				runInput.candidate,
				runInput.changeRef,
			);
			const security = prepareDecisionSecurityRuntime({
				catalog,
				candidate: runInput.candidate,
				changeRef: runInput.changeRef,
				subject,
				protectedBaseCustomCheckConfig: input.protectedBaseCustomCheckConfig,
				configuration: input.securityScanners,
				scanContext: runInput.securityScan,
			});
			const policy = security.policy;
			const runner = createLoopExitRunner({
				catalog,
				cache,
				limits: input.limits,
				executors: [
					...createDecisionCodeExecutors(catalog),
					...security.executors,
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
				securityFindingIntakeMaterials: Object.freeze([
					...security.findingIntakeMaterials,
				]),
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
