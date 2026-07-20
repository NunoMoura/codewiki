import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	DECISION_CHANGE_GRAPH_HASH,
	DECISION_CHANGE_QUALITY_STANDARDS,
} from "../../src/decision/change-quality.ts";
import { IMPLEMENTATION_LOOP_QUALITY_PACK } from "../../src/implementation/loop.ts";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../../src/index.ts";
import {
	PLANNING_PORTFOLIO_GRAPH_HASH,
	PLANNING_PORTFOLIO_QUALITY_STANDARDS,
} from "../../src/planning/portfolio-quality.ts";
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
			extensions: ["dist/pi/extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
		assert.equal(packageJson.name, "@nunomoura/codewiki");
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
		const toolSource = readFileSync("src/pi/tools/index.ts", "utf8");
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
			readFileSync("src/pi/tools/index.ts", "utf8"),
			/sourceOwners|sourcePaths/,
		);
	});

	it("keeps production quality definitions immutable and documents lab authority", () => {
		assert.match(DECISION_CHANGE_GRAPH_HASH, /^sha256:[a-f0-9]{64}$/);
		assert.match(PLANNING_PORTFOLIO_GRAPH_HASH, /^sha256:[a-f0-9]{64}$/);
		assert.equal(DECISION_CHANGE_QUALITY_STANDARDS.length > 0, true);
		assert.equal(PLANNING_PORTFOLIO_QUALITY_STANDARDS.length > 0, true);
		for (const pack of [IMPLEMENTATION_LOOP_QUALITY_PACK]) {
			assert.equal(pack.authority, "kernel");
			assert.equal(pack.rollout, "enforce");
			assert.equal(pack.id.startsWith("codewiki."), true);
			assert.equal(pack.standards.length > 0, true);
		}
		const loopContracts = readFileSync(
			".codewiki/kb/system/components/loop-contracts.md",
			"utf8",
		);
		const labDocumentation = readFileSync(
			".codewiki/kb/system/components/lab.md",
			"utf8",
		);
		assert.match(loopContracts, /immutable `kernel` packs in `enforce` mode/);
		assert.match(
			loopContracts,
			/Project policy composition and a Quality Designer remain deferred/,
		);
		assert.match(loopContracts, /JavaScript evaluators, shell evaluators/);
		assert.match(labDocumentation, /authority is `lab`/);
		assert.match(labDocumentation, /rollout is `observe`/);
		assert.match(labDocumentation, /does not grant production authority/);
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
		assert.match(readme, /Changes Backlog and control center/);
		assert.match(readme, /pending unvalidated Change/);
		assert.match(readme, /fully (?:exit and )?restart Pi/i);
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

	it("documents the OKF bundle boundary without demoting CodeWiki extensions", () => {
		const knowledgeDoc = readFileSync(
			".codewiki/kb/system/components/knowledge.md",
			"utf8",
		);
		assert.match(knowledgeDoc, /\.codewiki\/kb\/\*\*/);
		assert.match(knowledgeDoc, /OKF v0\.1 markdown\/frontmatter bundle/);
		assert.match(
			knowledgeDoc,
			/durable workflow truth remains JSONL under `\.codewiki\/traces\/TRACE-\*\.jsonl`/,
		);
		assert.match(
			knowledgeDoc,
			/Sprint, Work Pipeline, queue, and Change Journey screens are WorkState-backed projections/,
		);
		assert.match(
			knowledgeDoc,
			/OKF concept frontmatter is the active KB-code-test ownership source/,
		);
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

	it("recommends project-local CodeWiki installation", () => {
		const readme = readFileSync("README.md", "utf8");
		const extensionDoc = readFileSync(
			".codewiki/kb/system/components/extension.md",
			"utf8",
		);
		const runtimeDoc = readFileSync(
			".codewiki/kb/system/components/runtime.md",
			"utf8",
		);
		assert.match(readme, /not published to the npm registry yet/);
		assert.match(extensionDoc, /not published to the npm registry yet/);
		assert.match(readme, /@nunomoura\/codewiki/);
		assert.match(extensionDoc, /@nunomoura\/codewiki/);
		assert.match(readme, /"private": true/);
		assert.match(extensionDoc, /"private": true/);
		assert.match(readme, /Avoid global\/user installs/);
		assert.match(extensionDoc, /global\/user installs\s+for normal mutation/i);
		assert.match(readme, /Production readiness and automation gates/);
		assert.match(extensionDoc, /Production readiness gates/);
		assert.match(runtimeDoc, /Automation gates/);
		assert.match(runtimeDoc, /Unattended\s+worker start/i);
	});

	it("documents external release gates and source-repository non-self-hosting", () => {
		const readme = readFileSync("README.md", "utf8");
		const extensionDoc = readFileSync(
			".codewiki/kb/system/components/extension.md",
			"utf8",
		);
		const loopContracts = readFileSync(
			".codewiki/kb/system/components/loop-contracts.md",
			"utf8",
		);
		const audit = packageJson.scripts["audit:codewiki"];
		for (const command of [
			"npm test",
			"npm run test:pack",
			"npm run test:pi-install",
			"npm run test:pi-rpc",
			"npm run test:pi-mutation",
			"npm run test:project-local-install",
			"npm run test:external-lifecycle",
			"npm run test:external-failures",
			"npm run test:readiness",
			"npm audit --omit=dev",
			"git diff --check",
		]) {
			assert.match(audit, new RegExp(escapeRegExp(command)));
		}
		for (const content of [readme, extensionDoc]) {
			assert.match(content, /disposable external projects/i);
			assert.match(
				content,
				/does not (?:register, install, or load|install or load|self-host)/i,
			);
			assert.match(content, /new explicit .*decision/i);
			assert.match(content, /historical .*grant no authority/i);
		}
		assert.match(loopContracts, /fast edit feedback is never enough/i);
		assert.match(loopContracts, /Pi-tool autoload uses only/);
	});

	it("documents loop/runtime/host boundaries and trace queue ownership", () => {
		const loopContracts = readFileSync(
			".codewiki/kb/system/components/loop-contracts.md",
			"utf8",
		);
		const runtimeDoc = readFileSync(
			".codewiki/kb/system/components/runtime.md",
			"utf8",
		);
		const planningDoc = readFileSync(
			".codewiki/kb/system/components/planning-loop.md",
			"utf8",
		);
		const tracesDoc = readFileSync(
			".codewiki/kb/system/components/traces.md",
			"utf8",
		);
		const implementationDoc = readFileSync(
			".codewiki/kb/system/components/implementation-loop.md",
			"utf8",
		);
		assert.match(loopContracts, /Planning .*WorkState horizon/i);
		assert.match(loopContracts, /Runtime is the outer control loop/i);
		assert.match(loopContracts, /Write authority is surface-specific/i);
		assert.match(runtimeDoc, /does not.*approve Change meaning/is);
		assert.match(runtimeDoc, /does not.*create Sprint or Work Item truth/is);
		assert.match(
			planningDoc,
			/Planning is the project-wide execution optimizer/i,
		);
		assert.match(planningDoc, /Planning owns Sprint creation/i);
		assert.match(tracesDoc, /one Change owns one Change Trace/i);
		assert.match(tracesDoc, /Sprint state is a generated view/i);
		assert.match(tracesDoc, /Git restore ref/i);
		assert.match(tracesDoc, /compact hot stub/i);
		assert.match(implementationDoc, /does not own new Change meaning/i);
		assert.match(implementationDoc, /archive_disposition_ready/i);
		assert.match(implementationDoc, /outcome disposition/i);
		assert.match(implementationDoc, /retain[-_]hot/i);
		assert.doesNotMatch(
			runtimeDoc,
			/choose next semantic loop or coordination action/,
		);
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

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
