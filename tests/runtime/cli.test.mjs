import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { runCodewikiCli } from "../../src/cli/index.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";

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
		join(root, ".codewiki", "kb", "system", "source-map.yaml"),
		[
			"id: test-source-map",
			"source_docs:",
			"  - kb:system/source-map.md",
			"defaults:",
			"  inheritance: true",
			"  excluded: []",
			"components:",
			"  api:",
			"    doc: kb:system/api.md",
			"    source_patterns:",
			"      - src/api/**",
			"    test_patterns:",
			"      - tests/api/**",
			"    generated_views:",
			"      - .codewiki/views/status.json",
			"    trace_events:",
			"      - decision.iteration",
			"",
		].join("\n"),
	);
	return root;
}

describe("CLI adapter", () => {
	it("prints wiki_state JSON from project traces and source-map", async () => {
		const root = await fixture();
		try {
			const result = spawnSync(
				process.execPath,
				[
					"--experimental-strip-types",
					"src/cli/index.ts",
					"state",
					"--repo",
					root,
					"--trace",
					"TRACE-cli",
					"--source",
					"src/api/index.ts",
				],
				{ cwd: process.cwd(), encoding: "utf8" },
			);
			assert.equal(result.status, 0, result.stderr);
			const output = JSON.parse(result.stdout);
			assert.deepEqual(output.traceIds, ["TRACE-cli"]);
			assert.equal(output.selectedTraceId, "TRACE-cli");
			assert.equal(output.sourceOwners[0].componentId, "api");
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

	it("runs write facade commands from JSON input", async () => {
		const root = await fixture();
		try {
			const traceHead = createTraceHead({
				traceId: "TRACE-cli-command",
				title: "CLI command fixture",
				createdAt: "2026-06-12T00:00:00.000Z",
			});
			const commandInputs = {
				decide: {
					traceId: "TRACE-cli-command",
					tableInput: { rows: [] },
				},
				plan: {
					traceId: "TRACE-cli-command",
					decisionEvents: [],
				},
				implement: {
					repoRoot: root,
					traceId: "TRACE-cli-command",
					planningEvents: [],
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
