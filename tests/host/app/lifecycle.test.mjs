import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
	assertInstalledCodewikiRuntimeCurrent,
	captureInstalledCodewikiRuntimeIdentity,
	installedCodewikiRuntimeHealth,
} from "../../../src/host/app/installed-runtime.ts";
import { startCodewikiAppServer } from "../../../src/host/app/server.ts";

function pin(commit, sha256) {
	return JSON.stringify({
		source: { commit },
		package: { sha256 },
	});
}

describe("Host App lifecycle", () => {
	it("detects when Pi still has a replaced pinned runtime loaded", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-health-"));
		try {
			await mkdir(
				join(
					root,
					".pi",
					"npm",
					"node_modules",
					"@nunomoura",
					"codewiki",
					"dist",
					"host",
					"app",
				),
				{ recursive: true },
			);
			await writeFile(
				join(root, ".pi", "codewiki-controller.json"),
				pin("a".repeat(40), "1".repeat(64)),
			);
			const moduleUrl = pathToFileURL(
				join(
					root,
					".pi",
					"npm",
					"node_modules",
					"@nunomoura",
					"codewiki",
					"dist",
					"host",
					"app",
					"daemon.js",
				),
			).href;
			const loaded = captureInstalledCodewikiRuntimeIdentity(moduleUrl);
			assert.deepEqual(loaded, {
				commit: "a".repeat(40),
				packageSha256: "1".repeat(64),
			});
			assert.equal(
				installedCodewikiRuntimeHealth(loaded, root).status,
				"current",
			);

			await writeFile(
				join(root, ".pi", "codewiki-controller.json"),
				pin("b".repeat(40), "2".repeat(64)),
			);
			assert.equal(
				installedCodewikiRuntimeHealth(loaded, root).status,
				"mismatch",
			);
			assert.throws(
				() => assertInstalledCodewikiRuntimeCurrent(loaded, root),
				/Fully exit and restart Pi; \/reload is not sufficient/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects an endpoint that cannot serve pipeline state", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-state-"));
		try {
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "traces", "TRACE-invalid.jsonl"),
				`${JSON.stringify({
					type: "trace_event",
					id: "TRACE-invalid:decision:iteration:1",
					parentId: null,
					traceId: "TRACE-invalid",
					sequence: 1,
					loop: "decision",
					event: "change_approved",
					refs: [],
					createdAt: "2026-07-12T00:00:00.000Z",
					data: {},
				})}\n`,
			);
			await assert.rejects(
				() =>
					startCodewikiAppServer({
						repoRoot: root,
						open: false,
						keepAlive: false,
						inProcess: true,
						persistent: false,
					}),
				/did not serve pipeline state/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("leaves ordinary non-controller installs unmanaged", () => {
		const loaded = captureInstalledCodewikiRuntimeIdentity(
			pathToFileURL("/tmp/codewiki/dist/host/app/daemon.js").href,
		);
		assert.equal(loaded, undefined);
		assert.deepEqual(installedCodewikiRuntimeHealth(loaded, "/tmp/codewiki"), {
			status: "unmanaged",
		});
	});
});
