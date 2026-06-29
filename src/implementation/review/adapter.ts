import type { ImplementationLanguage } from "./artifacts.ts";
import {
	createImplementationEvidenceReport,
	type ImplementationEvidenceReport,
	type ImplementationEvidenceReportInput,
	type ImplementationReviewPhase,
} from "./evidence-report.ts";

export interface ToolAvailability {
	available: boolean;
	command?: string;
	version?: string;
	reason?: string;
	installHint?: string;
}

export interface ToolAdapterRunInput {
	cwd: string;
	phase: ImplementationReviewPhase;
	changedPaths?: string[];
	timeoutMs?: number;
	signal?: AbortSignal;
	environment?: Record<string, string | undefined>;
}

export interface ToolAdapterRunResult {
	adapterId: string;
	phase: ImplementationReviewPhase;
	availability: ToolAvailability;
	report: ImplementationEvidenceReport;
	durationMs: number;
	exitCode?: number;
	stdout?: string;
	stderr?: string;
	timedOut?: boolean;
}

export interface ToolAdapter {
	id: string;
	label: string;
	languages: ImplementationLanguage[];
	phases: ImplementationReviewPhase[];
	detect(
		input: ToolAdapterRunInput,
	): ToolAvailability | Promise<ToolAvailability>;
	run(input: ToolAdapterRunInput): Promise<ToolAdapterRunResult>;
}

export function adapterSupportsPhase(
	adapter: ToolAdapter,
	phase: ImplementationReviewPhase,
): boolean {
	return adapter.phases.includes(phase);
}

export function unavailableToolResult(input: {
	adapterId: string;
	phase: ImplementationReviewPhase;
	availability: ToolAvailability;
	durationMs?: number;
	report?: ImplementationEvidenceReportInput;
}): ToolAdapterRunResult {
	return {
		adapterId: input.adapterId,
		phase: input.phase,
		availability: input.availability,
		durationMs: input.durationMs ?? 0,
		report: createImplementationEvidenceReport({
			phase: input.phase,
			...(input.report || {}),
		}),
	};
}
