import type { AlignmentGraphSnapshot } from "../alignment/graph.ts";
import type { SynchronizationStatus } from "../changes/trace/synchronization.ts";
import { toCanonicalJsonValue } from "../utils/canonical-json.ts";
import { assertExactKeys } from "../utils/json.ts";
import type {
	CheckEnforcement,
	CheckObservationFinding,
	CheckResult,
	CheckResultStatus,
	ExitReport,
	ResolvedExitPolicy,
} from "./contracts.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "./identity.ts";
import {
	assertValidRepairFrontier,
	type RepairFrontier,
	type RepairFrontierCandidateBinding,
	type RepairFrontierReferences,
} from "./repair-frontier.ts";
import {
	matchRepairProfiles,
	type ResolvedRepairProfile,
} from "./repair-profiles.ts";
import { assertValidExitReport } from "./results.ts";

export const REPAIR_BRIEF_PROTOCOL_VERSION = "1.0.0" as const;
export const REPAIR_BUNDLE_PROTOCOL_VERSION = "1.0.0" as const;
export const EXIT_OUTCOME_PROTOCOL_VERSION = "1.0.0" as const;
export const REPAIR_EXECUTION_INVOCATION_PROTOCOL_VERSION = "1.0.0" as const;

const ACTIONABLE_STATUSES = ["fail", "indeterminate"] as const;
const DEFAULT_REPAIR_GUIDANCE_LIMITS: RepairGuidanceLimits = {
	maxResults: 64,
	maxFindings: 128,
	maxProfileMatches: 128,
};
const MAX_REPAIR_RESULTS = 512;
const MAX_REPAIR_FINDINGS = 1_024;
const MAX_REPAIR_PROFILE_MATCHES = 512;

export interface RepairGuidanceLimits {
	readonly maxResults: number;
	readonly maxFindings: number;
	readonly maxProfileMatches: number;
}

export interface RepairFindingSignal extends CheckObservationFinding {
	readonly findingIndex: number;
	readonly repairProposalDigest?: Sha256Digest;
}

export interface RepairResultSignal {
	readonly checkId: string;
	readonly resultDigest: Sha256Digest;
	readonly status: Extract<CheckResultStatus, "fail" | "indeterminate">;
	readonly required: boolean;
	readonly enforcement: CheckEnforcement;
	readonly repairTarget: string;
	readonly issueClass?: string;
	readonly feedback?: string;
	readonly findingCount: number;
	readonly findings: readonly RepairFindingSignal[];
}

export interface MatchedRepairProfile {
	readonly checkId: string;
	readonly resultDigest: Sha256Digest;
	readonly profile: ResolvedRepairProfile;
}

export interface RepairBriefContext {
	readonly frontierDigest: Sha256Digest;
	readonly references: RepairFrontierReferences;
	readonly coverageStatus: RepairFrontier["coverage"]["status"];
	readonly stale: boolean;
	readonly truncated: boolean;
}

export interface RepairGuidanceTruncation {
	readonly truncated: boolean;
	readonly results: boolean;
	readonly findings: boolean;
	readonly profileMatches: boolean;
}

export interface RepairBrief {
	readonly protocolVersion: typeof REPAIR_BRIEF_PROTOCOL_VERSION;
	readonly candidate: RepairFrontierCandidateBinding;
	readonly policyDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly limits: RepairGuidanceLimits;
	readonly resultSignals: readonly RepairResultSignal[];
	readonly guidance: readonly MatchedRepairProfile[];
	readonly context: RepairBriefContext;
	readonly truncation: RepairGuidanceTruncation;
	readonly grantsAuthority: false;
	readonly briefDigest: Sha256Digest;
}

export interface RepairBundleCoverage {
	readonly status: "complete" | "partial" | "unavailable";
	readonly actionableResultCount: number;
	readonly selectedResultCount: number;
	readonly resultWithGuidanceCount: number;
	readonly findingCount: number;
	readonly selectedFindingCount: number;
	readonly matchedProfileCount: number;
	readonly selectedProfileCount: number;
	readonly evaluatorProposalCount: number;
	readonly frontierStatus: RepairFrontier["coverage"]["status"];
}

