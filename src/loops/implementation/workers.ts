import {
	contentProofFromWorkerProof,
	detectImplementationWorkerProofConflicts,
	normalizeImplementationWorkerProof,
	type ImplementationWorkerProof,
	type ImplementationWorkerProofConflict,
	type ImplementationWorkerProofInput,
} from "./worker-proof.ts";
import type {
	ImplementationChangeInput,
	ImplementationWorkerStatus,
	ImplementationWorkerReportSummary,
} from "./types.ts";

export interface ImplementationWorkerBlockerInput {
	message?: string;
	refs?: string[];
}

export interface ImplementationWorkerReportInput {
	workerId: string;
	workUnitId: string;
	planningRefs?: string[];
	status?: ImplementationWorkerStatus | string;
	claimId?: string;
	message?: string;
	refs?: string[];
	sessionId?: string;
	sessionFile?: string;
	changeInputs?: ImplementationChangeInput[];
	proof?: ImplementationWorkerProofInput;
	blockers?: ImplementationWorkerBlockerInput[];
}

const IMPLEMENTATION_WORKER_REPORT_FIELDS = new Set([
	"workerId",
	"workUnitId",
	"planningRefs",
	"status",
	"claimId",
	"message",
	"refs",
	"sessionId",
	"sessionFile",
	"changeInputs",
	"proof",
	"blockers",
]);

export interface ImplementationWorkerReportAggregation {
	workerReports: ImplementationWorkerReportSummary[];
	workerProofs: ImplementationWorkerProof[];
	workerProofConflicts: ImplementationWorkerProofConflict[];
	changeInputs: ImplementationChangeInput[];
	completed: ImplementationWorkerReportSummary[];
	blocked: ImplementationWorkerReportSummary[];
	failed: ImplementationWorkerReportSummary[];
}

export function aggregateImplementationWorkerReports(
	inputs: ImplementationWorkerReportInput[] = [],
): ImplementationWorkerReportAggregation {
	const workerReports = inputs.map(workerReportSummary);
	const workerProofs = workerReports.flatMap((report) =>
		report.proof ? [report.proof] : [],
	);
	return {
		workerReports,
		workerProofs,
		workerProofConflicts:
			detectImplementationWorkerProofConflicts(workerProofs),
		changeInputs: inputs.flatMap(workerChangeInputs),
		completed: workerReports.filter((report) => report.status === "completed"),
		blocked: workerReports.filter((report) => report.status === "blocked"),
		failed: workerReports.filter((report) => report.status === "failed"),
	};
}

function workerReportSummary(
	input: ImplementationWorkerReportInput,
): ImplementationWorkerReportSummary {
	assertImplementationWorkerReport(input);
	const proof = normalizeImplementationWorkerProof(workerProofInput(input));
	return {
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		planningRefs: planningRefs(input),
		status: normalizeWorkerStatus(input.status),
		...(text(input.claimId) ? { claimId: text(input.claimId) } : {}),
		message: workerMessage(input),
		refs: workerRefs(input),
		...(text(input.sessionId) ? { sessionId: text(input.sessionId) } : {}),
		...(text(input.sessionFile)
			? { sessionFile: text(input.sessionFile) }
			: {}),
		...(proof ? { proof } : {}),
	};
}

function workerChangeInputs(
	input: ImplementationWorkerReportInput,
): ImplementationChangeInput[] {
	if (normalizeWorkerStatus(input.status) !== "completed") return [];
	const metadata = workerChangeMetadata(input);
	return rawWorkerChangeInputs(input).map((change, index) =>
		workerChangeInput(change, input, metadata, index),
	);
}

function workerChangeInput(
	change: ImplementationChangeInput,
	input: ImplementationWorkerReportInput,
	metadata: Partial<ImplementationChangeInput>,
	index: number,
): ImplementationChangeInput {
	const proof = normalizeImplementationWorkerProof(workerProofInput(input));
	const contentProof = contentProofFromWorkerProof(proof);
	return {
		...change,
		...workerProofChangedPathFields(change, proof),
		...metadata,
		id: text(change.id) || `${text(input.workUnitId)}-${index + 1}`,
		planningRefs: planningRefsForChange(change, input),
		...(change.contentProof || !contentProof ? {} : { contentProof }),
	};
}

function workerProofChangedPathFields(
	change: ImplementationChangeInput,
	proof?: ImplementationWorkerProof,
): Partial<ImplementationChangeInput> {
	if (!proof) return {};
	const categorized = categorizedChangedPaths(proof.changedPaths);
	return {
		...missingPathField(change, "codePaths", categorized.codePaths),
		...missingPathField(change, "docPaths", categorized.docPaths),
		...missingPathField(change, "testPaths", categorized.testPaths),
	};
}

