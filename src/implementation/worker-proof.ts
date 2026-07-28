import { createHash } from "node:crypto";
import type { ContentProof } from "../git/content-proof.ts";
import type { CheckResultInput, ImplementationChangeInput } from "./types.ts";

export type ImplementationWorkerProofVerdict =
	| "pass"
	| "fail"
	| "block"
	| "unknown";

export interface ImplementationWorkerProofInput {
	workerId?: string;
	worker_id?: string;
	workUnitId?: string;
	work_unit_id?: string;
	taskId?: string;
	task_id?: string;
	claimId?: string;
	claim_id?: string;
	planningRefs?: string[];
	planning_refs?: string[];
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
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
	checks?: string[];
	checksRun?: string[];
	checks_run?: string[];
	checkResults?: CheckResultInput[];
	check_results?: CheckResultInput[];
	validationVerdict?: string;
	validation_verdict?: string;
	validationRef?: string;
	validation_ref?: string;
	buildRef?: string;
	build_ref?: string;
	patchRef?: string;
	patch_ref?: string;
	contentProof?: ContentProof;
	content_proof?: ContentProof;
	clean?: boolean;
	status?: string;
	changeInputs?: ImplementationChangeInput[];
	change_inputs?: ImplementationChangeInput[];
	changes?: ImplementationChangeInput[];
	proof?: ImplementationWorkerProofInput;
	workerProof?: ImplementationWorkerProofInput;
	worker_proof?: ImplementationWorkerProofInput;
}

export interface ImplementationWorkerProof {
	workerId: string;
	workUnitId: string;
	planningRefs: string[];
	claimId?: string;
	sessionId?: string;
	sessionFile?: string;
	baseSha?: string;
	headSha?: string;
	treeSha?: string;
	workingTreeDigest?: string;
	worktreePath?: string;
	branch?: string;
	changedPaths: string[];
	checks: string[];
	validationVerdict: ImplementationWorkerProofVerdict;
	validationRef?: string;
	buildRef?: string;
	patchRef?: string;
	contentProof?: ContentProof;
	clean: boolean;
	digest: string;
}

export type ImplementationWorkerProofConflictKind =
	| "file-overlap"
	| "base-mismatch"
	| "duplicate-worker-work";

export interface ImplementationWorkerProofConflict {
	kind: ImplementationWorkerProofConflictKind;
	severity: "block";
	workerIds: string[];
	workUnitIds: string[];
	files: string[];
	refs: string[];
	message: string;
}

export function normalizeImplementationWorkerProof(
	input: ImplementationWorkerProofInput,
): ImplementationWorkerProof | undefined {
	const raw = mergeProofInput(input);
	const context = workerProofContext(raw);
	if (!hasWorkerProofSignal(raw, context)) return undefined;
	const proofWithoutDigest = buildWorkerProof(raw, context);
	return {
		...proofWithoutDigest,
		digest: stableDigest(proofWithoutDigest),
	};
}

export function contentProofFromWorkerProof(
	proof?: ImplementationWorkerProof,
): ContentProof | undefined {
	if (!proof) return undefined;
	const contentProof = proof.contentProof || {
		...(proof.headSha ? { commit: proof.headSha } : {}),
		...(proof.treeSha ? { tree: proof.treeSha } : {}),
		...(proof.workingTreeDigest
			? { workingTreeDigest: proof.workingTreeDigest }
			: {}),
	};
	return contentProofRefs(contentProof).length > 0 ? contentProof : undefined;
}

export function workerProofRefs(proof?: ImplementationWorkerProof): string[] {
	if (!proof) return [];
	return unique([
		proof.digest,
		proof.validationRef,
		proof.buildRef,
		proof.patchRef,
		proof.baseSha,
		proof.headSha,
		proof.treeSha,
		proof.workingTreeDigest,
		...contentProofRefs(proof.contentProof),
		...proof.changedPaths,
	]);
}

