import {
	classifyImplementationArtifact,
	type ImplementationArtifactClassification,
} from "./artifacts.ts";
import {
	blockingDiagnostics,
	createImplementationEvidenceReport,
	type ImplementationDiagnostic,
	type ImplementationEvidenceReport,
	type ImplementationEvidenceReportInput,
} from "./evidence-report.ts";

export type FastFeedbackStatus = "pass" | "warn" | "block";
export type FastFeedbackFindingKind =
	| "path-scope"
	| "forbidden-path"
	| "secret-like-content"
	| "blocking-diagnostic"
	| "artifact-routing";

export interface FastFeedbackFinding {
	id: string;
	kind: FastFeedbackFindingKind;
	status: FastFeedbackStatus;
	message: string;
	path?: string;
	repair?: string;
	evidenceRefs?: string[];
}

export interface FastFeedbackInput {
	changedPaths: string[];
	pathScopes?: string[];
	forbiddenPathPatterns?: RegExp[];
	contentByPath?: Record<string, string>;
	evidenceReport?: ImplementationEvidenceReportInput;
}

export interface FastFeedbackResult {
	status: FastFeedbackStatus;
	findings: FastFeedbackFinding[];
	artifactClassifications: ImplementationArtifactClassification[];
	evidenceReport: ImplementationEvidenceReport;
}

const defaultForbiddenPathPatterns = [
	/(^|\/)node_modules\//,
	/(^|\/)(dist|build|coverage|out)\//,
	/(^|\/)vendor\//,
];

