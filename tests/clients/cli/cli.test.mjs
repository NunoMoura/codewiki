import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { runCodewikiCli } from "../../../src/clients/cli/index.ts";
import { planningQualityStandards } from "../../helpers/canonical-loop-events.mjs";
import { seedProjectServerImplementation } from "../../helpers/project-server-implementation.mjs";
import { createTraceHead, formatTraceText } from "../../../src/changes/trace/writer.ts";

const cliPath = resolve("src/clients/cli/index.ts");

async function writeJsonInput(root, name, value) {
	const path = join(root, name);
	await writeFile(path, JSON.stringify(value));
	return path;
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-cli-"));
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
	await writeFile(
		join(root, ".codewiki", "traces", "TRACE-cli.jsonl"),
		formatTraceText([
			createTraceHead({
				traceId: "TRACE-cli",
				title: "CLI fixture",
				createdAt: "2026-06-12T00:00:00.000Z",
			}),
		]),
	);
	await writeFile(
		join(root, ".codewiki", "traces", "NOT-A-TRACE.jsonl"),
		"not json\n",
	);
	return root;
}

describe("CLI adapter", () => {
	it("prints help without a subcommand", async () => {
		const result = await runCodewikiCli(["--help"]);

		assert.equal(result.status, 0);
		assert.match(result.stdout || "", /codewiki <command>/);
	});

	it("discovers the CodeWiki project from nested cwd", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, "src", "api"), { recursive: true });
			const result = spawnSync(
				process.execPath,
				[
					"--experimental-strip-types",
					cliPath,
					"state",
					"--trace",
					"TRACE-cli",
				],
				{ cwd: join(root, "src", "api"), encoding: "utf8" },
			);

			assert.equal(result.status, 0, result.stderr);
			const output = JSON.parse(result.stdout);
			assert.deepEqual(output.traceIds, ["TRACE-cli"]);
			assert.equal(output.selectedTraceId, "TRACE-cli");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("prints wiki_state JSON from project traces", async () => {
		const root = await fixture();
		try {
			const result = spawnSync(
				process.execPath,
				[
					"--experimental-strip-types",
					cliPath,
					"state",
					"--repo",
					root,
					"--trace",
					"TRACE-cli",
				],
				{ cwd: process.cwd(), encoding: "utf8" },
			);
			assert.equal(result.status, 0, result.stderr);
			const output = JSON.parse(result.stdout);
			assert.deepEqual(output.traceIds, ["TRACE-cli"]);
			assert.equal(output.selectedTraceId, "TRACE-cli");
			assert.equal(output.append.byTrace["TRACE-cli"].nextSequence, 1);
			assert.equal(output.append.byTrace["TRACE-cli"].expectedBytes > 0, true);
			assert.equal(output.next.action, "decide");
			assert.equal(output.next.tool, undefined);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("resolves wiki_config JSON from CLI defaults", async () => {
		const result = await runCodewikiCli(["config"]);
		assert.equal(result.status, 0);
		assert.match(result.stdout || "", /"project": "codewiki"/);
	});

	it("bootstraps and writes config through CLI", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-cli-bootstrap-"));
		try {
			await writeFile(join(root, "package.json"), '{"name":"cli-bootstrap"}\n');
			const bootstrap = await runCodewikiCli(["bootstrap", "--repo", root]);
			assert.equal(bootstrap.status, 0, bootstrap.stderr || "");
			const bootstrapOutput = JSON.parse(bootstrap.stdout || "{}");
			assert.equal(bootstrapOutput.project, "cli-bootstrap");
			assert.ok(bootstrapOutput.created.includes(".codewiki/config.json"));

			const inputPath = await writeJsonInput(root, "config-patch.json", {
				patch: { runtime: { maxWorkers: 2 } },
			});
			const config = await runCodewikiCli([
				"config",
				"--repo",
				root,
				"--input",
				inputPath,
				"--write",
			]);
			assert.equal(config.status, 0, config.stderr || "");
			const configOutput = JSON.parse(config.stdout || "{}");
			assert.equal(configOutput.written, true);
			assert.equal(configOutput.config.runtime.maxWorkers, 2);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("loads repo config for runtime append policy", async () => {
		const root = await fixture();
		try {
			await writeFile(
				join(root, ".codewiki", "config.json"),
				JSON.stringify({ runtime: { automation: "assist" } }),
			);
			const head = createTraceHead({
				traceId: "TRACE-cli",
				title: "CLI fixture",
				createdAt: "2026-06-12T00:00:00.000Z",
			});
			const expectedBytes = Buffer.byteLength(formatTraceText([head]));
			const planningRef =
				"trace:TRACE-cli:planning:iteration:1#work:WU-cli-runtime";
			const inputPath = await writeJsonInput(root, "runtime-append.json", {
				mode: "append",
				queue: {
					traceIds: ["TRACE-cli"],
					summary: {
						backlog: 0,
						waiting: 0,
						ready: 1,
						claimed: 0,
						blocked: 0,
						done: 0,
					},
					items: [
						{
							id: "WU-cli-runtime",
							kind: "work-unit",
							status: "ready",
							traceId: "TRACE-cli",
							title: "Runtime append",
							traceRefs: [planningRef],
							changeRefs: [],
							planningRefs: [planningRef],
							componentRefs: ["runtime"],
							pathScopes: ["src/runtime"],
							dependsOn: [],
							blockers: [],
							qualityStandards: planningQualityStandards([]),
							qualityBlockers: [],
							sourceEventId: planningRef,
						},
					],
				},
				nextSequenceByTrace: { "TRACE-cli": 1 },
				expectedBytesByTrace: { "TRACE-cli": expectedBytes },
			});
			const result = await runCodewikiCli([
				"runtime",
				"--repo",
				root,
				"--input",
				inputPath,
			]);
			const output = JSON.parse(result.stdout || "{}");

			assert.equal(result.status, 0, result.stderr || "");
			assert.equal(output.policy.automation, "assist");
			assert.equal(output.append.events.length, 1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("runs write facade commands from JSON input", async () => {
		const root = await fixture();
		try {
			const implementation = await seedProjectServerImplementation(root, {
				suffix: "cli-command",
				workItemId: "WU-cli-command",
			});
			const traceHead = createTraceHead({
				traceId: "TRACE-cli-command",
				title: "CLI command fixture",
				createdAt: "2026-06-12T00:00:00.000Z",
			});
			const commandInputs = {
				implement: {
					repoRoot: root,
					expectedWorkStateDigest: implementation.expectedWorkStateDigest,
					evidence: [{ workItemId: "WU-cli-command" }],
				},
				runtime: {
					queue: {
						traceIds: [],
						summary: {
							backlog: 0,
							waiting: 0,
							ready: 0,
							claimed: 0,
							blocked: 0,
							done: 0,
						},
						items: [],
					},
				},
				archive: {
					records: [traceHead],
					gitRestoreRef: "refs/codewiki/archive/TRACE-cli-command",
				},
			};
			for (const [command, input] of Object.entries(commandInputs)) {
				const inputPath = await writeJsonInput(root, `${command}.json`, input);
				const result = await runCodewikiCli([command, "--input", inputPath]);
				assert.equal(result.status, 0, `${command}: ${result.stderr || ""}`);
				assert.equal(JSON.parse(result.stdout || "{}").mode, "preview");
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
