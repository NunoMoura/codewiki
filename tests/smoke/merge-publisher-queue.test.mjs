import assert from "node:assert/strict";
import { planMergePublisherQueue } from "../../src/session/merge-publisher-queue.ts";
import { normalizeWorkerDiffProof } from "../../src/session/worker-diff.ts";
import { buildPublisherProof } from "../../src/session/publisher-proof.ts";

const base = "abc1234";
const commonChecks = ["npm run typecheck", "npm run test:smoke", "npm run test:features"];

function worker(taskId, changedFiles, overrides = {}) {
	return {
		task_id: taskId,
		build_ref: `.codewiki/builds/implementation/${taskId}.json`,
		validation_ref: `.codewiki/validation/${taskId}-implementation-pass.json`,
		base_sha: base,
		head_sha: `${taskId.toLowerCase()}head`,
		tree_sha: `${taskId.toLowerCase()}tree`,
		worktree_path: `/tmp/${taskId}`,
		branch: `codewiki/${taskId}/builder/session`,
		changed_files: changedFiles,
		patch_ref: `.codewiki/patches/${taskId}.patch`,
		checks_run: commonChecks,
		validation_verdict: "pass",
		clean: true,
		...overrides,
	};
}

{
	const proofA = normalizeWorkerDiffProof(worker("TASK-101", ["src/a.ts", "tests/a.test.mjs"]));
	const proofB = normalizeWorkerDiffProof(worker("TASK-102", ["src/b.ts"]));
	assert.deepEqual(proofA.changed_files, ["src/a.ts", "tests/a.test.mjs"]);
	assert.ok(proofA.digest.startsWith("sha256:"));
	const publisherProof = buildPublisherProof({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		proofs: [proofA, proofB],
		checks_run: commonChecks,
	});
	assert.equal(publisherProof.safe_to_commit, true);
	assert.equal(publisherProof.safe_to_push, false, "remote push must not be allowed by default");
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-101", ["src/a.ts", "tests/a.test.mjs"]), worker("TASK-102", ["src/b.ts"])],
		checks_run: commonChecks,
	});
	assert.equal(plan.status, "ready");
	assert.deepEqual(plan.accepted_task_ids, ["TASK-101", "TASK-102"]);
	assert.equal(plan.local_commit.allowed, true);
	assert.match(plan.local_commit.commit_body, /Publisher-Tree: mergetree/);
	assert.equal(plan.remote_publication.allowed, false);
	assert.equal(plan.remote_publication.reason, "no remote publication requested");
	assert.ok(plan.evidence.queue_id.startsWith("publisher-"));
	assert.deepEqual(plan.evidence.build_refs, [
		".codewiki/builds/implementation/TASK-101.json",
		".codewiki/builds/implementation/TASK-102.json",
	]);
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-201", ["src/shared.ts"]), worker("TASK-202", ["src/shared.ts"])],
		checks_run: commonChecks,
	});
	assert.equal(plan.status, "blocked");
	assert.ok(plan.conflicts.some((conflict) => conflict.kind === "file-overlap"));
	assert.ok(plan.issues.some((issue) => issue.kind === "diff-conflict"));
	assert.deepEqual(plan.reroutes.map((reroute) => reroute.task_id), ["TASK-201", "TASK-202"]);
	assert.equal(plan.reroutes[0].wait.action, "wait");
	assert.match(plan.reroutes[0].wake_on_resolution.next_action_intent, /rerun merge publisher queue/);
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-301", ["src/a.ts"], { validation_verdict: "fail" })],
		checks_run: commonChecks,
	});
	assert.equal(plan.status, "blocked");
	assert.ok(plan.issues.some((issue) => issue.kind === "validation-not-pass"));
	assert.equal(plan.local_commit.allowed, false);
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-401", ["src/a.ts"], { base_sha: "stale999" })],
		checks_run: commonChecks,
	});
	assert.equal(plan.status, "blocked");
	assert.ok(plan.conflicts.some((conflict) => conflict.kind === "base-mismatch"));
	assert.ok(plan.issues.some((issue) => issue.kind === "diff-conflict"));
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		workers: [worker("TASK-501", ["src/a.ts"], { checks_run: [] })],
		checks_run: ["npm run typecheck"],
	});
	assert.equal(plan.status, "blocked");
	assert.ok(plan.issues.some((issue) => issue.kind === "publisher-proof-incomplete"));
	assert.ok(plan.issues.some((issue) => issue.kind === "required-check-missing"));
	assert.equal(plan.local_commit.allowed, false);
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-601", ["src/a.ts"])],
		checks_run: commonChecks,
		remote_ref: "origin/main",
	});
	assert.equal(plan.status, "blocked");
	assert.ok(plan.issues.some((issue) => issue.kind === "remote-publication-not-approved"));
	assert.equal(plan.remote_publication.allowed, false);
	assert.match(plan.remote_publication.reason, /requires explicit approval/);
}

{
	const plan = planMergePublisherQueue({
		publisher_base_sha: base,
		publisher_head_sha: "mergehead",
		publisher_tree_sha: "mergetree",
		workers: [worker("TASK-701", ["src/a.ts"])],
		checks_run: commonChecks,
		remote_ref: "origin/main",
		allow_remote_publication: true,
		approval_refs: ["approval:user:remote-publication"],
	});
	assert.equal(plan.status, "ready");
	assert.equal(plan.local_commit.allowed, true);
	assert.equal(plan.remote_publication.allowed, true);
}

console.log("✓ merge publisher queue smoke passed");
