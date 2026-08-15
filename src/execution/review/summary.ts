import type { CheckStatus } from "../../loops/implementation/types.ts";
import type { ImplementationLanguage } from "./artifacts.ts";
import type {
	LanguageReviewPackRunSummary,
	LanguageReviewPackSkipSummary,
} from "./language-pack.ts";
import {
	createImplementationEvidenceReport,
	type ImplementationDiagnostic,
	type ImplementationDiagnosticSeverity,
	type ImplementationEvidenceReportInput,
	type ImplementationReviewPhase,
} from "./evidence-report.ts";

export interface ReviewEvidenceCheckStatusCounts {
	pass: number;
	fail: number;
	blocked: number;
	"not-run": number;
}

export interface ReviewEvidenceDiagnosticCounts {
	total: number;
	error: number;
	warning: number;
	info: number;
	hint: number;
}

export interface ReviewEvidenceDiagnosticSummary {
	path: string;
	severity: ImplementationDiagnosticSeverity;
	message: string;
	sourceId?: string;
	ruleId?: string;
	line?: number;
	column?: number;
}

export interface ReviewEvidenceCheckSummary {
	command: string;
	status: CheckStatus;
	outputRef?: string;
	exitCode?: number;
	summary?: string;
}

export interface ReviewEvidenceReportSummary {
	id?: string;
	phase: ImplementationReviewPhase;
	sourceIds: string[];
	changedPaths: string[];
	checkStatuses: ReviewEvidenceCheckStatusCounts;
	diagnostics: ReviewEvidenceDiagnosticCounts;
	blockingDiagnostics: ReviewEvidenceDiagnosticSummary[];
	checks: ReviewEvidenceCheckSummary[];
}

export interface ReviewEvidenceSummary {
	reportCount: number;
	sourceIds: string[];
	changedPaths: string[];
	phases: Record<ImplementationReviewPhase, number>;
	checks: ReviewEvidenceCheckStatusCounts;
	diagnostics: ReviewEvidenceDiagnosticCounts;
	blockingDiagnostics: ReviewEvidenceDiagnosticSummary[];
	packRuns: LanguageReviewPackRunSummary[];
	skippedPacks: LanguageReviewPackSkipSummary[];
	reports: ReviewEvidenceReportSummary[];
}

export interface ReviewEvidenceSummaryOptions {
	maxBlockingDiagnostics?: number;
}

export function summarizeReviewEvidenceReports(
	reports: ImplementationEvidenceReportInput[] = [],
	options: ReviewEvidenceSummaryOptions = {},
): ReviewEvidenceSummary {
	const maxBlockingDiagnostics = options.maxBlockingDiagnostics ?? 20;
	const normalizedReports = reports.map((report) =>
		createImplementationEvidenceReport(report),
	);
	const reportSummaries = normalizedReports.map((report) =>
		reviewEvidenceReportSummary(report, { maxBlockingDiagnostics }),
	);
	const blockingDiagnostics = reportSummaries.flatMap(
		(report) => report.blockingDiagnostics,
	);
	const packMetadata = normalizedReports.map((report) =>
		reviewPackMetadata(report.metadata),
	);
	return {
		reportCount: reportSummaries.length,
		sourceIds: uniqueStrings(
			reportSummaries.flatMap((report) => report.sourceIds),
		),
		changedPaths: uniqueStrings(
			reportSummaries.flatMap((report) => report.changedPaths),
		),
		phases: {
			fast: reportSummaries.filter((report) => report.phase === "fast").length,
			exit: reportSummaries.filter((report) => report.phase === "exit").length,
		},
		checks: sumCheckCounts(
			reportSummaries.map((report) => report.checkStatuses),
		),
		diagnostics: sumDiagnosticCounts(
			reportSummaries.map((report) => report.diagnostics),
		),
		blockingDiagnostics: blockingDiagnostics.slice(0, maxBlockingDiagnostics),
		packRuns: uniquePackRuns(
			packMetadata.flatMap((metadata) => metadata.selected),
		),
		skippedPacks: uniqueSkippedPacks(
			packMetadata.flatMap((metadata) => metadata.skipped),
		),
		reports: reportSummaries,
	};
}

function reviewEvidenceReportSummary(
	report: ReturnType<typeof createImplementationEvidenceReport>,
	options: Required<ReviewEvidenceSummaryOptions>,
): ReviewEvidenceReportSummary {
	const blockingDiagnostics = report.diagnostics
		.filter((diagnostic) => diagnostic.severity === "error")
		.map(diagnosticSummary)
		.slice(0, options.maxBlockingDiagnostics);
	return {
		...(report.id ? { id: report.id } : {}),
		phase: report.phase,
		sourceIds: uniqueStrings(report.sources.map((source) => source.id)),
		changedPaths: report.changedPaths,
		checkStatuses: countChecks(report.checks.map((check) => check.status)),
		diagnostics: countDiagnostics(
			report.diagnostics.map((diagnostic) => diagnostic.severity),
		),
		blockingDiagnostics,
		checks: report.checks.map((check) => ({
			command: check.command,
			status: check.status,
			...(check.outputRef ? { outputRef: check.outputRef } : {}),
			...(check.exitCode !== undefined ? { exitCode: check.exitCode } : {}),
			...(check.summary ? { summary: check.summary } : {}),
		})),
	};
}

