import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE, sourceLayout } from "../src/index.ts";
import * as publicApi from "../src/api/index.ts";
import { traceTmpPath } from "../src/runtime/tmp.ts";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const buildTsconfig = JSON.parse(readFileSync("tsconfig.build.json", "utf8"));
const readme = readFileSync("README.md", "utf8");

const expectedSupportRoots = [
	"traces",
	"views",
	"knowledge",
	"git",
	"cli",
	"pi",
	"runtime",
	"project",
	"utils",
];

describe("fresh scaffold", () => {
	it("exposes the Pi extension for package installs", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
	});

	it("names the intended source roots", () => {
		assert.deepEqual(sourceLayout.loopRoots, [
			"decision",
			"planning",
			"implementation",
		]);
		assert.deepEqual(sourceLayout.supportRoots, expectedSupportRoots);
		assert.equal(sourceLayout.supportRoots.includes("graph"), false);
		assert.equal(sourceLayout.supportRoots.includes("telemetry"), false);
		assert.equal(sourceLayout.supportRoots.includes("agency"), false);
	});

	it("declares runtime requirements for generated package output", () => {
		assert.equal(packageJson.engines.node, ">=20.6.0");
		assert.equal(packageJson.bin, undefined);
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi/extension.js"],
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
			/node --experimental-strip-types src\/cli\/index\.ts/,
		);
	});

	it("keeps the package API surface facade-only", () => {
		assert.deepEqual(Object.keys(publicApi).sort(), [
			"CODEWIKI_EXTENSION_AVAILABLE",
			"DEFAULT_WIKI_CONFIG",
			"buildWikiState",
			"resolveWikiConfig",
			"runWikiArchive",
			"runWikiConfig",
			"runWikiDecide",
			"runWikiImplement",
			"runWikiPlan",
			"runWikiRuntime",
			"sourceLayout",
			"validateWikiConfig",
			"wikiStateSourceOwner",
		]);
	});

	it("keeps temporary trace scratch under runtime tmp", () => {
		assert.equal(
			traceTmpPath("TRACE-20260611-example", "planning"),
			".codewiki/runtime/tmp/TRACE-20260611-example/planning",
		);
	});
});
