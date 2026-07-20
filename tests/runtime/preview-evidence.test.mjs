import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { capturePreviewEvidence } from "../../src/preview/evidence.ts";
import {
	previewPackageScriptDigest,
	previewProfileDigest,
	resolveWikiPreviewConfig,
} from "../../src/preview/profile.ts";
import { uiPreviewTargetDigest } from "../../src/preview/target.ts";

function profile(browser = "playwright") {
	return resolveWikiPreviewConfig({
		profiles: [
			{
				id: "web",
				runner: {
					kind: "package_script",
					script: "dev",
					scriptDigest: previewPackageScriptDigest("node server.mjs"),
				},
				url: "http://127.0.0.1:4173",
				readyPath: "/ready",
				readyTimeoutMs: 5_000,
				browser,
				autoOpen: false,
			},
		],
	}).profiles[0];
}

const configuredTarget = {
	id: "dashboard-detail",
	uiRef: ".codewiki/kb/product/uis/terminal.md#live-preview",
	profileId: "web",
	route: "/dashboard",
	viewports: ["desktop", "mobile"],
};

function binding(configuredProfile) {
	return {
		targetId: configuredTarget.id,
		targetDigest: uiPreviewTargetDigest(configuredTarget),
		profileId: configuredProfile.id,
		profileDigest: previewProfileDigest(configuredProfile),
		workItemIds: ["WU-capture"],
		contributingChangeIds: ["CHG-capture"],
		required: true,
		activation: "implementation",
		autoOpen: "manual",
		traceIds: ["TRACE-capture"],
		sprintIds: ["SPR-capture"],
	};
}

const integration = {
	root: ".",
	gitHead: "a".repeat(40),
	gitTree: "b".repeat(40),
	workingTreeDigest: `sha256:${"c".repeat(64)}`,
	dirty: false,
	dirtyPaths: [],
	visibility: "integrated",
	visibleChangeIds: ["CHG-capture"],
	conflictingChangeIds: [],
	sprintIds: ["SPR-capture"],
	workItemIds: ["WU-capture"],
};

const records = [
	{
		type: "trace_event",
		id: "TRACE-capture:planning:iteration:1",
		traceId: "TRACE-capture",
		sequence: 1,
		loop: "planning",
		event: "work_units_created",
		refs: [],
		createdAt: "2026-07-19T10:00:00.000Z",
		data: { iteration: 1 },
	},
	{
		type: "trace_event",
		id: "TRACE-capture:implementation:iteration:3",
		traceId: "TRACE-capture",
		sequence: 2,
		loop: "implementation",
		event: "evidence_rejected",
		refs: [],
		createdAt: "2026-07-19T10:01:00.000Z",
		data: {},
	},
];

describe("preview evidence capture", () => {
	it("captures declared viewports and writes a digest-correlated bounded manifest", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-evidence-"));
		const calls = [];
		try {
			await writeFile(join(root, "README.md"), "fixture\n");
			git(root, "init", "-q");
			git(root, "config", "user.name", "CodeWiki Test");
			git(root, "config", "user.email", "codewiki@example.invalid");
			git(root, "add", "README.md");
			git(root, "commit", "-qm", "fixture");
			const configuredProfile = profile();
			const capture = await capturePreviewEvidence({
				repoRoot: root,
				profile: configuredProfile,
				target: configuredTarget,
				binding: binding(configuredProfile),
				integration,
				records,
				sessionId: "codewiki-capture-test",
				now: () => new Date("2026-07-19T10:02:03.004Z"),
				async commandRunner(args) {
					calls.push(args);
					const filename = args.find((arg) => arg.startsWith("--filename="));
					if (filename) {
						await writeFile(
							filename.slice("--filename=".length),
							`png:${args.join(" ")}`,
						);
					}
					if (args.at(-1) === "console") {
						return {
							stdout: `${Array.from({ length: 105 }, (_, index) => `info ${index}`).join("\n")}\ninfo loaded http://127.0.0.1:4173/?token=private\npassword=hunter2`,
							stderr: "",
						};
					}
					if (args.at(-1) === "requests") {
						return {
							stdout: "GET http://127.0.0.1:4173/api?secret=private 200",
							stderr: "",
						};
					}
					return { stdout: "", stderr: "" };
				},
			});

			assert.equal(capture.targetId, "dashboard-detail");
			assert.deepEqual(capture.traceIds, ["TRACE-capture"]);
			assert.equal(
				capture.implementation[0].implementationIterationId,
				"TRACE-capture:implementation:iteration:3",
			);
			assert.equal(capture.implementation[0].implementationIteration, 3);
			assert.equal(capture.integration.dirty, false);
			assert.match(capture.integration.gitHead, /^[a-f0-9]{40}$/);
			assert.match(capture.manifestDigest, /^sha256:[a-f0-9]{64}$/);
			assert.deepEqual(
				capture.screenshots.map((item) => [
					item.viewport,
					item.width,
					item.height,
				]),
				[
					["desktop", 1440, 900],
					["mobile", 390, 844],
				],
			);
			assert.equal(calls.length, 7);
			assert.ok(calls.every((args) => args[0] === "-s=codewiki-capture-test"));
			assert.equal(capture.console.count, 107);
			assert.equal(capture.console.lines.length, 100);
			assert.equal(capture.console.truncated, true);
			assert.doesNotMatch(capture.console.lines.join("\n"), /private|hunter2/);
			assert.doesNotMatch(capture.network.lines.join("\n"), /private/);
			const manifest = JSON.parse(
				await readFile(join(root, capture.manifestPath), "utf8"),
			);
			assert.equal(manifest.manifestDigest, capture.manifestDigest);
			assert.equal(manifest.screenshots.length, 2);
			assert.ok(
				capture.screenshots.every((item) =>
					item.path.startsWith(".codewiki/runtime/preview-evidence/"),
				),
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("fails closed when profile does not approve Playwright", async () => {
		await assert.rejects(
			capturePreviewEvidence({
				repoRoot: "/tmp/not-used",
				profile: profile("system"),
				target: configuredTarget,
				binding: binding(profile("system")),
				integration,
				records,
				sessionId: "codewiki-capture-test",
			}),
			/requires the Playwright browser adapter/,
		);
	});
});

function git(root, ...args) {
	execFileSync("git", args, { cwd: root, stdio: "ignore" });
}
