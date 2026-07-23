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
	planning_refs?: string[];
	status?: ImplementationWorkerStatus | string;
	claimId?: string;
	claim_id?: string;
	message?: string;
	refs?: string[];
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
	changeInputs?: ImplementationChangeInput[];
	change_inputs?: ImplementationChangeInput[];
	changes?: ImplementationChangeInput[];
	proof?: ImplementationWorkerProofInput;
	workerProof?: ImplementationWorkerProofInput;
	worker_proof?: ImplementationWorkerProofInput;
	baseSha?: string;
	base_sha?: string;
	headSha?: string;
	head_sha?: string;
	treeSha?: string;
	tree_sha?: string;
	workingTreeDigest?: string;
	working_tree_digest?: string;
	worktreePath?: string;
	worktree_path?: string;
	branch?: string;
	changedPaths?: string[];
	changed_paths?: string[];
	changedFiles?: string[];
	changed_files?: string[];
	checksRun?: string[];
	checks_run?: string[];
	validationVerdict?: string;
	validation_verdict?: string;
	validationRef?: string;
	validation_ref?: string;
	buildRef?: string;
	build_ref?: string;
	patchRef?: string;
	patch_ref?: string;
	clean?: boolean;
	blockers?: ImplementationWorkerBlockerInput[];
}

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
	const proof = normalizeImplementationWorkerProof(input);
	return {
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		planningRefs: planningRefs(input),
		status: normalizeWorkerStatus(input.status),
		...(text(input.claimId ?? input.claim_id)
			? { claimId: text(input.claimId ?? input.claim_id) }
			: {}),
		message: workerMessage(input),
		refs: workerRefs(input),
		...(text(input.sessionId ?? input.session_id)
			? { sessionId: text(input.sessionId ?? input.session_id) }
			: {}),
		...(text(input.sessionFile ?? input.session_file)
			? { sessionFile: text(input.sessionFile ?? input.session_file) }
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
	const proof = normalizeImplementationWorkerProof(input);
	const contentProof = contentProofFromWorkerProof(proof);
	return {
		...change,
		...workerProofChangedPathFields(change, proof),
		...metadata,
		id: text(change.id) || `${text(input.workUnitId)}-${index + 1}`,
		planningRefs: planningRefsForChange(change, input),
		...(change.contentProof || change.content_proof || !contentProof
			? {}
			: { contentProof }),
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
	const snakeKey = key.replace(
		/[A-Z]/g,
		(letter) => `_${letter.toLowerCase()}`,
	);
	const existing = [
		...stringList(change[key]),
		...stringList(change[snakeKey as keyof ImplementationChangeInput]),
	];
	return existing.length > 0 ? {} : { [key]: paths };
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
		...optionalTextField("claimId", input.claimId ?? input.claim_id),
		...optionalTextField("sessionId", input.sessionId ?? input.session_id),
		...optionalTextField(
			"sessionFile",
			input.sessionFile ?? input.session_file,
		),
	};
}

function rawWorkerChangeInputs(
	input: ImplementationWorkerReportInput,
): ImplementationChangeInput[] {
	return [
		...objectList<ImplementationChangeInput>(input.changeInputs),
		...objectList<ImplementationChangeInput>(input.change_inputs),
		...objectList<ImplementationChangeInput>(input.changes),
	];
}

function planningRefsForChange(
	change: ImplementationChangeInput,
	input: ImplementationWorkerReportInput,
): string[] {
	const refs = [
		...stringList(change.planningRefs),
		...stringList(change.planning_refs),
	];
	return refs.length > 0 ? unique(refs) : planningRefs(input);
}

function planningRefs(input: ImplementationWorkerReportInput): string[] {
	const explicitRefs = unique([
		...stringList(input.planningRefs),
		...stringList(input.planning_refs),
	]);
	if (explicitRefs.length > 0) return explicitRefs;
	return unique(
		rawWorkerChangeInputs(input).flatMap((change) => [
			...stringList(change.planningRefs),
			...stringList(change.planning_refs),
		]),
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

function workerProofRefs(input: ImplementationWorkerReportInput): string[] {
	const proof = normalizeImplementationWorkerProof(input);
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
