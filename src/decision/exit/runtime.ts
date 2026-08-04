import type {EvidenceRecord} from "../../evidence/contracts.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../loop-exit/cache.ts";
import {createCheckCatalog} from "../../loop-exit/catalog.ts";
import {
	createCustomCodeCheckExecutors,
	type CustomCodeCapabilitySnapshot,
} from "../../loop-exit/custom-checks/index.ts";
import type {ExitReport, ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	collectDecisionResearchEvidence,
	type DecisionResearchCollector,
} from "../../runtime/decision-research-collection.ts";
import {
	createNativeDecisionResearchExecutors,
	type DecisionResearchClaimsTransport,
} from "../../runtime/native-decision-research.ts";
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

export interface DecisionResearchRuntimeConfig {
	readonly route: WikiModelRouteConfig;
	readonly sensitivity: "public" | "project" | "private";
	readonly collector: DecisionResearchCollector;
	readonly transport: DecisionResearchClaimsTransport;
	readonly now?: () => string;
}

interface CreateDecisionExitRuntimeInput {
	readonly additionalExecutors?: readonly LoopCheckExecutor[];
	readonly customCodeCapabilitySnapshot?: CustomCodeCapabilitySnapshot;
	readonly protectedBaseCustomCheckConfig?: DecisionProtectedCustomCheckConfig;
	readonly cache?: LoopExitResultCache;
	readonly limits?: LoopExitRunnerLimits;
	readonly modelChecks?: {
		readonly route: WikiModelRouteConfig;
		readonly transport: DecisionModelCheckTransport;
		readonly independentSecurity?: {
			readonly route: WikiModelRouteConfig;
			readonly transport: DecisionModelCheckTransport;
		};
	};
	readonly securityScanners?: DecisionSecurityRuntimeConfig;
	readonly researchChecks?: DecisionResearchRuntimeConfig;
}

