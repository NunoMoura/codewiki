import type { CheckResult } from "../../loops/implementation/types.ts";
import {
	classifyImplementationArtifact,
	type ImplementationArtifactClassification,
	type ImplementationLanguage,
} from "./artifacts.ts";

export type ImplementationReviewPhase = "fast" | "exit";
export type ImplementationReviewLayer = "common" | "language-specific";
export type ImplementationReviewSourceKind =
	| "common"
	| "language-pack"
	| "tool"
	| "manual";

export type ImplementationDiagnosticSeverity =
	| "error"
	| "warning"
	| "info"
	| "hint";

export type ImplementationEvidenceLinkKind =
	| "acceptance"
	| "check"
	| "diagnostic"
	| "symbol"
	| "dependency"
	| "content-proof"
	| "manual";

export interface ImplementationReviewSource {
	id: string;
	kind: ImplementationReviewSourceKind;
	layer: ImplementationReviewLayer;
	language?: ImplementationLanguage;
	adapterId?: string;
	version?: string;
	summary?: string;
}

export interface ImplementationDiagnosticRange {
	startLine?: number;
	startColumn?: number;
	endLine?: number;
	endColumn?: number;
}

export interface ImplementationDiagnostic {
	id?: string;
	path: string;
	severity: ImplementationDiagnosticSeverity;
	message: string;
	sourceId?: string;
	ruleId?: string;
	language?: ImplementationLanguage;
	range?: ImplementationDiagnosticRange;
	evidenceRefs?: string[];
	tags?: string[];
}

export interface ImplementationChangedSymbol {
	name: string;
	path: string;
	kind?: string;
	language?: ImplementationLanguage;
	exported?: boolean;
	changeKind?: "added" | "changed" | "removed" | string;
	evidenceRefs?: string[];
}

export interface ImplementationDependencyEdge {
	from: string;
	to: string;
	kind?: string;
	language?: ImplementationLanguage;
	evidenceRefs?: string[];
}

export interface ImplementationEvidenceLink {
	kind: ImplementationEvidenceLinkKind;
	targetRef: string;
	evidenceRefs: string[];
	criterionId?: string;
	summary?: string;
	sourceId?: string;
}

export interface ImplementationEvidenceReportInput {
	id?: string;
	phase?: ImplementationReviewPhase;
	sources?: ImplementationReviewSource[];
	languages?: ImplementationLanguage[];
	changedPaths?: string[];
	artifactClassifications?: ImplementationArtifactClassification[];
	checks?: CheckResult[];
	diagnostics?: ImplementationDiagnostic[];
	symbols?: ImplementationChangedSymbol[];
	dependencyEdges?: ImplementationDependencyEdge[];
	evidenceLinks?: ImplementationEvidenceLink[];
	createdAt?: string;
	metadata?: Record<string, unknown>;
}

export interface ImplementationEvidenceReport {
	id?: string;
	phase: ImplementationReviewPhase;
	sources: ImplementationReviewSource[];
	languages: ImplementationLanguage[];
	changedPaths: string[];
	artifactClassifications: ImplementationArtifactClassification[];
	checks: CheckResult[];
	diagnostics: ImplementationDiagnostic[];
	symbols: ImplementationChangedSymbol[];
	dependencyEdges: ImplementationDependencyEdge[];
	evidenceLinks: ImplementationEvidenceLink[];
	createdAt?: string;
	metadata: Record<string, unknown>;
}