export interface RepairGuidanceDigests {
	readonly resultDigests: readonly Sha256Digest[];
	readonly profileDigests: readonly Sha256Digest[];
	readonly evaluatorProposalDigests: readonly Sha256Digest[];
	readonly frontierDigest: Sha256Digest;
	readonly briefDigest: Sha256Digest;
}

export interface RepairBundle {
	readonly protocolVersion: typeof REPAIR_BUNDLE_PROTOCOL_VERSION;
	readonly candidate: RepairFrontierCandidateBinding;
	readonly policyDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly limits: RepairGuidanceLimits;
	readonly matchedProfiles: readonly MatchedRepairProfile[];
	readonly frontier: RepairFrontier;
	readonly brief: RepairBrief;
	readonly coverage: RepairBundleCoverage;
	readonly guidanceDigests: RepairGuidanceDigests;
	readonly stale: boolean;
	readonly grantsAuthority: false;
	readonly bundleDigest: Sha256Digest;
}

export interface CreateRepairGuidanceInput {
	readonly candidate: RepairFrontierCandidateBinding;
	readonly policy: ResolvedExitPolicy;
	readonly report: ExitReport;
	readonly alignmentGraph: AlignmentGraphSnapshot;
	readonly synchronizationStatus: SynchronizationStatus;
	readonly frontier: RepairFrontier;
	readonly limits?: Partial<RepairGuidanceLimits>;
}

export interface ExitOutcomeRuntimeRouteReference {
	readonly candidateDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly route: string;
	readonly reasonCode: string;
	readonly routeDigest: Sha256Digest;
}

export interface ExitOutcome {
	readonly protocolVersion: typeof EXIT_OUTCOME_PROTOCOL_VERSION;
	readonly candidate: {
		readonly loop: ExitReport["loop"];
		readonly candidateDigest: Sha256Digest;
	};
	readonly exitReport: ExitReport;
	readonly repairBundle: RepairBundle | null;
	readonly runtimeRoute: ExitOutcomeRuntimeRouteReference | null;
	readonly outcomeDigest: Sha256Digest;
}

export interface CreateExitOutcomeInput {
	readonly policy: ResolvedExitPolicy;
	readonly report: ExitReport;
	readonly repairGuidance?: CreateRepairGuidanceInput;
	readonly runtimeRoute?: ExitOutcomeRuntimeRouteReference;
}

export interface RepairExecutionInvocation {
	readonly protocolVersion: typeof REPAIR_EXECUTION_INVOCATION_PROTOCOL_VERSION;
	readonly candidate: RepairFrontierCandidateBinding;
	readonly exitReportDigest: Sha256Digest;
	readonly repairBundleDigest: Sha256Digest;
	readonly brief: RepairBrief;
	readonly grantsAuthority: false;
	readonly invocationDigest: Sha256Digest;
}

interface RepairGuidanceContext {
	readonly limits: RepairGuidanceLimits;
	readonly selectedResults: readonly CheckResult[];
	readonly resultSignals: readonly RepairResultSignal[];
	readonly selectedProfileMatches: readonly MatchedRepairProfile[];
	readonly proposalDigests: readonly Sha256Digest[];
	readonly coverage: RepairBundleCoverage;
	readonly truncation: RepairGuidanceTruncation;
}

interface RepairGuidanceSelection {
	readonly selectedResults: readonly CheckResult[];
	readonly resultSignals: readonly RepairResultSignal[];
	readonly allProfileMatches: readonly MatchedRepairProfile[];
	readonly selectedProfileMatches: readonly MatchedRepairProfile[];
	readonly allProposalDigests: readonly Sha256Digest[];
	readonly proposalDigests: readonly Sha256Digest[];
	readonly findingCount: number;
	readonly selectedFindingCount: number;
	readonly resultWithGuidanceCount: number;
	readonly truncation: RepairGuidanceTruncation;
}

export function createRepairBrief(input: CreateRepairGuidanceInput): RepairBrief {
	const context = repairGuidanceContext(input);
	return repairBriefFromContext(input, context);
}

