import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

function collectFiles(root) {
	return readdirSync(root)
		.sort()
		.flatMap((name) => {
			const path = `${root}/${name}`;
			return statSync(path).isDirectory() ? collectFiles(path) : [path];
		});
}

function knowledgeBundleFiles() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

describe("OKF-backed intended source ownership", () => {
	it("builds one target realization map from Component frontmatter", () => {
		const ownership = sourceOwnershipMapFromOkfBundle(knowledgeBundleFiles());
		const components = new Map(
			ownership.components.map((component) => [component.id, component]),
		);

		assert.equal(ownership.id, CODEWIKI_SOURCE_OWNERSHIP_ID);
		assert.deepEqual(ownership.sourceRefs, CODEWIKI_SOURCE_OWNERSHIP_REFS);
		assert.deepEqual(ownership.defaults, CODEWIKI_SOURCE_OWNERSHIP_DEFAULTS);
		assert.equal(ownership.components.length, 18);
		assert.equal(
			components.get("knowledge")?.doc,
			".codewiki/kb/system/components/knowledge.md",
		);
		assert.equal(
			components.get("clients")?.doc,
			".codewiki/kb/system/components/clients.md",
		);
		assert.equal(
			components.get("package")?.doc,
			".codewiki/kb/system/components/package.md",
		);
	});

	it("answers target owner and test queries without requiring paths to exist yet", () => {
		const bundle = knowledgeBundleFiles();
		assert.equal(
			sourceOwnershipComponentById(bundle, "harnesses")?.doc,
			".codewiki/kb/system/components/harnesses.md",
		);
		assert.equal(
			sourceOwnershipOwnerForPath(bundle, "src/alignment/queries/context.ts")?.id,
			"alignment",
		);
		assert.equal(
			sourceOwnershipOwnerForPath(bundle, "src/clients/pi/extension.ts")?.id,
			"clients",
		);
		assert.equal(
			sourceOwnershipOwnerForPath(bundle, "src/harnesses/pi/worker.ts")?.id,
			"harnesses",
		);
		assert.equal(
			sourceOwnershipSupportsTestPath(
				sourceOwnershipComponentById(bundle, "verification"),
				"tests/verification/runner.test.mjs",
			),
			true,
		);
	});

	it("keeps target ownership declarations structurally valid and non-duplicated", () => {
		const bundle = knowledgeBundleFiles();
		const ownership = sourceOwnershipMapFromOkfBundle(bundle);
		const sourcePatterns = ownership.components.flatMap((component) =>
			component.sourcePatterns.map((pattern) => `${pattern} -> ${component.id}`),
		);
		const rawPatterns = sourcePatterns.map((entry) => entry.split(" -> ")[0]);

		assert.deepEqual(validateSourceOwnershipFromOkfBundle(bundle), []);
		assert.equal(new Set(rawPatterns).size, rawPatterns.length);
	});

	it("exports realization metadata from Component concepts only", () => {
		const extensions = okfSourceOwnershipExtensionsFromBundle(
			knowledgeBundleFiles(),
		);
		const packageExtension = extensions.find(
			(extension) => extension.path === ".codewiki/kb/system/components/package.md",
		);

		assert.equal(extensions.length, 18);
		assert.ok(packageExtension);
		assert.deepEqual(packageExtension.fields.codewiki_components, ["package"]);
		assert.equal(
			packageExtension.fields.codewiki_source_map.every(
				(component) =>
					component.doc === ".codewiki/kb/system/components/package.md",
			),
			true,
		);
	});
});