export function createImplementationEvidenceReport(
	input: ImplementationEvidenceReportInput = {},
): ImplementationEvidenceReport {
	const changedPaths = uniqueStrings(input.changedPaths || []);
	const artifactClassifications = normalizeArtifactClassifications(
		changedPaths,
		input.artifactClassifications || [],
	);
	const diagnostics = normalizeDiagnostics(input.diagnostics || []);
	const symbols = normalizeSymbols(input.symbols || []);
	const dependencyEdges = normalizeDependencyEdges(input.dependencyEdges || []);
	const evidenceLinks = normalizeEvidenceLinks(input.evidenceLinks || []);
	const languages = normalizeLanguages([
		...(input.languages || []),
		...artifactClassifications.map((artifact) => artifact.language),
		...diagnostics.map((diagnostic) => diagnostic.language),
		...symbols.map((symbol) => symbol.language),
		...dependencyEdges.map((edge) => edge.language),
		...((input.sources || []).map((source) => source.language) || []),
	]);
	return {
		...(input.id ? { id: input.id } : {}),
		phase: input.phase || "exit",
		sources: normalizeSources(input.sources || []),
		languages,
		changedPaths,
		artifactClassifications,
		checks: normalizeChecks(input.checks || []),
		diagnostics,
		symbols,
		dependencyEdges,
		evidenceLinks,
		...(input.createdAt ? { createdAt: input.createdAt } : {}),
		metadata: { ...(input.metadata || {}) },
	};
}

export function mergeImplementationEvidenceReports(
	reports: ImplementationEvidenceReportInput[],
	overrides: ImplementationEvidenceReportInput = {},
): ImplementationEvidenceReport {
	return createImplementationEvidenceReport({
		...overrides,
		sources: [
			...reports.flatMap((report) => report.sources || []),
			...(overrides.sources || []),
		],
		languages: [
			...reports.flatMap((report) => report.languages || []),
			...(overrides.languages || []),
		],
		changedPaths: [
			...reports.flatMap((report) => report.changedPaths || []),
			...(overrides.changedPaths || []),
		],
		artifactClassifications: [
			...reports.flatMap((report) => report.artifactClassifications || []),
			...(overrides.artifactClassifications || []),
		],
		checks: [
			...reports.flatMap((report) => report.checks || []),
			...(overrides.checks || []),
		],
		diagnostics: [
			...reports.flatMap((report) => report.diagnostics || []),
			...(overrides.diagnostics || []),
		],
		symbols: [
			...reports.flatMap((report) => report.symbols || []),
			...(overrides.symbols || []),
		],
		dependencyEdges: [
			...reports.flatMap((report) => report.dependencyEdges || []),
			...(overrides.dependencyEdges || []),
		],
		evidenceLinks: [
			...reports.flatMap((report) => report.evidenceLinks || []),
			...(overrides.evidenceLinks || []),
		],
		metadata: Object.assign(
			{},
			...reports.map((report) => report.metadata || {}),
			overrides.metadata || {},
		),
	});
}

export function blockingDiagnostics(
	report: ImplementationEvidenceReport,
): ImplementationDiagnostic[] {
	return report.diagnostics.filter(
		(diagnostic) => diagnostic.severity === "error",
	);
}

export function evidenceRefsForReport(
	report: ImplementationEvidenceReport,
): string[] {
	return uniqueStrings([
		...report.changedPaths,
		...report.checks.map((check) => check.outputRef),
		...report.diagnostics.flatMap(
			(diagnostic) => diagnostic.evidenceRefs || [],
		),
		...report.symbols.flatMap((symbol) => symbol.evidenceRefs || []),
		...report.dependencyEdges.flatMap((edge) => edge.evidenceRefs || []),
		...report.evidenceLinks.flatMap((link) => [
			link.targetRef,
			...link.evidenceRefs,
		]),
	]);
}

function normalizeArtifactClassifications(
	changedPaths: string[],
	explicit: ImplementationArtifactClassification[],
): ImplementationArtifactClassification[] {
	const byPath = new Map(
		explicit.map((classification) => [classification.path, classification]),
	);
	for (const path of changedPaths) {
		if (!byPath.has(path)) {
			byPath.set(path, classifyImplementationArtifact(path));
		}
	}
	return [...byPath.values()].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
}