export function assertValidRepairBrief(
	brief: RepairBrief,
	input: CreateRepairGuidanceInput,
): void {
	assertExactKeys(
		brief,
		[
			"protocolVersion",
			"candidate",
			"policyDigest",
			"exitReportDigest",
			"limits",
			"resultSignals",
			"guidance",
			"context",
			"truncation",
			"grantsAuthority",
			"briefDigest",
		],
		"Repair Brief",
	);
	if (brief.protocolVersion !== REPAIR_BRIEF_PROTOCOL_VERSION) {
		throw new Error(
			`Unsupported Repair Brief protocol version ${String(brief.protocolVersion)}.`,
		);
	}
	assertSha256Digest(brief.briefDigest, "Repair Brief digest");
	const { briefDigest, ...body } = brief;
	if (briefDigest !== canonicalJsonDigest(body)) {
		throw new Error("Repair Brief digest does not match content.");
	}
	const expected = createRepairBrief(input);
	if (canonicalJson(brief) !== canonicalJson(expected)) {
		throw new Error("Repair Brief does not match its bound report and Repair Frontier.");
	}
}

export function createRepairBundle(input: CreateRepairGuidanceInput): RepairBundle {
	const context = repairGuidanceContext(input);
	const brief = repairBriefFromContext(input, context);
	const guidanceDigests: RepairGuidanceDigests = {
		resultDigests: context.selectedResults.map((result) => result.resultDigest as Sha256Digest),
		profileDigests: sortedUnique(
			context.selectedProfileMatches.map((match) => match.profile.profileDigest),
		),
		evaluatorProposalDigests: context.proposalDigests,
		frontierDigest: input.frontier.frontierDigest,
		briefDigest: brief.briefDigest,
	};
	const body = {
		protocolVersion: REPAIR_BUNDLE_PROTOCOL_VERSION,
		candidate: input.frontier.candidate,
		policyDigest: input.policy.policyDigest,
		exitReportDigest: input.report.reportDigest,
		limits: context.limits,
		matchedProfiles: context.selectedProfileMatches,
		frontier: input.frontier,
		brief,
		coverage: context.coverage,
		guidanceDigests,
		stale: input.frontier.stale,
		grantsAuthority: false as const,
	};
	return canonicalValue<RepairBundle>({
		...body,
		bundleDigest: canonicalJsonDigest(body),
	});
}

export function assertValidRepairBundle(
	bundle: RepairBundle,
	input: CreateRepairGuidanceInput,
): void {
	assertExactKeys(
		bundle,
		[
			"protocolVersion",
			"candidate",
			"policyDigest",
			"exitReportDigest",
			"limits",
			"matchedProfiles",
			"frontier",
			"brief",
			"coverage",
			"guidanceDigests",
			"stale",
			"grantsAuthority",
			"bundleDigest",
		],
		"Repair Bundle",
	);
	if (bundle.protocolVersion !== REPAIR_BUNDLE_PROTOCOL_VERSION) {
		throw new Error(
			`Unsupported Repair Bundle protocol version ${String(bundle.protocolVersion)}.`,
		);
	}
	assertSha256Digest(bundle.bundleDigest, "Repair Bundle digest");
	const { bundleDigest, ...body } = bundle;
	if (bundleDigest !== canonicalJsonDigest(body)) {
		throw new Error("Repair Bundle digest does not match content.");
	}
	const expected = createRepairBundle(input);
	if (canonicalJson(bundle) !== canonicalJson(expected)) {
		throw new Error("Repair Bundle does not match its bound report and Repair Frontier.");
	}
}

export function createExitOutcome(input: CreateExitOutcomeInput): ExitOutcome {
	assertValidExitReport(input.report, input.policy);
	const repairBundle = input.repairGuidance
		? repairBundleForOutcome(input)
		: null;
	const runtimeRoute = input.runtimeRoute
		? normalizeRuntimeRouteReference(input.runtimeRoute, input.report)
		: null;
	const body = {
		protocolVersion: EXIT_OUTCOME_PROTOCOL_VERSION,
		candidate: {
			loop: input.report.loop,
			candidateDigest: input.report.candidateDigest as Sha256Digest,
		},
		exitReport: input.report,
		repairBundle,
		runtimeRoute,
	};
	return canonicalValue<ExitOutcome>({
		...body,
		outcomeDigest: canonicalJsonDigest(body),
	});
}

