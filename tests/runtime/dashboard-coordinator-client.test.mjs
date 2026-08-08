import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import { bootstrapCodewiki } from "../../src/project/bootstrap.ts";
import {
	connectProjectCoordinatorClient,
	readProjectCoordinatorServiceState,
	startProjectCoordinatorService,
	stopProjectCoordinatorService,
} from "../../src/runtime/coordinator/service.ts";

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

test("dashboard registers as observer of shared project coordinator", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-coordinator-"));
	let service;
	let dashboard;
	try {
		await bootstrapCodewiki(root, { projectName: "dashboard-coordinator" });
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:dashboard-client",
		});
		dashboard = await startCodewikiDashboardServer({
			repoRoot: root,
			open: false,
			keepAlive: true,
			inProcess: true,
			persistent: false,
			projectCoordinatorClient: true,
			projectCoordinatorConnector: async (repoRoot, input) => {
				try {
					return await connectProjectCoordinatorClient(repoRoot, input, {
						timeoutMs: 500,
					});
				} catch {
					service = await startProjectCoordinatorService(repoRoot, {
						generationId: "generation:dashboard-replacement",
					});
					return connectProjectCoordinatorClient(repoRoot, input, {
						timeoutMs: 500,
					});
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
