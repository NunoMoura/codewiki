import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildCodewikiImplementationReview,
	buildCodewikiWorkerAttempts,
	isCommittedDashboardTrace,
	projectSprintPlan,
} from "../../src/dashboard/state.ts";
import { createWorkerObservation } from "../../src/runtime/worker-observation.ts";

function claim(sequence = 1) {
	return {
		type: "trace_event",
		id: "claim-001",
		parentId: null,
		traceId: "TRACE-workers",
		sequence,
		event: "runtime.work_unit.claimed",
		refs: ["trace:TRACE-workers:planning:iteration:1#work:WU-workers"],
		createdAt: "2026-07-12T12:00:00.000Z",
		data: {
			claimId: "claim-001",
			workerId: "worker-001",
			workUnitId: "WU-workers",
			planningRefs: [
				"trace:TRACE-workers:planning:iteration:1#work:WU-workers",
			],
			pathScopes: ["src/dashboard/state.ts"],
		},
	};
}

const item = {
	id: "WU-workers",
	title: "Project worker attempts",
	status: "claimed",
};

describe("dashboard lifecycle projection", () => {
	it("projects the latest declared Sprint plan", () => {
		const plan = projectSprintPlan([
			{
				type: "trace_event",
				id: "decision-1",
				parentId: null,
				traceId: "TRACE-topics",
				sequence: 1,
				loop: "decision",
				event: "change_approved",
				refs: [".codewiki/kb/product/overview.md"],
				createdAt: "2026-07-15T00:00:00.000Z",
				data: {
					output: {
						changeRecord: {
							change: {
								knowledge: {
									topicRefs: [
										".codewiki/kb/product/overview.md",
										".codewiki/kb/product/DESIGN.md",
										".codewiki/kb/system/components/traces.md",
									],
								},
							},
						},
					},
				},
			},
			{
				type: "trace_event",
				id: "planning-1",
				parentId: "decision-1",
				traceId: "TRACE-topics",
				sequence: 2,
				loop: "planning",
				event: "work_units_created",
				refs: [],
				createdAt: "2026-07-15T00:01:00.000Z",
				data: {
					output: {
						sprints: [
							{
								goal: "Make Sprint Knowledge scope visible.",
								preview: {
									profileId: "web",
									profileDigest: `sha256:${"a".repeat(64)}`,
									required: true,
									activation: "implementation",
									autoOpen: "once_per_trace",
									evidenceViewports: ["desktop", "mobile"],
								},
								dependsOn: ["CHG-next"],
								rollbackBoundary: "Revert projection and contract together.",
							},
						],
					},
				},
			},
		]);
		assert.deepEqual(plan, {
			accountableGoal: "Make Sprint Knowledge scope visible.",
			knowledgeTopics: [
				{
					ref: ".codewiki/kb/product/overview.md",
					category: "product",
					label: "Overview",
				},
				{
					ref: ".codewiki/kb/product/DESIGN.md",
					category: "product",
					label: "DESIGN",
				},
				{
					ref: ".codewiki/kb/system/components/traces.md",
					category: "system",
					label: "Components / Traces",
				},
			],
			preview: {
				profileId: "web",
				profileDigest: `sha256:${"a".repeat(64)}`,
				required: true,
				activation: "implementation",
				autoOpen: "once_per_trace",
				evidenceViewports: ["desktop", "mobile"],
			},
			dependencies: ["CHG-next"],
			rollbackBoundary: "Revert projection and contract together.",
		});
	});

	it("labels only successful Git-backed closure as committed", () => {
		const close = {
			type: "trace_close",
			id: "TRACE-committed:archive:close:1",
			parentId: null,
			traceId: "TRACE-committed",
			reason: "Completed and retained.",
			gitRestoreRef: "abc123",
			headRef: "TRACE-committed",
			refs: ["abc123"],
			createdAt: "2026-07-15T00:00:00.000Z",
		};
		assert.equal(
			isCommittedDashboardTrace({ closed: true, status: "closed_complete" }, [
				close,
			]),
			true,
		);
		assert.equal(
			isCommittedDashboardTrace({ closed: true, status: "closed_incomplete" }, [
				close,
			]),
			false,
		);
		assert.equal(
			isCommittedDashboardTrace(
				{ closed: true, status: "closed_complete" },
				[],
			),
			false,
		);
	});
});

describe("dashboard worker projection", () => {
	it("combines durable claims with latest live observation", () => {
		const observedAt = new Date();
		const observation = createWorkerObservation({
			traceId: "TRACE-workers",
			workUnitId: "WU-workers",
			workerId: "worker-001",
			attemptId: "claim-001",
			phase: "running_checks",
			observedAt: observedAt.toISOString(),
			leaseExpiresAt: new Date(observedAt.getTime() + 60_000).toISOString(),
			progress: { current: 2, total: 3 },
			execution: {
				policyDigest: "sha256:" + "a".repeat(64),
				routeId: "worker-high",
				provider: "openai-codex",
				model: "gpt-5.4",
				thinking: "high",
				quality: "high",
				allowedTools: ["read", "edit"],
				timeoutMs: 90_000,
				budget: { maxTokens: 10_000 },
				usage: {
					inputTokens: 200,
					outputTokens: 100,
					totalTokens: 300,
					costUsd: 0.02,
					latencyMs: 2_000,
				},
			},
		});
		const attempts = buildCodewikiWorkerAttempts(
			[claim()],
			[item],
			[observation],
		);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0].title, "Project worker attempts");
		assert.equal(attempts[0].status, "running");
		assert.equal(attempts[0].phase, "running_checks");
		assert.equal(attempts[0].freshness, "live");
		assert.deepEqual(attempts[0].progress, { current: 2, total: 3 });
		assert.equal(attempts[0].execution.routeId, "worker-high");
		assert.equal(attempts[0].execution.usage.totalTokens, 300);
	});

	it("keeps aggregate review separate from worker attempts", () => {
		const release = {
			...claim(2),
			id: "release-001",
			event: "runtime.work_unit.claim.released",
			data: { ...claim().data, status: "completed" },
		};
		const attempts = buildCodewikiWorkerAttempts(
			[claim(), release],
			[item],
			[],
		);
		assert.equal(attempts[0].status, "completed");
		assert.deepEqual(
			buildCodewikiImplementationReview(attempts, [item], [], false),
			{
				status: "validating",
				resultsCollected: 1,
				totalTasks: 1,
				conflictCount: 0,
				acceptanceStatus: "ready",
			},
		);
		assert.equal(
			buildCodewikiImplementationReview(
				attempts,
				[item],
				["Path conflict"],
				false,
			).status,
			"blocked",
		);
	});
});
