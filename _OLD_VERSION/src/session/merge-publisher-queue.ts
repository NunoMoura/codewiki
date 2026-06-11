import { createHash } from "node:crypto";
import { unique } from "../shared/utils.ts";
import type { ChangeClaimScope } from "./types.ts";
import { buildPublisherProof, type PublisherProof } from "./publisher-proof.ts";
import {
	detectWorkerDiffConflicts,
	normalizeWorkerDiffProof,
	type WorkerDiffConflict,
	type WorkerDiffProof,
	type WorkerDiffProofInput,
} from "./worker-diff.ts";

export interface MergePublisherQueueInput {
	publisher_base_sha: string;
	publisher_head_sha?: string;
	publisher_tree_sha?: string;
	workers: WorkerDiffProofInput[];
	required_checks?: string[];
	checks_run?: string[];
	approval_refs?: string[];
	remote_ref?: string;
	allow_remote_publication?: boolean;
}

export interface PublisherQueueIssue {
	severity: "block" | "warning";
	kind:
		| "validation-not-pass"
		| "worker-dirty"
		| "worker-proof-missing"
		| "diff-conflict"
		| "required-check-missing"
		| "remote-publication-not-approved"
		| "publisher-proof-incomplete";
	task_ids: string[];
	message: string;
	refs?: string[];
	files?: string[];
}

export interface PublisherReroute {
	task_id: string;
	reason: string;
	wait: {
		action: "wait";
		mode: "write";
		role: "publisher";
		task_id: string;
		scopes: ChangeClaimScope[];
		summary: string;
	};
	wake_on_resolution: {
		source_refs: string[];
		next_action_intent: string;
	};
}

export interface MergePublisherQueuePlan {
	status: "ready" | "blocked";
	serialization_key: string;
	proofs: WorkerDiffProof[];
	accepted_task_ids: string[];
	issues: PublisherQueueIssue[];
	conflicts: WorkerDiffConflict[];
	reroutes: PublisherReroute[];
	publisher_proof: PublisherProof;
	required_audits: string[];
	local_commit: {
		allowed: boolean;
		commands: string[];
		commit_title: string;
		commit_body: string;
	};
	remote_publication: {
		allowed: boolean;
		reason: string;
	};
	evidence: {
		queue_id: string;
		build_refs: string[];
		validation_refs: string[];
		diff_digests: string[];
		checks_run: string[];
	};
}

const DEFAULT_REQUIRED_CHECKS = [
	"npm run typecheck",
	"npm run test:smoke",
	"npm run test:features",
];

function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function issue(
	kind: PublisherQueueIssue["kind"],
	message: string,
	proofs: WorkerDiffProof[],
	extra: Partial<PublisherQueueIssue> = {},
): PublisherQueueIssue {
	return {
		severity: "block",
		kind,
		task_ids: unique(proofs.map((proof) => proof.task_id)).sort(),
		message,
		...extra,
	};
}

function proofCompletenessIssues(proofs: WorkerDiffProof[]): PublisherQueueIssue[] {
	const issues: PublisherQueueIssue[] = [];
	for (const proof of proofs) {
		const missing = [
			["build_ref", proof.build_ref],
			["validation_ref", proof.validation_ref],
			["base_sha", proof.base_sha],
			["head_sha", proof.head_sha],
		].filter(([, value]) => !value).map(([name]) => name);
		if (missing.length > 0) {
			issues.push(issue(
				"worker-proof-missing",
				`${proof.task_id} worker proof missing ${missing.join(", ")}.`,
				[proof],
				{ refs: [proof.build_ref, proof.validation_ref].filter(Boolean) },
			));
		}
		if (proof.validation_verdict !== "pass") {
			issues.push(issue(
				"validation-not-pass",
				`${proof.task_id} validation verdict is ${proof.validation_verdict}; publisher requires pass.`,
				[proof],
				{ refs: [proof.validation_ref].filter(Boolean) },
			));
		}
		if (!proof.clean) {
			issues.push(issue(
				"worker-dirty",
				`${proof.task_id} worker proof is not clean; publisher requires committed/clean worker output.`,
				[proof],
			));
		}
	}
	return issues;
}

function missingRequiredChecks(
	checksRun: string[],
	requiredChecks: string[],
	proofs: WorkerDiffProof[],
): PublisherQueueIssue[] {
	const lower = new Set(checksRun.map((check) => check.toLowerCase()));
	return requiredChecks
		.filter((required) => !lower.has(required.toLowerCase()))
		.map((required) => issue(
			"required-check-missing",
			`Publisher check '${required}' was not recorded as run.`,
			proofs,
			{ refs: [required] },
		));
}

function conflictIssues(
	conflicts: WorkerDiffConflict[],
	proofs: WorkerDiffProof[],
): PublisherQueueIssue[] {
	return conflicts.map((conflict) => issue(
		"diff-conflict",
		conflict.message,
		proofs.filter((proof) => conflict.task_ids.includes(proof.task_id)),
		{ files: conflict.files },
	));
}

