import { readFile } from "node:fs/promises";
import type { ChangeIntakeContent } from "../../changes/intake/contracts.ts";
import { normalizeChangeIntakeContent } from "../../changes/intake/normalize.ts";
import type { ImplementationChangeInput } from "../../loops/implementation/types.ts";
import type { ImplementationWorkerProofInput } from "../../loops/implementation/worker-proof.ts";
import type {ProducerSkillReceipt} from "../../execution/ports.ts";
import type {
	ImplementationWorkerBlockerInput,
	ImplementationWorkerReportInput,
} from "../../loops/implementation/workers.ts";

export interface WorkerExecutionObservation {
	workUnitId: string;
	workerId: string;
	traceId: string;
	planningRefs: string[];
	claimId?: string;
	producerSkillReceipt?: ProducerSkillReceipt;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	status: "started" | "failed" | "cancelled";
	error?: string;
}

export interface WorkerCompletionInput {
	worker: WorkerExecutionObservation;
	output?: unknown;
	error?: unknown;
}

interface ParsedCompletionOutput {
	data: Record<string, unknown>;
	parseError?: string;
}

const WORKER_REPORT_FENCE =
	/```[ \t]*(?:codewiki-worker-report|json[ \t]+codewiki-worker-report)[^\n]*\n([\s\S]*?)\n?```/gi;

export async function collectWorkerOutputFiles(
	workers: WorkerExecutionObservation[],
): Promise<WorkerCompletionInput[]> {
	return Promise.all(workers.map(collectWorkerOutputFile));
}

export function collectWorkerReports(
	inputs: WorkerCompletionInput[],
): ImplementationWorkerReportInput[] {
	return inputs.map(normalizeWorkerCompletion);
}

export function collectWorkerDiscoveries(
	inputs: WorkerCompletionInput[],
): readonly ChangeIntakeContent[] {
	const discoveries: ChangeIntakeContent[] = [];
	for (const input of inputs) {
		const value = parseCompletionOutput(input.output).data.discoveries;
		if (value === undefined) continue;
		if (!Array.isArray(value) || value.length > 16) {
			throw new Error("Worker completion may contain at most 16 discoveries.");
		}
		for (const discovery of value) {
			discoveries.push(normalizeChangeIntakeContent(discovery));
		}
	}
	return Object.freeze(discoveries);
}

async function collectWorkerOutputFile(
	worker: WorkerExecutionObservation,
): Promise<WorkerCompletionInput> {
	if (!worker.outputFile) {
		return {
			worker,
			error: `Worker completion output file is missing for worker ${worker.workerId}.`,
		};
	}
	try {
		return {
			worker,
			output: await readFile(worker.outputFile, "utf8"),
		};
	} catch (error) {
		return {
			worker,
			error: `Worker completion output file is unreadable: ${worker.outputFile}: ${errorMessage(error)}`,
		};
	}
}

export function normalizeWorkerCompletion(
	input: WorkerCompletionInput,
): ImplementationWorkerReportInput {
	const parsed = parseCompletionOutput(input.output);
	const data = parsed.data;
	const status = completionStatus(input, parsed);
	return guardEmptyCompletedWorkerEvidence({
		workerId: input.worker.workerId,
		workUnitId: input.worker.workUnitId,
		planningRefs: completionPlanningRefs(input, data),
		status,
		...(input.worker.claimId || text(data.claimId ?? data.claim_id)
			? {
					claimId: input.worker.claimId || text(data.claimId ?? data.claim_id),
				}
			: {}),
		...completionSession(input, data),
		...completionMessage(input, data, parsed),
		...completionRefs(data),
		...completionChanges(data),
		...completionProof(data),
		...completionBlockers(data),
	});
}

function guardEmptyCompletedWorkerEvidence(
	report: ImplementationWorkerReportInput,
): ImplementationWorkerReportInput {
	if (report.status !== "completed" || hasImplementationEvidence(report)) {
		return report;
	}
	return {
		...report,
		status: "failed",
		message: [
			"completion_guard: completed worker produced no implementation evidence.",
			report.message,
		]
			.filter(Boolean)
			.join(" "),
	};
}

function hasImplementationEvidence(
	report: ImplementationWorkerReportInput,
): boolean {
	return [
		report.proof?.changedPaths,
		report.proof?.checks,
		report.proof?.checksRun,
		report.changeInputs,
		report.refs,
	].some((items) => Array.isArray(items) && items.length > 0);
}

function parseCompletionOutput(output: unknown): ParsedCompletionOutput {
	if (typeof output === "string") return parseCompletionText(output);
	return { data: objectRecord(output) };
}

