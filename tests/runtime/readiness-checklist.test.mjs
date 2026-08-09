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
import { piExtensionAvailable } from "../../src/clients/pi/extension.ts";
import {
	CODEWIKI_PROMPT_GUIDELINES,
	renderCodewikiPromptInstructions,
} from "../../src/clients/pi/prompt/index.ts";
import { CODEWIKI_TOOL_NAMES } from "../../src/clients/pi/tools/index.ts";

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
	"wiki_attention",
	"wiki_config",
	"wiki_change",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_archive",
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
	return parseJson(readFileSync(path, "utf8"), path);
}

function parseJson(value, label) {
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`Invalid JSON in ${label}.`, { cause: error });
	}
}

function filesUnder(root) {
	const files = [];
	if (!existsSync(root)) return files;
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
	it("exposes packaged Pi extension metadata for disposable external installs", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, true);
		assert.equal(piExtensionAvailable, true);
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/clients/pi/extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
		assert.equal(packageJson.name, "@nunomoura/codewiki");
		assert.equal(packageJson.private, true);
		assert.equal(packageJson.publishConfig, undefined);
		assert.equal(packageJson.bin, undefined);
		assert.equal(packageJson.keywords.includes("pi-package"), true);
		assert.deepEqual(Object.keys(packageJson.exports).sort(), [
			".",
			"./coordinator",
			"./package.json",
			"./pi-sdk",
		]);
		assert.deepEqual(packageJson.exports["./coordinator"], {
			types: "./dist/harnesses/coordinator-entrypoint.d.ts",
			import: "./dist/harnesses/coordinator-entrypoint.js",
		});
		assert.deepEqual(packageJson.exports["./pi-sdk"], {
			types: "./dist/harnesses/pi/sdk-semantic-session.d.ts",
			import: "./dist/harnesses/pi/sdk-semantic-session.js",
		});
		assert.equal(packageJson.scripts["test:pi-dogfood"], undefined);
		assert.equal(
			packageJson.scripts["test:pi-install"],
			"node tests/clients/pi/install-smoke.mjs",
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
		const toolSource = readFileSync("src/clients/pi/tools/index.ts", "utf8");
		assert.equal(toolSource.includes("wiki_runtime"), false);
		assert.match(toolSource, /Internal agent read/);
		assert.match(toolSource, /not a user command/);
	});

	it("keeps the source checkout free of project-local CodeWiki skills", () => {
		assert.deepEqual(filesUnder(".agents/skills"), []);
		for (const skill of forbiddenSkillNames) {
			assert.equal(existsSync(join(".agents/skills", skill)), false, skill);
		}
	});

	it("keeps the injected CodeWiki prompt high signal and low noise", () => {
		const prompt = renderCodewikiPromptInstructions();
		assert.equal(CODEWIKI_PROMPT_GUIDELINES.length <= 4, true);
		assert.equal(prompt.length < 900, true);
		assert.match(prompt, /internal wiki_state/);
		assert.match(prompt, /user \/wiki-select command/);
		assert.match(prompt, /runtimeReaction/);
		assert.doesNotMatch(prompt, /wiki_decide|wiki_plan|wiki_implement/);
		assert.match(prompt, /\.codewiki\/kb\/product\/DESIGN\.md/);
		assert.doesNotMatch(prompt, /wiki_runtime/);
		assert.doesNotMatch(prompt, /wiki_config/);
		assert.doesNotMatch(prompt, /wiki_archive/);
		assert.match(prompt, /open the Work Pipeline dashboard automatically/);
		assert.match(prompt, /\/wiki-dashboard reopens or stops/);
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
			readFileSync("src/clients/pi/tools/index.ts", "utf8"),
			/sourceOwners|sourcePaths/,
		);
	});

	it("keeps reconciled control-center behavior in release gates without dogfood state", () => {
		assert.match(
			packageJson.scripts["test:smoke"],
			/tests\/integration\/\*\.test\.mjs/,
		);
		assert.match(
			packageJson.scripts["test:features"],
			/tests\/integration\/\*\.test\.mjs/,
		);
		assert.equal(
			existsSync("tests/integration/control-center-reconciliation.test.mjs"),
			true,
		);
		for (const path of [
			"src/ideas",
			"src/api/wiki-ideas.ts",
			"src/ideas/git-ref-store.ts",
		]) {
			assert.equal(existsSync(path), false, path);
		}
		assert.equal(
			existsSync(
				".codewiki/traces/TRACE-ideas-workspace-and-control-center-v1.jsonl",
			),
			false,
		);
		const readme = readFileSync("README.md", "utf8");
		assert.match(readme, /Work and project control plane/);
		assert.match(readme, /persisted pending Change revisions/);
		assert.match(readme, /fully (?:exit and )?restart Pi/i);
	});

	it("keeps Lab deleted and out of the packaged Pi extension", () => {
		assert.deepEqual(packageJson.files, [
			"dist",
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"package.json",
		]);
		assert.deepEqual(buildTsconfig.include, ["src/**/*.ts"]);
		assert.equal(packageJson.pi.extensions.includes("lab"), false);
		assert.equal(existsSync("lab"), false);
		assert.equal(
			readFileSync("src/clients/pi/extension.ts", "utf8").includes("lab/"),
			false,
		);
		assert.equal(
			readFileSync("src/clients/pi/prompt/index.ts", "utf8").includes("lab/"),
			false,
		);
	});

	it("keeps the Pi SDK entrypoint optional and out of runtime dependencies", () => {
		const runtimeDependencyNames = [
			...Object.keys(packageJson.dependencies || {}),
			...Object.keys(packageJson.bundledDependencies || {}),
		];
		assert.deepEqual(
			runtimeDependencyNames.filter((name) =>
				name.startsWith("@earendil-works/"),
			),
			[],
		);
		assert.equal(
			packageJson.devDependencies["@earendil-works/pi-coding-agent"],
			"^0.81.1",
		);
		assert.equal(
			packageJson.peerDependencies["@earendil-works/pi-coding-agent"],
			">=0.80.10 <0.82.0",
		);
		assert.equal(
			packageJson.peerDependenciesMeta["@earendil-works/pi-coding-agent"]
				.optional,
			true,
		);
		assert.equal(packageJson.dependencies["js-yaml"], undefined);
		assert.equal(packageJson.dependencies.yaml.startsWith("^2."), true);
		assert.equal(packageJson.dependencies.typebox, undefined);
		assert.equal(packageJson.devDependencies.typebox, "^1.3.6");
		assert.equal(packageJson.peerDependencies.typebox, "*");
	});

	it("keeps the active .codewiki top level in the target shape", () => {
		const entries = readdirSync(".codewiki").sort();
		assert.deepEqual(
			entries.filter((entry) => entry !== "runtime"),
			["config.json", "kb", "traces", "views"],
		);
		if (entries.includes("runtime")) {
			assert.deepEqual(readdirSync(".codewiki/runtime").sort(), ["tmp"]);
		}
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
				.map((line, index) => parseJson(line, `${path}:${index + 1}`));
			for (const record of records) assertValidTraceRecord(record);
		}
	});

	it("keeps only Pi and MCP product host config keys", () => {
		assert.deepEqual(Object.keys(codewikiConfig.hosts).sort(), ["mcp", "pi"]);
		assert.equal(codewikiConfig.hosts.pi.enabled, true);
		assert.equal(codewikiConfig.hosts.mcp.enabled, false);
	});

	it("does not load CodeWiki in its source repository", () => {
		const packages = piSettings.packages || [];
		assert.equal(Array.isArray(packages), true);
		assert.deepEqual(packages, ["npm:pi-lens"]);
		assert.deepEqual(
			packages.filter((entry) => JSON.stringify(entry).includes("codewiki")),
			[],
		);
		assert.equal(codewikiConfig.hosts.pi.enabled, true);
		assert.equal(existsSync(".pi/codewiki-controller.json"), false);
		assert.equal(existsSync(".pi/extensions/codewiki.ts"), false);
		assert.equal(existsSync(".pi/extensions"), false);
		assert.deepEqual(filesUnder(".agents/skills"), []);
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
