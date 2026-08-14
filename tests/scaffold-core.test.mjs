import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../src/index.ts";
import * as packageApi from "../src/index.ts";
import * as runtimeApi from "../src/runtime/index.ts";
import { traceTmpPath } from "../src/runtime/persistence/tmp.ts";
import packageJson from "../package.json" with { type: "json" };
import tsconfig from "../tsconfig.json" with { type: "json" };
import buildTsconfig from "../tsconfig.build.json" with { type: "json" };

const readme = readFileSync("README.md", "utf8");
const sourceIndex = readFileSync("src/index.ts", "utf8");
const runtimeIndex = readFileSync("src/runtime/index.ts", "utf8");

describe("fresh scaffold", () => {
	it("exposes the Pi extension for package installs", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
	});

	it("keeps the package root contract-focused and the Runtime facade acyclic", () => {
		assert.equal(existsSync("src/api"), false);
		assert.doesNotMatch(sourceIndex, /from "\.\/api\//);
		assert.doesNotMatch(sourceIndex, /from "\.\/pi\//);
		assert.doesNotMatch(runtimeIndex, /from "\.\.\/clients\//);
		assert.doesNotMatch(runtimeIndex, /from "\.\.\/execution\/pi\//);
		assert.equal(
			Object.keys(packageApi).some(
				(name) => name.startsWith("Pi") || name.startsWith("createPi"),
			),
			false,
		);
		assert.equal(typeof packageApi.resolveExecutionCapabilities, "function");
		assert.equal(typeof packageApi.createRepairExecutionInvocation, "function");
		assert.equal("resolveHarnessCapabilities" in packageApi, false);
		assert.equal("createRepairHarnessInvocation" in packageApi, false);
		assert.equal("runWikiChange" in packageApi, false);
		assert.equal("buildWikiState" in packageApi, false);
	});

	it("declares runtime requirements for generated package output", () => {
		assert.equal(packageJson.engines.node, ">=20.6.0");
		assert.equal(packageJson.bin, undefined);
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi-extension.js"],
		});
		assert.equal(packageJson.keywords.includes("pi-package"), true);
		assert.deepEqual(packageJson.files, [
			"dist",
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"package.json",
		]);
		assert.deepEqual(packageJson.exports, {
			".": {
				types: "./dist/index.d.ts",
				import: "./dist/index.js",
			},
			"./runtime": {
				types: "./dist/runtime/index.d.ts",
				import: "./dist/runtime/index.js",
			},
			"./pi-sdk": {
				types: "./dist/execution/pi/sdk-semantic-session.d.ts",
				import: "./dist/execution/pi/sdk-semantic-session.js",
			},
			"./package.json": "./package.json",
		});
		assert.equal(packageJson.types, "./dist/index.d.ts");
		assert.match(packageJson.scripts.build, /rmSync\('dist'/);
		assert.match(packageJson.scripts.build, /tsc -p tsconfig\.build\.json/);
		assert.equal(tsconfig.compilerOptions.erasableSyntaxOnly, true);
		assert.equal(buildTsconfig.compilerOptions.outDir, "dist");
		assert.equal(
			buildTsconfig.compilerOptions.rewriteRelativeImportExtensions,
			true,
		);
	});

	it("does not promote the transitional CLI as product usage", () => {
		assert.doesNotMatch(readme, /codewiki <command>/);
		assert.doesNotMatch(readme, /codewiki state/);
		assert.doesNotMatch(readme, /codewiki bootstrap/);
		assert.doesNotMatch(
			readme,
			/node --experimental-strip-types src\/(?:clients\/cli|cli)\/index\.ts/,
		);
	});

	it("publishes one curated Runtime command and query surface", () => {
		assert.deepEqual(Object.keys(runtimeApi).sort(), [
			"CHANGE_INTAKE_RUNTIME_PROTOCOL",
			"buildProjectWikiState",
			"buildWikiState",
			"connectProjectRuntimeGateway",
			"createChangeIntakeRuntime",
			"createCodeWikiLoopExecutionPorts",
			"createProjectRuntimeGateway",
			"runRuntimeSemanticExecutor",
			"runWikiArchive",
			"runWikiChange",
			"runWikiConfig",
			"runWikiDecide",
			"runWikiImplement",
			"runWikiOkf",
			"runWikiPlan",
			"runWikiRuntime",
			"stopProjectRuntime",
			"wikiChangeOperationMutates",
		]);
	});

	it("keeps temporary trace scratch under runtime tmp", () => {
		assert.equal(
			traceTmpPath("TRACE-20260611-example", "planning"),
			".codewiki/runtime/tmp/TRACE-20260611-example/planning",
		);
	});
});
