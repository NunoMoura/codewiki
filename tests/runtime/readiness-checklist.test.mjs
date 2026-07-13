import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { DECISION_LOOP_QUALITY_PACK } from "../../src/decision/loop.ts";
import { IMPLEMENTATION_LOOP_QUALITY_PACK } from "../../src/implementation/loop.ts";
import { CODEWIKI_EXTENSION_AVAILABLE } from "../../src/index.ts";
import { PLANNING_LOOP_QUALITY_PACK } from "../../src/planning/loop.ts";
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
	it("exposes packaged Pi extension metadata for supervised pinned-controller dogfood", () => {
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
			packageJson.scripts["test:self-dogfood-candidate"],
			"npm run audit:codewiki && npm run lab:gate && npm run lab:pipeline -- --gate",
		);
		assert.equal(
			packageJson.scripts["test:self-dogfood-ready"],
			"npm run self-dogfood:baseline:verify -- --require-clean && npm run test:self-dogfood-candidate && npm run test:self-dogfood-shadow",
		);
		assert.match(
			packageJson.scripts["self-dogfood:baseline:create"],
			/create-self-dogfood-baseline\.mjs/,
		);
		assert.match(
			packageJson.scripts["self-dogfood:baseline:verify"],
			/verify-self-dogfood-baseline\.mjs/,
		);
		assert.match(
			packageJson.scripts["test:self-dogfood-shadow"],
			/run-self-dogfood-shadow\.mjs/,
		);
		assert.match(
			packageJson.scripts["self-dogfood:controller:install"],
			/install-self-dogfood-controller\.mjs/,
		);
		assert.equal(existsSync(".pi/codewiki-controller.json"), true);
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
		assert.match(prompt, /internal wiki_state/);
		assert.match(prompt, /wiki_decide/);
		assert.match(prompt, /wiki_plan/);
		assert.match(prompt, /wiki_implement/);
		assert.doesNotMatch(prompt, /wiki_runtime/);
		assert.doesNotMatch(prompt, /wiki_config/);
		assert.doesNotMatch(prompt, /wiki_archive/);
		assert.match(prompt, /\/wiki-dashboard opens/);
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

	it("keeps production quality packs immutable and documents lab authority", () => {
		for (const pack of [
			DECISION_LOOP_QUALITY_PACK,
			PLANNING_LOOP_QUALITY_PACK,
			IMPLEMENTATION_LOOP_QUALITY_PACK,
		]) {
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
		assert.match(loopContracts, /Project policy composition and a Quality Designer remain deferred/);
		assert.match(loopContracts, /JavaScript evaluators, shell evaluators/);
		assert.match(labDocumentation, /authority is `lab`/);
		assert.match(labDocumentation, /rollout is `observe`/);
		assert.match(labDocumentation, /does not grant production authority/);
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

	it("documents the OKF bundle boundary without demoting CodeWiki extensions", () => {
		const knowledgeDoc = readFileSync(
			".codewiki/kb/system/components/knowledge.md",
			"utf8",
		);
		assert.match(knowledgeDoc, /\.codewiki\/kb\/\*\*/);
		assert.match(knowledgeDoc, /OKF v0\.1 markdown\/frontmatter bundle/);
		assert.match(
			knowledgeDoc,
			/trace JSONL under `\.codewiki\/traces\/TRACE-\*\.jsonl`/,
		);
		assert.match(
			knowledgeDoc,
			/Sprints Queue and Sprint Trace output is a read-only projection/,
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
				.map((line) => JSON.parse(line));
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
		assert.match(readme, /future registry package name is still TBD/);
		assert.match(extensionDoc, /future registry package name is still TBD/);
		assert.match(readme, /Avoid global\/user installs/);
		assert.match(extensionDoc, /Global\/user installs are discouraged/);
		assert.match(readme, /Production readiness and automation gates/);
		assert.match(extensionDoc, /Production readiness gates/);
		assert.match(runtimeDoc, /Automation gates/);
		assert.match(runtimeDoc, /Unattended\s+worker start/i);
	});

	it("documents and scripts the self-dogfood re-enable gate", () => {
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
		for (const content of [readme, extensionDoc, loopContracts]) {
			assert.match(
				content,
				/self-dogfood re-enable gate|pinned-baseline.*installer gates/i,
			);
			assert.match(content, /content proof/i);
			assert.match(content, /expected-byte|expected byte/i);
			assert.match(content, /sequence/i);
		}
		for (const content of [readme, extensionDoc]) {
			assert.match(
				content,
				/Self-dogfood status: supervised pinned-controller/i,
			);
			assert.match(content, /autoload is enabled/i);
			assert.match(content, /TRACE-self-dogfood-reenabled-v1/);
			assert.match(content, /historical evidence/i);
			assert.match(
				content,
				/immutable reviewed package|pinned-baseline|reviewed controller|reviewed commit/i,
			);
			assert.match(content, /shadow mode/i);
		}
		assert.match(extensionDoc, /wiki_state/);
		assert.match(extensionDoc, /preview-mode/);
		assert.match(loopContracts, /fast edit feedback is never enough/);
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
		assert.match(loopContracts, /Planning .*trace-queue/i);
		assert.match(loopContracts, /Runtime .*does not own semantic truth/i);
		assert.match(loopContracts, /Write authority is surface-specific/i);
		assert.match(runtimeDoc, /does not invent accepted requirements/i);
		assert.match(runtimeDoc, /ignores raw decision items/i);
		assert.match(
			planningDoc,
			/planning loop owns executable work shaping and trace-queue health/i,
		);
		assert.match(
			planningDoc,
			/must not invent semantic work from the raw proposed changes/i,
		);
		assert.match(tracesDoc, /trace-queue.*product concept/i);
		assert.match(tracesDoc, /one Sprint Trace per accountable trace/i);
		assert.match(tracesDoc, /post-commit archive pipeline|Git restore ref/i);
		assert.match(tracesDoc, /compact hot stubs|compact.*stub/i);
		assert.match(implementationDoc, /does not own .*\.codewiki\/kb/i);
		assert.match(implementationDoc, /archive_disposition_ready/i);
		assert.match(implementationDoc, /post_commit_compact/i);
		assert.match(implementationDoc, /retain_hot/i);
		assert.doesNotMatch(
			runtimeDoc,
			/choose next semantic loop or coordination action/,
		);
	});

	it("loads only the reproducibly installed repo-local CodeWiki controller", () => {
		const packages = piSettings.packages || [];
		assert.equal(Array.isArray(packages), true);
		assert.equal(packages.includes("npm:pi-lens"), true);
		assert.equal(packages.includes("./npm/node_modules/codewiki"), true);
		assert.equal(packages.includes(".."), false);
		assert.equal(packages.includes("."), false);
		assert.notEqual(resolve(".pi", "."), process.cwd());
		assert.deepEqual(
			packages.filter((entry) => JSON.stringify(entry).includes("codewiki")),
			["./npm/node_modules/codewiki"],
		);
		assert.equal(codewikiConfig.hosts.pi.enabled, true);
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

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
