import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	artifactRunIds,
	hasDependencies,
	npmStartAvailable,
	parseArgs,
	selectRunId,
} from "../../benchmarks/serve-artifact.mjs";

describe("benchmark artifact local viewer", () => {
	it("lists artifact runs that have source archives", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-artifacts-"));
		mkdirSync(join(root, "run-b"), { recursive: true });
		mkdirSync(join(root, "run-a"), { recursive: true });
		mkdirSync(join(root, "run-empty"), { recursive: true });
		writeFileSync(join(root, "run-b", "source.tgz"), "not a real tar");
		writeFileSync(join(root, "run-a", "source.tgz"), "not a real tar");

		assert.deepEqual(artifactRunIds(root), ["run-a", "run-b"]);
	});

	it("selects latest or requested run id", () => {
		const runs = ["2026-01-a", "2026-02-b"];

		assert.equal(selectRunId(undefined, runs), "2026-02-b");
		assert.equal(selectRunId("latest", runs), "2026-02-b");
		assert.equal(selectRunId("2026-01-a", runs), "2026-01-a");
		assert.throws(() => selectRunId("missing", runs), /Unknown benchmark run/);
		assert.throws(() => selectRunId(undefined, []), /No benchmark artifact/);
	});

	it("parses viewer CLI arguments", () => {
		assert.deepEqual(parseArgs(["run-1", "--port", "3000", "--install"]), {
			runId: "run-1",
			artifactsDir: "benchmarks/artifacts",
			workDir: "benchmarks/.serve",
			port: 3000,
			list: false,
			install: true,
		});
		assert.equal(parseArgs(["--list"]).list, true);
		assert.throws(() => parseArgs(["--port", "nope"]), /--port/);
	});

	it("detects npm start and dependency need from package.json", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-artifact-project-"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				type: "module",
				scripts: { start: "node server.js" },
				dependencies: { example: "1.0.0" },
			}),
		);

		assert.equal(npmStartAvailable(root), true);
		assert.equal(hasDependencies(root), true);
	});
});
