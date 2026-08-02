import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import {
	runRuntimeSelectedSemanticReaction,
	runRuntimeSemanticExecutor,
} from "../../src/runtime/semantic-executor.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function decisionFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-executor-"));
	roots.push(root);
	const record = createChangeRecord(
		acceptedChangeFixture({ id: "CHG-runtime-semantic" }),
	);
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records: [record],
		message: "Persist runtime-selected Change",
		actor: "user:maintainer",
		createdAt: "2026-08-06T00:00:00.000Z",
	});
	return { root, record };
}

describe("runtime semantic executor", () => {
	it("quiesces without invoking an adapter when no semantic work is eligible", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-empty-"));
		roots.push(root);
		let calls = 0;
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "append",
			adapters: {
				decision() {
					calls += 1;
					throw new Error("adapter must not run");
				},
			},
		});

		assert.equal(result.status, "quiescent");
		assert.equal(result.iterations, 0);
		assert.equal(calls, 0);
	});

	it("keeps pending Decisions quiescent and rejects legacy preselection", async () => {
		const {root} = await decisionFixture();
		let calls = 0;
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: {kind: "manual_resume"},
			mode: "preview",
			adapters: {
				decision() {
					calls += 1;
					return {
						disposition: "approve",
						rationale: "Must not run without authenticated selection.",
					};
				},
			},
		});
		assert.equal(result.status, "quiescent");
		assert.equal(calls, 0);

		await assert.rejects(
			runRuntimeSelectedSemanticReaction({
				repoRoot: root,
				reaction: {
					schemaVersion: 1,
					status: "ready",
					trigger: {kind: "manual_resume"},
					observedWorkStateDigest: `sha256:${"0".repeat(64)}`,
					selection: {
						loop: "decision",
						change: {
							changeId: "CHG-runtime-semantic",
							traceId: "TRACE-CHG-runtime-semantic",
							changeRevision: 1,
							changeDigest: `sha256:${"1".repeat(64)}`,
						},
					},
				},
				runtimeJobId: `runtime-reaction:${"2".repeat(64)}`,
				adapters: {},
			}),
			/authenticated exact-revision selection/,
		);
	});

	it("adapts non-authoritative command results into the legacy Implementation facade", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-implementation-"));
		roots.push(root);
		const seeded = await seedRuntimeImplementation(root, {
			suffix: "semantic-command-results",
		});
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "preview",
			maxIterations: 1,
			adapters: {
				implementation: () => ({
					evidence: [
						{
							workItemId: seeded.workItemId,
							commands: ["npm test"],
							commandResults: [
								{
									command: "npm test",
									status: "pass",
									exitCode: 0,
									acceptanceRequirementId: "AR-1",
								},
							],
						},
					],
				}),
			},
		});

		assert.equal(result.outcomes[0].loop, "implementation");
		assert.deepEqual(
			result.outcomes[0].result.loopResult.changes[0].checkResults,
			[
				{
					command: "npm test",
					status: "pass",
					exitCode: 0,
					criterionId: "AR-1",
				},
			],
		);
	});

});
