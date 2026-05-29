import { createHash } from "node:crypto";
import { unique } from "../shared/utils.ts";
import type { WorkerDiffProof } from "./worker-diff.ts";

export interface PublisherProofInput {
	publisher_base_sha: string;
	publisher_head_sha?: string;
	publisher_tree_sha?: string;
	proofs: WorkerDiffProof[];
	checks_run?: string[];
	approval_refs?: string[];
	remote_ref?: string;
	commit_title?: string;
}

export interface PublisherCommitPlan {
	commit_title: string;
	commit_body: string;
	commands: string[];
	required_proof: string[];
}

export interface PublisherProof {
	publisher_base_sha: string;
	publisher_head_sha?: string;
	publisher_tree_sha?: string;
	merged_task_ids: string[];
	build_refs: string[];
	validation_refs: string[];
	diff_digests: string[];
	checks_run: string[];
	approval_refs: string[];
	remote_ref?: string;
	safe_to_commit: boolean;
	safe_to_push: boolean;
	commit_plan: PublisherCommitPlan;
	digest: string;
}

function stableDigest(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")}`;
}

function commitTitle(input: PublisherProofInput): string {
	if (input.commit_title?.trim()) return input.commit_title.trim();
	const tasks = input.proofs.map((proof) => proof.task_id).sort().join(", ");
	return `chore(codewiki): publish worker merge ${tasks}`;
}

function commitBody(input: PublisherProofInput): string {
	return [
		`Publisher-Base: ${input.publisher_base_sha}`,
		input.publisher_head_sha ? `Publisher-Head: ${input.publisher_head_sha}` : "Publisher-Head: <after-merge>",
		input.publisher_tree_sha ? `Publisher-Tree: ${input.publisher_tree_sha}` : "Publisher-Tree: <after-merge>",
		`Tasks: ${input.proofs.map((proof) => proof.task_id).sort().join(", ")}`,
		`Builds: ${input.proofs.map((proof) => proof.build_ref).sort().join(", ")}`,
		`Validations: ${input.proofs.map((proof) => proof.validation_ref).sort().join(", ")}`,
		"Remote-Publication: not approved by default",
	].join("\n");
}

export function buildPublisherProof(input: PublisherProofInput): PublisherProof {
	const checks = unique((input.checks_run || []).map(String).map((item) => item.trim()).filter(Boolean)).sort();
	const approvals = unique((input.approval_refs || []).map(String).map((item) => item.trim()).filter(Boolean)).sort();
	const title = commitTitle(input);
	const body = commitBody(input);
	const stable = {
		publisher_base_sha: String(input.publisher_base_sha || "").trim(),
		...(input.publisher_head_sha ? { publisher_head_sha: String(input.publisher_head_sha).trim() } : {}),
		...(input.publisher_tree_sha ? { publisher_tree_sha: String(input.publisher_tree_sha).trim() } : {}),
		merged_task_ids: unique(input.proofs.map((proof) => proof.task_id)).sort(),
		build_refs: unique(input.proofs.map((proof) => proof.build_ref)).sort(),
		validation_refs: unique(input.proofs.map((proof) => proof.validation_ref)).sort(),
		diff_digests: unique(input.proofs.map((proof) => proof.digest)).sort(),
		checks_run: checks,
		approval_refs: approvals,
		...(input.remote_ref ? { remote_ref: String(input.remote_ref).trim() } : {}),
	};
	const safeToCommit = Boolean(
		stable.publisher_base_sha &&
			stable.publisher_head_sha &&
			stable.publisher_tree_sha &&
			stable.merged_task_ids.length > 0,
	);
	const safeToPush = Boolean(input.remote_ref && approvals.some((ref) => ref.includes("approval")));
	const commitPlan: PublisherCommitPlan = {
		commit_title: title,
		commit_body: body,
		commands: [
			"git status --porcelain",
			"git rev-parse HEAD",
			"git rev-parse HEAD^{tree}",
			`git commit -m ${JSON.stringify(title)}`,
		],
		required_proof: [
			"validated_sha",
			"head_sha",
			"tree_sha",
			"build_refs",
			"validation_refs",
			"checks_run",
		],
	};
	return {
		...stable,
		safe_to_commit: safeToCommit,
		safe_to_push: safeToPush,
		commit_plan: commitPlan,
		digest: stableDigest({ ...stable, safe_to_commit: safeToCommit, safe_to_push: safeToPush, commit_plan: commitPlan }),
	};
}