export function assertValidExitOutcome(
	outcome: ExitOutcome,
	input: CreateExitOutcomeInput,
): void {
	assertExactKeys(
		outcome,
		[
			"protocolVersion",
			"candidate",
			"exitReport",
			"repairBundle",
			"runtimeRoute",
			"outcomeDigest",
		],
		"Exit Outcome",
	);
	if (outcome.protocolVersion !== EXIT_OUTCOME_PROTOCOL_VERSION) {
		throw new Error(
			`Unsupported Exit Outcome protocol version ${String(outcome.protocolVersion)}.`,
		);
	}
	assertSha256Digest(outcome.outcomeDigest, "Exit Outcome digest");
	const { outcomeDigest, ...body } = outcome;
	if (outcomeDigest !== canonicalJsonDigest(body)) {
		throw new Error("Exit Outcome digest does not match content.");
	}
	const expected = createExitOutcome(input);
	if (canonicalJson(outcome) !== canonicalJson(expected)) {
		throw new Error("Exit Outcome does not match its bound report, guidance, and route.");
	}
}

export function createRepairExecutionInvocation(
	input: CreateRepairGuidanceInput,
): RepairExecutionInvocation {
	const bundle = createRepairBundle(input);
	const body = {
		protocolVersion: REPAIR_EXECUTION_INVOCATION_PROTOCOL_VERSION,
		candidate: bundle.candidate,
		exitReportDigest: bundle.exitReportDigest,
		repairBundleDigest: bundle.bundleDigest,
		brief: bundle.brief,
		grantsAuthority: false as const,
	};
	return canonicalValue<RepairExecutionInvocation>({
		...body,
		invocationDigest: canonicalJsonDigest(body),
	});
}

export function assertValidRepairExecutionInvocation(
	invocation: RepairExecutionInvocation,
	input: CreateRepairGuidanceInput,
): void {
	assertExactKeys(
		invocation,
		[
			"protocolVersion",
			"candidate",
			"exitReportDigest",
			"repairBundleDigest",
			"brief",
			"grantsAuthority",
			"invocationDigest",
		],
		"Repair Execution Invocation",
	);
	if (invocation.protocolVersion !== REPAIR_EXECUTION_INVOCATION_PROTOCOL_VERSION) {
		throw new Error(
			`Unsupported Repair Execution Invocation protocol version ${String(invocation.protocolVersion)}.`,
		);
	}
	assertSha256Digest(
		invocation.invocationDigest,
		"Repair Execution Invocation digest",
	);
	const { invocationDigest, ...body } = invocation;
	if (invocationDigest !== canonicalJsonDigest(body)) {
		throw new Error("Repair Execution Invocation digest does not match content.");
	}
	const expected = createRepairExecutionInvocation(input);
	if (canonicalJson(invocation) !== canonicalJson(expected)) {
		throw new Error(
			"Repair Execution Invocation does not match its bound Repair Bundle.",
		);
	}
}

function repairBundleForOutcome(input: CreateExitOutcomeInput): RepairBundle {
	const guidance = input.repairGuidance;
	if (!guidance) throw new Error("Exit Outcome Repair guidance is unavailable.");
	if (
		guidance.policy.policyDigest !== input.policy.policyDigest ||
		guidance.report.reportDigest !== input.report.reportDigest
	) {
		throw new Error("Exit Outcome Repair Bundle must bind the same policy and Exit Report.");
	}
	return createRepairBundle(guidance);
}

function normalizeRuntimeRouteReference(
	route: ExitOutcomeRuntimeRouteReference,
	report: ExitReport,
): ExitOutcomeRuntimeRouteReference {
	assertExactKeys(
		route,
		["candidateDigest", "exitReportDigest", "route", "reasonCode", "routeDigest"],
		"Exit Outcome Runtime Route reference",
	);
	assertSha256Digest(route.candidateDigest, "Runtime Route candidate digest");
	assertSha256Digest(route.exitReportDigest, "Runtime Route Exit Report digest");
	assertSha256Digest(route.routeDigest, "Runtime Route digest");
	if (
		route.candidateDigest !== report.candidateDigest ||
		route.exitReportDigest !== report.reportDigest
	) {
		throw new Error("Exit Outcome Runtime Route references another Candidate or Exit Report.");
	}
	return {
		candidateDigest: route.candidateDigest,
		exitReportDigest: route.exitReportDigest,
		route: boundedText(route.route, "Runtime Route", 128),
		reasonCode: boundedText(route.reasonCode, "Runtime Route reason code", 256),
		routeDigest: route.routeDigest,
	};
}

