import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startCodewikiAppServer } from "../../../src/server/app/server.ts";
import { bootstrapCodewiki } from "../../../src/project/bootstrap.ts";
import {
	connectProjectCoordinatorClient,
	readProjectCoordinatorServiceState,
	startProjectCoordinatorService,
	stopProjectCoordinatorService,
} from "../../../src/runtime/coordinator/service.ts";
import { createProjectRuntimeGateway } from "../../../src/runtime/gateway.ts";

test("Project Runtime gateway exposes bounded grouped operations", async () => {
	const calls = [];
	const context = {
		actor: {actorId: "user:test", authenticatedIdentityRef: "identity:test"},
		client: {clientKind: "app", clientInstanceId: "app:test", authenticationRef: "auth:test"},
	};
	const client = {
		state: async () => {
			calls.push(["state"]);
			return {
				projectRoot: "/project",
				generationId: "generation:test",
				executionPolicy: "supervised",
				executionPermitted: true,
				clientCount: 1,
				supervisorCount: 1,
				recoveringJobCount: 0,
				queuedJobCount: 0,
				activeJobCount: 0,
				completedJobCount: 2,
				jobs: [{ idempotencyKey: "internal" }],
			};
		},
		appState: async (requestContext) => {
			calls.push(["appState", requestContext]);
			return { projectRoot: "/project", summary: { pipeline: 0 } };
		},
		changes: async (requestContext) => {
			calls.push(["changes", requestContext]);
			return { records: [] };
		},
		configuration: async (requestContext) => {
			calls.push(["configuration", requestContext]);
			return { source: "default" };
		},
		inspect: async (trigger) => {
			calls.push(["inspect", trigger]);
			return {
				schemaVersion: 1,
				status: "quiescent",
				trigger,
				observedWorkStateDigest: "sha256:test",
				selection: { internal: true },
			};
		},
		decisionAttention: async (request) => {
			calls.push(["decisionAttention", request]);
			return { items: [] };
		},
		selectDecision: async (command) => {
			calls.push(["selectDecision", command]);
			return { operationId: "operation:test" };
		},
		submitCandidate: async (trigger, loop, candidate, mode) => {
			calls.push(["submitCandidate", trigger, loop, candidate, mode]);
			return {
				receipt: {
					schemaVersion: 1,
					jobId: "job:candidate",
					loop,
					status: "completed",
					evidence: [],
				},
			};
		},
		events: async (afterCursor, options) => {
			calls.push(["events", afterCursor, options]);
			return {
				schemaVersion: 1,
				generationId: "generation:test",
				latestCursor: afterCursor,
				cursor: afterCursor,
				resetRequired: false,
				events: [],
			};
		},
		heartbeat: async () => calls.push(["heartbeat"]),
		disconnect: async () => calls.push(["disconnect"]),
	};

	const gateway = createProjectRuntimeGateway(client);
	assert.deepEqual(await gateway.queries.state(), {
		projectRoot: "/project",
		generationId: "generation:test",
		executionPolicy: "supervised",
		executionPermitted: true,
		clientCount: 1,
		supervisorCount: 1,
		recoveringJobCount: 0,
		queuedJobCount: 0,
		activeJobCount: 0,
		completedJobCount: 2,
	});
	assert.deepEqual(await gateway.queries.appState(context), {
		projectRoot: "/project",
		summary: { pipeline: 0 },
	});
	assert.deepEqual(await gateway.queries.changes(context), { records: [] });
	assert.deepEqual(await gateway.queries.configuration(context), {
		source: "default",
	});
	assert.deepEqual(
		await gateway.queries.inspect({ kind: "project_truth_changed" }),
		{
			schemaVersion: 1,
			status: "quiescent",
			trigger: { kind: "project_truth_changed" },
			observedWorkStateDigest: "sha256:test",
		},
	);
	await gateway.queries.decisionAttention({ maxItems: 2 });
	await gateway.commands.selectDecision({ changeId: "CHG-test" });
	await gateway.commands.submitCandidate(
		{ kind: "project_truth_changed" },
		"planning",
		{ candidateId: "candidate:test" },
		"append",
	);
	await gateway.events.read(4, { maxEvents: 8 });
	await gateway.connection.heartbeat();
	await gateway.connection.disconnect();

	assert.deepEqual(calls.slice(1, 4).map(([, requestContext]) => requestContext), [
		context,
		context,
		context,
	]);
	assert.deepEqual(
		calls.map(([name]) => name),
		[
			"state",
			"appState",
			"changes",
			"configuration",
			"inspect",
			"decisionAttention",
			"selectDecision",
			"submitCandidate",
			"events",
			"heartbeat",
			"disconnect",
		],
	);
	assert.equal(Object.isFrozen(gateway), true);
	assert.deepEqual(Object.keys(gateway).sort(), [
		"commands",
		"connection",
		"events",
		"queries",
	]);
});

async function waitForReplacement(root, previousGeneration, deadline) {
	const state = await readProjectCoordinatorServiceState(root).catch(() => undefined);
	if (
		state &&
		state.generationId !== previousGeneration &&
		state.clientCount === 1
	) {
		return state;
	}
	if (Date.now() >= deadline) {
		throw new Error("Dashboard did not resubscribe to replacement coordinator.");
	}
	await new Promise((resolve) => setTimeout(resolve, 50));
	return waitForReplacement(root, previousGeneration, deadline);
}

test("App Server registers as observer of shared Project Runtime", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-app-runtime-"));
	let service;
	let dashboard;
	try {
		await bootstrapCodewiki(root, { projectName: "dashboard-coordinator" });
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:dashboard-client",
		});
		dashboard = await startCodewikiAppServer({
			repoRoot: root,
			open: false,
			keepAlive: true,
			inProcess: true,
			persistent: false,
			connectProjectRuntime: true,
			projectRuntimeConnector: async (repoRoot, input) => {
				try {
					return createProjectRuntimeGateway(
						await connectProjectCoordinatorClient(repoRoot, input, {
							timeoutMs: 500,
						}),
					);
				} catch {
					service = await startProjectCoordinatorService(repoRoot, {
						generationId: "generation:dashboard-replacement",
					});
					return createProjectRuntimeGateway(
						await connectProjectCoordinatorClient(repoRoot, input, {
							timeoutMs: 500,
						}),
					);
				}
			},
		});
		assert.equal(service.coordinator.snapshot().clientCount, 1);
		assert.equal(service.coordinator.snapshot().supervisorCount, 0);
		await service.close();
		service = undefined;
		const replacement = await waitForReplacement(
			root,
			"generation:dashboard-client",
			Date.now() + 10_000,
		);
		assert.equal(replacement.clientCount, 1);
		assert.equal(replacement.supervisorCount, 0);
		await dashboard.close();
		dashboard = undefined;
		await stopProjectCoordinatorService(root);
	} finally {
		if (dashboard) await dashboard.close().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await stopProjectCoordinatorService(root).catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});
