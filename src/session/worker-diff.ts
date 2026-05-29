import { createHash } from "node:crypto";
import { unique } from "../shared/utils.ts";

export interface WorkerDiffProofInput {
	task_id: string;
	build_ref: string;
	validation_ref: string;
	base_sha: string;
	head_sha: string;
	tree_sha?: string;
	worktree_path?: string;
	branch?: string;
	changed_files: string[];
	patch_ref?: string;
	checks_run?: string[];
	validation_verdict?: string;
	clean?: boolean;
}

export interface WorkerDiffProof {
	task_id: string;
	build_ref: string;
	validation_ref: string;
	base_sha: string;
	head_sha: string;
	tree_sha?: string;
	worktree_path?: string;
	branch?: string;
	changed_files: string[];
	patch_ref?: string;
	checks_run: string[];
	validation_verdict: "pass" | "fail" | "block" | "unknown";
	clean: boolean;
	digest: string;
}

export interface WorkerDiffConflict {
	kind: "file-overlap" | "base-mismatch" | "duplicate-task";
	severity: "block";
	task_ids: string[];
	files: string[];
	message: string;
}

function stableDigest(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")}`;
}

function normalizePath(path: string): string {
	return String(path || "")
		.trim()
		.replaceAll("\\", "/")
		.replace(/^\.\//, "");
}

function verdict(value: unknown): WorkerDiffProof["validation_verdict"] {
	if (value === "pass" || value === "fail" || value === "block") return value;
	return "unknown";
}

export function normalizeWorkerDiffProof(
	input: WorkerDiffProofInput,
): WorkerDiffProof {
	const proof = {
		task_id: String(input.task_id || "").trim(),
		build_ref: String(input.build_ref || "").trim(),
		validation_ref: String(input.validation_ref || "").trim(),
		base_sha: String(input.base_sha || "").trim(),
		head_sha: String(input.head_sha || "").trim(),
		...(input.tree_sha ? { tree_sha: String(input.tree_sha).trim() } : {}),
		...(input.worktree_path ? { worktree_path: String(input.worktree_path).trim() } : {}),
		...(input.branch ? { branch: String(input.branch).trim() } : {}),
		changed_files: unique((input.changed_files || []).map(normalizePath).filter(Boolean)).sort(),
		...(input.patch_ref ? { patch_ref: String(input.patch_ref).trim() } : {}),
		checks_run: unique((input.checks_run || []).map(String).map((item) => item.trim()).filter(Boolean)).sort(),
		validation_verdict: verdict(input.validation_verdict),
		clean: input.clean === true,
	};
	return { ...proof, digest: stableDigest(proof) };
}

export function changedFilesOverlap(
	a: WorkerDiffProof,
	b: WorkerDiffProof,
): string[] {
	const right = new Set(b.changed_files);
	return a.changed_files.filter((file) => right.has(file)).sort();
}

export function detectWorkerDiffConflicts(
	proofs: WorkerDiffProof[],
	publisherBaseSha?: string,
): WorkerDiffConflict[] {
	const conflicts: WorkerDiffConflict[] = [];
	const byTask = new Map<string, WorkerDiffProof[]>();
	for (const proof of proofs) {
		byTask.set(proof.task_id, [...(byTask.get(proof.task_id) || []), proof]);
		if (publisherBaseSha && proof.base_sha !== publisherBaseSha) {
			conflicts.push({
				kind: "base-mismatch",
				severity: "block",
				task_ids: [proof.task_id],
				files: proof.changed_files,
				message: `${proof.task_id} base ${proof.base_sha} does not match publisher base ${publisherBaseSha}.`,
			});
		}
	}
	for (const [taskId, taskProofs] of byTask) {
		if (taskProofs.length > 1) {
			conflicts.push({
				kind: "duplicate-task",
				severity: "block",
				task_ids: [taskId],
				files: unique(taskProofs.flatMap((proof) => proof.changed_files)).sort(),
				message: `${taskId} has ${taskProofs.length} worker diff proofs in one publisher batch.`,
			});
		}
	}
	for (let i = 0; i < proofs.length; i += 1) {
		for (let j = i + 1; j < proofs.length; j += 1) {
			const overlap = changedFilesOverlap(proofs[i], proofs[j]);
			if (overlap.length === 0) continue;
			conflicts.push({
				kind: "file-overlap",
				severity: "block",
				task_ids: [proofs[i].task_id, proofs[j].task_id].sort(),
				files: overlap,
				message: `${proofs[i].task_id} and ${proofs[j].task_id} both change ${overlap.join(", ")}.`,
			});
		}
	}
	return conflicts;
}