function repairGuidanceContext(input: CreateRepairGuidanceInput): RepairGuidanceContext {
	assertValidRepairFrontier(input.frontier, {
		candidate: input.candidate,
		policy: input.policy,
		report: input.report,
		alignmentGraph: input.alignmentGraph,
		synchronizationStatus: input.synchronizationStatus,
		limits: input.frontier.limits,
	});
	const limits = normalizeLimits(input.limits);
	const actionableResults = actionableRepairResults(input.report, input.policy);
	const selection = selectRepairGuidance(input.policy, actionableResults, limits);
	const coverage = repairBundleCoverage(
		input.frontier,
		actionableResults.length,
		selection,
	);
	return {
		limits,
		selectedResults: selection.selectedResults,
		resultSignals: selection.resultSignals,
		selectedProfileMatches: selection.selectedProfileMatches,
		proposalDigests: selection.proposalDigests,
		coverage,
		truncation: selection.truncation,
	};
}

function actionableRepairResults(
	report: ExitReport,
	policy: ResolvedExitPolicy,
): readonly CheckResult[] {
	const results = [...report.checkResults]
		.filter((result) => isActionableStatus(result.status))
		.sort((left, right) => compareResults(left, right, policy));
	if (results.length === 0) {
		throw new Error("Repair guidance requires at least one failed or indeterminate Result.");
	}
	return results;
}

function selectRepairGuidance(
	policy: ResolvedExitPolicy,
	actionableResults: readonly CheckResult[],
	limits: RepairGuidanceLimits,
): RepairGuidanceSelection {
	const selectedResults = actionableResults.slice(0, limits.maxResults);
	const selectedResultDigests = new Set(
		selectedResults.map((result) => result.resultDigest),
	);
	const allProfileMatches = actionableResults.flatMap((result) =>
		matchedProfilesForResult(policy, result),
	);
	const selectedProfileMatches = allProfileMatches
		.filter((match) => selectedResultDigests.has(match.resultDigest))
		.slice(0, limits.maxProfileMatches);
	const selectedFindings = selectedFindingSignals(selectedResults, limits.maxFindings);
	const resultSignals = selectedResults.map((result) => {
		const binding = bindingForResult(policy, result);
		const findings = selectedFindings.filter(
			(signal) => signal.resultDigest === result.resultDigest,
		);
		return resultSignal(result, binding.required, binding.enforcement, findings);
	});
	const allProposalDigests = repairProposalDigests(actionableResults);
	const proposalDigests = selectedProposalDigests(resultSignals);
	const findingCount = findingSignalCount(actionableResults);
	const selectedFindingCount = findingSignalCount(resultSignals);
	const truncation = guidanceTruncation({
		actionableResults,
		selectedResults,
		findingCount,
		selectedFindingCount,
		allProfileMatches,
		selectedProfileMatches,
	});
	return {
		selectedResults,
		resultSignals,
		allProfileMatches,
		selectedProfileMatches,
		allProposalDigests,
		proposalDigests,
		findingCount,
		selectedFindingCount,
		resultWithGuidanceCount: guidedResultCount(actionableResults, allProfileMatches),
		truncation,
	};
}

function repairBundleCoverage(
	frontier: RepairFrontier,
	actionableResultCount: number,
	selection: RepairGuidanceSelection,
): RepairBundleCoverage {
	return {
		status: guidanceCoverageStatus({
			actionableResultCount,
			resultWithGuidanceCount: selection.resultWithGuidanceCount,
			truncated: selection.truncation.truncated,
			frontierStatus: frontier.coverage.status,
		}),
		actionableResultCount,
		selectedResultCount: selection.selectedResults.length,
		resultWithGuidanceCount: selection.resultWithGuidanceCount,
		findingCount: selection.findingCount,
		selectedFindingCount: selection.selectedFindingCount,
		matchedProfileCount: selection.allProfileMatches.length,
		selectedProfileCount: selection.selectedProfileMatches.length,
		evaluatorProposalCount: selection.allProposalDigests.length,
		frontierStatus: frontier.coverage.status,
	};
}

