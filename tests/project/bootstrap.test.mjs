import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { bootstrapCodewiki } from "../../src/project/bootstrap.ts";
import { loadWikiConfigFile } from "../../src/project/config-file.ts";
import {
	parseSourceMapYaml,
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
	it("writes target scaffold without frontmatter or legacy truth roots", async () => {
		const root = await fixture();
		try {
			const result = await bootstrapCodewiki(root);
			assert.equal(result.project, "bootstrap-fixture");
			assert.equal(result.brownfield, true);
			assert.ok(result.created.includes(".codewiki/config.json"));
			assert.ok(result.created.includes(".codewiki/kb/system/source-map.yaml"));
			assert.equal(result.created.some((path) => path.includes("roadmap")), false);
			assert.equal(result.created.some((path) => path.includes("index_graph")), false);

			const config = await loadWikiConfigFile(root);
			assert.equal(config.project, "bootstrap-fixture");
			assert.equal(config.hosts.pi.enabled, false);

			const sourceMapText = await readFile(
				join(root, ".codewiki/kb/system/source-map.yaml"),
				"utf8",
			);
			const sourceMap = parseSourceMapYaml(sourceMapText);
			assert.equal(sourceMapOwnerForPath(sourceMap, "src/index.ts")?.id, "source");
			const files = await collectFiles(root);
			const markdown = files
				.filter((path) => path.startsWith(".codewiki/kb/") && path.endsWith(".md"))
				.map(async (path) => ({
					path,
					hasFrontmatter: (await readFile(join(root, path), "utf8")).startsWith("---\n"),
				}));
			const issues = validateSourceMap(sourceMap, {
				artifactPaths: files,
				sourcePaths: ["src/index.ts"],
				markdown: await Promise.all(markdown),
			});
			assert.deepEqual(issues, []);

			const second = await bootstrapCodewiki(root);
			assert.equal(second.updated.length, 0);
			assert.ok(second.skipped.includes(".codewiki/config.json"));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