function parseCompletionText(output: string): ParsedCompletionOutput {
	const trimmed = output.trim();
	if (!trimmed) return { data: {} };
	const parsedJson = parseJsonObject(trimmed);
	if (parsedJson) return { data: parsedJson };
	const reportMatches = [...trimmed.matchAll(WORKER_REPORT_FENCE)];
	if (reportMatches.length === 0 || !reportMatches[0]?.[1]) {
		return {
			data: { message: trimmed },
			parseError:
				"Worker completion output is missing a codewiki-worker-report block.",
		};
	}
	if (reportMatches.length > 1) {
		return {
			data: { message: trimmed },
			parseError:
				"Worker completion output contains multiple codewiki-worker-report blocks.",
		};
	}
	const report = parseJsonObject(reportMatches[0][1].trim());
	if (!report) {
		return {
			data: { message: trimmed },
			parseError: "Worker codewiki-worker-report is not valid JSON.",
		};
	}
	return { data: report };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(value);
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

function completionStatus(
	input: WorkerCompletionInput,
	parsed: ParsedCompletionOutput,
): ImplementationWorkerReportInput["status"] {
	if (input.worker.status === "cancelled") return "cancelled";
	if (input.error || input.worker.status === "failed" || parsed.parseError) {
		return "failed";
	}
	const status = text(parsed.data.status).toLowerCase();
	if (isWorkerStatus(status)) return status;
	return status ? "failed" : "completed";
}

function completionPlanningRefs(
	input: WorkerCompletionInput,
	data: Record<string, unknown>,
): string[] {
	const refs = unique([
		...stringList(data.planningRefs),
		...stringList(data.planning_refs),
		text(data.workUnitRef ?? data.work_unit_ref),
	]);
	return refs.length > 0 ? refs : [...input.worker.planningRefs];
}

function completionSession(
	input: WorkerCompletionInput,
	data: Record<string, unknown>,
): Partial<ImplementationWorkerReportInput> {
	return {
		...optionalTextField(
			"sessionId",
			data.sessionId ?? data.session_id ?? input.worker.sessionId,
		),
		...optionalTextField(
			"sessionFile",
			data.sessionFile ?? data.session_file ?? input.worker.sessionFile,
		),
	};
}

function completionMessage(
	input: WorkerCompletionInput,
	data: Record<string, unknown>,
	parsed: ParsedCompletionOutput,
): Partial<ImplementationWorkerReportInput> {
	const message = [
		parsed.parseError,
		invalidStatusMessage(data.status),
		text(data.message ?? data.summary),
		text(data.notes),
		...stringList(data.residualRisks),
		...stringList(data.residual_risks),
		...objectList<ImplementationWorkerBlockerInput>(data.blockers).map(
			(blocker) => text(blocker.message),
		),
		input.worker.error,
		errorMessage(input.error),
	]
		.filter(Boolean)
		.join(" ");
	return message ? { message } : {};
}

function completionRefs(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerReportInput> {
	const refs = unique([
		...stringList(data.refs),
		...stringList(data.references),
		...stringList(data.contentProofRefs),
		...stringList(data.content_proof_refs),
		...stringList(data.proofRefs),
		...stringList(data.proof_refs),
	]);
	return refs.length > 0 ? { refs } : {};
}

function completionChanges(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerReportInput> {
	const changeInputs = [
		...objectList<ImplementationChangeInput>(data.changeInputs),
		...objectList<ImplementationChangeInput>(data.change_inputs),
		...objectList<ImplementationChangeInput>(data.changes),
	];
	return changeInputs.length > 0 ? { changeInputs } : {};
}

function completionProof(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerReportInput> {
	const nested = objectRecord(data.proof ?? data.workerProof ?? data.worker_proof);
	const source = { ...data, ...nested };
	const proof: ImplementationWorkerProofInput = {
		...optionalTextField("baseSha", source.baseSha ?? source.base_sha),
		...optionalTextField("headSha", source.headSha ?? source.head_sha),
		...optionalTextField("treeSha", source.treeSha ?? source.tree_sha),
		...optionalTextField(
			"workingTreeDigest",
			source.workingTreeDigest ?? source.working_tree_digest,
		),
		...optionalTextField(
			"worktreePath",
			source.worktreePath ?? source.worktree_path,
		),
		...optionalTextField("branch", source.branch),
		...optionalListField(
			"changedPaths",
			source.changedPaths ??
				source.changed_paths ??
				source.changedFiles ??
				source.changed_files,
		),
		...optionalListField(
			"checksRun",
			source.checksRun ?? source.checks_run,
		),
		...optionalTextField(
			"validationVerdict",
			source.validationVerdict ?? source.validation_verdict,
		),
		...optionalTextField(
			"validationRef",
			source.validationRef ?? source.validation_ref,
		),
		...optionalTextField("buildRef", source.buildRef ?? source.build_ref),
		...optionalTextField("patchRef", source.patchRef ?? source.patch_ref),
		...(typeof source.clean === "boolean" ? { clean: source.clean } : {}),
	};
	return Object.keys(proof).length > 0 ? { proof } : {};
}

function completionBlockers(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerReportInput> {
	const blockers = objectList<ImplementationWorkerBlockerInput>(data.blockers);
	return blockers.length > 0 ? { blockers } : {};
}

function invalidStatusMessage(value: unknown): string {
	const original = text(value);
	const status = original.toLowerCase();
	return status && !isWorkerStatus(status)
		? `Worker completion status "${original}" is invalid.`
		: "";
}

function isWorkerStatus(
	status: string,
): status is "completed" | "blocked" | "failed" | "cancelled" {
	return ["completed", "blocked", "failed", "cancelled"].includes(status);
}

function optionalTextField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string>> {
	const output = text(value);
	return output ? ({ [key]: output } as Partial<Record<Key, string>>) : {};
}

function optionalListField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string[]>> {
	const output = stringList(value);
	return output.length > 0
		? ({ [key]: output } as Partial<Record<Key, string[]>>)
		: {};
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList<T>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function errorMessage(error: unknown): string {
	if (!error) return "";
	return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