function missingPathField(
	change: ImplementationChangeInput,
	key: "codePaths" | "docPaths" | "testPaths",
	paths?: string[],
): Partial<ImplementationChangeInput> {
	if (!paths?.length) return {};
	return stringList(change[key]).length > 0 ? {} : { [key]: paths };
}

function categorizedChangedPaths(
	paths: string[],
): Partial<ImplementationChangeInput> {
	const codePaths = paths.filter(
		(path) => !isDocPath(path) && !isTestPath(path),
	);
	const docPaths = paths.filter(isDocPath);
	const testPaths = paths.filter(isTestPath);
	return {
		...(codePaths.length > 0 ? { codePaths } : {}),
		...(docPaths.length > 0 ? { docPaths } : {}),
		...(testPaths.length > 0 ? { testPaths } : {}),
	};
}

function isDocPath(path: string): boolean {
	return (
		path.startsWith(".codewiki/kb/") ||
		/(^|\/)(README|CHANGELOG|LICENSE)\.md$/.test(path)
	);
}

function isTestPath(path: string): boolean {
	return path.startsWith("tests/") || /(^|\/)test[s]?\//.test(path);
}

function workerChangeMetadata(
	input: ImplementationWorkerReportInput,
): Partial<ImplementationChangeInput> {
	return {
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		...optionalTextField("claimId", input.claimId),
		...optionalTextField("sessionId", input.sessionId),
		...optionalTextField("sessionFile", input.sessionFile),
	};
}

function rawWorkerChangeInputs(
	input: ImplementationWorkerReportInput,
): ImplementationChangeInput[] {
	return objectList<ImplementationChangeInput>(input.changeInputs);
}

function planningRefsForChange(
	change: ImplementationChangeInput,
	input: ImplementationWorkerReportInput,
): string[] {
	const refs = stringList(change.planningRefs);
	return refs.length > 0 ? unique(refs) : planningRefs(input);
}

function planningRefs(input: ImplementationWorkerReportInput): string[] {
	const explicitRefs = unique(stringList(input.planningRefs));
	if (explicitRefs.length > 0) return explicitRefs;
	return unique(
		rawWorkerChangeInputs(input).flatMap((change) =>
			stringList(change.planningRefs),
		),
	);
}

function workerRefs(input: ImplementationWorkerReportInput): string[] {
	return unique([
		...planningRefs(input),
		...stringList(input.refs),
		...workerProofRefs(input),
		...objectList<ImplementationWorkerBlockerInput>(input.blockers).flatMap(
			(blocker) => stringList(blocker.refs),
		),
	]);
}

function workerProofInput(
	input: ImplementationWorkerReportInput,
): ImplementationWorkerProofInput {
	return {
		...input.proof,
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		planningRefs: planningRefs(input),
		claimId: text(input.claimId),
		sessionId: text(input.sessionId),
		sessionFile: text(input.sessionFile),
		status: text(input.status),
		changeInputs: rawWorkerChangeInputs(input),
	};
}

function workerProofRefs(input: ImplementationWorkerReportInput): string[] {
	const proof = normalizeImplementationWorkerProof(workerProofInput(input));
	return proof
		? [proof.digest, proof.validationRef, proof.patchRef].filter(
				(ref): ref is string => Boolean(ref),
			)
		: [];
}

function workerMessage(input: ImplementationWorkerReportInput): string {
	return (
		text(input.message) ||
		objectList<ImplementationWorkerBlockerInput>(input.blockers)
			.map((blocker) => text(blocker.message))
			.filter(Boolean)
			.join(" ")
	);
}

function assertImplementationWorkerReport(
	input: ImplementationWorkerReportInput,
): void {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Implementation worker report must be an object.");
	}
	for (const key of Object.keys(input)) {
		if (!IMPLEMENTATION_WORKER_REPORT_FIELDS.has(key)) {
			throw new Error(
				`Implementation worker report received unsupported field ${key}.`,
			);
		}
	}
}

function normalizeWorkerStatus(value: unknown): ImplementationWorkerStatus {
	const status = text(value).toLowerCase();
	if (["completed", "blocked", "failed"].includes(status)) {
		return status as ImplementationWorkerStatus;
	}
	return "completed";
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function objectList<T>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function optionalTextField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string>> {
	const output = text(value);
	return output ? ({ [key]: output } as Partial<Record<Key, string>>) : {};
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
