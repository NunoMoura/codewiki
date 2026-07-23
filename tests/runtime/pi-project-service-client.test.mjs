import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPiProjectServiceClients } from "../../src/pi/project-service-client.ts";
import { startProjectCoordinatorService } from "../../src/runtime/project-coordinator-service.ts";

test("Pi project-service clients reuse one leased supervised connection", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pi-project-service-"));
	await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
	let service;
	let starts = 0;
	const clients = createPiProjectServiceClients({
		timeoutMs: 2_000,
		spawnDaemon(repoRoot) {
			starts += 1;
			void startProjectCoordinatorService(repoRoot, {
				generationId: `generation:pi-client:${starts}`,
			}).then((started) => {
				service = started;
			});
		},
	});
	const ctx = {
		mode: "rpc",
		sessionManager: { getSessionId: () => "session:test" },
	};
	try {
		await clients.connect(root, ctx);
		await clients.connect(root, ctx);
		const reaction = await clients.inspect(root, ctx, {
			kind: "manual_resume",
		});
		assert.equal(reaction.status, "quiescent");
		assert.equal(
			await clients.semanticExecution(root, ctx),
			"client_candidate",
		);
		assert.equal(starts, 1);
		assert.equal(service.coordinator.snapshot().clientCount, 1);
		assert.equal(service.coordinator.snapshot().supervisorCount, 1);
		const firstEvents = await clients.events(root, ctx, 0);
		assert.equal(firstEvents.generationId, "generation:pi-client:1");
		await service.close();
		service = undefined;
		const replacementEvents = await clients.events(
			root,
			ctx,
			firstEvents.latestCursor,
		);
		assert.equal(replacementEvents.generationId, "generation:pi-client:2");
		const recovered = await clients.inspect(root, ctx, {
			kind: "manual_resume",
		});
		assert.equal(recovered.status, "quiescent");
		assert.equal(starts, 2);
		assert.equal(
			service.coordinator.snapshot().generationId,
			"generation:pi-client:2",
		);
		assert.equal(service.coordinator.snapshot().supervisorCount, 1);
		await clients.disconnect(root);
		assert.equal(service.coordinator.snapshot().clientCount, 0);
	} finally {
		await clients.disconnect();
		if (service) await service.close();
		await rm(root, { recursive: true, force: true });
	}
});
