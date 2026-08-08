import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildProjectExplainView } from "../../src/project/explain.ts";
import { formatTraceText } from "../../src/traces/writer.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-explain-"));
	await mkdir(join(root, ".codewiki", "kb", "system", "components"), {
		recursive: true,
	});
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await writeFile(
		join(root, ".codewiki", "kb", "system", "components", "api.md"),
		apiDoc(),
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
				event: "work_units_created",
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

async function okfOnlyFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-explain-okf-"));
	await mkdir(join(root, ".codewiki", "kb", "system", "components"), {
		recursive: true,
	});
	await writeFile(
		join(root, ".codewiki", "kb", "system", "components", "api.md"),
		apiDoc(),
	);
	return root;
}

function apiDoc() {
	return [
		"---",
		"type: Concept",
		"title: API",
		"description: Public API facade.",
		"codewiki_component: api",
		"codewiki_source_patterns:",
		"  - src/api/**",
		"codewiki_test_patterns:",
		"  - tests/api/**",
		"codewiki_trace_events:",
		"  - planning.work_units_created",
		"codewiki_role: public_facade",
		"---",
		"# API",
		"",
		"Public API facade.",
		"",
	].join("\n");
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

	it("explains ownership from OKF metadata", async () => {
		const root = await okfOnlyFixture();
		try {
			const view = await buildProjectExplainView({
				repoRoot: root,
				target: "src/api/index.ts",
			});

			assert.equal(view.kind, "path");
			assert.equal(view.owner?.componentId, "api");
			assert.deepEqual(view.refs, [
				".codewiki/kb/system/components/api.md",
				".codewiki/kb/system/components/knowledge.md",
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
