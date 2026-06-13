import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	parseSourceMapYaml,
	sourceMapExcluded,
	sourceMapOwnerForPath,
	validateSourceMap,
} from "../../src/knowledge/source-map.ts";

const sourceMapText = readFileSync(
	".codewiki/kb/system/source-map.yaml",
	"utf8",
);

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root)) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) {
			output.push(...collectFiles(path));
		} else {
			output.push(path);
		}
	}
	return output;
}

function activeArtifactPaths() {
	return unique([
		...collectFiles("src"),
		...collectFiles("tests"),
		...collectFiles(".codewiki/kb"),
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]);
}

function knowledgeMarkdown() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({
			path,
			hasFrontmatter: readFileSync(path, "utf8").startsWith("---\n"),
		}));
}

function unique(values) {
	return Array.from(new Set(values));
}

describe("source ownership map", () => {
	it("parses canonical source ownership", () => {
		const map = parseSourceMapYaml(sourceMapText);

		assert.equal(map.id, "spec.system.source-map");
		assert.equal(sourceMapExcluded(map, "_OLD_VERSION/src/index.ts"), true);
		assert.equal(
			sourceMapOwnerForPath(map, "src/traces/append.ts")?.id,
			"traces",
		);
		assert.equal(
			sourceMapOwnerForPath(map, "src/implementation/workers.ts")?.doc,
			".codewiki/kb/system/implementation-loop.md",
		);
	});

	it("validates active repo ownership and frontmatter-free KB docs", () => {
		const map = parseSourceMapYaml(sourceMapText);
		const issues = validateSourceMap(map, {
			artifactPaths: activeArtifactPaths(),
			sourcePaths: collectFiles("src"),
			markdown: knowledgeMarkdown(),
		});

		assert.deepEqual(issues, []);
	});
});
