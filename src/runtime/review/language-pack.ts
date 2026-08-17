import {
	classifyImplementationArtifact,
	type ImplementationLanguage,
} from "./artifacts.ts";
import {
	createImplementationEvidenceReport,
	mergeImplementationEvidenceReports,
	type ImplementationEvidenceReport,
	type ImplementationEvidenceReportInput,
	type ImplementationReviewPhase,
} from "./evidence-report.ts";

export interface LanguageReviewContext {
	cwd: string;
	phase: ImplementationReviewPhase;
	changedPaths: string[];
	timeoutMs?: number;
	evidenceReport?: ImplementationEvidenceReportInput;
}

export type LanguageReviewPackRunStatus =
	| "pass"
	| "fail"
	| "blocked"
	| "not-run"
	| "no-evidence";

export type LanguageReviewPackSkipReason =
	| "no-matching-files"
	| "not-enabled"
	| "disabled";

export interface LanguageReviewPackRunSummary {
	id: string;
	label: string;
	status: LanguageReviewPackRunStatus;
	changedPaths: string[];
	checkCount: number;
	diagnosticCount: number;
	summary?: string;
}

export interface LanguageReviewPackSkipSummary {
	id: string;
	label: string;
	reason: LanguageReviewPackSkipReason;
	languages?: ImplementationLanguage[];
}

export interface LanguageReviewPack {
	id: string;
	label: string;
	languages: ImplementationLanguage[];
	fastChecks?: (
		context: LanguageReviewContext,
	) =>
		| ImplementationEvidenceReportInput
		| Promise<ImplementationEvidenceReportInput>;
	exitEvidence?: (
		context: LanguageReviewContext,
	) =>
		| ImplementationEvidenceReportInput
		| Promise<ImplementationEvidenceReportInput>;
}

export function selectLanguageReviewPacks(
	packs: LanguageReviewPack[],
	changedPaths: string[],
): LanguageReviewPack[] {
	const languages = languagesForPaths(changedPaths);
	return packs.filter((pack) =>
		pack.languages.some((language) => languages.includes(language)),
	);
}

export async function runLanguageReviewPacks(
	packs: LanguageReviewPack[],
	context: LanguageReviewContext,
): Promise<ImplementationEvidenceReport> {
	const selected = selectLanguageReviewPacks(packs, context.changedPaths);
	const skipped = packs
		.filter((pack) => !selected.includes(pack))
		.map(
			(pack): LanguageReviewPackSkipSummary => ({
				id: pack.id,
				label: pack.label,
				reason: "no-matching-files",
				languages: pack.languages,
			}),
		);
	const reports = await Promise.all(
		selected.map(async (pack) => {
			const producer =
				context.phase === "fast" ? pack.fastChecks : pack.exitEvidence;
			if (!producer) {
				return createImplementationEvidenceReport({
					phase: context.phase,
					changedPaths: languagePathsForPack(pack, context.changedPaths),
					sources: [sourceForPack(pack)],
				});
			}
			return createImplementationEvidenceReport({
				phase: context.phase,
				changedPaths: languagePathsForPack(pack, context.changedPaths),
				sources: [sourceForPack(pack)],
				...(await producer(context)),
			});
		}),
	);
	return mergeImplementationEvidenceReports(reports, {
		phase: context.phase,
		changedPaths: context.changedPaths,
		metadata: {
			reviewPacks: {
				selected: selected.map((pack, index) =>
					packRunSummary(pack, reports[index]),
				),
				skipped,
			},
		},
	});
}

export function languagesForPaths(paths: string[]): ImplementationLanguage[] {
	return Array.from(
		new Set(
			paths
				.map((path) => classifyImplementationArtifact(path).language)
				.filter((language) => language !== "unknown"),
		),
	).sort((left, right) => left.localeCompare(right));
}

function packRunSummary(
	pack: LanguageReviewPack,
	report: ImplementationEvidenceReportInput | undefined,
): LanguageReviewPackRunSummary {
	const checks = report?.checks || [];
	const diagnostics = report?.diagnostics || [];
	return {
		id: pack.id,
		label: pack.label,
		status: packRunStatus(checks.map((check) => check.status)),
		changedPaths: report?.changedPaths || [],
		checkCount: checks.length,
		diagnosticCount: diagnostics.length,
		...(checks[0]?.summary ? { summary: checks[0].summary } : {}),
	};
}

function packRunStatus(statuses: string[]): LanguageReviewPackRunStatus {
	if (statuses.includes("blocked")) return "blocked";
	if (statuses.includes("fail")) return "fail";
	if (statuses.includes("not-run")) return "not-run";
	if (statuses.includes("pass")) return "pass";
	return "no-evidence";
}

function languagePathsForPack(
	pack: LanguageReviewPack,
	paths: string[],
): string[] {
	return paths.filter((path) =>
		pack.languages.includes(classifyImplementationArtifact(path).language),
	);
}

function sourceForPack(pack: LanguageReviewPack) {
	return {
		id: pack.id,
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		...(pack.languages.length === 1 ? { language: pack.languages[0] } : {}),
		summary: pack.label,
	};
}
