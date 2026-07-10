import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	CODEWIKI_SOURCE_OWNERSHIP_DEFAULTS,
	CODEWIKI_SOURCE_OWNERSHIP_ID,
	CODEWIKI_SOURCE_OWNERSHIP_REFS,
	okfSourceOwnershipExtensionsFromBundle,
	sourceOwnershipComponentById,
	sourceOwnershipMapFromOkfBundle,
	sourceOwnershipOwnerForPath,
	sourceOwnershipSupportsTestPath,
	validateSourceOwnershipFromOkfBundle,
} from "../../src/knowledge/source-ownership.ts";
import {
	pathMatchesPattern,
	sourceMapExcluded,
	sourceMapOwnerForPath,
} from "../../src/knowledge/source-map.ts";

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

function byId(components) {
	return new Map(components.map((component) => [component.id, component]));
}

function unique(values) {
	return Array.from(new Set(values));
}

describe("OKF-backed source ownership", () => {
	it("builds the active ownership map from OKF frontmatter only", () => {
		const ownership = sourceOwnershipMapFromOkfBundle(knowledgeBundleFiles());
		const components = byId(ownership.components);

		assert.equal(ownership.id, CODEWIKI_SOURCE_OWNERSHIP_ID);
		assert.deepEqual(ownership.sourceRefs, CODEWIKI_SOURCE_OWNERSHIP_REFS);
		assert.deepEqual(ownership.defaults, CODEWIKI_SOURCE_OWNERSHIP_DEFAULTS);
		assert.equal(existsSync(".codewiki/kb/system/source-map.yaml"), false);
		assert.equal(
			components.get("knowledge")?.doc,
			".codewiki/kb/system/components/knowledge.md",
		);
		assert.equal(
			components.get("dashboard")?.doc,
			".codewiki/kb/product/uis/terminal.md",
		);
		assert.equal(components.get("package")?.doc, "README.md");
	});

	it("answers current owner, component, and test queries from OKF metadata", () => {
		const bundle = knowledgeBundleFiles();
		const ownership = sourceOwnershipMapFromOkfBundle(bundle);

		assert.equal(
			sourceOwnershipComponentById(bundle, "knowledge")?.doc,
			".codewiki/kb/system/components/knowledge.md",
		);
		assert.equal(
			sourceOwnershipOwnerForPath(bundle, "src/knowledge/source-ownership.ts")
				?.id,
			"knowledge",
		);
		for (const path of collectFiles("src")) {
			if (sourceMapExcluded(ownership, path)) continue;
			assert.ok(
				sourceMapOwnerForPath(ownership, path),
				`missing owner for ${path}`,
			);
		}
		for (const path of collectFiles("tests")) {
			assert.equal(
				ownership.components.some((component) =>
					sourceOwnershipSupportsTestPath(component, path),
				),
				true,
				`missing test owner for ${path}`,
			);
		}
	});

	it("validates active repo ownership through OKF metadata", () => {
		const issues = validateSourceOwnershipFromOkfBundle(
			knowledgeBundleFiles(),
			{
				artifactPaths: activeArtifactPaths(),
				sourcePaths: collectFiles("src"),
			},
		);

		assert.deepEqual(issues, []);
	});

	it("exports source ownership extension fields from OKF concepts", () => {
		const extensions = okfSourceOwnershipExtensionsFromBundle(
			knowledgeBundleFiles(),
		);
		const packageExtension = extensions.find((extension) =>
			extension.fields.codewiki_components.includes("package"),
		);

		assert.equal(extensions.length > 0, true);
		assert.ok(packageExtension);
		assert.equal(
			packageExtension.fields.codewiki_source_map.some(
				(component) => component.doc === "README.md",
			),
			true,
		);
		assert.equal(
			pathMatchesPattern("src/dashboard/server.ts", "src/dashboard/**"),
			true,
		);
	});
});
