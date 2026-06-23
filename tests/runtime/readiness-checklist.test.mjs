import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../../src/index.ts";
import { assertValidTraceRecord } from "../../src/traces/schema.ts";
import {
	formatKnowledgeDriftIssues,
	lintKnowledgeDrift,
} from "../../src/knowledge/drift-linter.ts";
import { piExtensionAvailable } from "../../src/pi/extension.ts";
import {
	CODEWIKI_PROMPT_GUIDELINES,
	renderCodewikiPromptInstructions,
} from "../../src/pi/prompt/index.ts";
import { CODEWIKI_TOOL_NAMES } from "../../src/pi/tools/index.ts";

const packageJson = jsonFile("package.json");
const buildTsconfig = jsonFile("tsconfig.build.json");
const codewikiConfig = jsonFile(".codewiki/config.json");
const piSettings = existsSync(".pi/settings.json")
	? jsonFile(".pi/settings.json")
	: { packages: [] };
const productDocumentationFiles = ["README.md", ...filesUnder(".codewiki/kb")];
const operatingGuidanceFiles = [
	...productDocumentationFiles,
	...filesUnder(".agents/skills"),
];
const expectedToolNames = [
	"wiki_state",
	"wiki_config",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_archive",
];
const expectedSkillNames = [
	"codewiki-decide",
	"codewiki-implement",
	"codewiki-plan",
];
const forbiddenSkillNames = [
	"codewiki-state",
	"codewiki-runtime",
	"codewiki-config",
	"codewiki-archive",
	"codewiki-decision",
	"codewiki-planning",
	"codewiki-implementation",
];
const agentSurfaceFiles = [
	"README.md",
	...filesUnder(".codewiki/kb"),
	...filesUnder(".agents/skills"),
	...filesUnder("src/pi"),
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
	it("exposes packaged Pi extension metadata without repo-local dogfooding", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
		assert.equal(piExtensionAvailable, true);
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi/extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
		assert.equal(packageJson.private, true);
		assert.equal(packageJson.publishConfig, undefined);
		assert.equal(packageJson.bin, undefined);
		assert.equal(packageJson.keywords.includes("pi-package"), true);
		assert.deepEqual(Object.keys(packageJson.exports).sort(), [
			".",
			"./package.json",
		]);
		assert.equal(packageJson.scripts["test:pi-dogfood"], undefined);
		assert.equal(
			packageJson.scripts["test:pi-install"],
			"node tests/runtime/pi-install-smoke.mjs",
		);
		assert.equal(
			packageJson.scripts["test:project-local-install"],
			"node tests/runtime/project-local-install-smoke.mjs",
		);
		assert.equal(
			packageJson.scripts["test:external-lifecycle"],
			"node tests/runtime/external-package-lifecycle-smoke.mjs",
		);
		assert.equal(
			packageJson.scripts["test:external-failures"],
			"node tests/runtime/external-package-failures-smoke.mjs",
		);
	});

	it("keeps the internal agent tool surface small and exact", () => {
		assert.deepEqual([...CODEWIKI_TOOL_NAMES], expectedToolNames);
		assert.equal(
			readFileSync("src/pi/tools/index.ts", "utf8").includes("wiki_runtime"),
			false,
		);
	});

	it("keeps only semantic loop skills", () => {
		assert.deepEqual(readdirSync(".agents/skills").sort(), expectedSkillNames);
		for (const skill of forbiddenSkillNames) {
			assert.equal(existsSync(join(".agents/skills", skill)), false, skill);
		}
	});

	it("keeps the injected CodeWiki prompt high signal and low noise", () => {
		const prompt = renderCodewikiPromptInstructions();
		assert.equal(CODEWIKI_PROMPT_GUIDELINES.length <= 4, true);
		assert.equal(prompt.length < 900, true);
		assert.match(prompt, /wiki_state/);
		assert.match(prompt, /wiki_decide/);
		assert.match(prompt, /wiki_plan/);
		assert.match(prompt, /wiki_implement/);
		assert.doesNotMatch(prompt, /wiki_runtime/);
		assert.doesNotMatch(prompt, /wiki_config/);
		assert.doesNotMatch(prompt, /wiki_archive/);
	});

	it("keeps runtime and source-map details out of the agent-facing state surface", () => {
		const agentSurfaceText = agentSurfaceFiles
			.map((path) => `${path}\n${readFileSync(path, "utf8")}`)
			.join("\n---\n");
		assert.doesNotMatch(agentSurfaceText, /wiki_runtime/);
		assert.doesNotMatch(
			readFileSync("src/api/state.ts", "utf8"),
			/sourceOwners|sourcePaths/,
		);
		assert.doesNotMatch(
			readFileSync("src/project/state-file.ts", "utf8"),
			/sourceOwners|sourcePaths/,
		);
		assert.doesNotMatch(
			readFileSync("src/pi/tools/index.ts", "utf8"),
			/sourceOwners|sourcePaths/,
		);
	});

	it("keeps lab code out of the packaged Pi extension", () => {
		assert.deepEqual(packageJson.files, [
			"dist",
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"package.json",
		]);
		assert.deepEqual(buildTsconfig.include, ["src/**/*.ts"]);
		assert.equal(packageJson.pi.extensions.includes("lab"), false);
		assert.equal(existsSync("lab"), true);
		assert.equal(
			readFileSync("src/pi/extension.ts", "utf8").includes("lab/"),
			false,
		);
		assert.equal(
			readFileSync("src/pi/prompt/index.ts", "utf8").includes("lab/"),
			false,
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

	it("keeps trace truth in TRACE files without central index files", () => {
		assert.equal(existsSync(".codewiki/traces.jsonl"), false);
		assert.equal(existsSync(".codewiki/traces/traces.jsonl"), false);
		assert.equal(existsSync(".codewiki/traces/catalog.json"), false);
		assert.equal(existsSync(".codewiki/traces/trace-index.jsonl"), false);
	});

	it("keeps hot trace files valid under the current schema", () => {
		for (const fileName of readdirSync(".codewiki/traces")) {
			if (!/^TRACE-.*\.jsonl$/.test(fileName)) continue;
			const path = join(".codewiki/traces", fileName);
			const records = readFileSync(path, "utf8")
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			for (const record of records) assertValidTraceRecord(record);
		}
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
		assert.match(readme, /not published to the npm registry yet/);
		assert.match(extensionDoc, /not published to the npm registry yet/);
		assert.match(readme, /future registry package name is still TBD/);
		assert.match(extensionDoc, /future registry package name is still TBD/);
		assert.match(readme, /Avoid global\/user installs/);
		assert.match(extensionDoc, /Global\/user installs are discouraged/);
		assert.match(readme, /Production readiness and automation gates/);
		assert.match(extensionDoc, /Production readiness gates/);
		assert.match(runtimeDoc, /Automation gates/);
		assert.match(runtimeDoc, /Unattended\s+worker start/i);
	});

	it("keeps this checkout free of repo-local CodeWiki dogfooding", () => {
		const packages = piSettings.packages || [];
		assert.equal(Array.isArray(packages), true);
		assert.equal(packages.includes("npm:pi-lens"), true);
		assert.equal(packages.includes(".."), false);
		assert.deepEqual(
			packages.filter((entry) => JSON.stringify(entry).includes("codewiki")),
			[],
		);
		assert.equal(existsSync(".pi/extensions/codewiki.ts"), false);
		assert.equal(existsSync(".pi/extensions"), false);
		assert.equal(
			packageJson.scripts["audit:codewiki"].includes("pi-dogfood"),
			false,
		);
	});

	it("has no stale public command or trace wording in docs", () => {
		assert.deepEqual(
			formatKnowledgeDriftIssues(lintKnowledgeDrift(knowledgeDriftFiles())),
			[],
		);
	});
});
