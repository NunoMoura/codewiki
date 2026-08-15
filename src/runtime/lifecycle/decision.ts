import type {DecisionCandidate} from "../../loops/decision/candidate.ts";
import {createDecisionCodeExecutors} from "../../loops/decision/code-executors.ts";
import {
	decisionEvidenceSubject,
	resolveDecisionEvidenceObligations,
} from "../../loops/decision/evidence.ts";
import {
	createDecisionModelCheckExecutors,
	type DecisionModelCheckTransport,
} from "../../loops/decision/model-checks.ts";
import {
	createDecisionResearchExecutors,
	type DecisionResearchClaimsTransport,
} from "../../loops/decision/research-executors.ts";
import type {DecisionResearchCollectionPort} from "../../loops/decision/research.ts";
import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../checks/cache.ts";
import {createCheckCatalog} from "../../checks/catalog.ts";
import type {ExitReport, ResolvedExitPolicy} from "../../checks/contracts.ts";
import {
	assertProjectCheckPackSnapshot,
	createCustomCodeCheckExecutors,
	type CustomCodeCapabilitySnapshot,
	type ProjectCheckPackSnapshot,
} from "../../checks/packs/index.ts";
import {
	createLoopExitRunner,
	type LoopCheckExecutor,
	type LoopExitRunnerLimits,
} from "../../checks/runner.ts";
import {
	prepareDecisionGateSecurity,
	type DecisionGateSecurityConfig,
	type DecisionProtectedCustomCheckConfig,
	type DecisionSecurityFindingIntakeMaterial,
	type DecisionSecurityScanContext,
} from "./decision-security.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export interface DecisionGateResearchConfig {
	readonly route: WikiModelRouteConfig;
	readonly sensitivity: "public" | "project" | "private";
	readonly collectEvidence: DecisionResearchCollectionPort;
	readonly transport: DecisionResearchClaimsTransport;
}

interface CreateDecisionGateInput {
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
	readonly securityScanners?: DecisionGateSecurityConfig;
	readonly researchChecks?: DecisionGateResearchConfig;
}

interface RunDecisionGateInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly securityScan?: DecisionSecurityScanContext;
	readonly signal?: AbortSignal;
}

export type DecisionLifecycleTransition = Readonly<{
	readonly schemaVersion: "1.0.0";
	readonly candidateDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly route: "planning" | "repair" | "waiting" | "complete" | "withdrawn";
	readonly reasonCode: string;
	readonly requestedDisposition: DecisionCandidate["content"]["disposition"];
	readonly routeDigest: Sha256Digest;
}>;

interface DecisionGateRun {
	readonly policy: ResolvedExitPolicy;
	readonly result: Awaited<
		ReturnType<ReturnType<typeof createLoopExitRunner>["run"]>
	>;
	readonly collectedEvidenceRecords: readonly EvidenceRecord<"research_citation">[];
	readonly transition: DecisionLifecycleTransition;
	readonly securityFindingIntakeMaterials: readonly DecisionSecurityFindingIntakeMaterial[];
}

export function createDecisionGate(
	input: CreateDecisionGateInput = {},
): {
	readonly run: (runInput: RunDecisionGateInput) => Promise<DecisionGateRun>;
	readonly cache: LoopExitResultCache;
} {
	if ("customChecks" in input) {
		throw new Error(
			"Decision Gate received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
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
		async run(runInput: RunDecisionGateInput): Promise<DecisionGateRun> {
			assertRunInput(runInput);
			const subject = decisionEvidenceSubject({
				candidate: runInput.candidate,
				changeRef: runInput.changeRef,
			});
			const security = prepareDecisionGateSecurity({
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
				transition: deriveDecisionLifecycleTransition(
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
	readonly configuration: DecisionGateResearchConfig | undefined;
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

export function deriveDecisionLifecycleTransition(
	candidate: DecisionCandidate,
	report: ExitReport,
): DecisionLifecycleTransition {
	if (
		report.loop !== "decision" ||
		report.candidateDigest !== candidate.digest
	) {
		throw new Error(
			"Decision lifecycle requires the exact Candidate Gate Report.",
		);
	}
	const selection = decisionLifecycleSelection(candidate, report);
	const body = {
		schemaVersion: "1.0.0" as const,
		candidateDigest: candidate.digest,
		exitReportDigest: report.reportDigest,
		requestedDisposition: candidate.content.disposition,
		...selection,
	};
	return toCanonicalJsonValue({
		...body,
		routeDigest: canonicalJsonDigest(body),
	}) as unknown as DecisionLifecycleTransition;
}

function decisionLifecycleSelection(
	candidate: DecisionCandidate,
	report: ExitReport,
): Pick<DecisionLifecycleTransition, "route" | "reasonCode"> {
	if (report.status === "fail") {
		return {route: "repair", reasonCode: "decision-checks-failed"};
	}
	if (report.status === "indeterminate") {
		return {
			route: "waiting",
			reasonCode: "decision-assurance-indeterminate",
		};
	}
	return passedDecisionTransition(candidate.content.disposition);
}

function passedDecisionTransition(
	disposition: DecisionCandidate["content"]["disposition"],
): Pick<DecisionLifecycleTransition, "route" | "reasonCode"> {
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
	modelChecks: CreateDecisionGateInput["modelChecks"],
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

function assertRunInput(input: RunDecisionGateInput): void {
	if ("researchFreshnessBoundary" in input) {
		throw new Error(
			"Decision Gate received unsupported field researchFreshnessBoundary; Runtime owns research freshness.",
		);
	}
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision Gate requires a Decision Candidate.");
	}
	if (!/^change:[A-Za-z0-9._-]+$/.test(input.changeRef)) {
		throw new Error("Decision Gate changeRef is invalid.");
	}
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision Gate changeRef is not bound by Candidate.");
	}
}
