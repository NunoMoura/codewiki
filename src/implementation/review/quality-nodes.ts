import {
	blockingDiagnostics,
	type ImplementationEvidenceReport,
	type ImplementationEvidenceLink,
} from "./evidence-report.ts";

export type CommonReviewQualityCode =
	| "review_blocking_diagnostic"
	| "review_missing_acceptance_evidence_link"
	| "review_irrelevant_check";

export interface CommonReviewAcceptanceRequirement {
	planningRef: string;
	criterionId: string;
	text?: string;
}

export interface CommonReviewQualityFinding {
	code: CommonReviewQualityCode;
	severity: "block" | "warn";
	message: string;
	planningRef?: string;
	criterionId?: string;
	path?: string;
	evidenceRefs: string[];
}

export interface CommonReviewEvidenceEvaluationInput {
	report: ImplementationEvidenceReport;
	acceptanceRequirements?: CommonReviewAcceptanceRequirement[];
	requireRelevantChecks?: boolean;
}

export interface CommonReviewEvidenceEvaluation {
	passed: boolean;
	score: number;
	findings: CommonReviewQualityFinding[];
}

export function evaluateCommonReviewEvidence(
	input: CommonReviewEvidenceEvaluationInput,
): CommonReviewEvidenceEvaluation {
	const findings = [
		...blockingDiagnosticFindings(input.report),
		...missingAcceptanceEvidenceLinkFindings(
			input.report.evidenceLinks,
			input.acceptanceRequirements || [],
		),
		...(input.requireRelevantChecks
			? irrelevantCheckFindings(input.report)
			: []),
	];
	const blocking = findings.filter((finding) => finding.severity === "block");
	return {
		passed: blocking.length === 0,
		score: commonReviewScore(findings),
		findings,
	};
}

function blockingDiagnosticFindings(
	report: ImplementationEvidenceReport,
): CommonReviewQualityFinding[] {
	return blockingDiagnostics(report).map((diagnostic) => ({
		code: "review_blocking_diagnostic" as const,
		severity: "block" as const,
		message: diagnostic.ruleId
			? `${diagnostic.path} has blocking diagnostic ${diagnostic.ruleId}: ${diagnostic.message}`
			: `${diagnostic.path} has blocking diagnostic: ${diagnostic.message}`,
		path: diagnostic.path,
		evidenceRefs: diagnostic.evidenceRefs?.length
			? diagnostic.evidenceRefs
			: [diagnostic.path],
	}));
}

function missingAcceptanceEvidenceLinkFindings(
	links: ImplementationEvidenceLink[],
	requirements: CommonReviewAcceptanceRequirement[],
): CommonReviewQualityFinding[] {
	return requirements.flatMap((requirement) => {
		const covered = links.some(
			(link) =>
				link.kind === "acceptance" &&
				link.targetRef === requirement.planningRef &&
				link.criterionId === requirement.criterionId &&
				link.evidenceRefs.length > 0,
		);
		if (covered) return [];
		return [
			{
				code: "review_missing_acceptance_evidence_link" as const,
				severity: "block" as const,
				planningRef: requirement.planningRef,
				criterionId: requirement.criterionId,
				message: `Review evidence does not link acceptance criterion ${requirement.criterionId} for ${requirement.planningRef} to concrete evidence.`,
				evidenceRefs: [requirement.planningRef],
			},
		];
	});
}

function irrelevantCheckFindings(
	report: ImplementationEvidenceReport,
): CommonReviewQualityFinding[] {
	const refs = new Set([
		...report.changedPaths,
		...report.diagnostics.flatMap(
			(diagnostic) => diagnostic.evidenceRefs || [],
		),
		...report.symbols.flatMap((symbol) => symbol.evidenceRefs || []),
		...report.dependencyEdges.flatMap((edge) => edge.evidenceRefs || []),
		...report.evidenceLinks.flatMap((link) => link.evidenceRefs),
	]);
	return report.checks.flatMap((check) => {
		if (check.status !== "pass") return [];
		if (check.outputRef && refs.has(check.outputRef)) return [];
		return [
			{
				code: "review_irrelevant_check" as const,
				severity: "warn" as const,
				message: `Passing check ${check.command} has no linked output evidence in the review report.`,
				evidenceRefs: check.outputRef ? [check.outputRef] : [],
			},
		];
	});
}

function commonReviewScore(findings: CommonReviewQualityFinding[]): number {
	const blockCount = findings.filter(
		(finding) => finding.severity === "block",
	).length;
	const warnCount = findings.filter(
		(finding) => finding.severity === "warn",
	).length;
	return Math.max(0, 100 - blockCount * 30 - warnCount * 10);
}
