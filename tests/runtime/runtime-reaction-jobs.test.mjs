import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { readTraceFileSnapshot } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { ProjectCoordinator } from "../../src/runtime/coordinator/project.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../src/runtime/coordinator/service.ts";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import {
	runtimeReactionJob,
	scheduleRuntimeReactionJob,
} from "../../src/runtime/runtime-reaction-jobs.ts";
import {buildProjectWorkState} from "../../src/work-state/project.ts";
import {acceptedChangeFixture} from "../helpers/accepted-change.mjs";

async function fixture(id) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-reaction-"));
	const record = createChangeRecord(acceptedChangeFixture({ id }));
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records: [record],
		message: "Persist coordinator-selected Change",
		actor: "user:maintainer",
		createdAt: "2026-08-09T00:00:00.000Z",
	});
	return { root, record };
}

function approvingAdapters() {
	return {
		decision: () => ({
			disposition: "approve",
			rationale: "Approve exact coordinator-selected Change.",
		}),
	};
}

function decisionContext(ref = "confirmation:coordinator-runtime") {
	return {
		decision: {
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref,
			},
			occurredAt: "2026-08-09T00:00:01.000Z",
		},
	};
}

async function selectedReaction(root) {
	const reactor = new RuntimeReactor(root);
	const workState = await buildProjectWorkState({repoRoot: root});
	const change = workState.changes.find(
		(candidate) => candidate.currentLoop === "decision",
	);
	assert.ok(change);
	return {
		reactor,
		reaction: {
			schemaVersion: 1,
			status: "ready",
			trigger: {
				kind: "manual_resume",
				occurredAt: "2026-08-09T00:00:00.000Z",
			},
			observedWorkStateDigest: workState.snapshotDigest,
			selection: {
				loop: "decision",
				change: {
					changeId: change.id,
					traceId: change.traceId,
					changeRevision: change.approval.changeRevision,
					changeDigest: change.approval.changeDigest,
				},
			},
		},
	};
}

function approvedCoordinator(root, generationId) {
	const coordinator = new ProjectCoordinator(root, { generationId });
	coordinator.connectClient({
		clientId: `test:${generationId}`,
		kind: "test",
		supervision: "approved",
	});
	return coordinator;
}

test("Implementation reaction identity includes stable exact worker-report context", () => {
	const reaction = {
		schemaVersion: 1,
		status: "ready",
		trigger: { kind: "timer_due", occurredAt: "2026-08-09T00:00:00.000Z" },
		observedWorkStateDigest: "sha256:worker-report-context",
		selection: {
			loop: "implementation",
			sprintId: "SPR-worker-report-context",
			workItemIds: ["WU-worker-report-context"],
			changeIds: ["CHG-worker-report-context"],
			pathScopes: ["src/worker-report.ts"],
			componentRefs: ["runtime"],
		},
	};
	const workerReport = {
		workerId: "worker:context",
		workUnitId: "WU-worker-report-context",
		claimId: "claim:context",
		planningRefs: ["trace:planning#work:WU-worker-report-context"],
		status: "completed",
		refs: ["runtime-worker-report:context"],
	};
	const first = runtimeReactionJob({
		repoRoot: "/tmp/codewiki-worker-report-context",
		reaction,
		adapters: {},
		implementationWorkerReports: [workerReport],
	});
	const reordered = runtimeReactionJob({
		repoRoot: "/tmp/codewiki-worker-report-context",
		reaction,
		adapters: {},
		implementationWorkerReports: [
			{
				refs: workerReport.refs,
				status: workerReport.status,
				planningRefs: workerReport.planningRefs,
				claimId: workerReport.claimId,
				workUnitId: workerReport.workUnitId,
				workerId: workerReport.workerId,
			},
		],
	});
	const changed = runtimeReactionJob({
		repoRoot: "/tmp/codewiki-worker-report-context",
		reaction,
		adapters: {},
		implementationWorkerReports: [
			{ ...workerReport, refs: ["runtime-worker-report:changed"] },
		],
	});
	assert.equal(first.idempotencyKey, reordered.idempotencyKey);
	assert.notEqual(first.idempotencyKey, changed.idempotencyKey);
});

test("legacy runtime reactions cannot create Decision jobs", async () => {
	const {root} = await fixture("CHG-coordinator-selection-required");
	try {
		const {reactor, reaction} = await selectedReaction(root);
		let adapterCalls = 0;
		const coordinator = approvedCoordinator(root, "generation:selection-required");
		await assert.rejects(
			() =>
				scheduleRuntimeReactionJob({
					repoRoot: root,
					coordinator,
					reactor,
					reaction,
					adapters: {
						decision() {
							adapterCalls += 1;
							return approvingAdapters().decision();
						},
					},
				}),
			/authenticated exact-revision selection/,
		);
		assert.equal(adapterCalls, 0);
		coordinator.close();
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test("generic service reactions do not auto-execute pending Decisions", async () => {
	const {root} = await fixture("CHG-coordinator-service-pending");
	let service;
	let client;
	try {
		let adapterCalls = 0;
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:service-pending",
			semanticAdapters: {
				decision() {
					adapterCalls += 1;
					return approvingAdapters().decision();
				},
			},
			semanticContext: decisionContext("confirmation:service-pending"),
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:pending-client",
			kind: "pi",
			supervision: "approved",
		});
		assert.deepEqual(await client.react({kind: "manual_resume"}), []);
		assert.equal(adapterCalls, 0);
		const trace = await readTraceFileSnapshot(
			join(root, traceFilePath("TRACE-CHG-coordinator-service-pending")),
		);
		assert.equal(
			trace.records.some((record) => record.data?.runtimeJobId),
			false,
		);
		await client.disconnect();
		client = undefined;
		await service.close();
		service = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, {recursive: true, force: true});
	}
});

test("remote candidate submission cannot substitute for Decision selection", async () => {
	const {root} = await fixture("CHG-coordinator-transport");
	let service;
	let client;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:transport",
			semanticContext: decisionContext("confirmation:transport"),
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:semantic-client",
			kind: "pi",
			supervision: "approved",
		});
		const observed = await client.inspect({kind: "manual_resume"});
		assert.equal(observed.status, "quiescent");
		for (const [field, value] of [
			["changeId", "CHG-caller-selected"],
			["runtimeJobId", `runtime-reaction:${"0".repeat(64)}`],
		]) {
			await assert.rejects(
				() =>
					client.submitCandidate(
						{kind: "manual_resume"},
						"decision",
						{...approvingAdapters().decision(), [field]: value},
					),
				new RegExp(
					`Runtime decision candidate cannot supply runtime-owned fields: ${field}`,
				),
			);
		}
		await assert.rejects(
			() =>
				client.submitCandidate(
					{kind: "manual_resume"},
					"decision",
					{
						...approvingAdapters().decision(),
						candidateId: "caller-owned",
					},
				),
			/Runtime decision candidate received unsupported fields: candidateId/,
		);
		await assert.rejects(
			() =>
				client.submitCandidate(
					{kind: "manual_resume"},
					"decision",
					approvingAdapters().decision(),
				),
			(error) =>
				error?.status === 409 &&
				error.message === "decision_attention_selection_required",
		);
		await client.disconnect();
		client = undefined;
		await service.close();
		service = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, {recursive: true, force: true});
	}
});