function diagnosticSummary(
	diagnostic: ImplementationDiagnostic,
): ReviewEvidenceDiagnosticSummary {
	return {
		path: diagnostic.path,
		severity: diagnostic.severity,
		message: diagnostic.message,
		...(diagnostic.sourceId ? { sourceId: diagnostic.sourceId } : {}),
		...(diagnostic.ruleId ? { ruleId: diagnostic.ruleId } : {}),
		...(diagnostic.range?.startLine !== undefined
			? { line: diagnostic.range.startLine }
			: {}),
		...(diagnostic.range?.startColumn !== undefined
			? { column: diagnostic.range.startColumn }
			: {}),
	};
}

function countChecks(statuses: CheckStatus[]): ReviewEvidenceCheckStatusCounts {
	return {
		pass: statuses.filter((status) => status === "pass").length,
		fail: statuses.filter((status) => status === "fail").length,
		blocked: statuses.filter((status) => status === "blocked").length,
		"not-run": statuses.filter((status) => status === "not-run").length,
	};
}

function countDiagnostics(
	severities: ImplementationDiagnosticSeverity[],
): ReviewEvidenceDiagnosticCounts {
	return {
		total: severities.length,
		error: severities.filter((severity) => severity === "error").length,
		warning: severities.filter((severity) => severity === "warning").length,
		info: severities.filter((severity) => severity === "info").length,
		hint: severities.filter((severity) => severity === "hint").length,
	};
}

function sumCheckCounts(
	counts: ReviewEvidenceCheckStatusCounts[],
): ReviewEvidenceCheckStatusCounts {
	return {
		pass: sum(counts.map((count) => count.pass)),
		fail: sum(counts.map((count) => count.fail)),
		blocked: sum(counts.map((count) => count.blocked)),
		"not-run": sum(counts.map((count) => count["not-run"])),
	};
}

function sumDiagnosticCounts(
	counts: ReviewEvidenceDiagnosticCounts[],
): ReviewEvidenceDiagnosticCounts {
	return {
		total: sum(counts.map((count) => count.total)),
		error: sum(counts.map((count) => count.error)),
		warning: sum(counts.map((count) => count.warning)),
		info: sum(counts.map((count) => count.info)),
		hint: sum(counts.map((count) => count.hint)),
	};
}

function reviewPackMetadata(metadata: Record<string, unknown>): {
	selected: LanguageReviewPackRunSummary[];
	skipped: LanguageReviewPackSkipSummary[];
} {
	const reviewPacks = objectValue(metadata.reviewPacks);
	return {
		selected: arrayValue(reviewPacks.selected).flatMap((value) => {
			const item = objectValue(value);
			const id = textValue(item.id);
			const label = textValue(item.label);
			const status = textValue(item.status);
			if (!id || !label || !isPackRunStatus(status)) return [];
			return [
				{
					id,
					label,
					status,
					changedPaths: arrayValue(item.changedPaths).flatMap((path) => {
						const text = textValue(path);
						return text ? [text] : [];
					}),
					checkCount: numberValue(item.checkCount) ?? 0,
					diagnosticCount: numberValue(item.diagnosticCount) ?? 0,
					...(textValue(item.summary)
						? { summary: textValue(item.summary) }
						: {}),
				},
			];
		}),
		skipped: arrayValue(reviewPacks.skipped).flatMap((value) => {
			const item = objectValue(value);
			const id = textValue(item.id);
			const label = textValue(item.label);
			const reason = textValue(item.reason);
			if (!id || !label || !isSkipReason(reason)) return [];
			return [
				{
					id,
					label,
					reason,
					languages: arrayValue(item.languages).flatMap((language) => {
						const text = textValue(language);
						return text ? [text as ImplementationLanguage] : [];
					}),
				},
			];
		}),
	};
}

function uniquePackRuns(
	items: LanguageReviewPackRunSummary[],
): LanguageReviewPackRunSummary[] {
	return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function uniqueSkippedPacks(
	items: LanguageReviewPackSkipSummary[],
): LanguageReviewPackSkipSummary[] {
	return Array.from(
		new Map(items.map((item) => [`${item.id}:${item.reason}`, item])).values(),
	);
}

function isPackRunStatus(
	value: string,
): value is LanguageReviewPackRunSummary["status"] {
	return ["pass", "fail", "blocked", "not-run", "no-evidence"].includes(value);
}

function isSkipReason(
	value: string,
): value is LanguageReviewPackSkipSummary["reason"] {
	return ["no-matching-files", "not-enabled", "disabled"].includes(value);
}

function objectValue(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
