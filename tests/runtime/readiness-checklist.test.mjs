import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../../src/index.ts";
import { piExtensionAvailable } from "../../src/pi/extension.ts";

const packageJson = jsonFile("package.json");
const codewikiConfig = jsonFile(".codewiki/config.json");
const piSettings = existsSync(".pi/settings.json")
	? jsonFile(".pi/settings.json")
	: { packages: [] };
const productDocumentationFiles = ["README.md", ...filesUnder(".codewiki/kb")];
const operatingGuidanceFiles = [
	...productDocumentationFiles,
	...filesUnder(".agents/skills"),
];

function jsonFile(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function filesUnder(root) {
	const files = [];
	for (const entry of readdirSync(root).sort()) {
		const path = join(root, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) files.push(...filesUnder(path));
		else files.push(path);
	}
	return files;
}

function assertNoPattern(paths, pattern, message) {
	const matches = [];
	for (const path of paths) {
		const content = readFileSync(path, "utf8");
		if (pattern.test(content)) matches.push(path);
	}
	assert.deepEqual(matches, [], message);
}

describe("install readiness checklist", () => {
	it("exposes package install metadata for repo-local dogfooding", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
		assert.equal(piExtensionAvailable, true);
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi/extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
		assert.equal(packageJson.bin, undefined);
		assert.equal(packageJson.keywords.includes("pi-package"), true);
		assert.deepEqual(Object.keys(packageJson.exports).sort(), [
			".",
			"./package.json",
		]);
		assert.equal(
			packageJson.scripts["test:pi-install"],
			"node tests/runtime/pi-install-smoke.mjs",
		);
	});

	it("does not bundle Pi as a runtime dependency", () => {
		const dependencyNames = [
			...Object.keys(packageJson.dependencies || {}),
			...Object.keys(packageJson.peerDependencies || {}),
			...Object.keys(packageJson.bundledDependencies || {}),
		];
		assert.deepEqual(
			dependencyNames.filter((name) => name.startsWith("@earendil-works/")),
			[],
		);
		assert.equal(packageJson.dependencies["js-yaml"], undefined);
		assert.equal(packageJson.dependencies.yaml.startsWith("^2."), true);
		assert.equal(packageJson.dependencies.typebox, undefined);
		assert.equal(packageJson.devDependencies.typebox, "^1.2.14");
		assert.deepEqual(packageJson.peerDependencies, { typebox: "*" });
	});

	it("keeps the active .codewiki top level in the target shape", () => {
		assert.deepEqual(readdirSync(".codewiki").sort(), [
			"config.json",
			"kb",
			"traces",
			"views",
		]);
	});

	it("keeps the CLI out of product host config", () => {
		assert.deepEqual(Object.keys(codewikiConfig.hosts).sort(), ["mcp", "pi"]);
		assert.equal(codewikiConfig.hosts.pi.enabled, false);
		assert.equal(codewikiConfig.hosts.mcp.enabled, false);
	});

	it("enables this checkout for repo-local Pi dogfooding", () => {
		const packages = piSettings.packages || [];
		assert.equal(Array.isArray(packages), true);
		assert.equal(packages.includes("npm:pi-lens"), true);
		assert.equal(packages.includes(".."), true);
		assert.deepEqual(
			packages.filter((entry) => JSON.stringify(entry).includes("codewiki")),
			[],
		);
	});

	it("has no stale public command or trace wording in docs", () => {
		assertNoPattern(
			productDocumentationFiles,
			/\/codewiki(?:\s|$)/,
			"docs must use /wiki, not /codewiki",
		);
		assertNoPattern(
			productDocumentationFiles,
			/\bcodewiki\s+(?:<command>|state|bootstrap)\b/,
			"docs must not advertise the transitional CLI as product UX",
		);
		assertNoPattern(
			productDocumentationFiles,
			/\btrace\.close\b/,
			"docs must use trace_close event wording",
		);
		assertNoPattern(
			productDocumentationFiles,
			/\bwiki_status\b|\/wiki\s+status\b/,
			"public UX must use state, not status",
		);
		assertNoPattern(
			operatingGuidanceFiles,
			/extension is disabled|while the extension is disabled|hosts\.cli/,
			"docs/skills must use current repo-local dogfood gating wording",
		);
	});
});
