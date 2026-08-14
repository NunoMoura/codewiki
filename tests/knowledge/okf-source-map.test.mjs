import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	generateOkfSourceMapExtensions,
	mergeOkfSourceMapExtension,
	okfSourceMapExtensionForDoc,
	okfSourceMapOwnerForPath,
	sourceMapFromOkfSourceMapExtensions,
} from "../../src/knowledge/okf-source-map.ts";
import {
	sourceMapExcluded,
	sourceMapOwnerForPath,
} from "../../src/knowledge/source-map.ts";

const sourceMap = {
	id: "spec.test.source-ownership",
	sourceRefs: [".codewiki/kb/system/components/source-map.md"],
	defaults: {
		inheritance: true,
		maxOwnerDepth: 2,
		excluded: ["dist/**"],
	},
	components: [
		{
			id: "decision",
			doc: ".codewiki/kb/system/components/decision-loop.md",
			sourcePatterns: ["src/decision/**"],
			testPatterns: ["tests/decision/**"],
			generatedViews: [],
			traceEvents: ["decision.change_approved"],
			role: "semantic_loop",
		},
		{
			id: "runtime",
			doc: ".codewiki/kb/system/components/runtime.md",
			sourcePatterns: ["src/runtime/**"],
			testPatterns: ["tests/runtime/**"],
			generatedViews: [],
			traceEvents: [],
			role: "project_runtime",
		},
		{
			id: "cli",
			doc: ".codewiki/kb/system/components/runtime.md",
			sourcePatterns: ["src/cli/**"],
			testPatterns: ["tests/runtime/cli.test.mjs"],
			generatedViews: [],
			traceEvents: [],
			role: "temporary_development_harness",
		},
		{
			id: "knowledge",
			doc: ".codewiki/kb/system/components/knowledge.md",
			sourcePatterns: ["src/knowledge/**", ".codewiki/kb/**"],
			testPatterns: ["tests/knowledge/**"],
			generatedViews: [],
			traceEvents: [],
			role: "hot_knowledge",
		},
	],
};

function byId(components) {
	return new Map(components.map((component) => [component.id, component]));
}

function stripUndefined(value) {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	);
}

describe("OKF source ownership extension generation", () => {
	it("generates CodeWiki OKF extension fields for single and shared docs", () => {
		const decision = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/components/decision-loop.md",
		);
		assert.equal(decision?.codewiki_component, "decision");
		assert.deepEqual(decision?.codewiki_components, ["decision"]);
		assert.deepEqual(decision?.codewiki_source_patterns, ["src/decision/**"]);
		assert.deepEqual(decision?.codewiki_trace_events, [
			"decision.change_approved",
		]);

		const runtime = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/components/runtime.md",
		);
		assert.equal("codewiki_component" in runtime, false);
		assert.deepEqual(runtime?.codewiki_components, ["cli", "runtime"]);
		assert.deepEqual(runtime?.codewiki_roles, [
			"temporary_development_harness",
			"project_runtime",
		]);
		assert.equal(runtime?.codewiki_source_map.length, 2);
		assert.deepEqual(
			runtime?.codewiki_source_map.map((component) => component.id),
			["cli", "runtime"],
		);
	});

	it("merges generated extension fields while preserving unknown producer metadata", () => {
		const fields = okfSourceMapExtensionForDoc(
			sourceMap,
			".codewiki/kb/system/components/decision-loop.md",
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
		assert.deepEqual(merged.codewiki_source_patterns, ["src/decision/**"]);
	});

	it("round-trips source ownership through generated OKF extension metadata", () => {
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
			assert.deepEqual(stripUndefined(generated), component);
		}
		assert.equal(sourceMapExcluded(reconstructed, "dist/index.js"), true);
		assert.equal(
			sourceMapOwnerForPath(reconstructed, "src/knowledge/okf-source-map.ts")
				?.id,
			"knowledge",
		);
		assert.equal(
			sourceMapOwnerForPath(reconstructed, "src/cli/index.ts")?.id,
			"cli",
		);
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

	it("allows structured OKF extensions to point at non-KB owner docs", () => {
		const reconstructed = sourceMapFromOkfSourceMapExtensions({
			defaults: sourceMap.defaults,
			extensions: [
				{
					path: ".codewiki/kb/system/components/package.md",
					fields: {
						codewiki_components: ["package"],
						codewiki_source_patterns: ["package.json"],
						codewiki_test_patterns: ["tests/runtime/package-install-smoke.mjs"],
						codewiki_source_map: [
							{
								id: "package",
								doc: "README.md",
								source_patterns: ["package.json"],
								test_patterns: ["tests/runtime/package-install-smoke.mjs"],
								role: "package_entrypoint",
							},
						],
					},
				},
			],
		});

		assert.equal(reconstructed.components[0].id, "package");
		assert.equal(reconstructed.components[0].doc, "README.md");
		assert.equal(
			okfSourceMapOwnerForPath(
				[
					{
						path: ".codewiki/kb/system/components/package.md",
						fields: {
							codewiki_components: ["package"],
							codewiki_source_patterns: ["package.json"],
							codewiki_test_patterns: [
								"tests/runtime/package-install-smoke.mjs",
							],
							codewiki_source_map: [
								{
									id: "package",
									doc: "README.md",
									source_patterns: ["package.json"],
									test_patterns: ["tests/runtime/package-install-smoke.mjs"],
								},
							],
						},
					},
				],
				"package.json",
				{ defaults: sourceMap.defaults },
			)?.doc,
			"README.md",
		);
	});
});
