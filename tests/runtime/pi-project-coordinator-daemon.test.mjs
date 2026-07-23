import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import {
	loadPiSemanticAdapters,
	startPiProjectCoordinatorDaemon,
} from "../../src/pi/project-coordinator-daemon.ts";
import { connectProjectCoordinatorClient } from "../../src/runtime/project-coordinator-service.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

test("Pi coordinator daemon loads entrypoint-isolated SDK adapters", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pi-daemon-loader-"));
	try {
		const adapters = await loadPiSemanticAdapters(root);
		assert.equal(typeof adapters?.decision, "function");
		assert.equal(typeof adapters?.planning, "function");
		assert.equal(typeof adapters?.implementation, "function");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Pi coordinator daemon owns autonomous semantic adapter execution", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pi-daemon-"));
	let daemon;
	let client;
	let adapterCalls = 0;
	try {
		await new ChangeTraceStore({ repoRoot: root }).write({
			expectedHead: null,
			records: [
				createChangeRecord(
					acceptedChangeFixture({ id: "CHG-pi-daemon-semantic" }),
				),
			],
			message: "Persist autonomous semantic Change",
			actor: "user:maintainer",
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		daemon = await startPiProjectCoordinatorDaemon(root, {
			loadSemanticAdapters: async (repoRoot) => {
				assert.equal(repoRoot, root);
				return {
					decision(invocation) {
						adapterCalls += 1;
						return {
							disposition: "approve",
							rationale: "Approve coordinator-owned semantic execution.",
							authority: {
								kind: "user",
								actor: "user:maintainer",
								ref: `confirmation:${invocation.change.id}`,
							},
							occurredAt: "2026-08-10T00:00:01.000Z",
						};
					},
				};
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:autonomous-daemon-test",
			kind: "pi",
			supervision: "approved",
		});
		assert.equal(client.semanticExecution, "service");
		const receipts = await client.react({ kind: "manual_resume" });
		assert.equal(adapterCalls, 1);
		assert.equal(receipts.length, 1);
		assert.equal(receipts[0].status, "completed");
		assert.equal(receipts[0].evidence.length, 1);
		await client.disconnect();
		client = undefined;
		await daemon.close();
		daemon = undefined;
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (daemon) await daemon.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});