function repairProposalDigests(results: readonly CheckResult[]): readonly Sha256Digest[] {
	return results.flatMap((result) =>
		result.findings.flatMap((finding, findingIndex) =>
			finding.repair
				? [repairProposalDigest(result.resultDigest, findingIndex, finding)]
				: [],
		),
	);
}

function selectedProposalDigests(
	signals: readonly RepairResultSignal[],
): readonly Sha256Digest[] {
	return sortedUnique(
		signals.flatMap((signal) =>
			signal.findings.flatMap((finding) =>
				finding.repairProposalDigest ? [finding.repairProposalDigest] : [],
			),
		),
	);
}

function findingSignalCount(
	values: readonly { readonly findings: readonly unknown[] }[],
): number {
	return values.reduce((count, value) => count + value.findings.length, 0);
}

function guidanceTruncation(input: {
	readonly actionableResults: readonly CheckResult[];
	readonly selectedResults: readonly CheckResult[];
	readonly findingCount: number;
	readonly selectedFindingCount: number;
	readonly allProfileMatches: readonly MatchedRepairProfile[];
	readonly selectedProfileMatches: readonly MatchedRepairProfile[];
}): RepairGuidanceTruncation {
	const results = input.actionableResults.length > input.selectedResults.length;
	const findings = input.findingCount > input.selectedFindingCount;
	const profileMatches =
		input.allProfileMatches.length > input.selectedProfileMatches.length;
	return {
		results,
		findings,
		profileMatches,
		truncated: results || findings || profileMatches,
	};
}

function guidedResultCount(
	results: readonly CheckResult[],
	profileMatches: readonly MatchedRepairProfile[],
): number {
	const guided = new Set<string>(
		profileMatches.map((match) => match.resultDigest),
	);
	for (const result of results) {
		if (result.findings.some((finding) => finding.repair)) {
			guided.add(result.resultDigest);
		}
	}
	return guided.size;
}

function repairBriefFromContext(
	input: CreateRepairGuidanceInput,
	context: RepairGuidanceContext,
): RepairBrief {
	const body = {
		protocolVersion: REPAIR_BRIEF_PROTOCOL_VERSION,
		candidate: input.frontier.candidate,
		policyDigest: input.policy.policyDigest,
		exitReportDigest: input.report.reportDigest,
		limits: context.limits,
		resultSignals: context.resultSignals,
		guidance: context.selectedProfileMatches,
		context: {
			frontierDigest: input.frontier.frontierDigest,
			references: input.frontier.references,
			coverageStatus: input.frontier.coverage.status,
			stale: input.frontier.stale,
			truncated: input.frontier.truncation.truncated,
		},
		truncation: context.truncation,
		grantsAuthority: false as const,
	};
	return canonicalValue<RepairBrief>({
		...body,
		briefDigest: canonicalJsonDigest(body),
	});
}

function selectedFindingSignals(
	results: readonly CheckResult[],
	maximum: number,
): readonly (RepairFindingSignal & { readonly resultDigest: string })[] {
	const selected: (RepairFindingSignal & { readonly resultDigest: string })[] = [];
	for (const result of results) {
		for (const [findingIndex, finding] of result.findings.entries()) {
			if (selected.length >= maximum) return selected;
			selected.push({
				...finding,
				findingIndex,
				resultDigest: result.resultDigest,
				...(finding.repair
					? {
							repairProposalDigest: repairProposalDigest(
								result.resultDigest,
								findingIndex,
								finding,
							),
						}
					: {}),
			});
		}
	}
	return selected;
}

