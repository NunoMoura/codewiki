import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	connectEnsuredProjectCoordinatorClient,
	ensureProjectCoordinatorService,
	projectCoordinatorDaemonScriptPath,
} from "../../src/runtime/coordinator/process.ts";
import {
	startProjectCoordinatorService,
	stopProjectCoordinatorService,
} from "../../src/runtime/coordinator/service.ts";
import { readProjectCoordinatorEndpoint } from "../../src/runtime/coordinator/endpoint.ts";

test("project coordinator process ensure reuses one responsive service", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-coordinator-process-"));
	let service;
	let starts = 0;
	const options = {
		timeoutMs: 2_000,
		spawnDaemon(repoRoot) {
			starts += 1;
			void startProjectCoordinatorService(repoRoot, {
				generationId: "generation:ensured",
			}).then((started) => {
				service = started;
			});
		},
	};
	try {
		const first = await ensureProjectCoordinatorService(root, options);
		const second = await ensureProjectCoordinatorService(root, {
			...options,
			spawnDaemon() {
				throw new Error("responsive service must be reused");
			},
		});
		assert.equal(first.generationId, "generation:ensured");
		assert.equal(second.generationId, first.generationId);
		assert.equal(starts, 1);
		const client = await connectEnsuredProjectCoordinatorClient(
			root,
			{
				clientId: "test:ensured",
				kind: "test",
				supervision: "approved",
			},
			options,
		);
		assert.equal((await client.state()).clientCount, 1);
		await client.disconnect();
		await stopProjectCoordinatorService(root, { timeoutMs: 2_000 });
		assert.equal(await readProjectCoordinatorEndpoint(root), undefined);
		assert.match(
			projectCoordinatorDaemonScriptPath(),
			/[\\/]pi[\\/]project-coordinator-daemon\.js$/,
		);
	} finally {
		if (service) await service.close();
		await rm(root, { recursive: true, force: true });
	}
});
