import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createChangeRecord } from "../../../src/changes/records.ts";
import { ChangeTraceStore } from "../../../src/changes/trace/store.ts";
import {
	loadPiSemanticAdapters,
	startPiProjectCoordinatorDaemon,
} from "../../../src/runtime/pi/coordinator-daemon.ts";
import { connectProjectCoordinatorClient } from "../../../src/project-server/coordinator/service.ts";
import { acceptedChangeFixture } from "../../helpers/accepted-change.mjs";

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

test("Pi coordinator daemon does not auto-execute pending Decisions", async () => {
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
			semanticContext: {
				decision: {
					authority: {
						kind: "user",
						actor: "user:maintainer",
						ref: "confirmation:CHG-pi-daemon-semantic",
					},
					occurredAt: "2026-08-10T00:00:01.000Z",
				},
			},
			loadSemanticAdapters: async (repoRoot) => {
				assert.equal(repoRoot, root);
				return {
					decision(invocation) {
						adapterCalls += 1;
						assert.equal(invocation.change.id, "CHG-pi-daemon-semantic");
						return {
							disposition: "approve",
							rationale: "Approve coordinator-owned semantic execution.",
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
		const receipts = await client.react({kind: "manual_resume"});
		assert.equal(adapterCalls, 0);
		assert.deepEqual(receipts, []);
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
