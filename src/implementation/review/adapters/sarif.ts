import type { ImplementationLanguage } from "../artifacts.ts";
import type {
	ImplementationDiagnostic,
	ImplementationEvidenceReport,
	ImplementationReviewPhase,
} from "../evidence-report.ts";
import { createImplementationEvidenceReport } from "../evidence-report.ts";

export interface SarifEvidenceOptions {
	sourceId: string;
	phase?: ImplementationReviewPhase;
	language?: ImplementationLanguage;
	changedPaths?: string[];
}

export function createSarifEvidenceReport(
	sarifJson: string | Record<string, unknown>,
	options: SarifEvidenceOptions,
): ImplementationEvidenceReport {
	return createImplementationEvidenceReport({
		phase: options.phase || "exit",
		sources: [
			{
				id: options.sourceId,
				kind: "tool",
				layer: options.language ? "language-specific" : "common",
				...(options.language ? { language: options.language } : {}),
				summary: "SARIF diagnostic source.",
			},
		],
		changedPaths: options.changedPaths,
		diagnostics: sarifDiagnosticsFromJson(sarifJson, options),
	});
}

export function sarifDiagnosticsFromJson(
	sarifJson: string | Record<string, unknown>,
	options: SarifEvidenceOptions,
): ImplementationDiagnostic[] {
	const root =
		typeof sarifJson === "string" ? safeJsonParse(sarifJson) : sarifJson;
	return arrayOfRecords(root.runs).flatMap((run) =>
		arrayOfRecords(run.results).flatMap((result) => {
			const location = arrayOfRecords(result.locations).at(0);
			const physical = record(location?.physicalLocation);
			const artifact = record(physical.artifactLocation);
			const region = record(physical.region);
			const path = text(artifact.uri);
			const message = text(record(result.message).text || result.message);
			if (!path || !message) return [];
			return [
				{
					path,
					severity: severityFromSarifLevel(text(result.level)),
					message,
					sourceId: options.sourceId,
					ruleId: text(result.ruleId) || undefined,
					language: options.language,
					range: {
						...optionalNumberField("startLine", region.startLine),
						...optionalNumberField("startColumn", region.startColumn),
						...optionalNumberField("endLine", region.endLine),
						...optionalNumberField("endColumn", region.endColumn),
					},
				},
			];
		}),
	);
}

function safeJsonParse(value: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(value);
		return record(parsed);
	} catch {
		return {};
	}
}

function severityFromSarifLevel(
	level: string,
): ImplementationDiagnostic["severity"] {
	switch (level) {
		case "error":
			return "error";
		case "warning":
			return "warning";
		case "note":
			return "info";
		default:
			return "info";
	}
}

function optionalNumberField(
	key: string,
	value: unknown,
): Record<string, number> {
	return typeof value === "number" ? { [key]: value } : {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
