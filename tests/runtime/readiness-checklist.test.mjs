import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../../src/index.ts";
import {
	formatKnowledgeDriftIssues,
	lintKnowledgeDrift,
} from "../../src/knowledge/drift-linter.ts";
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

function knowledgeDriftFiles() {
	const productPaths = new Set(productDocumentationFiles);
	return Array.from(new Set(operatingGuidanceFiles)).map((path) => ({
		path,
		content: readFileSync(path, "utf8"),
		scopes: [
			...(productPaths.has(path) ? ["product_documentation"] : []),
			"operating_guidance",
		],
	}));
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
		assert.equal(
			packageJson.scripts["test:project-local-install"],
			"node tests/runtime/project-local-install-smoke.mjs",
		);
		assert.equal(
			packageJson.scripts["test:external-dogfood"],
			"node tests/runtime/external-package-dogfood-smoke.mjs",
		);
		assert.equal(
			packageJson.scripts["test:external-failures"],
			"node tests/runtime/external-package-failures-smoke.mjs",
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

	it("recommends project-local CodeWiki installation", () => {
		const readme = readFileSync("README.md", "utf8");
		const extensionDoc = readFileSync(
			".codewiki/kb/system/extension.md",
			"utf8",
		);
		const runtimeDoc = readFileSync(".codewiki/kb/system/runtime.md", "utf8");
		assert.match(readme, /pi install -l npm:codewiki/);
		assert.match(extensionDoc, /pi install -l npm:codewiki/);
		assert.match(readme, /Avoid global\/user installs/);
		assert.match(extensionDoc, /Global\/user installs are discouraged/);
		assert.match(readme, /Production readiness and automation gates/);
		assert.match(extensionDoc, /Production readiness gates/);
		assert.match(runtimeDoc, /Automation gates/);
		assert.match(runtimeDoc, /Unattended\s+worker dispatch/i);
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
		assert.deepEqual(
			formatKnowledgeDriftIssues(lintKnowledgeDrift(knowledgeDriftFiles())),
			[],
		);
	});
});
