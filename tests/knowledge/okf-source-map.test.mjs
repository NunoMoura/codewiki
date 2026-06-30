import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	generateOkfSourceMapExtensions,
	mergeOkfSourceMapExtension,
	okfSourceMapExtensionForDoc,
	okfSourceMapOwnerForPath,
	sourceMapFromOkfSourceMapExtensions,
} from "../../src/knowledge/okf-source-map.ts";
import {
	parseSourceMapYaml,
	sourceMapExcluded,
	sourceMapOwnerForPath,
} from "../../src/knowledge/source-map.ts";

const sourceMap = parseSourceMapYaml(
	readFileSync(".codewiki/kb/system/source-map.yaml", "utf8"),
);

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root)) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function byId(components) {
	return new Map(components.map((component) => [component.id, component]));
}

describe("OKF source-map extension generation", () => {
	it("generates CodeWiki OKF extension fields for single and shared docs", () => {
		const decision = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/decision-loop.md",
		);
		assert.equal(decision?.codewiki_component, "decision");
		assert.deepEqual(decision?.codewiki_components, ["decision"]);
		assert.deepEqual(decision?.codewiki_source_patterns, [
			"src/decision/**",
			"src/api/decision.ts",
		]);
		assert.deepEqual(decision?.codewiki_trace_events, ["decision.rows_approved"]);

		const api = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/api.md",
		);
		assert.equal("codewiki_component" in api, false);
		assert.deepEqual(api?.codewiki_components, ["api", "cli"]);
		assert.deepEqual(api?.codewiki_roles, [
			"public_facade",
			"temporary_development_harness",
		]);
		assert.equal(api?.codewiki_source_map.length, 2);
		assert.deepEqual(
			api?.codewiki_source_map.map((component) => component.id),
			["api", "cli"],
		);
	});

	it("merges generated extension fields while preserving unknown producer metadata", () => {
		const fields = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/decision-loop.md",
		);
		assert.ok(fields);
		const merged = mergeOkfSourceMapExtension(
			{
				type: "Reference",
				title: "Decision Loop",
				unknown_producer_key: "preserve me",
				codewiki_component: "stale",
				codewiki_source_patterns: ["stale/**"],
			},
			fields,
		);

		assert.equal(merged.type, "Reference");
		assert.equal(merged.unknown_producer_key, "preserve me");
		assert.equal(merged.codewiki_component, "decision");
		assert.deepEqual(merged.codewiki_source_patterns, [
			"src/decision/**",
			"src/api/decision.ts",
		]);
	});

	it("round-trips source-map ownership through generated OKF extension metadata", () => {
		const extensions = generateOkfSourceMapExtensions(sourceMap);
		const reconstructed = sourceMapFromOkfSourceMapExtensions({
			extensions,
			defaults: sourceMap.defaults,
			sourceRefs: sourceMap.sourceRefs,
			id: sourceMap.id,
		});
		const expected = byId(sourceMap.components);
		const actual = byId(reconstructed.components);

		assert.equal(reconstructed.components.length, sourceMap.components.length);
		for (const [id, component] of expected) {
			const generated = actual.get(id);
			assert.ok(generated, `missing generated component ${id}`);
			assert.deepEqual(generated, component);
		}
		for (const path of collectFiles("src")) {
			if (sourceMapExcluded(sourceMap, path)) continue;
			assert.equal(
				sourceMapOwnerForPath(reconstructed, path)?.id,
				sourceMapOwnerForPath(sourceMap, path)?.id,
				`owner mismatch for ${path}`,
			);
		}
	});

	it("answers owner queries from generated OKF extension fields", () => {
		const extensions = generateOkfSourceMapExtensions(sourceMap);

		assert.equal(
			okfSourceMapOwnerForPath(extensions, "src/knowledge/okf-source-map.ts", {
				defaults: sourceMap.defaults,
			})?.id,
			"knowledge",
		);
		assert.equal(
			okfSourceMapOwnerForPath(extensions, "src/cli/index.ts", {
				defaults: sourceMap.defaults,
			})?.id,
			"cli",
		);
	});
});
