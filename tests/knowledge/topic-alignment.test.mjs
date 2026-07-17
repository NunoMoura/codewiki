import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	captureKnowledgeAlignmentBaseline,
	knowledgeTopicRefsFromRecords,
	projectKnowledgeAlignment,
	readKnowledgeTopicDigests,
} from "../../src/knowledge/topic-alignment.ts";

const ref = ".codewiki/kb/product/overview.md";

function decisionRecord(baseline) {
	return {
		type: "trace_event",
		id: "decision-1",
		parentId: null,
		traceId: "TRACE-alignment",
		sequence: 1,
		loop: "decision",
		event: "changes_approved",
		refs: [ref],
		createdAt: "2026-07-16T00:00:00.000Z",
		data: {
			output: {
				sprintBoundary: {
					accountableGoal: "Keep topic alignment honest.",
					knowledgeTopics: [ref],
					dependencies: [],
					rollbackBoundary: "Revert alignment projection.",
				},
				knowledgeAlignmentBaseline: baseline,
			},
		},
	};
}

describe("topic-scoped Knowledge alignment", () => {
	it("captures Decision baselines and distinguishes aligned from review needed", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-topic-alignment-"));
		try {
			const path = join(root, ref);
			await mkdir(join(root, ".codewiki", "kb", "product"), {
				recursive: true,
			});
			await writeFile(path, "# Product\n", "utf8");
			const baseline = await captureKnowledgeAlignmentBaseline(
				root,
				[ref],
				"2026-07-16T00:00:00.000Z",
			);
			assert.equal(baseline.topics.length, 1);
			const records = [decisionRecord(baseline)];
			assert.deepEqual(knowledgeTopicRefsFromRecords(records), [ref]);
			const current = await readKnowledgeTopicDigests(root, [ref]);
			assert.equal(
				projectKnowledgeAlignment({
					records,
					topicRefs: [ref],
					currentDigests: current,
				}).state,
				"aligned",
			);
			await writeFile(path, "# Product\n\nChanged.\n", "utf8");
			const changed = await readKnowledgeTopicDigests(root, [ref]);
			const projection = projectKnowledgeAlignment({
				records,
				topicRefs: [ref],
				currentDigests: changed,
			});
			assert.equal(projection.state, "review_needed");
			assert.match(
				projection.rationale,
				/changed since the validated baseline/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("uses Unknown for insufficient evidence and Misaligned only for grounded findings", () => {
		assert.equal(
			projectKnowledgeAlignment({ records: [], topicRefs: [ref] }).state,
			"unknown",
		);
		assert.equal(
			projectKnowledgeAlignment({
				records: [],
				topicRefs: [],
				noKnowledgeImpactReason: "No Product or System Knowledge is affected.",
			}).state,
			"aligned",
		);
		const finding = {
			type: "trace_event",
			id: "finding-1",
			parentId: null,
			traceId: "TRACE-alignment",
			sequence: 2,
			loop: "implementation",
			event: "alignment_reviewed",
			refs: [ref],
			createdAt: "2026-07-16T01:00:00.000Z",
			data: {
				knowledgeAlignmentFinding: {
					affectedLayer: "product",
					sourceRefs: [ref],
					rationale:
						"Implemented behavior contradicts the declared Product contract.",
					recommendedNextLoop: "decision",
				},
			},
		};
		const projection = projectKnowledgeAlignment({
			records: [finding],
			topicRefs: [ref],
		});
		assert.equal(projection.state, "misaligned");
		assert.equal(projection.findings.length, 1);
	});
});
