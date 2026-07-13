import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import type { DecisionEvidencePolicy } from "../decision/policy-profiles.ts";
import { resolveLoopQualityJudgeExecutionOptions } from "../loops/judge-provider.ts";
import { uniqueStrings } from "../loops/quality-standards.ts";
import {
	assertKnownInputKeys,
	requiredStringField,
} from "./input-validation.ts";
import type { ContentProof } from "../git/content-proof.ts";
import type { SourceMapContract } from "../knowledge/source-map.ts";
import {
	changedPaths,
	normalizeImplementationChanges,
} from "../implementation/evidence.ts";
import {
	createImplementationEvidenceReport,
	defaultReviewEvidenceCache,
	reviewPackSelectionForPolicy,
	runLanguageReviewPacks,
	summarizeReviewEvidenceReports,
	type ImplementationEvidenceReportInput,
	type LanguageReviewPack,
	type LanguageReviewPackRunSummary,
	type LanguageReviewPackSkipSummary,
	type ReviewEvidenceSummary,
	type ReviewPackSelection,
} from "../implementation/review/index.ts";
import {
	runImplementationIterationWithRunner,
	type ImplementationIterationInput,
	type ImplementationIterationResult,
} from "../implementation/iteration.ts";
import type {
	ImplementationArchiveDisposition,
	ImplementationArchiveDispositionInput,
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationWorkerClaim,
} from "../implementation/types.ts";
import { createImplementationMergeContentProof } from "../implementation/merge-proof.ts";
import {
	aggregateImplementationWorkerResults,
	type ImplementationWorkerResultInput,
} from "../implementation/workers.ts";
import { loadWikiConfigFile } from "../project/config-file.ts";
import type { WikiQualityReviewConfig } from "../project/config.ts";
import {
	collectProjectSnapshot,
	type ProjectSnapshot,
} from "../project/snapshot.ts";
import {
	appendSemanticLoopReport,
	assertSemanticLoopReportBatch,
	type AppendSemanticLoopReportResult,
} from "../runtime/trace-writer.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiImplementMode = "preview" | "append";

export interface RunWikiImplementInput {
	repoRoot: string;
	traceId: string;
	planningEvents?: TraceEvent[];
	decisionEvents?: TraceEvent[];
	changes?: ImplementationChange[];
	changeInputs?: ImplementationChangeInput[];
	workerResults?: ImplementationWorkerResultInput[];
	workerClaims?: ImplementationWorkerClaim[];
	claimEvents?: TraceEvent[];
	reviewEvidenceReports?: ImplementationEvidenceReportInput[];
	archiveDisposition?: ImplementationArchiveDisposition;
	archiveDispositionInput?: ImplementationArchiveDispositionInput;
	requireArchiveDisposition?: boolean;
	evidencePolicy?: DecisionEvidencePolicy;
	includeCachedReviewEvidence?: boolean;
	autoReviewEvidence?: boolean;
	reviewTimeoutMs?: number;
	expectedWorkerBaseSha?: string;
	componentMap?: SourceMapContract;
	requireTddEvidence?: boolean;
	parentId?: string | null;
	createdAt?: string;
	mode?: WikiImplementMode;
	expectedBytes?: number;
	nextSequence?: number;
	expectedTraceId?: string;
	snapshotRoots?: string[];
	snapshotExclude?: string[];
	proofPaths?: string[];
	changedPaths?: string[];
	evidencePaths?: string[];
	aggregateContentProof?: ContentProof;
}

export interface WikiImplementReviewEvidenceResult {
	enabled: boolean;
	autoEvidence: boolean;
	includeCachedEvidence: boolean;
	availablePackIds: string[];
	enabledPackIds: string[];
	selectedPackIds: string[];
	requiredPackIds: string[];
	skippedPacks: LanguageReviewPackSkipSummary[];
	explicitReportCount: number;
	generatedReportCount: number;
	submittedReportCount: number;
	summary: ReviewEvidenceSummary;
}