function scopesForProof(proof: WorkerDiffProof): ChangeClaimScope[] {
	return unique(proof.changed_files).map((path) => ({ layer: "code" as const, path }));
}

function sourceRefsForProof(proof: WorkerDiffProof): string[] {
	return unique([
		`.codewiki/roadmap/tasks/${proof.task_id}/task.json`,
		`.codewiki/roadmap/tasks/${proof.task_id}/context.json`,
		proof.build_ref,
		proof.validation_ref,
		proof.patch_ref || "",
	]).filter(Boolean);
}

function reroutes(
	issues: PublisherQueueIssue[],
	proofs: WorkerDiffProof[],
): PublisherReroute[] {
	const affected = new Set(issues.flatMap((item) => item.task_ids));
	return proofs
		.filter((proof) => affected.has(proof.task_id))
		.map((proof) => ({
			task_id: proof.task_id,
			reason: issues
				.filter((item) => item.task_ids.includes(proof.task_id))
				.map((item) => item.kind)
				.join(", "),
			wait: {
				action: "wait",
				mode: "write",
				role: "publisher",
				task_id: proof.task_id,
				scopes: scopesForProof(proof),
				summary: `Publisher reroute waiting for ${proof.task_id} conflict/validation resolution.`,
			},
			wake_on_resolution: {
				source_refs: sourceRefsForProof(proof),
				next_action_intent: `Resolve publisher reroute for ${proof.task_id}, then rerun merge publisher queue from CodeWiki source refs.`,
			},
		}));
}

export function planMergePublisherQueue(
	input: MergePublisherQueueInput,
): MergePublisherQueuePlan {
	const proofs = input.workers.map(normalizeWorkerDiffProof);
	const requiredChecks = input.required_checks?.length ? input.required_checks : DEFAULT_REQUIRED_CHECKS;
	const checksRun = unique([...(input.checks_run || []), ...proofs.flatMap((proof) => proof.checks_run)]).sort();
	const conflicts = detectWorkerDiffConflicts(proofs, input.publisher_base_sha);
	const publisherProof = buildPublisherProof({
		publisher_base_sha: input.publisher_base_sha,
		publisher_head_sha: input.publisher_head_sha,
		publisher_tree_sha: input.publisher_tree_sha,
		proofs,
		checks_run: checksRun,
		approval_refs: input.approval_refs,
		remote_ref: input.remote_ref,
	});
	const issues = [
		...proofCompletenessIssues(proofs),
		...conflictIssues(conflicts, proofs),
		...missingRequiredChecks(checksRun, requiredChecks, proofs),
	];
	if (!publisherProof.safe_to_commit) {
		issues.push(issue(
			"publisher-proof-incomplete",
			"Publisher proof must include base/head/tree proof before local checkpoint commit is allowed.",
			proofs,
		));
	}
	if (input.remote_ref && !input.allow_remote_publication) {
		issues.push(issue(
			"remote-publication-not-approved",
			"Remote publication requested but explicit approval was not provided.",
			proofs,
			{ refs: [input.remote_ref] },
		));
	}
	const status = issues.some((item) => item.severity === "block") ? "blocked" : "ready";
	const queueBasis = {
		tasks: proofs.map((proof) => proof.task_id).sort(),
		builds: proofs.map((proof) => proof.build_ref).sort(),
		validations: proofs.map((proof) => proof.validation_ref).sort(),
		base: input.publisher_base_sha,
	};
	return {
		status,
		serialization_key: `publisher:${input.publisher_base_sha}`,
		proofs,
		accepted_task_ids: status === "ready" ? proofs.map((proof) => proof.task_id).sort() : [],
		issues,
		conflicts,
		reroutes: reroutes(issues, proofs),
		publisher_proof: publisherProof,
		required_audits: ["changed", "alignment", "generated-parity", "file-structure", "source-contract"],
		local_commit: {
			allowed: status === "ready" && publisherProof.safe_to_commit,
			commands: publisherProof.commit_plan.commands,
			commit_title: publisherProof.commit_plan.commit_title,
			commit_body: publisherProof.commit_plan.commit_body,
		},
		remote_publication: {
			allowed: Boolean(input.remote_ref && input.allow_remote_publication && publisherProof.safe_to_push && status === "ready"),
			reason: input.remote_ref
				? input.allow_remote_publication
					? "remote publication still requires explicit push command outside publisher plan"
					: "remote publication requires explicit approval"
				: "no remote publication requested",
		},
		evidence: {
			queue_id: `publisher-${digest(queueBasis)}`,
			build_refs: unique(proofs.map((proof) => proof.build_ref)).sort(),
			validation_refs: unique(proofs.map((proof) => proof.validation_ref)).sort(),
			diff_digests: unique(proofs.map((proof) => proof.digest)).sort(),
			checks_run: checksRun,
		},
	};
}
