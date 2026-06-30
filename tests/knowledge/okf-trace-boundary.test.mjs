import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
	classifyCodeWikiOkfBoundary,
	codeWikiOkfBundleFiles,
	codeWikiTraceBoundaryEntries,
	isCodeWikiOkfKnowledgePath,
	isCodeWikiTraceJsonlPath,
} from "../../src/knowledge/okf-trace-boundary.ts";
import { validateOkfBundle } from "../../src/knowledge/okf-validation.ts";

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function repoBoundaryFiles() {
	return [...collectFiles(".codewiki/kb"), ...collectFiles(".codewiki/traces")]
		.filter((path) => path.endsWith(".md") || path.endsWith(".jsonl"))
		.map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

describe("OKF trace boundary", () => {
	it("classifies KB markdown as OKF and trace JSONL as outside OKF", () => {
		assert.deepEqual(classifyCodeWikiOkfBoundary(".codewiki/kb/index.md"), {
			path: ".codewiki/kb/index.md",
			kind: "okf_kb_markdown",
		});
		assert.deepEqual(
			classifyCodeWikiOkfBoundary(
				".codewiki/traces/TRACE-okf-v0-1-adoption-v1.jsonl",
			),
			{
				path: ".codewiki/traces/TRACE-okf-v0-1-adoption-v1.jsonl",
				kind: "trace_jsonl",
			},
		);
		assert.equal(
			isCodeWikiOkfKnowledgePath(
				".codewiki/traces/TRACE-okf-v0-1-adoption-v1.jsonl",
			),
			false,
		);
		assert.equal(
			isCodeWikiTraceJsonlPath(".codewiki/kb/system/traces.md"),
			false,
		);
	});

	it("builds OKF validation bundles from KB markdown only", () => {
		const fullRepoFiles = [
			...repoBoundaryFiles(),
			{
				path: ".codewiki/traces/TRACE-frontmatter-trap.jsonl",
				content: "---\ntype: Concept\n---\n# Not OKF\n",
			},
		];
		const okfFiles = codeWikiOkfBundleFiles(fullRepoFiles);
		const result = validateOkfBundle(okfFiles);

		assert.equal(
			okfFiles.some((file) => file.path.startsWith(".codewiki/traces/")),
			false,
		);
		assert.equal(
			okfFiles.some((file) => file.path.endsWith(".jsonl")),
			false,
		);
		assert.equal(
			okfFiles.some((file) => file.path === "index.md"),
			true,
		);
		assert.deepEqual(result.issues, []);
		assert.equal(result.conceptCount, 43);
		assert.equal(result.reservedCount, 4);
	});

	it("does not parse trace files as OKF concepts", () => {
		const traceFiles = codeWikiTraceBoundaryEntries(repoBoundaryFiles());
		const okfFiles = codeWikiOkfBundleFiles(
			traceFiles.map((entry) => ({
				path: entry.path,
				content: "---\ntype: Concept\n---\n# Trap\n",
			})),
		);

		assert.equal(traceFiles.length > 0, true);
		assert.equal(
			traceFiles.every((entry) => entry.kind === "trace_jsonl"),
			true,
		);
		assert.deepEqual(okfFiles, []);
		assert.equal(validateOkfBundle(okfFiles).conceptCount, 0);
	});
});