export interface RunWikiImplementResult {
	mode: WikiImplementMode;
	traceId: string;
	proofPaths: string[];
	snapshot: ProjectSnapshot;
	aggregateContentProof?: ContentProof;
	reviewEvidence: WikiImplementReviewEvidenceResult;
	loopResult: ImplementationIterationResult;
	iterationEvent: TraceEvent;
	append?: AppendSemanticLoopReportResult<ImplementationIterationResult>["append"];
}

interface PreparedWikiImplementReviewEvidence {
	reports: ImplementationEvidenceReportInput[];
	enabled: boolean;
	autoEvidence: boolean;
	includeCachedEvidence: boolean;
	availablePackIds: string[];
	enabledPackIds: string[];
	selectedPackIds: string[];
	requiredPackIds: string[];
	skippedPacks: LanguageReviewPackSkipSummary[];
	explicitReportCount: number;
	generatedReportCount: number;
}

const WIKI_IMPLEMENT_INPUT_KEYS = [
	"repoRoot",
	"traceId",
	"planningEvents",
	"decisionEvents",
	"changes",
	"changeInputs",
	"workerResults",
	"workerClaims",
	"claimEvents",
	"reviewEvidenceReports",
	"archiveDisposition",
	"archiveDispositionInput",
	"requireArchiveDisposition",
	"evidencePolicy",
	"includeCachedReviewEvidence",
	"autoReviewEvidence",
	"reviewTimeoutMs",
	"expectedWorkerBaseSha",
	"componentMap",
	"requireTddEvidence",
	"parentId",
	"createdAt",
	"mode",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
	"snapshotRoots",
	"snapshotExclude",
	"proofPaths",
	"changedPaths",
	"evidencePaths",
	"aggregateContentProof",
] as const;