function resultSignal(
	result: CheckResult,
	required: boolean,
	enforcement: CheckEnforcement,
	findings: readonly (RepairFindingSignal & { readonly resultDigest: string })[],
): RepairResultSignal {
	return {
		checkId: result.checkId,
		resultDigest: result.resultDigest as Sha256Digest,
		status: result.status as Extract<CheckResultStatus, "fail" | "indeterminate">,
		required,
		enforcement,
		repairTarget: result.repairTarget,
		...(result.issueClass ? { issueClass: result.issueClass } : {}),
		...(result.feedback ? { feedback: result.feedback } : {}),
		findingCount: result.findings.length,
		findings: findings.map(({ resultDigest: _resultDigest, ...finding }) => finding),
	};
}

function matchedProfilesForResult(
	policy: ResolvedExitPolicy,
	result: CheckResult,
): MatchedRepairProfile[] {
	const binding = bindingForResult(policy, result);
	return matchRepairProfiles({ profiles: binding.repairProfiles, result }).map((profile) => ({
		checkId: result.checkId,
		resultDigest: result.resultDigest as Sha256Digest,
		profile,
	}));
}

function bindingForResult(policy: ResolvedExitPolicy, result: CheckResult) {
	const binding = policy.bindings.find((candidate) => candidate.checkId === result.checkId);
	if (!binding) {
		throw new Error(`Repair guidance cannot find Check binding ${result.checkId}.`);
	}
	return binding;
}

function repairProposalDigest(
	resultDigest: string,
	findingIndex: number,
	finding: CheckObservationFinding,
): Sha256Digest {
	return canonicalJsonDigest({
		resultDigest,
		findingIndex,
		repair: finding.repair,
	});
}

function normalizeLimits(
	limits: Partial<RepairGuidanceLimits> | undefined,
): RepairGuidanceLimits {
	return {
		maxResults: boundedInteger(
			limits?.maxResults,
			DEFAULT_REPAIR_GUIDANCE_LIMITS.maxResults,
			MAX_REPAIR_RESULTS,
			"maxResults",
		),
		maxFindings: boundedInteger(
			limits?.maxFindings,
			DEFAULT_REPAIR_GUIDANCE_LIMITS.maxFindings,
			MAX_REPAIR_FINDINGS,
			"maxFindings",
		),
		maxProfileMatches: boundedInteger(
			limits?.maxProfileMatches,
			DEFAULT_REPAIR_GUIDANCE_LIMITS.maxProfileMatches,
			MAX_REPAIR_PROFILE_MATCHES,
			"maxProfileMatches",
		),
	};
}

function boundedInteger(
	value: number | undefined,
	fallback: number,
	maximum: number,
	label: string,
): number {
	const selected = value ?? fallback;
	if (!Number.isInteger(selected) || selected < 1 || selected > maximum) {
		throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
	}
	return selected;
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
		throw new Error(`${label} must contain from 1 to ${maximum} characters.`);
	}
	return value;
}

function compareResults(
	left: CheckResult,
	right: CheckResult,
	policy: ResolvedExitPolicy,
): number {
	const requiredDifference =
		Number(bindingForResult(policy, right).required) -
		Number(bindingForResult(policy, left).required);
	if (requiredDifference !== 0) return requiredDifference;
	const statusDifference = statusRank(left.status) - statusRank(right.status);
	return statusDifference || compareText(left.checkId, right.checkId);
}

function statusRank(status: CheckResultStatus): number {
	return status === "fail" ? 0 : 1;
}

function isActionableStatus(
	status: CheckResultStatus,
): status is Extract<CheckResultStatus, "fail" | "indeterminate"> {
	return ACTIONABLE_STATUSES.includes(
		status as (typeof ACTIONABLE_STATUSES)[number],
	);
}

function guidanceCoverageStatus(input: {
	readonly actionableResultCount: number;
	readonly resultWithGuidanceCount: number;
	readonly truncated: boolean;
	readonly frontierStatus: RepairFrontier["coverage"]["status"];
}): RepairBundleCoverage["status"] {
	if (input.resultWithGuidanceCount === 0) return "unavailable";
	if (
		input.resultWithGuidanceCount === input.actionableResultCount &&
		!input.truncated &&
		input.frontierStatus === "complete"
	) {
		return "complete";
	}
	return "partial";
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
	return Number(left > right) - Number(left < right);
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
