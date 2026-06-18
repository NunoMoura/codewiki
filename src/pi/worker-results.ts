import type { ImplementationChangeInput } from "../implementation/types.ts";
import type {
	ImplementationWorkerBlockerInput,
	ImplementationWorkerResultInput,
} from "../implementation/workers.ts";
import type { PiWorkerDispatchResult } from "./dispatcher.ts";

export interface PiWorkerCompletionInput {
	dispatch: PiWorkerDispatchResult;
	output?: unknown;
	error?: unknown;
}

interface ParsedCompletionOutput {
	data: Record<string, unknown>;
	parseError?: string;
}

const WORKER_REPORT_FENCE =
	/```[ \t]*(?:codewiki-worker-report|json[ \t]+codewiki-worker-report)[^\n]*\n([\s\S]*?)\n?```/gi;

export function collectPiWorkerResults(
	inputs: PiWorkerCompletionInput[],
): ImplementationWorkerResultInput[] {
	return inputs.map(normalizePiWorkerCompletion);
}

export function normalizePiWorkerCompletion(
	input: PiWorkerCompletionInput,
): ImplementationWorkerResultInput {
	const parsed = parseCompletionOutput(input.output);
	const data = parsed.data;
	const status = completionStatus(input, parsed);
	return guardEmptyCompletedWorkerEvidence({
		workerId: input.dispatch.workerId,
		workUnitId: input.dispatch.workUnitId,
		planningRefs: completionPlanningRefs(input, data),
		status,
		...(input.dispatch.claimId || text(data.claimId ?? data.claim_id)
			? {
					claimId:
						input.dispatch.claimId || text(data.claimId ?? data.claim_id),
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
	result: ImplementationWorkerResultInput,
): ImplementationWorkerResultInput {
	if (result.status !== "completed" || hasImplementationEvidence(result)) {
		return result;
	}
	return {
		...result,
		status: "failed",
		message: [
			"completion_guard: completed worker produced no implementation evidence.",
			result.message,
		]
			.filter(Boolean)
			.join(" "),
	};
}

function hasImplementationEvidence(
	result: ImplementationWorkerResultInput,
): boolean {
	return [
		result.changedFiles,
		result.changed_files,
		result.checksRun,
		result.checks_run,
		result.changeInputs,
		result.change_inputs,
		result.refs,
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
	input: PiWorkerCompletionInput,
	parsed: ParsedCompletionOutput,
): ImplementationWorkerResultInput["status"] {
	if (input.error || input.dispatch.status === "failed" || parsed.parseError) {
		return "failed";
	}
	const status = text(parsed.data.status).toLowerCase();
	if (["completed", "blocked", "failed"].includes(status)) {
		return status as ImplementationWorkerResultInput["status"];
	}
	return "completed";
}

function completionPlanningRefs(
	input: PiWorkerCompletionInput,
	data: Record<string, unknown>,
): string[] {
	const refs = unique([
		...stringList(data.planningRefs),
		...stringList(data.planning_refs),
		text(data.workUnitRef ?? data.work_unit_ref),
	]);
	return refs.length > 0 ? refs : [...input.dispatch.planningRefs];
}

function completionSession(
	input: PiWorkerCompletionInput,
	data: Record<string, unknown>,
): Partial<ImplementationWorkerResultInput> {
	return {
		...optionalTextField(
			"sessionId",
			data.sessionId ?? data.session_id ?? input.dispatch.sessionId,
		),
		...optionalTextField(
			"sessionFile",
			data.sessionFile ?? data.session_file ?? input.dispatch.sessionFile,
		),
	};
}

function completionMessage(
	input: PiWorkerCompletionInput,
	data: Record<string, unknown>,
	parsed: ParsedCompletionOutput,
): Partial<ImplementationWorkerResultInput> {
	const message = [
		parsed.parseError,
		text(data.message ?? data.summary),
		text(data.notes),
		...stringList(data.residualRisks),
		...stringList(data.residual_risks),
		...objectList<ImplementationWorkerBlockerInput>(data.blockers).map(
			(blocker) => text(blocker.message),
		),
		input.dispatch.error,
		errorMessage(input.error),
	]
		.filter(Boolean)
		.join(" ");
	return message ? { message } : {};
}

function completionRefs(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerResultInput> {
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
): Partial<ImplementationWorkerResultInput> {
	const changeInputs = [
		...objectList<ImplementationChangeInput>(data.changeInputs),
		...objectList<ImplementationChangeInput>(data.change_inputs),
		...objectList<ImplementationChangeInput>(data.changes),
	];
	return changeInputs.length > 0 ? { changeInputs } : {};
}

function completionProof(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerResultInput> {
	return {
		...optionalObjectField(
			"proof",
			data.proof ?? data.workerProof ?? data.worker_proof,
		),
		...optionalTextField("baseSha", data.baseSha ?? data.base_sha),
		...optionalTextField("headSha", data.headSha ?? data.head_sha),
		...optionalTextField("treeSha", data.treeSha ?? data.tree_sha),
		...optionalTextField(
			"workingTreeDigest",
			data.workingTreeDigest ?? data.working_tree_digest,
		),
		...optionalListField(
			"changedFiles",
			data.changedFiles ?? data.changed_files,
		),
		...optionalListField("checksRun", data.checksRun ?? data.checks_run),
		...optionalTextField(
			"validationVerdict",
			data.validationVerdict ?? data.validation_verdict,
		),
		...optionalTextField(
			"validationRef",
			data.validationRef ?? data.validation_ref,
		),
		...optionalTextField("buildRef", data.buildRef ?? data.build_ref),
		...optionalTextField("patchRef", data.patchRef ?? data.patch_ref),
	};
}

function completionBlockers(
	data: Record<string, unknown>,
): Partial<ImplementationWorkerResultInput> {
	const blockers = objectList<ImplementationWorkerBlockerInput>(data.blockers);
	return blockers.length > 0 ? { blockers } : {};
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

function optionalObjectField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, Record<string, unknown>>> {
	const output = objectRecord(value);
	return Object.keys(output).length > 0
		? ({ [key]: output } as Partial<Record<Key, Record<string, unknown>>>)
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
