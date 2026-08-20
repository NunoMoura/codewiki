import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { writeWikiConfigFile } from "../../src/project/config-file.ts";
import {
	createPreviewCoordinator,
	tracePreviewIsActive,
} from "../../src/preview/coordinator.ts";
import {
	previewPackageScriptDigest,
	previewProfileDigest,
	resolveWikiPreviewConfig,
} from "../../src/preview/profile.ts";
import { uiPreviewTargetDigest } from "../../src/preview/target.ts";

function profile(port, overrides = {}) {
	return resolveWikiPreviewConfig({
		profiles: [
			{
				id: "web",
				runner: {
					kind: "package_script",
					script: "dev",
					scriptDigest: previewPackageScriptDigest("node server.mjs"),
				},
				url: `http://127.0.0.1:${port}`,
				readyPath: "/ready",
				readyTimeoutMs: 8_000,
				browser: "none",
				autoOpen: true,
				...overrides,
			},
		],
	}).profiles[0];
}

function target(overrides = {}) {
	return {
		id: "dashboard-detail",
		uiRef: ".codewiki/kb/product/uis/terminal.md#live-preview",
		profileId: "web",
		route: "/dashboard",
		viewports: ["desktop", "mobile"],
		...overrides,
	};
}

function previewConfig(configured, configuredTargets = [target()]) {
	return resolveWikiPreviewConfig({
		profiles: [configured],
		uiPreviewTargets: configuredTargets,
	});
}

function records(
	profileDigest,
	targetDigest = uiPreviewTargetDigest(target()),
	targetBindings,
) {
	return [
		{
			type: "trace_event",
			id: "TRACE-preview:planning:1",
			parentId: null,
			traceId: "TRACE-preview",
			sequence: 1,
			loop: "planning",
			event: "work_units_created",
			refs: [],
			createdAt: "2026-07-18T12:01:00.000Z",
			data: {
				output: {
					workGraphDeltaId: "WGD-preview",
					change: { changeId: "CHG-preview" },
					workUnits: [{ id: "WU-preview" }],
					uiPreviewTargets: targetBindings || [
						{
							targetId: "dashboard-detail",
							targetDigest,
							profileId: "web",
							profileDigest,
							workUnitIds: ["WU-preview"],
							changeIds: ["CHG-preview"],
							required: true,
							activation: "implementation",
							autoOpen: "once_per_target",
						},
					],
				},
			},
		},
		{
			type: "trace_event",
			id: "TRACE-preview:implementation:iteration:1",
			parentId: "TRACE-preview:planning:1",
			traceId: "TRACE-preview",
			sequence: 2,
			loop: "implementation",
			event: "evidence_rejected",
			refs: ["work:WU-preview"],
			createdAt: "2026-07-18T12:02:00.000Z",
			data: { iteration: 1 },
		},
	];
}

function integrationState(binding) {
	return {
		root: ".",
		gitHead: "a".repeat(40),
		gitTree: "b".repeat(40),
		workingTreeDigest: `sha256:${"c".repeat(64)}`,
		dirty: false,
		dirtyPaths: [],
		visibility: "integrated",
		visibleChangeIds: [...binding.changeIds],
		conflictingChangeIds: [],
		workGraphDeltaIds: [...binding.workGraphDeltaIds],
		workUnitIds: [...binding.workUnitIds],
	};
}

function coordinatorOptions(overrides = {}) {
	return {
		async readIntegrationState({ binding }) {
			return integrationState(binding);
		},
		...overrides,
	};
}