export function detectImplementationWorkerProofConflicts(
	proofs: ImplementationWorkerProof[],
	expectedBaseSha?: string,
): ImplementationWorkerProofConflict[] {
	return [
		...duplicateWorkerWorkConflicts(proofs),
		...baseMismatchConflicts(proofs, expectedBaseSha),
		...fileOverlapConflicts(proofs),
	];
}

interface WorkerProofContext {
	changedPaths: string[];
	checks: string[];
}

function workerProofContext(
	input: ImplementationWorkerProofInput,
): WorkerProofContext {
	return {
		changedPaths: workerProofChangedPaths(input),
		checks: workerProofChecks(input),
	};
}

function hasWorkerProofSignal(
	input: ImplementationWorkerProofInput,
	context: WorkerProofContext,
): boolean {
	return [
		text(input.baseSha ?? input.base_sha),
		text(input.headSha ?? input.head_sha),
		text(input.treeSha ?? input.tree_sha),
		text(input.workingTreeDigest ?? input.working_tree_digest),
		text(input.worktreePath ?? input.worktree_path),
		text(input.branch),
		text(input.validationRef ?? input.validation_ref),
		text(input.buildRef ?? input.build_ref),
		text(input.patchRef ?? input.patch_ref),
		...(input.contentProof || input.content_proof ? ["content-proof"] : []),
		...context.changedPaths,
		...context.checks,
	].some(Boolean);
}

function buildWorkerProof(
	input: ImplementationWorkerProofInput,
	context: WorkerProofContext,
): Omit<ImplementationWorkerProof, "digest"> {
	return {
		...workerProofIdentity(input),
		...workerProofGitMetadata(input),
		changedPaths: context.changedPaths,
		checks: context.checks,
		validationVerdict: workerProofVerdict(input),
		...workerProofEvidenceMetadata(input),
		clean: input.clean === true,
	};
}

function workerProofIdentity(
	input: ImplementationWorkerProofInput,
): Pick<ImplementationWorkerProof, "workerId" | "workUnitId" | "planningRefs"> &
	Partial<
		Pick<ImplementationWorkerProof, "claimId" | "sessionId" | "sessionFile">
	> {
	return {
		workerId: text(input.workerId ?? input.worker_id),
		workUnitId: text(
			input.workUnitId ?? input.work_unit_id ?? input.taskId ?? input.task_id,
		),
		planningRefs: unique([
			...stringList(input.planningRefs),
			...stringList(input.planning_refs),
			...changeInputs(input).flatMap(changePlanningRefs),
		]),
		...optionalTextField("claimId", input.claimId ?? input.claim_id),
		...optionalTextField("sessionId", input.sessionId ?? input.session_id),
		...optionalTextField(
			"sessionFile",
			input.sessionFile ?? input.session_file,
		),
	};
}

function workerProofGitMetadata(
	input: ImplementationWorkerProofInput,
): Partial<
	Pick<
		ImplementationWorkerProof,
		| "baseSha"
		| "headSha"
		| "treeSha"
		| "workingTreeDigest"
		| "worktreePath"
		| "branch"
	>
> {
	return {
		...optionalTextField("baseSha", input.baseSha ?? input.base_sha),
		...optionalTextField("headSha", input.headSha ?? input.head_sha),
		...optionalTextField("treeSha", input.treeSha ?? input.tree_sha),
		...optionalTextField(
			"workingTreeDigest",
			input.workingTreeDigest ?? input.working_tree_digest,
		),
		...optionalTextField(
			"worktreePath",
			input.worktreePath ?? input.worktree_path,
		),
		...optionalTextField("branch", input.branch),
	};
}

function workerProofEvidenceMetadata(
	input: ImplementationWorkerProofInput,
): Partial<
	Pick<
		ImplementationWorkerProof,
		"validationRef" | "buildRef" | "patchRef" | "contentProof"
	>
