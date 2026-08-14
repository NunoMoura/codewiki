import type {DecisionCandidate} from "../../decision/exit/candidate.ts";
import {createDecisionCodeExecutors} from "../../decision/exit/code-executors.ts";
import {
	decisionEvidenceSubject,
	resolveDecisionEvidenceObligations,
} from "../../decision/exit/evidence.ts";
import {
	createDecisionModelCheckExecutors,
	type DecisionModelCheckTransport,
} from "../../decision/exit/model-checks.ts";
import {
	createDecisionResearchExecutors,
	type DecisionResearchClaimsTransport,
} from "../../decision/exit/research-executors.ts";
import type {DecisionResearchCollectionPort} from "../../decision/exit/research.ts";
import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../verification/cache.ts";
import {createCheckCatalog} from "../../verification/catalog.ts";
import type {ExitReport, ResolvedExitPolicy} from "../../verification/contracts.ts";
import {
	assertProjectCheckPackSnapshot,
	createCustomCodeCheckExecutors,
	type CustomCodeCapabilitySnapshot,
	type ProjectCheckPackSnapshot,
} from "../../verification/custom-checks/index.ts";
import {
	createLoopExitRunner,
	type LoopCheckExecutor,
	type LoopExitRunnerLimits,
} from "../../verification/runner.ts";
import {
	prepareDecisionLoopExitSecurity,
	type DecisionLoopExitSecurityConfig,
	type DecisionProtectedCustomCheckConfig,
	type DecisionSecurityFindingIntakeMaterial,
	type DecisionSecurityScanContext,
} from "./decision-security.ts";
import {
	routeRuntimeLoopExit,
	type RuntimeLoopExitRoute,
} from "./router.ts";

export interface DecisionLoopExitResearchConfig {
	readonly route: WikiModelRouteConfig;
	readonly sensitivity: "public" | "project" | "private";
	readonly collectEvidence: DecisionResearchCollectionPort;
	readonly transport: DecisionResearchClaimsTransport;
}

interface CreateDecisionLoopExitInput {
	readonly additionalExecutors?: readonly LoopCheckExecutor[];
	readonly customCodeCapabilitySnapshot?: CustomCodeCapabilitySnapshot;
	readonly protectedBaseCustomCheckConfig?: DecisionProtectedCustomCheckConfig;
	readonly projectCheckPackSnapshot?: ProjectCheckPackSnapshot;
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
	readonly securityScanners?: DecisionLoopExitSecurityConfig;
	readonly researchChecks?: DecisionLoopExitResearchConfig;
}

interface RunDecisionLoopExitInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly securityScan?: DecisionSecurityScanContext;
	readonly signal?: AbortSignal;
}

export type DecisionLoopExitRoute = RuntimeLoopExitRoute<
	"planning" | "repair" | "waiting" | "complete" | "withdrawn",
	{
		readonly requestedDisposition: DecisionCandidate["content"]["disposition"];
	}
>;

interface DecisionLoopExitRun {
	readonly policy: ResolvedExitPolicy;
	readonly result: Awaited<
		ReturnType<ReturnType<typeof createLoopExitRunner>["run"]>
	>;
	readonly collectedEvidenceRecords: readonly EvidenceRecord<"research_citation">[];
	readonly route: DecisionLoopExitRoute;
	readonly securityFindingIntakeMaterials: readonly DecisionSecurityFindingIntakeMaterial[];
}

export function createDecisionLoopExit(
	input: CreateDecisionLoopExitInput = {},
): {
	readonly run: (runInput: RunDecisionLoopExitInput) => Promise<DecisionLoopExitRun>;
	readonly cache: LoopExitResultCache;
} {
	if ("customChecks" in input) {
		throw new Error(
			"Decision Loop Exit received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
		);
	}
	assertIndependentSecurityRoute(input.modelChecks);
	const protectedConfig = input.protectedBaseCustomCheckConfig;
	if (input.projectCheckPackSnapshot) {
		assertProjectCheckPackSnapshot(input.projectCheckPackSnapshot);
	}
	const catalog = createCheckCatalog({
		userStandards: protectedConfig?.userStandards ?? [],
		customChecks: protectedConfig?.customChecks ?? [],
		checkPacks: input.projectCheckPackSnapshot?.packs ?? [],
	});
	if (
		input.projectCheckPackSnapshot &&
		catalog.checkPackSnapshotDigest !== input.projectCheckPackSnapshot.digest
	) {
		throw new Error("Check Pack snapshot does not match the Decision Catalog.");
	}
	const cache = input.cache ?? createLoopExitResultCache();
	return Object.freeze({
		cache,
		async run(runInput: RunDecisionLoopExitInput): Promise<DecisionLoopExitRun> {
			assertRunInput(runInput);
			const subject = decisionEvidenceSubject({
				candidate: runInput.candidate,
				changeRef: runInput.changeRef,
			});
			const security = prepareDecisionLoopExitSecurity({
				catalog,
				candidate: runInput.candidate,
				changeRef: runInput.changeRef,
				subject,
				protectedBaseCustomCheckConfig: input.protectedBaseCustomCheckConfig,
				projectCheckPackSnapshot: input.projectCheckPackSnapshot,
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
						? createDecisionResearchExecutors({
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
				route: routeDecisionLoopExit(
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
	readonly configuration: DecisionLoopExitResearchConfig | undefined;
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
	const collection = await input.configuration.collectEvidence({
		candidate: input.candidate,
		subject: {
			changeRefs: input.subject.changeRefs,
			changeRevisionDigests: input.subject.changeRevisionDigests,
			acceptanceRequirementIds: [],
		},
		sensitivity: input.configuration.sensitivity,
		signal: input.signal,
	});
	return Object.freeze({
		freshnessBoundary: collection.freshnessBoundary,
		collectedEvidenceRecords: collection.evidenceRecords,
	});
}

export function routeDecisionLoopExit(
	candidate: DecisionCandidate,
	report: ExitReport,
): DecisionLoopExitRoute {
	if (
		report.loop !== "decision" ||
		report.candidateDigest !== candidate.digest
	) {
		throw new Error(
			"Decision Loop Exit requires the exact Candidate Exit Report.",
		);
	}
	return routeRuntimeLoopExit({
		candidate,
		report,
		passed: passedDecisionRoute(candidate.content.disposition),
		details: {requestedDisposition: candidate.content.disposition},
	});
}

function passedDecisionRoute(
	disposition: DecisionCandidate["content"]["disposition"],
): Pick<DecisionLoopExitRoute, "route" | "reasonCode"> {
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
	modelChecks: CreateDecisionLoopExitInput["modelChecks"],
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

function assertRunInput(input: RunDecisionLoopExitInput): void {
	if ("researchFreshnessBoundary" in input) {
		throw new Error(
			"Decision Loop Exit received unsupported field researchFreshnessBoundary; Runtime owns research freshness.",
		);
	}
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision Loop Exit requires a Decision Candidate.");
	}
	if (!/^change:[A-Za-z0-9._-]+$/.test(input.changeRef)) {
		throw new Error("Decision Loop Exit changeRef is invalid.");
	}
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision Loop Exit changeRef is not bound by Candidate.");
	}
}
