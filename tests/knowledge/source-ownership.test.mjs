import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	okfSourceOwnershipExtensionsFromBundle,
	sourceOwnershipComponentById,
	sourceOwnershipMapFromOkfBundle,
	sourceOwnershipOwnerForPath,
	sourceOwnershipSupportsTestPath,
	validateSourceOwnershipFromOkfBundle,
} from "../../src/knowledge/source-ownership.ts";
import {
	parseSourceMapYaml,
	pathMatchesPattern,
	sourceMapExcluded,
	sourceMapOwnerForPath,
} from "../../src/knowledge/source-map.ts";

const sourceMapText = readFileSync(
	".codewiki/kb/system/source-map.yaml",
	"utf8",
);
const sourceMap = parseSourceMapYaml(sourceMapText);

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function activeArtifactPaths() {
	return unique([
		...collectFiles("src"),
		...collectFiles("tests"),
		...collectFiles("lab"),
		...collectFiles(".codewiki/kb"),
		...collectFiles(".agents/skills"),
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"tsconfig.build.json",
	]);
}

function knowledgeBundleFiles() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

function sourceOwnershipOptions() {
	return { migrationMap: sourceMap };
}

function byId(components) {
	return new Map(components.map((component) => [component.id, component]));
}

function unique(values) {
	return Array.from(new Set(values));
}

describe("OKF-backed source ownership", () => {
	it("reconstructs the current source-map contract from OKF frontmatter", () => {
		const ownership = sourceOwnershipMapFromOkfBundle(
			knowledgeBundleFiles(),
			sourceOwnershipOptions(),
		);
		const expected = byId(sourceMap.components);
		const actual = byId(ownership.components);

		assert.equal(ownership.id, sourceMap.id);
		assert.deepEqual(ownership.sourceRefs, sourceMap.sourceRefs);
		assert.deepEqual(ownership.defaults, sourceMap.defaults);
		assert.equal(ownership.components.length, sourceMap.components.length);
		for (const [id, component] of expected) {
			assert.deepEqual(actual.get(id), component, `component ${id}`);
		}
	});

	it("answers current owner, component, and test queries from OKF metadata", () => {
		const bundle = knowledgeBundleFiles();
		const options = sourceOwnershipOptions();
		const ownership = sourceOwnershipMapFromOkfBundle(bundle, options);

		assert.equal(
			sourceOwnershipComponentById(bundle, "knowledge", options)?.doc,
			".codewiki/kb/system/knowledge.md",
		);
		assert.equal(
			sourceOwnershipOwnerForPath(
				bundle,
				"src/knowledge/source-ownership.ts",
				options,
			)?.id,
			"knowledge",
		);
		for (const path of collectFiles("src")) {
			if (sourceMapExcluded(sourceMap, path)) continue;
			assert.equal(
				sourceMapOwnerForPath(ownership, path)?.id,
				sourceMapOwnerForPath(sourceMap, path)?.id,
				`owner mismatch for ${path}`,
			);
		}
		for (const path of collectFiles("tests")) {
			assert.equal(
				ownership.components.some((component) =>
					sourceOwnershipSupportsTestPath(component, path),
				),
				sourceMap.components.some((component) =>
					component.testPatterns.some((pattern) =>
						pathMatchesPattern(path, pattern),
					),
				),
				`test ownership mismatch for ${path}`,
			);
		}
	});

	it("validates active repo ownership through the OKF compatibility view", () => {
		const issues = validateSourceOwnershipFromOkfBundle(
			knowledgeBundleFiles(),
			{
				artifactPaths: activeArtifactPaths(),
				sourcePaths: collectFiles("src"),
			},
			sourceOwnershipOptions(),
		);

		assert.deepEqual(issues, []);
	});

	it("keeps source-map.yaml as a deprecated migration fixture until parity is complete", () => {
		const docs = readFileSync(".codewiki/kb/system/source-map.md", "utf8");
		const extensions = okfSourceOwnershipExtensionsFromBundle(
			knowledgeBundleFiles(),
		);

		assert.match(sourceMapText, /id: spec\.system\.source-map/);
		assert.match(docs, /deprecated migration input/i);
		assert.match(docs, /must not be removed/i);
		assert.equal(extensions.length > 0, true);
		assert.equal(
			extensions.some((extension) =>
				extension.fields.codewiki_components.includes("package"),
			),
			false,
		);
	});
});