describe("preview coordinator", () => {
	it("starts a bound package script, waits for readiness, and stops its process group", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-managed-"));
		const port = await availablePort();
		const configured = profile(port);
		const coordinator = createPreviewCoordinator(root, coordinatorOptions());
		try {
			await writeFile(
				join(root, "package.json"),
				`${JSON.stringify(
					{
						name: "preview-fixture",
						private: true,
						type: "module",
						scripts: { dev: "node server.mjs" },
					},
					null,
					2,
				)}\n`,
			);
			await writeFile(
				join(root, "server.mjs"),
				`import { createServer } from "node:http";\nconst server = createServer((request, response) => { response.writeHead(request.url === "/ready" ? 204 : 200); response.end(); });\nserver.listen(${port}, "127.0.0.1");\nprocess.on("SIGTERM", () => server.close(() => process.exit(0)));\n`,
			);
			await writeWikiConfigFile(
				root,
				resolveWikiConfig({ preview: previewConfig(configured) }),
			);
			const starting = await coordinator.reconcile(
				records(previewProfileDigest(configured)),
			);
			assert.equal(starting.length, 1);
			assert.equal(starting[0].state, "starting");
			await waitFor(async () => coordinator.status()[0]?.state === "ready");
			const [status] = coordinator.status();
			assert.equal(status.managed, true);
			assert.deepEqual(status.traceIds, ["TRACE-preview"]);
			const readyResponse = await fetch(`${configured.url}/ready`);
			assert.equal(readyResponse.status, 204);
			await assert.rejects(
				coordinator.capture(
					"dashboard-detail",
					records(previewProfileDigest(configured)),
				),
				/requires the Playwright browser adapter/,
			);

			await writeFile(
				join(root, "package.json"),
				`${JSON.stringify(
					{
						name: "preview-fixture",
						private: true,
						type: "module",
						scripts: { dev: "node changed-server.mjs" },
					},
					null,
					2,
				)}\n`,
			);
			await coordinator.restart(
				"dashboard-detail",
				records(previewProfileDigest(configured)),
			);
			await waitFor(async () => coordinator.status()[0]?.state === "failed");
			assert.match(
				coordinator.status()[0].failure,
				/package script dev changed/,
			);

			await coordinator.stop("dashboard-detail");
			await waitFor(async () => !(await reachable(`${configured.url}/ready`)));
		} finally {
			await coordinator.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("deduplicates one profile process across multiple canonical UI targets", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-dedup-"));
		const port = await availablePort();
		const configured = profile(port);
		const targets = [
			target(),
			target({
				id: "dashboard-settings",
				uiRef: ".codewiki/kb/product/uis/terminal.md#settings",
				route: "/settings",
				viewports: ["desktop"],
			}),
		];
		const bindings = targets.map((configuredTarget) => ({
			targetId: configuredTarget.id,
			targetDigest: uiPreviewTargetDigest(configuredTarget),
			profileId: "web",
			profileDigest: previewProfileDigest(configured),
			workUnitIds: ["WU-preview"],
			changeIds: ["CHG-preview"],
			required: true,
			activation: "implementation",
			autoOpen: "manual",
		}));
		const coordinator = createPreviewCoordinator(root, coordinatorOptions());
		try {
			await writeFile(
				join(root, "package.json"),
				`${JSON.stringify(
					{
						name: "preview-dedup-fixture",
						private: true,
						type: "module",
						scripts: { dev: "node server.mjs" },
					},
					null,
					2,
				)}\n`,
			);
			await writeFile(
				join(root, "server.mjs"),
				`import { createServer } from "node:http";\nconst server = createServer((_request, response) => { response.writeHead(204); response.end(); });\nserver.listen(${port}, "127.0.0.1");\nprocess.on("SIGTERM", () => server.close(() => process.exit(0)));\n`,
			);
			await writeWikiConfigFile(
				root,
				resolveWikiConfig({ preview: previewConfig(configured, targets) }),
			);
			await coordinator.reconcile(
				records(
					previewProfileDigest(configured),
					uiPreviewTargetDigest(targets[0]),
					bindings,
				),
			);
			await waitFor(async () =>
				coordinator.status().every((status) => status.state === "ready"),
			);
			const statuses = coordinator.status();
			assert.equal(statuses.length, 2);
			assert.deepEqual(
				statuses.map((status) => status.targetId),
				["dashboard-detail", "dashboard-settings"],
			);
			assert.ok(statuses.every((status) => status.managed));
			await coordinator.stop("dashboard-settings");
			await waitFor(async () => !(await reachable(`${configured.url}/ready`)));
		} finally {
			await coordinator.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("attaches without owning an existing server and blocks stale profile digests", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-attach-"));
		const server = createServer((_request, response) => {
			response.writeHead(204);
			response.end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const configured = profile(address.port);
		const coordinator = createPreviewCoordinator(root, coordinatorOptions());
		try {
			await writeWikiConfigFile(
				root,
				resolveWikiConfig({ preview: previewConfig(configured) }),
			);
			const stale = await coordinator.reconcile(
				records(`sha256:${"0".repeat(64)}`),
			);
			assert.equal(stale[0].state, "blocked");
			assert.match(stale[0].failure, /digest changed/);

			await coordinator.reconcile(records(previewProfileDigest(configured)));
			await waitFor(async () => coordinator.status()[0]?.state === "ready");
			const [ready] = coordinator.status();
			assert.equal(ready.managed, false);
			await coordinator.close();
			assert.equal((await fetch(`${configured.url}/ready`)).status, 204);
		} finally {
			server.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("captures evidence only for a ready bound Playwright trace", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-capture-"));
		const server = createServer((_request, response) => {
			response.writeHead(204);
			response.end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const configured = profile(address.port, {
			browser: "playwright",
			autoOpen: false,
		});
		let browserOpened = 0;
		let captured;
		const coordinator = createPreviewCoordinator(
			root,
			coordinatorOptions({
				async detectBrowserCapability() {
					return {
						cliState: "available",
						sessionState: "not_open",
						captureAvailable: false,
						reason: "Open preview to verify the browser and enable Capture.",
					};
				},
				async openBrowser() {
					browserOpened += 1;
					if (browserOpened > 1) throw new Error("browser executable missing");
					return { adapter: "playwright", opened: true, async close() {} };
				},
				async captureEvidence(input) {
					captured = input;
					return {
						id: "capture-test",
						targetId: input.target.id,
						targetDigest: input.binding.targetDigest,
						uiRef: input.target.uiRef,
						profileId: input.profile.id,
						profileDigest: previewProfileDigest(input.profile),
						route: input.target.route,
						url: input.profile.url,
						traceIds: [...input.binding.traceIds],
						changeIds: [...input.binding.changeIds],
						workGraphDeltaIds: [...input.binding.workGraphDeltaIds],
						workUnitIds: [...input.binding.workUnitIds],
						implementation: [],
						integration: input.integration,
						capturedAt: "2026-07-18T12:02:00.000Z",
						screenshots: [],
						console: {
							count: 0,
							lines: [],
							truncated: false,
							digest: `sha256:${"b".repeat(64)}`,
						},
						network: {
							count: 0,
							lines: [],
							truncated: false,
							digest: `sha256:${"c".repeat(64)}`,
						},
						manifestPath: ".codewiki/runtime/preview-evidence/manifest.json",
						manifestDigest: `sha256:${"d".repeat(64)}`,
					};
				},
			}),
		);
		try {
			await writeWikiConfigFile(
				root,
				resolveWikiConfig({ preview: previewConfig(configured) }),
			);
			const traceRecords = records(previewProfileDigest(configured));
			await coordinator.reconcile(traceRecords);
			await waitFor(async () => coordinator.status()[0]?.state === "ready");
			assert.equal(
				coordinator.status()[0].browserCapability.captureAvailable,
				false,
			);
			await coordinator.open("dashboard-detail");
			assert.equal(
				coordinator.status()[0].browserCapability.captureAvailable,
				true,
			);
			const statuses = await coordinator.capture(
				"dashboard-detail",
				traceRecords,
			);
			assert.equal(browserOpened, 1);
			assert.deepEqual(captured.binding.traceIds, ["TRACE-preview"]);
			assert.deepEqual(captured.target.viewports, ["desktop", "mobile"]);
			assert.equal(statuses[0].captures[0].id, "capture-test");
			await assert.rejects(
				coordinator.capture("missing-target", traceRecords),
				/not ready/,
			);
			await coordinator.restart("dashboard-detail", traceRecords);
			await waitFor(async () => coordinator.status()[0]?.state === "ready");
			assert.equal(coordinator.status()[0].captures[0].id, "capture-test");
			await assert.rejects(
				coordinator.open("dashboard-detail"),
				/browser executable missing/,
			);
			assert.equal(
				coordinator.status()[0].browserCapability.sessionState,
				"failed",
			);
			assert.match(
				coordinator.status()[0].browserCapability.installHint,
				/install-browser/,
			);
			const stopped = await coordinator.stop("dashboard-detail");
			assert.equal(stopped[0].captures[0].id, "capture-test");
		} finally {
			await coordinator.close();
			server.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("keeps preview ready but disables Open and Capture when Playwright is unavailable", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-capability-"));
		const server = createServer((_request, response) => {
			response.writeHead(204);
			response.end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const configured = profile(address.port, {
			browser: "playwright",
			autoOpen: false,
		});
		let browserOpenCalls = 0;
		const coordinator = createPreviewCoordinator(
			root,
			coordinatorOptions({
				async detectBrowserCapability() {
					return {
						cliState: "unavailable",
						sessionState: "not_open",
						captureAvailable: false,
						reason: "playwright-cli is not available on PATH.",
						installHint: "Install Playwright explicitly.",
					};
				},
				async openBrowser() {
					browserOpenCalls += 1;
					return { adapter: "playwright", opened: true, async close() {} };
				},
			}),
		);
		try {
			await writeWikiConfigFile(
				root,
				resolveWikiConfig({ preview: previewConfig(configured) }),
			);
			const traceRecords = records(previewProfileDigest(configured));
			await coordinator.reconcile(traceRecords);
			await waitFor(async () => coordinator.status()[0]?.state === "ready");
			const status = coordinator.status()[0];
			assert.equal(status.browserCapability.cliState, "unavailable");
			assert.equal(status.browserCapability.captureAvailable, false);
			await assert.rejects(
				coordinator.open("dashboard-detail"),
				/not available on PATH/,
			);
			await assert.rejects(
				coordinator.capture("dashboard-detail", traceRecords),
				/not available on PATH/,
			);
			assert.equal(browserOpenCalls, 0);
			assert.equal(status.state, "ready");
		} finally {
			await coordinator.close();
			server.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("activates only after planning reaches implementation handoff", async () => {
		const digest = `sha256:${"a".repeat(64)}`;
		assert.equal(tracePreviewIsActive([], "TRACE-preview"), false);
		assert.equal(
			tracePreviewIsActive(records(digest).slice(0, 1), "TRACE-preview"),
			true,
		);
		assert.equal(tracePreviewIsActive(records(digest), "TRACE-preview"), true);
	});
});

async function availablePort() {
	const server = createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	await new Promise((resolve) => server.close(resolve));
	return address.port;
}

async function reachable(url) {
	try {
		await fetch(url);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(predicate) {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.fail("condition did not become true before timeout");
}
