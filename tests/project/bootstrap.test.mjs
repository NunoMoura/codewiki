import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { bootstrapCodewiki } from "../../src/project/bootstrap.ts";
import { loadWikiConfigFile } from "../../src/project/config-file.ts";
import { validateOkfBundle } from "../../src/knowledge/okf-validation.ts";
import { sourceOwnershipMapFromOkfBundle } from "../../src/knowledge/source-ownership.ts";
import {
	sourceMapOwnerForPath,
	validateSourceMap,
} from "../../src/knowledge/source-map.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-bootstrap-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(join(root, "package.json"), '{"name":"bootstrap-fixture"}\n');
	await writeFile(join(root, "README.md"), "# Bootstrap fixture\n");
	await writeFile(join(root, "src", "index.ts"), "export {};\n");
	await writeFile(join(root, "tests", "index.test.mjs"), "export {};\n");
	return root;
}

async function collectFiles(root, current = root) {
	const output = [];
	for (const entry of await readdir(current, { withFileTypes: true })) {
		const path = join(current, entry.name);
		if (entry.isDirectory()) output.push(...(await collectFiles(root, path)));
		else output.push(relative(root, path).replace(/\\/g, "/"));
	}
	return output;
}

describe("project bootstrap", () => {
	it("audits brownfield state and stale roots without deleting them", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, ".codewiki", "roadmap"), { recursive: true });
			await writeFile(join(root, ".codewiki", "roadmap", "queue.json"), "{}\n");

			const result = await bootstrapCodewiki(root);

			assert.equal(result.audit.projectKind, "brownfield");
			assert.equal(result.brownfield, true);
			assert.equal(result.audit.existing.codewiki, true);
			assert.deepEqual(result.audit.staleRoots, [".codewiki/roadmap"]);
			assert.equal(
				await readFile(
					join(root, ".codewiki", "roadmap", "queue.json"),
					"utf8",
				),
				"{}\n",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("preserves existing KB and trace files by default", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			const existingKb = "# Existing Lexicon\n\nKeep curated knowledge.\n";
			const existingTrace = "existing trace content\n";
			await writeFile(join(root, ".codewiki", "kb", "lexicon.md"), existingKb);
			await writeFile(
				join(root, ".codewiki", "traces", "TRACE-existing.jsonl"),
				existingTrace,
			);

			const result = await bootstrapCodewiki(root);

			assert.equal(result.audit.existing.kb, true);
			assert.equal(result.audit.existing.traces, true);
			assert.ok(result.preserved.includes(".codewiki/kb"));
			assert.ok(result.preserved.includes(".codewiki/traces"));
			assert.ok(result.skipped.includes(".codewiki/kb/lexicon.md"));
			assert.equal(
				await readFile(join(root, ".codewiki", "kb", "lexicon.md"), "utf8"),
				existingKb,
			);
			assert.equal(
				await readFile(
					join(root, ".codewiki", "traces", "TRACE-existing.jsonl"),
					"utf8",
				),
				existingTrace,
			);
			assert.equal(
				result.created.includes(".codewiki/traces/TRACE-existing.jsonl"),
				false,
			);
			assert.equal(
				result.updated.includes(".codewiki/traces/TRACE-existing.jsonl"),
				false,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("writes target scaffold with OKF frontmatter and without legacy truth roots", async () => {
		const root = await fixture();
		try {
			const result = await bootstrapCodewiki(root);
			assert.equal(result.project, "bootstrap-fixture");
			assert.equal(result.brownfield, true);
			assert.ok(result.created.includes(".codewiki/config.json"));
			assert.equal(
				result.created.includes(".codewiki/kb/system/source-map.yaml"),
				false,
			);
			assert.equal(
				result.created.some((path) => path.includes("roadmap")),
				false,
			);
			assert.equal(
				result.created.some((path) => path.includes("index_graph")),
				false,
			);

			const config = await loadWikiConfigFile(root);
			assert.equal(config.project, "bootstrap-fixture");
			assert.equal(config.hosts.pi.enabled, false);

			const files = await collectFiles(root);
			const markdown = files
				.filter(
					(path) => path.startsWith(".codewiki/kb/") && path.endsWith(".md"),
				)
				.map(async (path) => ({
					path,
					hasFrontmatter: (await readFile(join(root, path), "utf8")).startsWith(
						"---\n",
					),
				}));
			const markdownFiles = await Promise.all(markdown);
			const sourceMap = sourceOwnershipMapFromOkfBundle(
				await Promise.all(
					markdownFiles.map(async (entry) => ({
						path: entry.path,
						content: await readFile(join(root, entry.path), "utf8"),
					})),
				),
			);
			assert.equal(
				sourceMapOwnerForPath(sourceMap, "src/index.ts")?.id,
				"source",
			);
			const issues = validateSourceMap(sourceMap, {
				artifactPaths: files,
				sourcePaths: ["src/index.ts"],
				markdown: markdownFiles,
			});
			assert.deepEqual(issues, []);
			assert.equal(
				markdownFiles
					.filter((entry) => !entry.path.endsWith("/index.md"))
					.every((entry) => entry.hasFrontmatter),
				true,
			);
			const okf = validateOkfBundle(
				await Promise.all(
					markdownFiles.map(async (entry) => ({
						path: entry.path.replace(/^\.codewiki\/kb\//, ""),
						content: await readFile(join(root, entry.path), "utf8"),
					})),
				),
			);
			assert.deepEqual(okf.issues, []);
			assert.equal(
				okf.documents.find(
					(document) => document.path === "system/components/knowledge.md",
				)?.frontmatter?.codewiki_component,
				"knowledge",
			);

			const second = await bootstrapCodewiki(root);
			assert.equal(second.updated.length, 0);
			assert.ok(second.skipped.includes(".codewiki/config.json"));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