> {
	return {
		...optionalTextField(
			"validationRef",
			input.validationRef ?? input.validation_ref,
		),
		...optionalTextField("buildRef", input.buildRef ?? input.build_ref),
		...optionalTextField("patchRef", input.patchRef ?? input.patch_ref),
		...optionalContentProof(input),
	};
}

function mergeProofInput(
	input: ImplementationWorkerProofInput,
): ImplementationWorkerProofInput {
	return {
		...input,
		...(input.proof || {}),
		...(input.workerProof || {}),
		...(input.worker_proof || {}),
	};
}

function workerProofChangedPaths(
	input: ImplementationWorkerProofInput,
): string[] {
	return normalizePaths([
		...stringList(input.changedPaths),
		...stringList(input.changed_paths),
		...stringList(input.changedFiles),
		...stringList(input.changed_files),
		...changeInputs(input).flatMap(changeChangedPaths),
	]);
}

function workerProofChecks(input: ImplementationWorkerProofInput): string[] {
	return unique([
		...stringList(input.checks),
		...stringList(input.checksRun),
		...stringList(input.checks_run),
		...objectList<CheckResultInput>(input.checkResults).map((check) =>
			text(check.command),
		),
		...objectList<CheckResultInput>(input.check_results).map((check) =>
			text(check.command),
		),
		...changeInputs(input).flatMap(changeChecks),
	]).sort((left, right) => left.localeCompare(right));
}

function workerProofVerdict(
	input: ImplementationWorkerProofInput,
): ImplementationWorkerProofVerdict {
	const explicit = normalizeVerdict(
		input.validationVerdict ?? input.validation_verdict,
	);
	if (explicit !== "unknown") return explicit;
	const statuses = [
		...objectList<CheckResultInput>(input.checkResults),
		...objectList<CheckResultInput>(input.check_results),
		...changeInputs(input).flatMap((change) =>
			objectList<CheckResultInput>(change.checkResults),
		),
	]
		.map((check) => text(check.status).toLowerCase())
		.filter(Boolean);
	if (statuses.includes("blocked")) return "block";
	if (statuses.includes("fail")) return "fail";
	if (statuses.length > 0 && statuses.every((status) => status === "pass")) {
		return "pass";
	}
	const status = text(input.status).toLowerCase();
	if (status === "blocked") return "block";
	if (status === "failed") return "fail";
	return "unknown";
}

function normalizeVerdict(value: unknown): ImplementationWorkerProofVerdict {
	const verdict = text(value).toLowerCase();
	if (["pass", "fail", "block", "unknown"].includes(verdict)) {
		return verdict as ImplementationWorkerProofVerdict;
	}
	return "unknown";
}

function duplicateWorkerWorkConflicts(
	proofs: ImplementationWorkerProof[],
): ImplementationWorkerProofConflict[] {
	const byKey = new Map<string, ImplementationWorkerProof[]>();
	for (const proof of proofs) {
		const key = `${proof.workerId}\0${proof.workUnitId}`;
		byKey.set(key, [...(byKey.get(key) || []), proof]);
	}
	return [...byKey.values()]
		.filter((matches) => matches.length > 1)
		.map((matches) => ({
			kind: "duplicate-worker-work" as const,
			severity: "block" as const,
			workerIds: unique(matches.map((proof) => proof.workerId)),
			workUnitIds: unique(matches.map((proof) => proof.workUnitId)),
			files: normalizePaths(matches.flatMap((proof) => proof.changedPaths)),
			refs: unique(matches.flatMap(workerProofRefs)),
			message: `Worker ${matches[0].workerId} has ${matches.length} proofs for ${matches[0].workUnitId}.`,
		}));
}