interface RunDecisionExitInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceRecords?: readonly EvidenceRecord[];
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
	readonly collectedEvidenceRecords: readonly EvidenceRecord<"research_citation">[];
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
	assertIndependentSecurityRoute(input.modelChecks);
	const protectedConfig = input.protectedBaseCustomCheckConfig;
	const catalog = createCheckCatalog(
		protectedConfig
			? {
					userStandards: protectedConfig.userStandards,
					customChecks: protectedConfig.customChecks,
				}
			: undefined,
	);
	const cache = input.cache ?? createLoopExitResultCache();
	return Object.freeze({
		cache,
		async run(runInput: RunDecisionExitInput): Promise<DecisionExitRun> {
			assertRunInput(runInput);
			const subject = decisionEvidenceSubject({
				candidate: runInput.candidate,
				changeRef: runInput.changeRef,
			});
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
			const suppliedEvidenceRecords = runInput.evidenceRecords ?? [];
			const research = await admittedDecisionResearch({
				candidate: runInput.candidate,
				subject,
				policy,
				suppliedEvidenceRecords,
				configuration: input.researchChecks,
				signal: runInput.signal ?? new AbortController().signal,
			});
			const runner = createLoopExitRunner({
				catalog,
				cache,
				limits: input.limits,
				executors: [
					...createDecisionCodeExecutors(catalog),
					...createCustomCodeCheckExecutors({
						catalog,
						...(input.customCodeCapabilitySnapshot
							? {capabilitySnapshot: input.customCodeCapabilitySnapshot}
							: {}),
					}),
					...security.executors,
					...(input.modelChecks
						? createDecisionModelCheckExecutors({
								catalog,
								route: input.modelChecks.route,
								subject,
								transport: input.modelChecks.transport,
								excludeCheckIds: [
									"security_independent_challenge_reviewed",
								],
							})
						: []),
					...(input.modelChecks?.independentSecurity
						? createDecisionModelCheckExecutors({
								catalog,
								route: input.modelChecks.independentSecurity.route,
								subject,
								transport:
									input.modelChecks.independentSecurity.transport,
								includeCheckIds: [
									"security_independent_challenge_reviewed",
								],
							})
						: []),
					...(input.researchChecks && research.freshnessBoundary
						? createNativeDecisionResearchExecutors({
								catalog,
								route: input.researchChecks.route,
								candidateSubject: subject,
								expectedFreshnessBoundary: research.freshnessBoundary,
								sensitivity: input.researchChecks.sensitivity,
								transport: input.researchChecks.transport,
							})
						: []),
					...(input.additionalExecutors ?? []),
				],
			});
			const evidenceRecords = [
				...suppliedEvidenceRecords,
				...research.collectedEvidenceRecords,
			];
			const evidenceResolutionsByCheck = resolveDecisionEvidenceObligations({
				catalog,
				policy,
				subject,
				evidenceRecords,
				...(research.freshnessBoundary
					? {researchFreshnessBoundary: research.freshnessBoundary}
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
				collectedEvidenceRecords: research.collectedEvidenceRecords,
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

async function admittedDecisionResearch(input: {
	readonly candidate: DecisionCandidate;
	readonly subject: ReturnType<typeof decisionEvidenceSubject>;
	readonly policy: ResolvedExitPolicy;
	readonly suppliedEvidenceRecords: readonly EvidenceRecord[];
	readonly configuration: DecisionResearchRuntimeConfig | undefined;
	readonly signal: AbortSignal;
}): Promise<{
	readonly freshnessBoundary?: string;
	readonly collectedEvidenceRecords: readonly EvidenceRecord<"research_citation">[];
}> {
	const active = input.policy.bindings.some(
		(binding) =>
			binding.checkId === "research_provenance_valid" ||
			binding.checkId === "research_claims_supported",
	);
	if (!active) return {collectedEvidenceRecords: Object.freeze([])};
	const suppliedCitations = input.suppliedEvidenceRecords.filter(
		(record): record is EvidenceRecord<"research_citation"> =>
			record.kind === "research_citation",
	);
	if (suppliedCitations.length > 0) {
		const boundaries = new Set(
			suppliedCitations.map((record) => record.freshnessBoundary),
		);
		const freshnessBoundary =
			boundaries.size === 1 ? suppliedCitations[0]?.freshnessBoundary : undefined;
		return Object.freeze({
			...(freshnessBoundary ? {freshnessBoundary} : {}),
			collectedEvidenceRecords: Object.freeze([]),
		});
	}
	if (!input.configuration) {
		return {collectedEvidenceRecords: Object.freeze([])};
	}
	const collection = await collectDecisionResearchEvidence({
		candidate: input.candidate,
		subject: {
			changeRefs: input.subject.changeRefs,
			changeRevisionDigests: input.subject.changeRevisionDigests,
			acceptanceRequirementIds: [],
		},
		collector: input.configuration.collector,
		sensitivity: input.configuration.sensitivity,
		observedAt: input.configuration.now ?? (() => new Date().toISOString()),
		signal: input.signal,
	});
	return Object.freeze({
		freshnessBoundary: collection.freshnessBoundary,
		collectedEvidenceRecords: collection.evidenceRecords,
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

function assertIndependentSecurityRoute(
	modelChecks: CreateDecisionExitRuntimeInput["modelChecks"],
): void {
	const independent = modelChecks?.independentSecurity?.route;
	const primary = modelChecks?.route;
	if (!independent || !primary) return;
	if (
		independent.id === primary.id ||
		(independent.provider === primary.provider &&
			independent.model === primary.model)
	) {
		throw new Error(
			"Independent security assessment requires a distinct model route and provider/model identity.",
		);
	}
}

function assertRunInput(input: RunDecisionExitInput): void {
	if ("researchFreshnessBoundary" in input) {
		throw new Error(
			"Decision exit runtime received unsupported field researchFreshnessBoundary; Runtime owns research freshness.",
		);
	}
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
