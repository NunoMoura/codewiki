import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWikiRuntime } from "../../src/api/wiki-runtime.ts";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import { createRuntimeHandoffManifest } from "../../src/runtime/handoff.ts";

function queue() {
	return {
		traceIds: ["TRACE-handoff"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 2,
			claimed: 0,
			blocked: 0,
			done: 0,
		},
		items: [
			{
				id: "WU-handoff-a",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-handoff",
				title: "Handoff A",
				traceRefs: ["TRACE-handoff:planning:work:1"],
				decisionRefs: ["TRACE-handoff:decision:row:1"],
				planningRefs: ["TRACE-handoff:planning:work:1"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/a.ts"],
				dependsOn: [],
				blockers: [],
				qualityStandards: planningQualityStandards([]),
				qualityBlockers: [],
				sourceEventId: "TRACE-handoff:planning:work:1",
			},
			{
				id: "WU-handoff-b",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-handoff",
				title: "Handoff B",
				traceRefs: ["TRACE-handoff:planning:work:2"],
				decisionRefs: ["TRACE-handoff:decision:row:1"],
				planningRefs: ["TRACE-handoff:planning:work:2"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/b.ts"],
				dependsOn: [],
				blockers: [],
				qualityStandards: planningQualityStandards([]),
				qualityBlockers: [],
				sourceEventId: "TRACE-handoff:planning:work:2",
			},
		],
	};
}

describe("runtime handoff manifest", () => {
	it("bundles claims, worktree steps, session prompts, completion contract, and release instructions", async () => {
		const runtime = await runWikiRuntime({
			mode: "preview",
			config: {
				project: "handoff-fixture",
				runtime: {
					automation: "assist",
					maxWorkers: 2,
					worktreeIsolation: "auto",
				},
			},
			repoRoot: "/tmp/repo/codewiki",
			queue: queue(),
			workerIdPrefix: "host-worker",
			nextSequenceByTrace: { "TRACE-handoff": 1 },
		});
		const manifest = createRuntimeHandoffManifest({
			runtime,
			promptSuffix: "HANDOFF_SUFFIX",
		});

		assert.equal(manifest.schemaVersion, "codewiki.runtime.handoff.v1");
		assert.equal(manifest.kind, "runtime_handoff");
		assert.deepEqual(manifest.actions, [
			"runtime.claims",
			"worktree.prepare",
			"worker.start",
			"worker.collect_completion",
			"wiki.implement",
			"runtime.release",
			"worktree.cleanup",
		]);
		assert.equal(manifest.runtime.appendAllowed, true);
		assert.equal(manifest.runtime.dispatchCount, 2);
		assert.equal(manifest.runtime.claimEventCount, 2);
		assert.equal(manifest.claimEvents[0].event, "runtime.work.claimed");
		assert.equal(manifest.workers.length, 2);
		assert.deepEqual(
			manifest.workerStatuses.map((status) => [
				status.workerId,
				status.workUnitId,
				status.state,
				status.claimId,
			]),
			[
				[
					"host-worker-001",
					"WU-handoff-a",
					"starting",
					"claim-WU-handoff-a-001",
				],
				[
					"host-worker-002",
					"WU-handoff-b",
					"starting",
					"claim-WU-handoff-b-002",
				],
			],
		);
		assert.equal(manifest.workers[0].workerId, "host-worker-001");
		assert.equal(manifest.workers[0].claimId, "claim-WU-handoff-a-001");
		assert.equal(
			manifest.workers[0].worktree?.branch,
			"codewiki/TRACE-handoff/WU-handoff-a/host-worker-001",
		);
		assert.equal(
			manifest.workers[0].worktreeCommands.execute,
			"host_explicit_only",
		);
		assert.equal(manifest.workers[0].worktreeCommands.dryRunDefault, true);
		assert.equal(
			manifest.workers[0].worktreeCommands.worktreePrepare[0].startsWith(
				"git worktree add",
			),
			true,
		);
		assert.equal(
			manifest.workers[0].sessionInput.prompt.includes("Worker owns local TDD"),
			true,
		);
		assert.equal(
			manifest.workers[0].sessionInput.prompt.endsWith("HANDOFF_SUFFIX"),
			true,
		);
		assert.equal(manifest.workers[0].completionFeeds, "collectPiWorkerResults");
		assert.equal(manifest.workers[0].implementationInput, "workerResults");
		assert.equal(
			manifest.expectedCompletion.collector,
			"collectPiWorkerResults",
		);
		assert.deepEqual(manifest.expectedCompletion.statusValues, [
			"completed",
			"blocked",
			"failed",
		]);
		assert.deepEqual(manifest.expectedCompletion.requiredFields, [
			"status",
			"workUnitRef",
			"changedFiles",
			"checksRun",
			"changes[].checkResults",
			"changes[].acceptanceEvidenceItems",
		]);
		assert.deepEqual(manifest.expectedCompletion.proofFields, [
			"changedFiles",
			"checksRun",
			"contentProofRefs",
			"headSha",
			"treeSha",
			"workingTreeDigest",
			"validationRef",
		]);
		assert.equal(
			manifest.expectedCompletion.example.changes[0]
				.acceptanceEvidenceItems[0].criterionId,
			"AC-001",
		);
		assert.equal(
			manifest.release.failedStart.helper,
			"createRuntimeFailedWorkerStartReleaseEvents",
		);
		assert.equal(
			manifest.release.completion.timing,
			"after_wiki_implement_consumes_worker_results",
		);
	});

	it("stays useful for preview runtime without claim events or worktrees", async () => {
		const runtime = await runWikiRuntime({
			mode: "preview",
			config: {
				project: "handoff-fixture",
				runtime: { automation: "assist", maxWorkers: 1 },
			},
			queue: queue(),
		});
		const manifest = createRuntimeHandoffManifest({ runtime });

		assert.deepEqual(manifest.actions, [
			"runtime.claims",
			"worker.start",
			"worker.collect_completion",
			"wiki.implement",
			"runtime.release",
		]);
		assert.equal(manifest.runtime.claimEventCount, 0);
		assert.equal(manifest.workers[0].workerId, "worker-001");
		assert.equal(manifest.workers[0].claimId, undefined);
		assert.deepEqual(manifest.workerStatuses[0], {
			workerId: "worker-001",
			workUnitId: "WU-handoff-a",
			traceId: "TRACE-handoff",
			state: "starting",
		});
		assert.deepEqual(manifest.workers[0].worktreeCommands.worktreePrepare, []);
		assert.equal(
			manifest.workers[0].sessionInput.prompt.includes("Worktree:"),
			false,
		);
	});
});