const secretLikePattern =
	/(api[_-]?key|secret|token|credential|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i;

export function runCommonFastFeedback(
	input: FastFeedbackInput,
): FastFeedbackResult {
	const changedPaths = uniqueStrings(input.changedPaths);
	const artifactClassifications = changedPaths.map(
		classifyImplementationArtifact,
	);
	const report = createImplementationEvidenceReport({
		phase: "fast",
		changedPaths,
		artifactClassifications,
		...(input.evidenceReport || {}),
	});
	const findings = [
		...pathScopeFindings(changedPaths, input.pathScopes || []),
		...forbiddenPathFindings(
			artifactClassifications,
			input.forbiddenPathPatterns || defaultForbiddenPathPatterns,
		),
		...secretLikeContentFindings(input.contentByPath || {}),
		...blockingDiagnosticFindings(blockingDiagnostics(report)),
		...artifactRoutingFindings(artifactClassifications),
	];
	const status = aggregateFastFeedbackStatus(findings);
	return {
		status,
		findings,
		artifactClassifications,
		evidenceReport: createFastFeedbackEvidenceReport({
			changedPaths,
			artifactClassifications,
			findings,
			status,
		}),
	};
}

export function createFastFeedbackEvidenceReport(input: {
	changedPaths: string[];
	artifactClassifications: ImplementationArtifactClassification[];
	findings: FastFeedbackFinding[];
	status: FastFeedbackStatus;
	createdAt?: string;
}): ImplementationEvidenceReport {
	return createImplementationEvidenceReport({
		phase: "fast",
		createdAt: input.createdAt,
		sources: [
			{
				id: "codewiki.common-fast-feedback",
				kind: "common",
				layer: "common",
				summary: "CodeWiki common fast edit feedback.",
			},
		],
		changedPaths: input.changedPaths,
		artifactClassifications: input.artifactClassifications,
		checks: [
			{
				command: "codewiki common fast feedback",
				status: input.status === "block" ? "fail" : "pass",
				phase: "verify",
				outputRef: input.changedPaths[0],
				summary: `Common fast feedback ${input.status}.`,
			},
		],
		diagnostics: input.findings.flatMap((finding) => {
			if (!finding.path || finding.status === "pass") return [];
			return [
				{
					path: finding.path,
					severity: finding.status === "block" ? "error" : "warning",
					message: finding.message,
					sourceId: "codewiki.common-fast-feedback",
					ruleId: finding.kind,
					evidenceRefs: finding.evidenceRefs || [finding.path],
				},
			];
		}),
	});
}

export function aggregateFastFeedbackStatus(
	findings: FastFeedbackFinding[],
): FastFeedbackStatus {
	if (findings.some((finding) => finding.status === "block")) return "block";
	if (findings.some((finding) => finding.status === "warn")) return "warn";
	return "pass";
}

function pathScopeFindings(
	changedPaths: string[],
	pathScopes: string[],
): FastFeedbackFinding[] {
	const scopes = uniqueStrings(pathScopes);
	if (scopes.length === 0) return [];
	return changedPaths
		.filter((path) => !scopes.some((scope) => pathMatchesScope(path, scope)))
		.map((path) => ({
			id: `path-scope:${path}`,
			kind: "path-scope" as const,
			status: "block" as const,
			path,
			message: `${path} is outside the active Implementation work-unit path scope.`,
			repair:
				"Move the change into the planned scope or route back to planning before editing this path.",
			evidenceRefs: [path],
		}));
}

function forbiddenPathFindings(
	classifications: ImplementationArtifactClassification[],
	patterns: RegExp[],
): FastFeedbackFinding[] {
	return classifications.flatMap((classification) => {
		const forbidden =
			classification.kind === "generated" ||
			classification.kind === "vendor" ||
			patterns.some((pattern) => pattern.test(classification.path));
		if (!forbidden) return [];
		return [
			{
				id: `forbidden-path:${classification.path}`,
				kind: "forbidden-path" as const,
				status: "block" as const,
				path: classification.path,
				message: `${classification.path} is generated, vendored, or otherwise forbidden for direct agent edits.`,
				repair:
					"Edit the source artifact instead, or add an explicit planning decision that allows this path.",
				evidenceRefs: [classification.path],
			},
		];
	});
}

function secretLikeContentFindings(
	contentByPath: Record<string, string>,
): FastFeedbackFinding[] {
	return Object.entries(contentByPath).flatMap(([path, content]) => {
		if (!secretLikePattern.test(content)) return [];
		return [
			{
				id: `secret-like-content:${path}`,
				kind: "secret-like-content" as const,
				status: "block" as const,
				path,
				message: `${path} appears to contain secret-like literal content.`,
				repair:
					"Remove the literal secret and use configuration, environment, or fixture-safe placeholders.",
				evidenceRefs: [path],
			},
		];
	});
}

function blockingDiagnosticFindings(
	diagnostics: ImplementationDiagnostic[],
): FastFeedbackFinding[] {
	return diagnostics.map((diagnostic) => ({
		id: `blocking-diagnostic:${diagnostic.path}:${diagnostic.ruleId || diagnostic.message}`,
		kind: "blocking-diagnostic" as const,
		status: "block" as const,
		path: diagnostic.path,
		message: diagnostic.ruleId
			? `${diagnostic.path} has blocking diagnostic ${diagnostic.ruleId}: ${diagnostic.message}`
			: `${diagnostic.path} has blocking diagnostic: ${diagnostic.message}`,
		repair:
			"Fix the diagnostic before continuing or rerun the relevant adapter after repair.",
		evidenceRefs: diagnostic.evidenceRefs || [diagnostic.path],
	}));
}

function artifactRoutingFindings(
	classifications: ImplementationArtifactClassification[],
): FastFeedbackFinding[] {
	return classifications.flatMap((classification) => {
		if (["implementation", "none"].includes(classification.reviewOwner))
			return [];
		return [
			{
				id: `artifact-routing:${classification.path}`,
				kind: "artifact-routing" as const,
				status: "warn" as const,
				path: classification.path,
				message: `${classification.path} is owned by the ${classification.reviewOwner} loop contract, not normal code review.`,
				repair:
					"Use the owning loop contract or keep this change tied to explicit planned source-truth work.",
				evidenceRefs: [classification.path],
			},
		];
	});
}

function pathMatchesScope(path: string, scope: string): boolean {
	const normalizedPath = normalizePath(path);
	const normalizedScope = normalizePath(scope);
	return (
		normalizedPath === normalizedScope ||
		normalizedPath.startsWith(`${normalizedScope.replace(/\/$/, "")}/`)
	);
}

function normalizePath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.map(normalizePath).filter(Boolean)));
}
