import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startCodewikiDashboardServer } from "../../src/dashboard/server.ts";
import { bootstrapCodewiki } from "../../src/project/bootstrap.ts";
import { startProjectCoordinatorService } from "../../src/runtime/project-coordinator-service.ts";

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
			keepAlive: false,
			inProcess: true,
			persistent: false,
			projectCoordinatorClient: true,
		});
		assert.equal(service.coordinator.snapshot().clientCount, 1);
		assert.equal(service.coordinator.snapshot().supervisorCount, 0);
		await dashboard.close();
		dashboard = undefined;
		assert.equal(service.coordinator.snapshot().clientCount, 0);
	} finally {
		if (dashboard) await dashboard.close().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});
