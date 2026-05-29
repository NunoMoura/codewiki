import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { auditSourceContract } from "../../src/checks/source-contract.ts";
import { generateSourceContractSnapshot } from "../../src/checks/source-contract-snapshot.ts";
import { loadProject } from "../../src/project/context.ts";
import { executeCodewikiAudit } from "../../src/audit/tool.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const expectedFixture = JSON.parse(
	await readFile(
		resolve(repoRoot, "tests/fixtures/source-contract/wiki-tools.expected.json"),
		"utf8",
	),
);

async function writeFixtureProject({ toolName = "wiki_state", commandName = "wiki-status" } = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-source-contract-"));
	await mkdir(resolve(root, ".codewiki/kb/system"), { recursive: true });
	await mkdir(resolve(root, "src/adapters/pi"), { recursive: true });
	await mkdir(resolve(root, "src/api"), { recursive: true });
	await mkdir(resolve(root, "scripts"), { recursive: true });
	await mkdir(resolve(root, "tests"), { recursive: true });
	await writeFile(
		resolve(root, "package.json"),
		JSON.stringify(
			{
				name: "contract-fixture",
				type: "module",
				files: ["src", "skills", "scripts", "README.md", "package.json"],
				pi: { extensions: ["./src/index.ts"], skills: ["./skills"] },
				knip: { entry: expectedFixture.knip_entry },
			},
			null,
			2,
		) + "\n",
	);
	await writeFile(
		resolve(root, "README.md"),
		`# fixture\n\n### Commands\n\n- \`/${commandName} [repo-path]\`\n\n### Internal agent tools\n\n- \`${expectedFixture.tools[0]}\`\n\n### Static analysis entrypoints\n\n- \`src/index.ts\`\n- \`src/api/index.ts\` and \`src/api/tools.ts\`\n- \`scripts/*.mjs\`\n- \`tests/**/*.mjs\`\n\n### Skills\n`,
	);
	await writeFile(
		resolve(root, ".codewiki/kb/system/api.md"),
		"# API\n\nUse the documented internal tool contract.\n",
	);
	await writeFile(
		resolve(root, "src/index.ts"),
		"export function activate() {}\n",
	);
	await writeFile(
		resolve(root, "src/api/index.ts"),
		'export * from "./tools.ts";\nexport type { WikiProject } from "../project/types.ts";\n',
	);
	await writeFile(
		resolve(root, "src/api/tools.ts"),
		"export function executeWikiStateTool() {}\n",
	);
	await writeFile(
		resolve(root, "src/adapters/pi/index.ts"),
		`export function registerPiAdapter(pi) {\n\tpi.registerTool({ name: "${toolName}" });\n\tpi.registerCommand("${commandName}", {});\n}\n`,
	);
	return { root, project: { root, label: "fixture" } };
}

try {
	{
		const { root, project } = await writeFixtureProject();
		try {
			const snapshotA = await generateSourceContractSnapshot(project);
			const snapshotB = await generateSourceContractSnapshot(project);
			assert.deepEqual(snapshotA, snapshotB, "source contract snapshot should be deterministic");
			assert.deepEqual(snapshotA.tools, expectedFixture.tools, "snapshot should capture tool names");
			assert.deepEqual(snapshotA.commands, expectedFixture.commands, "snapshot should capture command names");
			assert.ok(snapshotA.api_exports.includes("* from ./tools.ts"), "snapshot should capture API facade exports");
			assert.deepEqual(snapshotA.package.knip_entry, [...expectedFixture.knip_entry].sort(), "snapshot should capture package entry surfaces");
			assert.equal(Object.hasOwn(snapshotA, "generated_at"), false, "snapshot must not include timestamp truth");
			const audit = await auditSourceContract(project, { include_fingerprints: false });
			assert.equal(audit.status, "pass", JSON.stringify(audit.issues, null, 2));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}

	{
		const { root, project } = await writeFixtureProject({ toolName: "codewiki_state" });
		try {
			const audit = await auditSourceContract(project, { include_fingerprints: false });
			assert.equal(audit.status, "fail", "stale internal tool namespace should fail against wiki_* expectation");
			assert.ok(
				audit.issues.some((issue) => issue.kind === "tool-namespace-stale"),
				"stale codewiki_* tool should produce actionable namespace issue",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}

	{
		const project = await loadProject(repoRoot);
		const report = await executeCodewikiAudit(project, {
			profiles: ["source-contract"],
			include_fingerprints: false,
		});
		assert.equal(report.status, "pass", JSON.stringify(report.issues, null, 2));
		const result = report.profile_results[0];
		assert.ok(result.details.snapshot.tools.includes("codewiki_state"), "repo snapshot should include current live tool names");
		assert.ok(result.details.snapshot.commands.includes("wiki-status"), "repo snapshot should include command names");
	}

	console.log("✓ source contract check smoke passed");
} catch (error) {
	console.error(error);
	process.exit(1);
}
