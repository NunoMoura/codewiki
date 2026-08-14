import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	pathMatchesPattern,
	sourceMapExcluded,
	sourceMapOwnerForPath,
	validateSourceMap,
} from "../../src/knowledge/source-map.ts";

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
		"tsconfig.build.json",
	]);
}

function unique(values) {
	return Array.from(new Set(values));
}

function sampleSourceMap() {
	return {
		id: "spec.test.source-ownership",
		sourceRefs: [".codewiki/kb/system/components/change-trace.md"],
		defaults: {
			inheritance: true,
			maxOwnerDepth: 2,
			excluded: ["node_modules/**", "dist/**"],
		},
		components: [
			{
				id: "traces",
				doc: ".codewiki/kb/system/components/change-trace.md",
				sourcePatterns: ["src/changes/trace/**", "src/runtime/persistence/trace.ts"],
				testPatterns: ["tests/changes/trace/**"],
				generatedViews: [],
				traceEvents: ["trace_head", "trace_event"],
				role: "state_truth",
			},
			{
				id: "implementation",
				doc: ".codewiki/kb/system/components/implementation.md",
				sourcePatterns: ["src/implementation/**"],
				testPatterns: ["tests/implementation/**"],
				generatedViews: [],
				traceEvents: ["implementation.evidence_accepted"],
				role: "semantic_loop",
			},
		],
	};
}

describe("source ownership map helpers", () => {
	it("answers ownership from an in-memory OKF-derived contract", () => {
		const map = sampleSourceMap();

		assert.equal(sourceMapExcluded(map, "dist/index.js"), true);
		assert.equal(
			sourceMapOwnerForPath(map, "src/changes/trace/append.ts")?.id,
			"traces",
		);
		assert.equal(
			sourceMapOwnerForPath(map, "src/implementation/workers.ts")?.doc,
			".codewiki/kb/system/components/implementation.md",
		);
	});

	it("validates ownership contracts without reading source-map.yaml", () => {
		const map = sampleSourceMap();
		const issues = validateSourceMap(map, {
			artifactPaths: activeArtifactPaths(),
			sourcePaths: ["src/changes/trace/append.ts", "src/implementation/iteration.ts"],
		});

		assert.deepEqual(issues, []);
	});

	it("matches every active test file through explicit glob helpers", () => {
		const map = {
			...sampleSourceMap(),
			components: [
				{
					id: "tests",
					doc: ".codewiki/kb/system/components/change-trace.md",
					sourcePatterns: ["tests/**"],
					testPatterns: ["tests/**"],
					generatedViews: [],
					traceEvents: [],
					role: "test_contract",
				},
			],
		};
		const unmappedTests = collectFiles("tests").filter(
			(path) =>
				map.components.some((component) =>
					component.testPatterns.some((pattern) =>
						pathMatchesPattern(path, pattern),
					),
				) === false,
		);

		assert.deepEqual(unmappedTests, []);
	});
});