function baseMismatchConflicts(
	proofs: ImplementationWorkerProof[],
	expectedBaseSha?: string,
): ImplementationWorkerProofConflict[] {
	const expected = text(expectedBaseSha);
	if (expected) {
		return proofs
			.filter((proof) => proof.baseSha && proof.baseSha !== expected)
			.map((proof) => ({
				kind: "base-mismatch" as const,
				severity: "block" as const,
				workerIds: [proof.workerId],
				workUnitIds: [proof.workUnitId],
				files: proof.changedPaths,
				refs: workerProofRefs(proof),
				message: `Worker ${proof.workerId} base ${proof.baseSha} does not match expected base ${expected}.`,
			}));
	}
	const bases = unique(proofs.map((proof) => proof.baseSha || ""));
	if (bases.length <= 1) return [];
	return [
		{
			kind: "base-mismatch" as const,
			severity: "block" as const,
			workerIds: unique(proofs.map((proof) => proof.workerId)),
			workUnitIds: unique(proofs.map((proof) => proof.workUnitId)),
			files: normalizePaths(proofs.flatMap((proof) => proof.changedPaths)),
			refs: unique(proofs.flatMap(workerProofRefs)),
			message: `Worker proofs use multiple base SHAs: ${bases.join(", ")}.`,
		},
	];
}

function fileOverlapConflicts(
	proofs: ImplementationWorkerProof[],
): ImplementationWorkerProofConflict[] {
	const conflicts: ImplementationWorkerProofConflict[] = [];
	for (let left = 0; left < proofs.length; left += 1) {
		for (let right = left + 1; right < proofs.length; right += 1) {
			const overlap = changedPathsOverlap(proofs[left], proofs[right]);
			if (overlap.length === 0) continue;
			conflicts.push({
				kind: "file-overlap",
				severity: "block",
				workerIds: unique([proofs[left].workerId, proofs[right].workerId]),
				workUnitIds: unique([
					proofs[left].workUnitId,
					proofs[right].workUnitId,
				]),
				files: overlap,
				refs: unique([
					...workerProofRefs(proofs[left]),
					...workerProofRefs(proofs[right]),
				]),
				message: `Worker proofs for ${proofs[left].workUnitId} and ${proofs[right].workUnitId} both change ${overlap.join(", ")}.`,
			});
		}
	}
	return conflicts;
}

function changedPathsOverlap(
	left: ImplementationWorkerProof,
	right: ImplementationWorkerProof,
): string[] {
	const rightPaths = new Set(right.changedPaths);
	return left.changedPaths.filter((path) => rightPaths.has(path)).sort();
}

function changeInputs(
	input: ImplementationWorkerProofInput,
): ImplementationChangeInput[] {
	return [
		...objectList<ImplementationChangeInput>(input.changeInputs),
		...objectList<ImplementationChangeInput>(input.change_inputs),
		...objectList<ImplementationChangeInput>(input.changes),
	];
}

function changePlanningRefs(change: ImplementationChangeInput): string[] {
	return stringList(change.planningRefs);
}

function changeChangedPaths(change: ImplementationChangeInput): string[] {
	return [
		...stringList(change.codePaths),
		...stringList(change.docPaths),
		...stringList(change.testPaths),
	];
}

function changeChecks(change: ImplementationChangeInput): string[] {
	return [
		...stringList(change.checks),
		...objectList<CheckResultInput>(change.checkResults).map((check) =>
			text(check.command),
		),
	];
}

function optionalContentProof(input: ImplementationWorkerProofInput): {
	contentProof?: ContentProof;
} {
	const proof = input.contentProof ?? input.content_proof;
	return proof ? { contentProof: proof } : {};
}

function contentProofRefs(proof?: ContentProof): string[] {
	return unique([proof?.commit, proof?.tree, proof?.workingTreeDigest]);
}

function stableDigest(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")}`;
}

function normalizePaths(paths: string[]): string[] {
	return unique(paths.map(normalizePath)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function normalizePath(path: string): string {
	return text(path).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function optionalTextField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string>> {
	const output = text(value);
	return output ? ({ [key]: output } as Partial<Record<Key, string>>) : {};
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

function unique(values: Array<string | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