export async function runWikiImplement(
	input: RunWikiImplementInput,
): Promise<RunWikiImplementResult> {
	assertKnownInputKeys(
		"wiki_implement",
		input as unknown as Record<string, unknown>,
		WIKI_IMPLEMENT_INPUT_KEYS,
	);
	requiredStringField("wiki_implement", "repoRoot", input.repoRoot);
	const traceId = requiredStringField(
		"wiki_implement",
		"traceId",
		input.traceId,
	);
	if (
		!Array.isArray(input.planningEvents) &&
		!Array.isArray(input.decisionEvents)
	) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "planningEvents",
			message:
				"wiki_implement requires planningEvents or direct implementation decisionEvents.",
		});
	}
	const mode = input.mode || "preview";
	const nextSequence = input.nextSequence ?? 1;
	if (!Number.isInteger(nextSequence) || nextSequence < 1) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "nextSequence",
			message: "wiki_implement requires nextSequence >= 1.",
			data: { value: nextSequence },
		});
	}
	const config = await loadWikiConfigFile(input.repoRoot);
	const snapshot = await collectProjectSnapshot({
		root: input.repoRoot,
		roots: input.snapshotRoots,
		exclude: input.snapshotExclude,
	});
	const changes = implementationChangesForRun(input);
	const mergeProof = await createImplementationMergeContentProof({
		repoRoot: input.repoRoot,
		changes,
		workerResults: input.workerResults,
		proofPaths: input.proofPaths,
		changedPaths: input.changedPaths,
		evidencePaths: input.evidencePaths,
		exclude: input.snapshotExclude,
		aggregateContentProof: input.aggregateContentProof,
	});
	const { proofPaths, aggregateContentProof } = mergeProof;
	const preparedChanges = changesWithLocalProof(changes, aggregateContentProof);
	const reviewEvidencePreparation = await reviewEvidenceReportsForRun(
		input,
		preparedChanges,
		config.quality.review,
	);
	const qualityJudge = await resolveLoopQualityJudgeExecutionOptions({
		repoRoot: input.repoRoot,
	});
	const loopInput = implementationIterationInput(input, {
		changes: preparedChanges,
		existingPaths: snapshot.paths,
		aggregateContentProof,
		reviewEvidenceReports: reviewEvidencePreparation.reports,
		reviewConfig: config.quality.review,
		qualityJudge,
	});
	if (mode === "append") {
		const expectedBytes = requiredExpectedBytes(input.expectedBytes);
		const result = await appendSemanticLoopReport({
			repoRoot: input.repoRoot,
			loop: "implementation",
			expectedBytes,
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runImplementationIterationWithRunner({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			proofPaths,
			snapshot,
			aggregateContentProof,
			reviewEvidence: wikiImplementReviewEvidenceResult(
				reviewEvidencePreparation,
				result.loopResult,
			),
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = await runImplementationIterationWithRunner({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: "implementation",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? traceId,
	});
	return {
		mode,
		traceId: iterationEvent.traceId,
		proofPaths,
		snapshot,
		aggregateContentProof,
		reviewEvidence: wikiImplementReviewEvidenceResult(
			reviewEvidencePreparation,
			loopResult,
		),
		loopResult,
		iterationEvent,
	};
}

async function reviewEvidenceReportsForRun(
	input: RunWikiImplementInput,
	changes: ImplementationChange[],
	reviewConfig: WikiQualityReviewConfig,
): Promise<PreparedWikiImplementReviewEvidence> {
	const explicitReports = input.reviewEvidenceReports || [];
	const paths = uniqueChangedPaths(changes);
	const effectiveReviewConfig: WikiQualityReviewConfig = {
		...reviewConfig,
		requiredPacks: uniqueStrings([
			...reviewConfig.requiredPacks,
			...(input.evidencePolicy?.requiredReviewPacks || []),
		]),
	};
	const selection = reviewPackSelectionForConfig(
		effectiveReviewConfig,
		paths,
		input.evidencePolicy,
	);
	const autoEvidence = shouldAutoReviewEvidence(input, effectiveReviewConfig);
	const includeCachedEvidence = shouldIncludeCachedReviewEvidence(
		input,
		effectiveReviewConfig,
	);
	const basePreparation = {
		enabled: effectiveReviewConfig.enabled,
		autoEvidence,
		includeCachedEvidence,
		availablePackIds: selection.availablePacks.map((pack) => pack.id),
		enabledPackIds: selection.enabledPacks.map((pack) => pack.id),
		selectedPackIds: selection.selectedPacks.map((pack) => pack.id),
		requiredPackIds: [...effectiveReviewConfig.requiredPacks],
		skippedPacks: selection.skippedPacks,
		explicitReportCount: explicitReports.length,
	};
	if (!autoEvidence) {
		return {
			reports: explicitReports,
			...basePreparation,
			generatedReportCount: 0,
		};
	}
	const languageReport = await runLanguageReviewPacks(selection.enabledPacks, {
		cwd: input.repoRoot,
		phase: "exit",
		changedPaths: paths,
		timeoutMs: input.reviewTimeoutMs ?? effectiveReviewConfig.timeoutMs,
	});
	const reports = [...explicitReports];
	let generatedReportCount = 0;
	if (hasReviewEvidence(languageReport)) {
		reports.push(languageReport);
		generatedReportCount += 1;
	}
	const requiredReport = requiredReviewPackPolicyReport(
		effectiveReviewConfig,
		selection,
		languageReport,
	);
	if (requiredReport && hasReviewEvidence(requiredReport)) {
		reports.push(requiredReport);
		generatedReportCount += 1;
	}
	if (reports.some((report) => (report.phase || "exit") === "exit")) {
		const acceptanceReport = acceptanceReviewEvidenceReport(changes);
		if ((acceptanceReport.evidenceLinks || []).length > 0) {
			reports.push(acceptanceReport);
			generatedReportCount += 1;
		}
	}
	return {
		reports,
		...basePreparation,
		generatedReportCount,
	};
}

function acceptanceReviewEvidenceReport(
	changes: ImplementationChange[],
): ImplementationEvidenceReportInput {
	return createImplementationEvidenceReport({
		phase: "exit",
		sources: [
			{
				id: "codewiki.acceptance-evidence-links",
				kind: "common",
				layer: "common",
				summary:
					"Implementation acceptance evidence linked for review evidence gates.",
			},
		],
		changedPaths: uniqueChangedPaths(changes),
		evidenceLinks: changes.flatMap((change) =>
			change.planningRefs.flatMap((planningRef) =>
				change.acceptanceEvidenceItems.flatMap((item) => {
					if (!item.criterionId || item.evidenceRefs.length === 0) return [];
					return [
						{
							kind: "acceptance" as const,
							targetRef: planningRef,
							criterionId: item.criterionId,
							evidenceRefs: item.evidenceRefs,
							summary: item.summary,
							sourceId: "codewiki.acceptance-evidence-links",
						},
					];
				}),
			),
		),
	});
}

function uniqueChangedPaths(changes: ImplementationChange[]): string[] {
	return Array.from(new Set(changes.flatMap((change) => changedPaths(change))));
}

function hasReviewEvidence(report: ImplementationEvidenceReportInput): boolean {
	return Boolean(
		(report.sources || []).length ||
			(report.checks || []).length ||
			(report.diagnostics || []).length ||
			(report.symbols || []).length ||
			(report.dependencyEdges || []).length ||
			(report.evidenceLinks || []).length,
	);
}

function wikiImplementReviewEvidenceResult(
	prepared: PreparedWikiImplementReviewEvidence,
	loopResult: ImplementationIterationResult,
): WikiImplementReviewEvidenceResult {
	return {
		enabled: prepared.enabled,
		autoEvidence: prepared.autoEvidence,
		includeCachedEvidence: prepared.includeCachedEvidence,
		availablePackIds: prepared.availablePackIds,
		enabledPackIds: prepared.enabledPackIds,
		selectedPackIds: prepared.selectedPackIds,
		requiredPackIds: prepared.requiredPackIds,
		skippedPacks: prepared.skippedPacks,
		explicitReportCount: prepared.explicitReportCount,
		generatedReportCount: prepared.generatedReportCount,
		submittedReportCount: loopResult.reviewEvidenceReports.length,
		summary: summarizeReviewEvidenceReports(loopResult.reviewEvidenceReports),
	};
}

function shouldAutoReviewEvidence(
	input: RunWikiImplementInput,
	reviewConfig: WikiQualityReviewConfig,
): boolean {
	if (input.autoReviewEvidence !== undefined) return input.autoReviewEvidence;
	return reviewConfig.enabled && reviewConfig.autoEvidence;
}

function shouldIncludeCachedReviewEvidence(
	input: RunWikiImplementInput,
	reviewConfig: WikiQualityReviewConfig | undefined,
): boolean {
	if (input.includeCachedReviewEvidence !== undefined) {
		return input.includeCachedReviewEvidence;
	}
	return Boolean(reviewConfig?.enabled && reviewConfig.includeCachedEvidence);
}

function reviewPackSelectionForConfig(
	reviewConfig: WikiQualityReviewConfig,
	changedPaths: string[],
	evidencePolicy?: DecisionEvidencePolicy,
): ReviewPackSelection {
	return reviewPackSelectionForPolicy(
		reviewConfig,
		changedPaths,
		{},
		evidencePolicy,
	);
}

function requiredReviewPackPolicyReport(
	reviewConfig: WikiQualityReviewConfig,
	selection: ReviewPackSelection,
	languageReport: ImplementationEvidenceReportInput,
): ImplementationEvidenceReportInput | undefined {
	const required = new Set(reviewConfig.requiredPacks);
	if (required.size === 0) return undefined;
	const packRuns = summarizeReviewEvidenceReports([languageReport]).packRuns;
	const runsById = new Map(packRuns.map((run) => [run.id, run]));
	const diagnostics = selection.selectedPacks.flatMap((pack) => {
		if (!required.has(pack.id)) return [];
		const run = runsById.get(pack.id);
		if (run && !requiredPackRunBlocks(run)) return [];
		const path = run?.changedPaths[0] || languageReport.changedPaths?.[0];
		if (!path) return [];
		return [
			{
				path,
				severity: "error" as const,
				message: requiredPackMessage(pack, run),
				sourceId: "codewiki.required-review-packs",
				ruleId: "required-review-pack",
				evidenceRefs: [path],
			},
		];
	});
	if (diagnostics.length === 0) return undefined;
	return createImplementationEvidenceReport({
		phase: "exit",
		changedPaths: languageReport.changedPaths,
		sources: [
			{
				id: "codewiki.required-review-packs",
				kind: "common",
				layer: "common",
				summary: "Required review pack policy.",
			},
		],
		diagnostics,
		metadata: { requiredPacks: [...required] },
	});
}

function requiredPackRunBlocks(run: LanguageReviewPackRunSummary): boolean {
	return ["fail", "blocked", "not-run", "no-evidence"].includes(run.status);
}

function requiredPackMessage(
	pack: LanguageReviewPack,
	run: LanguageReviewPackRunSummary | undefined,
): string {
	if (!run) {
		return `Required review pack ${pack.id} produced no evidence.`;
	}
	return run.summary
		? `Required review pack ${pack.id} did not pass (${run.status}): ${run.summary}`
		: `Required review pack ${pack.id} did not pass (${run.status}).`;
}

function implementationIterationInput(
	input: RunWikiImplementInput,
	prepared: {
		changes: ImplementationChange[];
		existingPaths: string[];
		aggregateContentProof?: ContentProof;
		reviewEvidenceReports?: ImplementationEvidenceReportInput[];
		reviewConfig?: WikiQualityReviewConfig;
		qualityJudge?: ImplementationIterationInput["qualityJudge"];
	},
): ImplementationIterationInput {
	return {
		traceId: input.traceId,
		planningEvents: input.planningEvents,
		decisionEvents: input.decisionEvents,
		changes: prepared.changes,
		workerResults: input.workerResults,
		workerClaims: input.workerClaims,
		claimEvents: input.claimEvents,
		expectedWorkerBaseSha: input.expectedWorkerBaseSha,
		componentMap: input.componentMap,
		requireTddEvidence: input.requireTddEvidence,
		parentId: input.parentId,
		createdAt: input.createdAt,
		existingPaths: prepared.existingPaths,
		aggregateContentProof: prepared.aggregateContentProof,
		reviewEvidenceReports: prepared.reviewEvidenceReports,
		archiveDisposition: input.archiveDisposition,
		archiveDispositionInput: input.archiveDispositionInput,
		requireArchiveDisposition: input.requireArchiveDisposition,
		reviewEvidenceCache: shouldIncludeCachedReviewEvidence(
			input,
			prepared.reviewConfig,
		)
			? defaultReviewEvidenceCache
			: undefined,
		qualityJudge: prepared.qualityJudge,
	};
}

function implementationChangesForRun(
	input: RunWikiImplementInput,
): ImplementationChange[] {
	if (input.changes) return input.changes;
	return normalizeImplementationChanges([
		...(input.changeInputs || []),
		...aggregateImplementationWorkerResults(input.workerResults).changeInputs,
	] as ImplementationChangeInput[]);
}

function changesWithLocalProof(
	changes: ImplementationChange[],
	proof?: ContentProof,
): ImplementationChange[] {
	if (!proof) return changes;
	return changes.map((change) => {
		if (change.contentProof || change.workerId || change.claimId) return change;
		return { ...change, contentProof: proof };
	});
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_implement append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}
