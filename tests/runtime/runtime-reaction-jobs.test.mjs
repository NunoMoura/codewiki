import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { readTraceFileSnapshot } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { ProjectCoordinator } from "../../src/runtime/project-coordinator.ts";
import { projectCoordinatorOwnershipPath } from "../../src/runtime/project-coordinator-endpoint.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../src/runtime/project-coordinator-service.ts";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import { scheduleRuntimeReactionJob } from "../../src/runtime/runtime-reaction-jobs.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

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

function approvingAdapters(approvalRef = "confirmation:coordinator-runtime") {
	return {
		decision: () => ({
			disposition: "approve",
			rationale: "Approve exact coordinator-selected Change.",
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref: approvalRef,
			},
			occurredAt: "2026-08-09T00:00:01.000Z",
		}),
	};
}

async function selectedReaction(root) {
	const reactor = new RuntimeReactor(root);
	const observation = await reactor.observeMany({ kind: "manual_resume" });
	assert.equal(observation.reactions.length, 1);
	return { reactor, reaction: observation.reactions[0] };
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

test("runtime reaction job binds exact trace evidence and recovers after restart", async () => {
	const { root } = await fixture("CHG-coordinator-recovery");
	try {
		const { reactor, reaction } = await selectedReaction(root);
		const firstCoordinator = approvedCoordinator(root, "generation:first");
		const first = await scheduleRuntimeReactionJob({
			repoRoot: root,
			coordinator: firstCoordinator,
			reactor,
			reaction,
			adapters: approvingAdapters(),
		});
		assert.equal(first.status, "completed");
		assert.equal(first.loop, "decision");
		assert.equal(first.evidence.length, 1);
		const trace = await readTraceFileSnapshot(
			join(root, traceFilePath(first.evidence[0].traceId)),
		);
		const event = trace.records.find(
			(record) => record.id === first.evidence[0].eventId,
		);
		assert.equal(event?.type, "trace_event");
		assert.equal(event?.data?.runtimeJobId, first.jobId);
		firstCoordinator.close();

		let adapterCalls = 0;
		const restarted = approvedCoordinator(root, "generation:restarted");
		const recovered = await scheduleRuntimeReactionJob({
			repoRoot: root,
			coordinator: restarted,
			reactor: new RuntimeReactor(root),
			reaction,
			adapters: {
				decision() {
					adapterCalls += 1;
					throw new Error("recovered job must not invoke adapter");
				},
			},
		});
		assert.deepEqual(recovered, first);
		assert.equal(adapterCalls, 0);
		restarted.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("runtime reaction job rejects stale exact selection before adapter invocation", async () => {
	const { root } = await fixture("CHG-coordinator-stale");
	try {
		const { reactor, reaction } = await selectedReaction(root);
		assert.equal(reaction.selection?.loop, "decision");
		const selection = reaction.selection;
		const trace = await readTraceFileSnapshot(
			join(root, traceFilePath(selection.change.traceId)),
		);
		await runWikiDecide({
			repoRoot: root,
			changeId: selection.change.changeId,
			expectedRevision: selection.change.changeRevision,
			expectedChangeDigest: selection.change.changeDigest,
			expectedWorkStateDigest: reaction.observedWorkStateDigest,
			expectedBytes: trace.bytes,
			disposition: "approve",
			rationale: "Supersede stale selected reaction.",
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref: "confirmation:superseding-decision",
			},
			occurredAt: "2026-08-09T00:00:00.500Z",
			mode: "append",
		});
		let adapterCalls = 0;
		const coordinator = approvedCoordinator(root, "generation:stale");
		const result = await scheduleRuntimeReactionJob({
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
		});
		assert.equal(result.status, "stale");
		assert.deepEqual(result.evidence, []);
		assert.equal(adapterCalls, 0);
		coordinator.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("runtime reaction job rechecks generation authority before append", async () => {
	const { root } = await fixture("CHG-coordinator-fence");
	try {
		const { reactor, reaction } = await selectedReaction(root);
		const coordinator = approvedCoordinator(root, "generation:fence");
		let fenceChecks = 0;
		await assert.rejects(
			() =>
				scheduleRuntimeReactionJob({
					repoRoot: root,
					coordinator,
					reactor,
					reaction,
					adapters: approvingAdapters("confirmation:fenced"),
					beforeAppend() {
						fenceChecks += 1;
						throw new Error("stale_generation");
					},
				}),
			/stale_generation/,
		);
		assert.equal(fenceChecks, 1);
		const evidence = reaction.selection
			? await readTraceFileSnapshot(
					join(root, traceFilePath(reaction.selection.change.traceId)),
				)
			: undefined;
		assert.equal(
			evidence?.records.some(
				(record) => record.data?.runtimeJobId?.startsWith("runtime-reaction:"),
			),
			false,
		);
		coordinator.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("elected service fences generation replacement after adapter return", async () => {
	const { root } = await fixture("CHG-coordinator-service-fence");
	let service;
	let client;
	try {
		let releaseAdapter;
		const adapterRelease = new Promise((resolve) => {
			releaseAdapter = resolve;
		});
		let markStarted;
		const adapterStarted = new Promise((resolve) => {
			markStarted = resolve;
		});
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:service-fence",
			semanticAdapters: {
				async decision() {
					markStarted();
					await adapterRelease;
					return approvingAdapters("confirmation:service-fence").decision();
				},
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:fenced-client",
			kind: "pi",
			supervision: "approved",
		});
		const reaction = client.react({ kind: "manual_resume" });
		await adapterStarted;
		await writeFile(
			projectCoordinatorOwnershipPath(root),
			`${JSON.stringify({
				schemaVersion: 1,
				repoRoot: root,
				pid: process.pid,
				generationId: "generation:replacement",
				ownerNonce: "owner:replacement",
				startedAt: "2026-08-09T00:00:02.000Z",
			})}\n`,
			{ mode: 0o600 },
		);
		releaseAdapter();
		await assert.rejects(
			() => reaction,
			(error) => error?.status === 409 && error.message === "stale_generation",
		);
		const trace = await readTraceFileSnapshot(
			join(root, traceFilePath("TRACE-CHG-coordinator-service-fence")),
		);
		assert.equal(
			trace.records.some((record) => record.data?.runtimeJobId),
			false,
		);
		await service.close();
		service = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

test("elected service runs compatible Decision adapters concurrently", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-reaction-batch-"));
	let service;
	let client;
	try {
		const records = [
			createChangeRecord(
				acceptedChangeFixture({
					id: "CHG-coordinator-batch-a",
					targetRefs: ["src/a.ts"],
				}),
			),
			createChangeRecord(
				acceptedChangeFixture({
					id: "CHG-coordinator-batch-b",
					targetRefs: ["src/b.ts"],
				}),
			),
		];
		await new ChangeTraceStore({ repoRoot: root }).write({
			expectedHead: null,
			records,
			message: "Persist compatible coordinator Changes",
			actor: "user:maintainer",
			createdAt: "2026-08-09T00:00:00.000Z",
		});
		let resolveBoth;
		const bothStarted = new Promise((resolve) => {
			resolveBoth = resolve;
		});
		let firstCalls = 0;
		let active = 0;
		let maxActive = 0;
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:batch",
			maxConcurrentJobs: 2,
			maxReactions: 2,
			semanticAdapters: {
				async decision(invocation) {
					active += 1;
					maxActive = Math.max(maxActive, active);
					firstCalls += 1;
					if (firstCalls === 2) resolveBoth();
					if (firstCalls <= 2) await bothStarted;
					active -= 1;
					return {
						disposition: "approve",
						rationale: "Approve compatible coordinator Change.",
						authority: {
							kind: "user",
							actor: "user:maintainer",
							ref: `confirmation:${invocation.change.id}`,
						},
						occurredAt: "2026-08-09T00:00:01.000Z",
					};
				},
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:batch-client",
			kind: "pi",
			supervision: "approved",
		});
		const receipts = await client.react({ kind: "manual_resume" });
		assert.equal(receipts.length, 2);
		assert.equal(receipts.every((receipt) => receipt.status === "completed"), true);
		assert.equal(receipts.every((receipt) => receipt.evidence.length === 1), true);
		assert.equal(maxActive, 2);
		await client.disconnect();
		client = undefined;
		await service.close();
		service = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

test("authenticated remote client executes semantic work through elected service", async () => {
	const { root } = await fixture("CHG-coordinator-transport");
	let service;
	let client;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:transport",
			semanticAdapters: approvingAdapters("confirmation:transport"),
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:semantic-client",
			kind: "pi",
			supervision: "approved",
		});
		const preview = await client.react({ kind: "manual_resume" }, "preview");
		assert.equal(preview.length, 1);
		assert.equal(preview[0].status, "previewed");
		assert.deepEqual(preview[0].evidence, []);
		const receipts = await client.react({ kind: "manual_resume" });
		assert.equal(receipts.length, 1);
		assert.notEqual(receipts[0].jobId, preview[0].jobId);
		assert.equal(receipts[0].status, "completed");
		assert.equal(receipts[0].evidence.length, 1);
		await client.disconnect();
		client = undefined;
		await service.close();
		service = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});
