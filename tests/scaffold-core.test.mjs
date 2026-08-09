import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../src/index.ts";
import * as packageApi from "../src/index.ts";
import * as publicApi from "../src/api/index.ts";
import { traceTmpPath } from "../src/runtime/persistence/tmp.ts";
import packageJson from "../package.json" with { type: "json" };
import tsconfig from "../tsconfig.json" with { type: "json" };
import buildTsconfig from "../tsconfig.build.json" with { type: "json" };

const readme = readFileSync("README.md", "utf8");
const sourceIndex = readFileSync("src/index.ts", "utf8");
const apiIndex = readFileSync("src/api/index.ts", "utf8");

describe("fresh scaffold", () => {
	it("exposes the Pi extension for package installs", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
	});

	it("keeps the package root harness-neutral and the API facade acyclic", () => {
		assert.match(sourceIndex, /export \* from "\.\/api\/index\.ts"/);
		assert.doesNotMatch(sourceIndex, /from "\.\/pi\//);
		assert.equal(
			Object.keys(packageApi).some(
				(name) => name.startsWith("Pi") || name.startsWith("createPi"),
			),
			false,
		);
		assert.doesNotMatch(apiIndex, /from "\.\.\/index\.ts"/);
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
			"./coordinator": {
				types: "./dist/harnesses/coordinator-entrypoint.d.ts",
				import: "./dist/harnesses/coordinator-entrypoint.js",
			},
			"./pi-sdk": {
				types: "./dist/harnesses/pi/sdk-semantic-session.d.ts",
				import: "./dist/harnesses/pi/sdk-semantic-session.js",
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

	it("keeps the package API surface facade runtime- and contract-only", () => {
		assert.deepEqual(Object.keys(publicApi).sort(), [
			"BACKLOG_TRIAGE_PROJECTION_PROTOCOL",
			"BACKLOG_TRIAGE_QUERY_PROTOCOL",
			"CHANGE_DEFECT_PROFILE_PROTOCOL",
			"CHANGE_INTAKE_MATERIAL_PROTOCOL",
			"CHANGE_INTAKE_MATERIAL_TYPES",
			"CHANGE_INTAKE_RUNTIME_PROTOCOL",
			"CODEWIKI_EXTENSION_AVAILABLE",
			"DEFAULT_WIKI_CONFIG",
			"ProjectCoordinator",
			"TRIAGE_CONFIDENCE",
			"TRIAGE_EFFORTS",
			"TRIAGE_LEVELS",
			"TRIAGE_ORDERINGS",
			"TRIAGE_REVERSIBILITY",
			"buildBacklogTriageProjection",
			"buildProjectWorkState",
			"buildWikiState",
			"buildWorkState",
			"createChangeIntakeRuntime",
			"createDeliveryObservationMaterial",
			"createDeliveryObservationMaterialFromEvidence",
			"createKnowledgeDriftMaterial",
			"createKnowledgeDriftMaterialFromIssue",
			"createOutcomeFindingMaterial",
			"createOutcomeFindingMaterialFromEvidence",
			"createPullRequestFindingMaterial",
			"createRegressionFindingMaterial",
			"createSecurityScannerFindingMaterial",
			"createUserSuggestionMaterial",
			"createWorkerDiscoveryMaterial",
			"createWorkerReportDiscoveryMaterials",
			"normalizeChangeDefectProfile",
			"normalizeChangeIntakeContent",
			"normalizeChangeIntakeMaterial",
			"normalizeChangeSecurityProfile",
			"queryBacklogTriage",
			"resolveWikiConfig",
			"runRuntimeSemanticExecutor",
			"runWikiArchive",
			"runWikiChange",
			"runWikiConfig",
			"runWikiDecide",
			"runWikiImplement",
			"runWikiOkf",
			"runWikiPlan",
			"runWikiRuntime",
			"validateWikiConfig",
		]);
	});

	it("keeps temporary trace scratch under runtime tmp", () => {
		assert.equal(
			traceTmpPath("TRACE-20260611-example", "planning"),
			".codewiki/runtime/tmp/TRACE-20260611-example/planning",
		);
	});
});
