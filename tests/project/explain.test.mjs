import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildProjectExplainView } from "../../src/project/explain.ts";
import { formatTraceText } from "../../src/traces/writer.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-explain-"));
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await writeFile(
		join(root, ".codewiki", "kb", "system", "source-map.yaml"),
		[
			"id: test-source-map",
			"source_docs:",
			"  - .codewiki/kb/system/source-map.md",
			"defaults:",
			"  inheritance: true",
			"  excluded: []",
			"components:",
			"  api:",
			"    doc: .codewiki/kb/system/api.md",
			"    source_patterns:",
			"      - src/api/**",
			"    test_patterns:",
			"      - tests/api/**",
			"    trace_events:",
			"      - planning.iteration",
			"    role: public_facade",
			"",
		].join("\n"),
	);
	await writeFile(
		join(root, ".codewiki", "traces", "TRACE-explain.jsonl"),
		formatTraceText([
			{
				type: "trace_head",
				traceId: "TRACE-explain",
				title: "Explain source ownership",
				createdAt: "2026-06-17T00:00:00.000Z",
			},
			{
				type: "trace_event",
				id: "TRACE-explain:planning:iteration:1",
				parentId: null,
				traceId: "TRACE-explain",
				sequence: 1,
				loop: "planning",
				event: "planning.iteration",
				refs: ["src/api/**"],
				createdAt: "2026-06-17T00:00:01.000Z",
				data: {
					exit: { status: "continue", conditions: [] },
					output: {
						qualityStandards: [
							{
								id: "decision_coverage_complete",
								status: "met",
								mode: "deterministic",
								description: "Decision coverage is complete.",
								refs: ["src/api/index.ts"],
							},
						],
						workItems: [
							{
								id: "WU-explain",
								title: "Explain API ownership",
								componentRefs: ["api"],
								pathScopes: ["src/api/**"],
								verification: ["tests/api/**"],
							},
						],
					},
				},
			},
		]),
	);
	return root;
}

describe("project explain", () => {
	it("explains path owners, tests, trace refs, and quality", async () => {
		const root = await fixture();
		try {
			const view = await buildProjectExplainView({
				repoRoot: root,
				target: "src/api/index.ts",
			});

			assert.equal(view.kind, "path");
			assert.equal(view.owner?.componentId, "api");
			assert.deepEqual(view.owner?.testPatterns, ["tests/api/**"]);
			assert.equal(
				view.traceRefs?.includes(
					"trace:TRACE-explain:planning:iteration:1#work:WU-explain",
				),
				true,
			);
			assert.equal(view.quality?.[0].traceId, "TRACE-explain");
			assert.equal(view.quality?.[0].loop, "planning");
			assert.equal(view.quality?.[0].met, 1);
			assert.equal(
				view.sections.some((section) => section.title === "Tests"),
				true,
			);
			assert.equal(
				view.sections.some((section) => section.title === "Trace refs"),
				true,
			);
			assert.equal(
				view.sections.some((section) => section.title === "Quality"),
				true,
			);

			const testPath = await buildProjectExplainView({
				repoRoot: root,
				target: "tests/api/index.test.mjs",
			});
			assert.equal(testPath.owner?.componentId, "api");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