function normalizeSources(
	sources: ImplementationReviewSource[],
): ImplementationReviewSource[] {
	const byId = new Map<string, ImplementationReviewSource>();
	for (const source of sources) {
		const id = source.id.trim();
		if (!id) continue;
		byId.set(id, { ...source, id });
	}
	return [...byId.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
}

function normalizeChecks(checks: CheckResult[]): CheckResult[] {
	const byKey = new Map<string, CheckResult>();
	for (const check of checks) {
		const command = check.command.trim();
		if (!command) continue;
		const key = [command, check.phase || "", check.criterionId || ""].join(
			"\0",
		);
		byKey.set(key, { ...check, command });
	}
	return [...byKey.values()];
}

function normalizeDiagnostics(
	diagnostics: ImplementationDiagnostic[],
): ImplementationDiagnostic[] {
	const byKey = new Map<string, ImplementationDiagnostic>();
	for (const diagnostic of diagnostics) {
		const path = diagnostic.path.trim();
		const message = diagnostic.message.trim();
		if (!path || !message) continue;
		const normalized = {
			...diagnostic,
			path,
			message,
			severity: normalizeSeverity(diagnostic.severity),
			language:
				diagnostic.language || classifyImplementationArtifact(path).language,
			evidenceRefs: uniqueStrings(diagnostic.evidenceRefs || []),
			tags: uniqueStrings(diagnostic.tags || []),
		};
		const key = [
			normalized.id || "",
			normalized.path,
			normalized.ruleId || "",
			normalized.message,
		].join("\0");
		byKey.set(key, normalized);
	}
	return [...byKey.values()];
}

function normalizeSymbols(
	symbols: ImplementationChangedSymbol[],
): ImplementationChangedSymbol[] {
	const byKey = new Map<string, ImplementationChangedSymbol>();
	for (const symbol of symbols) {
		const path = symbol.path.trim();
		const name = symbol.name.trim();
		if (!path || !name) continue;
		const normalized = {
			...symbol,
			name,
			path,
			language:
				symbol.language || classifyImplementationArtifact(path).language,
			evidenceRefs: uniqueStrings(symbol.evidenceRefs || []),
		};
		byKey.set(
			[normalized.path, normalized.name, normalized.kind || ""].join("\0"),
			normalized,
		);
	}
	return [...byKey.values()];
}

function normalizeDependencyEdges(
	edges: ImplementationDependencyEdge[],
): ImplementationDependencyEdge[] {
	const byKey = new Map<string, ImplementationDependencyEdge>();
	for (const edge of edges) {
		const from = edge.from.trim();
		const to = edge.to.trim();
		if (!from || !to) continue;
		const normalized = {
			...edge,
			from,
			to,
			language: edge.language || classifyImplementationArtifact(from).language,
			evidenceRefs: uniqueStrings(edge.evidenceRefs || []),
		};
		byKey.set(
			[normalized.from, normalized.to, normalized.kind || ""].join("\0"),
			normalized,
		);
	}
	return [...byKey.values()];
}

function normalizeEvidenceLinks(
	links: ImplementationEvidenceLink[],
): ImplementationEvidenceLink[] {
	const byKey = new Map<string, ImplementationEvidenceLink>();
	for (const link of links) {
		const targetRef = link.targetRef.trim();
		const evidenceRefs = uniqueStrings(link.evidenceRefs || []);
		if (!targetRef || evidenceRefs.length === 0) continue;
		const normalized = {
			...link,
			targetRef,
			evidenceRefs,
		};
		byKey.set(
			[
				normalized.kind,
				normalized.targetRef,
				normalized.criterionId || "",
			].join("\0"),
			normalized,
		);
	}
	return [...byKey.values()];
}

function normalizeSeverity(
	severity: ImplementationDiagnosticSeverity,
): ImplementationDiagnosticSeverity {
	return ["error", "warning", "info", "hint"].includes(severity)
		? severity
		: "warning";
}

function normalizeLanguages(
	languages: (ImplementationLanguage | undefined)[],
): ImplementationLanguage[] {
	const concrete = uniqueStrings(
		languages.filter((language): language is ImplementationLanguage =>
			Boolean(language && language !== "unknown"),
		),
	) as ImplementationLanguage[];
	return concrete.sort((left, right) => left.localeCompare(right));
}

function uniqueStrings(values: (string | undefined)[]): string[] {
	return Array.from(
		new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
	);
}
